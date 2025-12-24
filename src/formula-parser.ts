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

/** Position information for AST nodes (relative to start of formula, preserving line breaks) */
export interface PositionInfo {
  startLine: number; // Line offset from start of formula (0 for first line)
  startColumn: number; // Column on that line (0-indexed)
  endLine: number; // Line offset from start of formula
  endColumn: number; // Column on that line (0-indexed, exclusive)
}

export type WithPosition<T> = T & PositionInfo;

// Base node interfaces (internal - without positions)
interface LiteralNodeBase {
  type: 'literal';
  value: number;
}

interface VariableNodeBase {
  type: 'variable';
  name: string; // 'x', 'X'
}

interface FunctionCallNodeBase {
  type: 'function';
  name: FunctionNameNode; // Function name with position tracking
  args: FunctionArg[]; // Colon-separated arguments
  body?: ASTNode | undefined; // For functions that take formula expressions (min, max, lessThan, etc.)
}

interface StringArgBase {
  type: 'string';
  value: string; // Simple string argument like "HP" in c:HP
}

interface FunctionStyleArgBase {
  type: 'functionStyle';
  name: string; // Function name like "distance" in m:distance(32)
  params: ASTNode[]; // Parameters like [Literal(32)]
}

interface GlobalFormulaNodeBase {
  type: 'global';
  name: string;
  argument?: ASTNode | undefined; // Optional parenthesized argument
}

interface FunctionNameNodeBase {
  type: 'functionName';
  value: string; // The function name (e.g., 'distance', 'floor', 'm', 'd')
}

interface MathFunctionNodeBase {
  type: 'mathFunction';
  name: FunctionNameNode; // The function name with position tracking
  argument?: ASTNode | undefined; // Optional parenthesized argument
}

interface BinaryOperationNodeBase {
  type: 'binaryOp';
  operator: '+' | '-' | '*' | '/' | '%';
  left: ASTNode;
  right: ASTNode;
}

interface UnaryOperationNodeBase {
  type: 'unaryOp';
  operator: '-' | '+';
  operand: ASTNode;
}

export type LiteralNode = WithPosition<LiteralNodeBase>;
export type VariableNode = WithPosition<VariableNodeBase>;
export type FunctionCallNode = WithPosition<FunctionCallNodeBase>;
export type StringArg = WithPosition<StringArgBase>;
export type FunctionStyleArg = WithPosition<FunctionStyleArgBase>;
export type GlobalFormulaNode = WithPosition<GlobalFormulaNodeBase>;
export type FunctionNameNode = WithPosition<FunctionNameNodeBase>;
export type MathFunctionNode = WithPosition<MathFunctionNodeBase>;
export type BinaryOperationNode = WithPosition<BinaryOperationNodeBase>;
export type UnaryOperationNode = WithPosition<UnaryOperationNodeBase>;

export type ASTNode =
  | LiteralNode
  | VariableNode
  | FunctionCallNode
  | GlobalFormulaNode
  | FunctionNameNode
  | MathFunctionNode
  | BinaryOperationNode
  | UnaryOperationNode;

export type FunctionArg = StringArg | FunctionStyleArg;

/**
 * Position in formula with line and column tracking
 */
export interface FormulaPosition {
  line: number; // Line offset from start (0-indexed)
  column: number; // Column on that line (0-indexed)
  offset: number; // Absolute character offset
}

/**
 * Tokenizes a formula into operands and operators
 * Handles unary operators (only - is supported, + crashes the game)
 * Respects parentheses - operators inside parentheses are part of operands, not top-level operators
 * Preserves whitespace for accurate position tracking
 */
