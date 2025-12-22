/**
 * Formula Parser - SYNTAX VALIDATION ONLY
 *
 * Recreates the C# Formula parsing algorithm to generate an AST.
 * This parser handles SYNTAX validation - whether the formula text is structurally valid.
 *
 * RESPONSIBILITIES (what this file validates):
 * - Formula structure: operators, parentheses placement, colons
 * - Bare words with parentheses must be function-style operators (from formula.json)
 * - Invalid characters after colons: abs:& , min: foo (space), abs:(, abs:-
 * - Unary operator validation: unary + is invalid
 * - Creates appropriate AST nodes: literal, variable, global, function, etc.
 *
 * NOT RESPONSIBILITIES (delegated to formula-ast-validator.ts):
 * - Unknown operator names (e.g., m:unknownFunc)
 * - Wrong parameter types (e.g., m:distance(foo) where literal expected)
 * - Wrong argument counts (e.g., min:5 missing formula body)
 * - Calling convention mismatches (using : vs () incorrectly)
 * - 'x' parameter validity in context (validator checks allowXParameter flag)
 *
 * Parsing algorithm (based on Tactics/Formula.cs):
 * 1. Split formula by operators (+-*\/%) to get operands
 * 2. Process each operand from right to left
 * 3. Each operand can be:
 *    - A literal number or 'x' variable
 *    - A function call with colon-separated arguments (e.g., "c:HP", "min:5:c:STR")
 *    - A global formula reference (bare identifier)
 *    - A function-style operator with parenthesized argument (e.g., distance(32))
 * 4. Build operation tree respecting precedence
 *
 * After parsing, use validateAST() from formula-ast-validator.ts to check
 * the AST against formula.json metadata for semantic correctness.
 */

import {
  isFunctionStyle,
  getArgCount,
  hasFormulaBody,
  resolveOperatorAlias,
  getAlternateDelimiters,
  getDelegatesTo,
} from './formula-metadata.js';

// Re-export validator for convenience
export { validateAST, formatValidationErrors, type ValidationError } from './formula-ast-validator.js';

export type ASTNode =
  | LiteralNode
  | VariableNode
  | FunctionCallNode
  | GlobalFormulaNode
  | MathFunctionNode
  | BinaryOperationNode
  | UnaryOperationNode;

export interface LiteralNode {
  type: 'literal';
  value: number;
}

export interface VariableNode {
  type: 'variable';
  name: string; // 'x', 'X'
}

export interface FunctionCallNode {
  type: 'function';
  name: string; // e.g., 'c', 't', 'min', 'max', 'lessThan', etc.
  args: FunctionArg[]; // Colon-separated arguments
  body?: ASTNode | undefined; // For functions that take formula expressions (min, max, lessThan, etc.)
}

export type FunctionArg = StringArg | FunctionStyleArg;

export interface StringArg {
  type: 'string';
  value: string; // Simple string argument like "HP" in c:HP
}

export interface FunctionStyleArg {
  type: 'functionStyle';
  name: string; // Function name like "distance" in m:distance(32)
  params: ASTNode[]; // Parameters like [Literal(32)]
}

export interface GlobalFormulaNode {
  type: 'global';
  name: string;
  argument?: ASTNode | undefined; // Optional parenthesized argument
}

export interface MathFunctionNode {
  type: 'mathFunction';
  name: string; // e.g., 'distance', 'evasionFacing', etc.
  argument?: ASTNode | undefined; // Optional parenthesized argument
}

export interface BinaryOperationNode {
  type: 'binaryOp';
  operator: '+' | '-' | '*' | '/' | '%';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOperationNode {
  type: 'unaryOp';
  operator: '-' | '+';
  operand: ASTNode;
}

/**
 * Tokenizes a formula into operands and operators
 * Handles unary operators (only - is supported, + crashes the game)
 * Respects parentheses - operators inside parentheses are part of operands, not top-level operators
 */
function tokenizeFormula(formula: string): {
  operands: string[];
  operators: string[];
  positions: number[];
  unaryOperandIndices: Map<number, number>;
} {
  // Remove all whitespace (matches C# behavior)
  const cleanFormula = formula.replace(/\s+/g, '');

  // Parse character by character to properly handle unary operators and parentheses
  const operands: string[] = [];
  const operators: string[] = [];
  const positions: number[] = [];
  const unaryOperandIndices = new Map<number, number>();

  let i = 0;
  let currentOperand = '';
  let currentOperandStart = 0;
  let justPushedOperand = false;
  let parenDepth = 0;

  while (i < cleanFormula.length) {
    const char = cleanFormula[i];
    if (!char) {
      throw new Error(`Invalid char in formula ${cleanFormula} at ${i}`);
    }

    // Track parenthesis depth
    if (char === '(') {
      parenDepth++;
      currentOperand += char;
      i++;
      continue;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        throw new Error(`Invalid syntax: unmatched closing parenthesis at position ${i}`);
      }
      currentOperand += char;
      i++;
      continue;
    }

    // Check if this is an operator at depth 0 (top-level operator)
    if ('+-*/%'.includes(char) && parenDepth === 0) {
      // Save current operand if we have one
      if (currentOperand) {
        operands.push(currentOperand);
        positions.push(currentOperandStart);
        currentOperand = '';
        justPushedOperand = true;
      } else {
        justPushedOperand = false;
      }

      // Check if this is a unary minus (at start or after another operator)
      // If we just pushed an operand, this must be a binary operator
      const prevIsOperator = !justPushedOperand;
      if (char === '-' && prevIsOperator) {
        // Unary minus - record which operand this will apply to
        const operatorIndex = operators.length;
        const targetOperandIndex = operands.length; // Next operand to be added
        operators.push('unary-');
        unaryOperandIndices.set(operatorIndex, targetOperandIndex);
      } else if (char === '+' && prevIsOperator) {
        // Unary plus - this crashes the game!
        throw new Error(
          `Invalid syntax: unary '+' is not supported by the game. Use '-' for negation or remove the '+'.`
        );
      } else {
        // Binary operator
        operators.push(char);
      }

      i++;
      currentOperandStart = i;
    } else {
      // Part of an operand
      currentOperand += char;
      i++;
    }
  }

  // Add final operand
  if (currentOperand) {
    operands.push(currentOperand);
    positions.push(currentOperandStart);
  }

  // Validate invariants
  // Check parentheses are balanced
  if (parenDepth !== 0) {
    throw new Error(
      `Invalid syntax: unmatched opening parenthesis. Expected ${parenDepth} more closing parenthesis(es).`
    );
  }

  const unaryCount = Array.from(operators).filter(op => op.startsWith('unary')).length;
  if (unaryOperandIndices.size !== unaryCount) {
    throw new Error(
      `Invariant violation: unaryOperandIndices.size (${unaryOperandIndices.size}) !== unary operator count (${unaryCount})`
    );
  }

  for (const [opIndex, operandIndex] of unaryOperandIndices.entries()) {
    if (operandIndex >= operands.length) {
      throw new Error(
        `Invariant violation: unary operator at ${opIndex} references non-existent operand ${operandIndex} (max: ${operands.length - 1})`
      );
    }
  }

  const usedOperandIndices = new Set(unaryOperandIndices.values());
  if (usedOperandIndices.size !== unaryOperandIndices.size) {
    throw new Error('Invariant violation: multiple unary operators apply to the same operand');
  }

  return { operands, operators, positions, unaryOperandIndices };
}

/**
 * Parses a single operand string into an AST node
 */
function parseOperand(operand: string): ASTNode {
  // Check if it's a literal number
  const numValue = parseFloat(operand);
  if (!isNaN(numValue) && operand === numValue.toString()) {
    return { type: 'literal', value: numValue };
  }

  // Check if it's the 'x' or 'X' variable
  if (operand === 'x' || operand === 'X') {
    return { type: 'variable', name: operand };
  }

  // Check if it contains colons (function call with arguments)
  // This must be checked BEFORE parentheses because operators like m:distance(32)
  // have colons and should be parsed as function calls with colon-separated args
  if (operand.includes(':')) {
    return parseFunctionCall(operand);
  }

  // Check if it contains a left parenthesis (function-style operator only)
  if (operand.includes('(')) {
    return parseParenthesizedOperand(operand);
  }

  // If no special syntax, treat as a global formula reference
  return { type: 'global', name: operand };
}

/**
 * Parses an operand with parentheses: name(arg)
 * Only valid for function-style operators (determined by isFunctionStyle in formula.json)
 */