function tokenizeFormula(formula: string): {
  operands: string[];
  operators: string[];
  positions: FormulaPosition[];
  unaryOperandIndices: Map<number, number>;
} {
  // Parse character by character, skipping whitespace but tracking positions
  const operands: string[] = [];
  const operators: string[] = [];
  const positions: FormulaPosition[] = [];
  const unaryOperandIndices = new Map<number, number>();

  let line = 0;
  let column = 0;
  let i = 0;
  let currentOperand = '';
  let currentOperandStart: FormulaPosition | null = null;
  let justPushedOperand = false;
  let parenDepth = 0;

  while (i < formula.length) {
    const char = formula[i];
    if (!char) {
      throw new Error(`Invalid char in formula at offset ${i}`);
    }

    // Handle newlines
    if (char === '\n') {
      line++;
      column = 0;
      i++;
      continue;
    }

    // Skip other whitespace (space, tab, carriage return)
    if (char === ' ' || char === '\t' || char === '\r') {
      column++;
      i++;
      continue;
    }

    // Track parenthesis depth
    if (char === '(') {
      // Track start of operand if not already tracking
      if (!currentOperandStart) {
        currentOperandStart = { line, column, offset: i };
      }
      parenDepth++;
      currentOperand += char;
      column++;
      i++;
      continue;
    } else if (char === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        throw new Error(`Invalid syntax: unmatched closing parenthesis at line ${line}, column ${column}`);
      }
      currentOperand += char;
      column++;
      i++;
      continue;
    }

    // Check if this is an operator at depth 0 (top-level operator)
    // Special case: + or - after e/E is part of scientific notation, not an operator
    // Only matches if: currentOperand is a numeric literal ending with e/E AND next char after +/- is a digit
    // Examples: "1e+5" (scientific), "1e-10" (scientific), "distance+1" (not scientific)
    const endsWithScientificE = currentOperand && /^-?(\d+\.?\d*|\d*\.\d+)[eE]$/.test(currentOperand);
    const nextCharIsDigit = i + 1 < formula.length && /\d/.test(formula[i + 1] ?? '');
    const isScientificSign = endsWithScientificE && (char === '+' || char === '-') && nextCharIsDigit;

    if ('+-*/%'.includes(char) && parenDepth === 0 && !isScientificSign) {
      // Save current operand if we have one
      if (currentOperand && currentOperandStart) {
        operands.push(currentOperand);
        positions.push(currentOperandStart);
        currentOperand = '';
        currentOperandStart = null;
        justPushedOperand = true;
      } else {
        justPushedOperand = false;
      }

      // Check if this is a unary minus (at start or after another operator)
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

      column++;
      i++;
    } else {
      // Part of an operand - track start if not already tracking
      if (!currentOperandStart) {
        currentOperandStart = { line, column, offset: i };
      }
      currentOperand += char;
      column++;
      i++;
    }
  }

  // Add final operand
  if (currentOperand && currentOperandStart) {
    operands.push(currentOperand);
    positions.push(currentOperandStart);
  }

  // Validate invariants
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
 * Calculate end position from start position and text length
 * Handles multi-line text by counting newlines
 */