function parseParenthesizedOperand(operand: string): MathFunctionNode {
  const parenIndex = operand.indexOf('(');
  const name = operand.substring(0, parenIndex);
  const argString = operand.substring(parenIndex + 1, operand.length - 1); // Remove '(' and ')'

  // Parentheses are only valid with function-style operators
  if (!isFunctionStyle(name)) {
    throw new Error(
      `Invalid syntax: '${name}(...)' - parentheses can only be used with function-style operators. '${name}' is not a valid function-style operator.`
    );
  }

  // Try to parse argument as a number or formula
  let argument: ASTNode | undefined;
  const numValue = parseFloat(argString);
  if (!isNaN(numValue) && argString === numValue.toString()) {
    argument = { type: 'literal', value: numValue };
  } else if (argString === 'x' || argString === 'X') {
    argument = { type: 'variable', name: argString };
  } else if (argString) {
    // Recursively parse the argument as a formula
    argument = parseFormula(argString);
  }

  return { type: 'mathFunction', name, argument };
}

/**
 * Parses a function-style argument like "distance(32)" or "rand(100)"
 * Used only for m: and d: operators (and operators that delegate to them)
 * Returns the function name and parsed parameters as AST nodes
 */
function parseFunctionStyleArg(arg: string): { name: string; params: ASTNode[] } | null {
  const parenIndex = arg.indexOf('(');
  if (parenIndex === -1) {
    return null;
  }

  const name = arg.substring(0, parenIndex);
  const paramString = arg.substring(parenIndex + 1, arg.length - 1); // Remove '(' and ')'

  // Split parameters by comma (for multi-param functions)
  const paramStrings = paramString
    .split(',')
    .map(s => s.trim())
    .filter(s => s);

  const params: ASTNode[] = paramStrings.map(param => {
    // Try to parse as number
    const numValue = parseFloat(param);
    if (!isNaN(numValue) && param === numValue.toString()) {
      return { type: 'literal', value: numValue };
    }

    // 'x' and 'X' are always parsed as variables
    if (param === 'x' || param === 'X') {
      return { type: 'variable', name: param };
    }

    // Check if parameter contains operators (which would make it a formula expression, not an identifier)
    // Function-style arguments can only be: numeric literals, 'x' variable, or simple identifiers
    // Formulas like (1+1), (5*2), etc. are not allowed
    if (/[+\-*\/%()]/.test(param)) {
      throw new Error(
        `Invalid syntax: '${arg}' - function-style argument contains formula operators. Parameters must be simple literals or identifiers, not expressions like '${param}'.`
      );
    }

    // Other identifiers are parsed as global formula references
    // The validator will check if they're allowed in this context
    return { type: 'global', name: param };
  });

  return { name, params };
}

/**
 * Splits a string by delimiters (colons and optionally commas), but only those outside of parentheses
 */
function splitByDelimitersRespectingParens(str: string, additionalDelimiters: string[] = []): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;

  const allDelimiters = new Set([':', ...additionalDelimiters]);

  for (const char of str) {
    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (allDelimiters.has(char) && parenDepth === 0) {
      // Delimiter at top level - this is a separator
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last part
  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Parses a function call with colon-separated arguments: name:arg1:arg2:...
 * Also supports alternate delimiters (e.g., commas for gIs:varName,value)
 */
function parseFunctionCall(operand: string): FunctionCallNode {
  // Extract function name first (before any delimiters)
  const firstDelimiter = operand.search(/[:]/);
  const functionName = firstDelimiter === -1 ? operand : operand.substring(0, firstDelimiter);

  // Check if this operator supports alternate delimiters (e.g., comma for gIs)
  const alternateDelimiters = getAlternateDelimiters(functionName);

  // Split by colons and any alternate delimiters
  const parts = splitByDelimitersRespectingParens(operand, alternateDelimiters || []);

  let body: ASTNode | undefined;
  let rawArgs: string[] = parts.slice(1);

  // Check if this operator takes a formula as an argument (from formula.json)
  if (hasFormulaBody(functionName)) {
    // Extract the body formula
    // For functions like "min:5:c:HP", the body is "c:HP"
    // For functions like "lessThan:10:c:STR+5", the body is "c:STR+5"
    const argCount = getArgCount(functionName);
    const nonFormulaArgs = rawArgs.slice(0, argCount);

    const functionPrefix = functionName + ':' + nonFormulaArgs.join(':') + (argCount > 0 ? ':' : '');
    const bodyString = operand.substring(functionPrefix.length);

    if (bodyString) {
      body = parseFormula(bodyString);
      // Only keep non-formula arguments
      rawArgs = nonFormulaArgs;
    }
  }

  // Parse each argument - only m: and d: operators (and their aliases), or operators that delegate to them,
  // support function-style arguments with parentheses
  const canonicalFunctionName = resolveOperatorAlias(functionName);
  const delegatesTo = getDelegatesTo(functionName);
  const isMathOperator =
    canonicalFunctionName === 'm' || canonicalFunctionName === 'd' || delegatesTo === 'm' || delegatesTo === 'd';
  const args: FunctionArg[] = rawArgs.map(arg => {
    if (isMathOperator && arg.includes('(')) {
      const parsed = parseFunctionStyleArg(arg);
      if (parsed) {
        return { type: 'functionStyle', ...parsed };
      }
    }
    return { type: 'string', value: arg };
  });

  return {
    type: 'function',
    name: functionName,
    args,
    body,
  };
}

/**
 * Applies unary operators to operands, creating a new array with UnaryOp nodes
 * Returns modified operands and binary-only operators (immutable)
 */
function applyUnaryOperators(
  operands: ASTNode[],
  operators: string[],
  unaryOperandIndices: Map<number, number>
): { modifiedOperands: ASTNode[]; binaryOperators: string[] } {
  // Create a copy of operands that we'll modify
  const modifiedOperands = [...operands];
  const binaryOperators: string[] = [];

  // Process operators, applying unary ones and collecting binary ones
  for (let i = 0; i < operators.length; i++) {
    const op = operators[i];
    if (!op) {
      throw new Error(`Missing operator at index ${i}`);
    }

    if (op.startsWith('unary')) {
      const unaryOp = op.substring('unary'.length) as '-' | '+';
      const operandIndex = unaryOperandIndices.get(i);

      if (operandIndex === undefined) {
        throw new Error(`Unary operator at index ${i} has no operand mapping`);
      }

      const operand = modifiedOperands[operandIndex];
      if (!operand) {
        throw new Error(`Missing operand at index ${operandIndex} for unary operator at ${i}`);
      }

      // Wrap the operand in a UnaryOp node
      modifiedOperands[operandIndex] = {
        type: 'unaryOp',
        operator: unaryOp,
        operand: operand,
      };
    } else {
      // Binary operator - keep it
      binaryOperators.push(op);
    }
  }

  // Validate binary operator count
  if (binaryOperators.length !== modifiedOperands.length - 1) {
    throw new Error(
      `Invariant violation: binary operator count (${binaryOperators.length}) must equal operand count - 1 (${modifiedOperands.length - 1})`
    );
  }

  return { modifiedOperands, binaryOperators };
}

/**
 * Builds a binary operation tree from operands and operators (immutable)
 * Respects standard math operator precedence (*, /, % before +, -)
 */
function buildBinaryTree(operands: ASTNode[], operators: string[]): ASTNode {
  if (operands.length === 1) {
    const result = operands[0];
    if (!result) {
      throw new Error('Single operand is undefined');
    }
    return result;
  }

  if (operators.length === 0) {
    throw new Error(`No operators but ${operands.length} operands`);
  }

  // Find first high-precedence operator (*, /, %)
  const highPrecedenceOps = ['*', '/', '%'];
  const highPrecIndex = operators.findIndex(op => highPrecedenceOps.includes(op));

  if (highPrecIndex !== -1) {
    // Found a high-precedence operator - build node for it
    const op = operators[highPrecIndex];
    const left = operands[highPrecIndex];
    const right = operands[highPrecIndex + 1];

    if (!op || !left || !right) {
      throw new Error(`Missing operator or operands at index ${highPrecIndex}`);
    }

    const binaryNode: BinaryOperationNode = {
      type: 'binaryOp',
      operator: op as '*' | '/' | '%',
      left: left,
      right: right,
    };

    // Create new arrays with the binary node replacing its operands
    const newOperands = [...operands.slice(0, highPrecIndex), binaryNode, ...operands.slice(highPrecIndex + 2)];
    const newOperators = [...operators.slice(0, highPrecIndex), ...operators.slice(highPrecIndex + 1)];

    // Recursively build the rest of the tree
    return buildBinaryTree(newOperands, newOperators);
  }

  // No high-precedence operators left, process low-precedence (+, -) left-to-right
  const op = operators[0];
  const left = operands[0];
  const right = operands[1];

  if (!op || !left || !right) {
    throw new Error('Missing operator or operands in low-precedence pass');
  }

  const binaryNode: BinaryOperationNode = {
    type: 'binaryOp',
    operator: op as '+' | '-',
    left: left,
    right: right,
  };

  const newOperands = [binaryNode, ...operands.slice(2)];
  const newOperators = operators.slice(1);

  return buildBinaryTree(newOperands, newOperators);
}

/**
 * Builds a complete operation tree from operands and operators
 * Handles both unary and binary operators with proper precedence
 */
function buildOperationTree(
  operands: ASTNode[],
  operators: string[],
  unaryOperandIndices: Map<number, number>
): ASTNode {
  if (operands.length === 1 && operators.length === 0) {
    const result = operands[0];
    if (!result) {
      throw new Error('Single operand is undefined');
    }
    return result;
  }

  // First apply unary operators (immutable)
  const { modifiedOperands, binaryOperators } = applyUnaryOperators(operands, operators, unaryOperandIndices);

  // Then build binary tree (immutable)
  return buildBinaryTree(modifiedOperands, binaryOperators);
}

/**
 * Main entry point: parses a formula string into an AST
 * @param formula The formula string to parse
 */
export function parseFormula(formula: string): ASTNode {
  // Check for invalid characters immediately after colon
  // Colons must be followed by a letter or digit (not underscore)
  // Invalid: abs:(1-2), abs:-2, min:+5, min: d:foo (space after colon), c:_foo (underscore)
  // Valid: c:HP, m:distance(32), d:gswordDmg
  const invalidAfterColonPattern = /(\w+):([^a-zA-Z0-9])/;
  const invalidMatch = formula.match(invalidAfterColonPattern);
  if (invalidMatch?.length === 3) {
    const [_, operatorName, invalidChar] = invalidMatch;

    let errorMsg = `Invalid syntax: '${operatorName}:${invalidChar}' - `;
    if (invalidChar === '(') {
      errorMsg += `parentheses cannot appear immediately after colon.`;
    } else if ('+-*/%'.includes(invalidChar ?? 'placeholder')) {
      errorMsg += `math operator cannot appear immediately after colon.`;
    } else if (invalidChar === ' ') {
      errorMsg += `space cannot appear after colon. Remove the space.`;
    } else if (invalidChar === '_') {
      errorMsg += `underscore cannot appear after colon. Colon must be followed by a letter or digit.`;
    } else {
      errorMsg += `colon must be followed by a letter or digit, not '${invalidChar}'.`;
    }
    throw new Error(errorMsg);
  }

  const { operands, operators, unaryOperandIndices } = tokenizeFormula(formula);

  // Parse each operand into an AST node
  const operandNodes = operands.map(op => parseOperand(op));

  // Build the operation tree respecting precedence
  return buildOperationTree(operandNodes, operators, unaryOperandIndices);
}

/**
 * Pretty-prints an AST for debugging
 */
export function printAST(node: ASTNode, indent: string = ''): string {
  switch (node.type) {
    case 'literal':
      return `${indent}Literal(${node.value})`;

    case 'variable':
      return `${indent}Variable(${node.name})`;

    case 'function':
      let funcStr = `${indent}Function(${node.name})`;

      // Print arguments
      if (node.args.length > 0) {
        funcStr += '\n' + indent + '  args:';
        node.args.forEach((arg, i) => {
          if (arg.type === 'string') {
            funcStr += '\n' + indent + `    [${i}] "${arg.value}"`;
          } else {
            // Function-style argument with params
            funcStr += '\n' + indent + `    [${i}] ${arg.name}(...)`;
            arg.params.forEach((param, j) => {
              funcStr +=
                '\n' + printAST(param, indent + '      ').replace(indent + '      ', indent + `      param[${j}]: `);
            });
          }
        });
      }

      // Print body if present
      if (node.body) {
        funcStr += '\n' + indent + '  body:';
        funcStr += '\n' + printAST(node.body, indent + '    ');
      }

      return funcStr;

    case 'global':
      let globalStr = `${indent}GlobalFormula(${node.name})`;
      if (node.argument) {
        globalStr += '\n' + printAST(node.argument, indent + '  ');
      }
      return globalStr;

    case 'mathFunction':
      let mathStr = `${indent}MathFunction(${node.name})`;
      if (node.argument) {
        mathStr += '\n' + printAST(node.argument, indent + '  ');
      }
      return mathStr;

    case 'binaryOp':
      return (
        `${indent}BinaryOp(${node.operator})\n` +
        printAST(node.left, indent + '  ') +
        '\n' +
        printAST(node.right, indent + '  ')
      );

    case 'unaryOp':
      return `${indent}UnaryOp(${node.operator})\n` + printAST(node.operand, indent + '  ');
  }
}