function calculateEndPosition(startPos: FormulaPosition, text: string): { line: number; column: number } {
  let line = startPos.line;
  let column = startPos.column;

  for (const char of text) {
    if (char === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Create a complete PositionInfo from start position and text
 */
function createPositionInfo(startPos: FormulaPosition, text: string): PositionInfo {
  const endPos = calculateEndPosition(startPos, text);
  return {
    startLine: startPos.line,
    startColumn: startPos.column,
    endLine: endPos.line,
    endColumn: endPos.column,
  };
}

/**
 * Advance position by a given text (for calculating relative positions)
 */
function advancePosition(pos: FormulaPosition, text: string): FormulaPosition {
  const endPos = calculateEndPosition(pos, text);
  return {
    line: endPos.line,
    column: endPos.column,
    offset: pos.offset + text.length,
  };
}

/**
 * Parses a single operand string into an ASTNode
 * @param operand The operand string to parse
 * @param startPos Position where this operand starts
 */
function parseOperand(operand: string, startPos: FormulaPosition): ASTNode {
  const posInfo = createPositionInfo(startPos, operand);

  // Check if it's a literal number
  // Use a regex to ensure the entire operand is numeric (not just a numeric prefix like "5" in "5:10")
  // This regex allows: integers, decimals, leading/trailing decimal point, scientific notation
  const numericRegex = /^-?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/;
  if (numericRegex.test(operand)) {
    const numValue = parseFloat(operand);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return { type: 'literal', value: numValue, ...posInfo };
    }
  }

  // Check if it's the 'x' or 'X' variable
  if (operand === 'x' || operand === 'X') {
    return { type: 'variable', name: operand, ...posInfo };
  }

  // Check if it contains colons (function call with arguments)
  // This must be checked BEFORE parentheses because operators like m:distance(32)
  // have colons and should be parsed as function calls with colon-separated args
  if (operand.includes(':')) {
    return parseFunctionCall(operand, startPos);
  }

  // Check if it contains a left parenthesis (function-style operator only)
  if (operand.includes('(')) {
    return parseParenthesizedOperand(operand, startPos);
  }

  // If no special syntax, treat as a global formula reference
  return { type: 'global', name: operand, ...posInfo };
}

/**
 * Parses an operand with parentheses: name(arg)
 * Only valid for function-style operators (determined by isFunctionStyle in formula.json)
 * @param operand The operand string to parse
 * @param startPos Position where this operand starts
 */
function parseParenthesizedOperand(operand: string, startPos: FormulaPosition): MathFunctionNode {
  const parenIndex = operand.indexOf('(');
  const name = operand.substring(0, parenIndex);
  const argString = operand.substring(parenIndex + 1, operand.length - 1); // Remove '(' and ')'

  // Parentheses are only valid with function-style operators
  if (!isFunctionStyle(name)) {
    throw new Error(
      `Invalid syntax: '${name}(...)' - parentheses can only be used with function-style operators. '${name}' is not a valid function-style operator.`
    );
  }

  // Calculate position after the opening parenthesis
  const beforeParen = operand.substring(0, parenIndex + 1);
  const argStartPos = advancePosition(startPos, beforeParen);

  // Try to parse argument as a number or formula
  let argument: ASTNode | undefined;
  const numericRegex = /^-?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/;
  if (numericRegex.test(argString)) {
    const numValue = parseFloat(argString);
    if (!isNaN(numValue) && isFinite(numValue)) {
      argument = { type: 'literal', value: numValue, ...createPositionInfo(argStartPos, argString) };
    }
  } else if (argString === 'x' || argString === 'X') {
    argument = { type: 'variable', name: argString, ...createPositionInfo(argStartPos, argString) };
  } else if (argString) {
    // Recursively parse the argument as a formula
    argument = parseFormula(argString, argStartPos);
  }

  // Create a FunctionNameNode with position tracking for just the function name
  const nameNode: FunctionNameNode = {
    type: 'functionName',
    value: name,
    ...createPositionInfo(startPos, name),
  };

  return { type: 'mathFunction', name: nameNode, argument, ...createPositionInfo(startPos, operand) };
}

/**
 * Parses a function-style argument like "distance(32)" or "rand(100)"
 * Used only for m: and d: operators (and operators that delegate to them)
 * Returns the function name and parsed parameters as AST nodes
 * @param arg The argument string to parse
 * @param startPos Position where this argument starts
 */
function parseFunctionStyleArg(arg: string, startPos: FormulaPosition): { name: string; params: ASTNode[] } | null {
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

  // Position after '('
  const beforeParen = arg.substring(0, parenIndex + 1);
  let currentPos = advancePosition(startPos, beforeParen);

  const params: ASTNode[] = paramStrings.map((param, idx) => {
    const paramStart = currentPos;

    // Try to parse as number
    const numericRegex = /^-?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/;
    if (numericRegex.test(param)) {
      const numValue = parseFloat(param);
      if (!isNaN(numValue) && isFinite(numValue)) {
        const result = { type: 'literal' as const, value: numValue, ...createPositionInfo(paramStart, param) };
        currentPos = advancePosition(currentPos, param + (idx < paramStrings.length - 1 ? ',' : ''));
        return result;
      }
    }

    // 'x' and 'X' are always parsed as variables
    if (param === 'x' || param === 'X') {
      const result = { type: 'variable' as const, name: param, ...createPositionInfo(paramStart, param) };
      currentPos = advancePosition(currentPos, param + (idx < paramStrings.length - 1 ? ',' : ''));
      return result;
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
    const result = { type: 'global' as const, name: param, ...createPositionInfo(paramStart, param) };
    currentPos = advancePosition(currentPos, param + (idx < paramStrings.length - 1 ? ',' : ''));
    return result;
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
 * @param operand The operand string to parse
 * @param startPos Position where this operand starts
 */
function parseFunctionCall(operand: string, startPos: FormulaPosition): FunctionCallNode {
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
      const bodyStartPos = advancePosition(startPos, functionPrefix);
      body = parseFormula(bodyString, bodyStartPos);
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

  // Track position after "name:"
  let currentPos = advancePosition(startPos, functionName + ':');
  const args: FunctionArg[] = rawArgs.map((arg, idx) => {
    const argStartPos = currentPos;

    if (isMathOperator && arg.includes('(')) {
      const parsed = parseFunctionStyleArg(arg, argStartPos);
      if (parsed) {
        const result = { type: 'functionStyle' as const, ...parsed, ...createPositionInfo(argStartPos, arg) };
        currentPos = advancePosition(currentPos, arg + (idx < rawArgs.length - 1 ? ':' : ''));
        return result;
      }
    }

    const result = { type: 'string' as const, value: arg, ...createPositionInfo(argStartPos, arg) };
    currentPos = advancePosition(currentPos, arg + (idx < rawArgs.length - 1 ? ':' : ''));
    return result;
  });

  // Create a FunctionNameNode with position tracking for just the function name
  const nameNode: FunctionNameNode = {
    type: 'functionName',
    value: functionName,
    ...createPositionInfo(startPos, functionName),
  };

  return {
    type: 'function',
    name: nameNode,
    args,
    body,
    ...createPositionInfo(startPos, operand),
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
      // Position: operator is before operand (one character earlier on same line)
      const unaryNode: ASTNode = {
        type: 'unaryOp',
        operator: unaryOp,
        operand: operand,
        startLine: operand.startLine,
        startColumn: Math.max(0, operand.startColumn - 1), // Approximate operator position
        endLine: operand.endLine,
        endColumn: operand.endColumn,
      };
      modifiedOperands[operandIndex] = unaryNode;
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

    const binaryNode: ASTNode = {
      type: 'binaryOp',
      operator: op as '*' | '/' | '%',
      left: left,
      right: right,
      startLine: left.startLine,
      startColumn: left.startColumn,
      endLine: right.endLine,
      endColumn: right.endColumn,
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

  const binaryNode: ASTNode = {
    type: 'binaryOp',
    operator: op as '+' | '-',
    left: left,
    right: right,
    startLine: left.startLine,
    startColumn: left.startColumn,
    endLine: right.endLine,
    endColumn: right.endColumn,
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
 * @param basePos Optional base position for nested formulas (defaults to line 0, column 0)
 */
export function parseFormula(formula: string, basePos?: FormulaPosition): ASTNode {
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

  const { operands, operators, positions, unaryOperandIndices } = tokenizeFormula(formula);

  // Parse each operand into an AST node with proper positions
  const operandNodes = operands.map((op, i) => {
    const pos = positions[i];
    if (pos === undefined) {
      throw new Error(`Missing position for operand ${i}: "${op}"`);
    }

    // If we have a base position, offset the position
    const adjustedPos: FormulaPosition = basePos
      ? {
          line: basePos.line + pos.line,
          column: pos.line === 0 ? basePos.column + pos.column : pos.column,
          offset: basePos.offset + pos.offset,
        }
      : pos;

    return parseOperand(op, adjustedPos);
  });

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

    case 'functionName':
      return `${indent}FunctionName(${node.value})`;

    case 'mathFunction':
      let mathStr = `${indent}MathFunction(${node.name.value})`;
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
