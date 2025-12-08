/**
 * Formula Parser - Recreates the C# Formula parsing algorithm to generate an AST
 *
 * Based on Tactics/Formula.cs parsing logic:
 * 1. Split formula by operators (+-*\/%) to get operands
 * 2. Process each operand from right to left
 * 3. Each operand can be:
 *    - A literal number or 'x' variable
 *    - A function call with colon-separated arguments (e.g., "c:HP", "min:5:c:STR")
 *    - A global formula reference with optional parenthesized argument
 *    - A math function with parenthesized argument
 * 4. Replace operands with their values and evaluate the math expression
 *
 * After parsing, use validateAST() from formula-ast-validator.ts to check
 * the AST against formula.json metadata.
 */

import {
  isFunctionStyle,
  getArgCount,
  hasFormulaBody,
  resolveOperatorAlias,
  getAlternateDelimiters,
} from "./formula-metadata.js";

// Re-export validator for convenience
export {
  validateAST,
  formatValidationErrors,
  type ValidationError,
} from "./formula-ast-validator.js";

export type ASTNode =
  | LiteralNode
  | VariableNode
  | FunctionCallNode
  | GlobalFormulaNode
  | MathFunctionNode
  | BinaryOperationNode
  | UnaryOperationNode;

export interface LiteralNode {
  type: "literal";
  value: number;
}

export interface VariableNode {
  type: "variable";
  name: string; // 'x', 'X'
}

export interface FunctionCallNode {
  type: "function";
  name: string; // e.g., 'c', 't', 'min', 'max', 'lessThan', etc.
  args: FunctionArg[]; // Colon-separated arguments
  body?: ASTNode; // For functions that take formula expressions (min, max, lessThan, etc.)
}

export type FunctionArg = StringArg | FunctionStyleArg;

export interface StringArg {
  type: "string";
  value: string; // Simple string argument like "HP" in c:HP
}

export interface FunctionStyleArg {
  type: "functionStyle";
  name: string; // Function name like "distance" in m:distance(32)
  params: ASTNode[]; // Parameters like [Literal(32)]
}

export interface GlobalFormulaNode {
  type: "global";
  name: string;
  argument?: ASTNode; // Optional parenthesized argument
}

export interface MathFunctionNode {
  type: "mathFunction";
  name: string; // e.g., 'distance', 'evasionFacing', etc.
  argument?: ASTNode; // Optional parenthesized argument
}

export interface BinaryOperationNode {
  type: "binaryOp";
  operator: "+" | "-" | "*" | "/" | "%";
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOperationNode {
  type: "unaryOp";
  operator: "-" | "+";
  operand: ASTNode;
}

/**
 * Tokenizes a formula into operands and operators
 * Handles unary operators (only - is supported, + crashes the game)
 */
function tokenizeFormula(formula: string): {
  operands: string[];
  operators: string[];
  positions: number[];
} {
  // Remove all whitespace (matches C# behavior)
  const cleanFormula = formula.replace(/\s+/g, "");

  // Parse character by character to properly handle unary operators
  const operands: string[] = [];
  const operators: string[] = [];
  const positions: number[] = [];

  let i = 0;
  let currentOperand = "";
  let currentOperandStart = 0;
  let justPushedOperand = false;

  while (i < cleanFormula.length) {
    const char = cleanFormula[i];

    // Check if this is an operator
    if ("+-*/%".includes(char)) {
      // Save current operand if we have one
      if (currentOperand) {
        operands.push(currentOperand);
        positions.push(currentOperandStart);
        currentOperand = "";
        justPushedOperand = true;
      } else {
        justPushedOperand = false;
      }

      // Check if this is a unary minus (at start or after another operator)
      // If we just pushed an operand, this must be a binary operator
      const prevIsOperator = !justPushedOperand;
      if (char === "-" && prevIsOperator) {
        // Unary minus
        operators.push("unary-");
      } else if (char === "+" && prevIsOperator) {
        // Unary plus - this crashes the game!
        throw new Error(
          `Invalid syntax: unary '+' is not supported by the game. Use '-' for negation or remove the '+'.`,
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

  return { operands, operators, positions };
}

/**
 * Parses a single operand into an AST node
 * Operands are processed right-to-left in the original C# code
 */
function parseOperand(operand: string): ASTNode {
  // Check if it's a literal number
  const numValue = parseFloat(operand);
  if (!isNaN(numValue) && operand === numValue.toString()) {
    return { type: "literal", value: numValue };
  }

  // Check if it's the 'x' or 'X' variable
  if (operand === "x" || operand === "X") {
    return { type: "variable", name: operand };
  }

  // Check if it contains colons (function call with arguments)
  // This must be checked BEFORE parentheses because operators like m:distance(32)
  // have colons and should be parsed as function calls with colon-separated args
  if (operand.includes(":")) {
    return parseFunctionCall(operand);
  }

  // Check if it contains a left parenthesis (global formula or math function)
  if (operand.includes("(")) {
    return parseParenthesizedOperand(operand);
  }

  // If no special syntax, treat as a global formula reference or math function name
  return { type: "global", name: operand };
}

/**
 * Parses an operand with parentheses: name(arg)
 * Used for function-style operators (determined by isFunctionStyle in formula.json)
 */
function parseParenthesizedOperand(
  operand: string,
): GlobalFormulaNode | MathFunctionNode {
  const parenIndex = operand.indexOf("(");
  const name = operand.substring(0, parenIndex);
  const argString = operand.substring(parenIndex + 1, operand.length - 1); // Remove '(' and ')'

  // Try to parse argument as a number or formula
  let argument: ASTNode | undefined;
  const numValue = parseFloat(argString);
  if (!isNaN(numValue) && argString === numValue.toString()) {
    argument = { type: "literal", value: numValue };
  } else if (argString === "x" || argString === "X") {
    argument = { type: "variable", name: argString };
  } else if (argString) {
    // Recursively parse the argument as a formula
    argument = parseFormula(argString);
  }

  // Check if this operator is marked as function-style in formula.json
  // Function-style operators use parentheses: m:distance(5), d(gswordDmg)
  // Otherwise, it's a global formula reference
  if (isFunctionStyle(name)) {
    return { type: "mathFunction", name, argument };
  } else {
    return { type: "global", name, argument };
  }
}

/**
 * Parses a function-style argument like "distance(32)" or "rand(100)"
 * Returns the function name and parsed parameters
 */
function parseFunctionStyleArg(
  arg: string,
): { name: string; params: ASTNode[] } | null {
  const parenIndex = arg.indexOf("(");
  if (parenIndex === -1) {
    return null;
  }

  const name = arg.substring(0, parenIndex);
  const paramString = arg.substring(parenIndex + 1, arg.length - 1); // Remove '(' and ')'

  // Split parameters by comma (for multi-param functions)
  const paramStrings = paramString
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);
  const params: ASTNode[] = paramStrings.map((param) => {
    // Try to parse as number
    const numValue = parseFloat(param);
    if (!isNaN(numValue) && param === numValue.toString()) {
      return { type: "literal", value: numValue };
    }

    // Try to parse as variable
    if (param === "x" || param === "X") {
      return { type: "variable", name: param };
    }

    // Otherwise parse as formula
    return parseFormula(param);
  });

  return { name, params };
}

/**
 * Splits a string by delimiters (colons and optionally commas), but only those outside of parentheses
 */
function splitByDelimitersRespectingParens(str: string, additionalDelimiters: string[] = []): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  const allDelimiters = new Set([":", ...additionalDelimiters]);

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (allDelimiters.has(char) && parenDepth === 0) {
      // Delimiter at top level - this is a separator
      parts.push(current);
      current = "";
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

    const functionPrefix =
      functionName + ":" + nonFormulaArgs.join(":") + (argCount > 0 ? ":" : "");
    const bodyString = operand.substring(functionPrefix.length);

    if (bodyString) {
      body = parseFormula(bodyString);
      // Only keep non-formula arguments
      rawArgs = nonFormulaArgs;
    }
  }

  // Parse each argument - only m: and d: operators (and their aliases) support function-style arguments with parentheses
  const canonicalFunctionName = resolveOperatorAlias(functionName);
  const isMathOperator = canonicalFunctionName === "m" || canonicalFunctionName === "d";
  const args: FunctionArg[] = rawArgs.map((arg) => {
    if (isMathOperator && arg.includes("(")) {
      const parsed = parseFunctionStyleArg(arg);
      if (parsed) {
        return { type: "functionStyle", ...parsed };
      }
    }
    return { type: "string", value: arg };
  });

  return {
    type: "function",
    name: functionName,
    args,
    body,
  };
}

/**
 * Builds a binary operation tree from operands and operators
 * Respects standard math operator precedence (*, /, % before +, -)
 * Handles unary operators (-, +)
 */
function buildOperationTree(operands: ASTNode[], operators: string[]): ASTNode {
  if (operands.length === 1 && operators.length === 0) {
    return operands[0];
  }

  // First, handle unary operators (highest precedence, right-to-left)
  // Unary operators are marked as "unary-"
  // When we have "unary-" at index i, it applies to operands[i]
  for (let i = operators.length - 1; i >= 0; i--) {
    if (operators[i].startsWith("unary")) {
      const unaryOp = operators[i].substring(5) as "-" | "+"; // Remove "unary" prefix
      const unaryNode: UnaryOperationNode = {
        type: "unaryOp",
        operator: unaryOp,
        operand: operands[i],
      };
      // Replace the operand with the unary node
      operands[i] = unaryNode;
      // Remove the operator
      operators.splice(i, 1);
    }
  }

  if (operands.length === 1) {
    return operands[0];
  }

  // Second pass: handle *, /, % (higher precedence)
  const highPrecedenceOps = ["*", "/", "%"];
  while (operators.some((op) => highPrecedenceOps.includes(op))) {
    const index = operators.findIndex((op) => highPrecedenceOps.includes(op));
    if (index === -1) break;

    const newNode: BinaryOperationNode = {
      type: "binaryOp",
      operator: operators[index] as "+" | "-" | "*" | "/" | "%",
      left: operands[index],
      right: operands[index + 1],
    };

    operands.splice(index, 2, newNode);
    operators.splice(index, 1);
  }

  // Third pass: handle +, - (lower precedence)
  while (operators.length > 0) {
    const newNode: BinaryOperationNode = {
      type: "binaryOp",
      operator: operators[0] as "+" | "-" | "*" | "/" | "%",
      left: operands[0],
      right: operands[1],
    };

    operands.splice(0, 2, newNode);
    operators.splice(0, 1);
  }

  return operands[0];
}

/**
 * Main entry point: parses a formula string into an AST
 */
export function parseFormula(formula: string): ASTNode {
  // Check for invalid characters immediately after colon
  // Colons must be followed by a letter or digit (not underscore)
  // Invalid: abs:(1-2), abs:-2, min:+5, min: d:foo (space after colon), c:_foo (underscore)
  // Valid: c:HP, m:distance(32), d:gswordDmg
  const invalidAfterColonPattern = /(\w+):([^a-zA-Z0-9])/;
  const invalidMatch = formula.match(invalidAfterColonPattern);
  if (invalidMatch) {
    const operatorName = invalidMatch[1];
    const invalidChar = invalidMatch[2];

    let errorMsg = `Invalid syntax: '${operatorName}:${invalidChar}' - `;
    if (invalidChar === "(") {
      errorMsg += `parentheses cannot appear immediately after colon.`;
    } else if ("+-*/%".includes(invalidChar)) {
      errorMsg += `math operator cannot appear immediately after colon.`;
    } else if (invalidChar === " ") {
      errorMsg += `space cannot appear after colon. Remove the space.`;
    } else if (invalidChar === "_") {
      errorMsg += `underscore cannot appear after colon. Colon must be followed by a letter or digit.`;
    } else {
      errorMsg += `colon must be followed by a letter or digit, not '${invalidChar}'.`;
    }
    throw new Error(errorMsg);
  }

  const { operands, operators } = tokenizeFormula(formula);

  // Parse each operand into an AST node
  const operandNodes = operands.map(parseOperand);

  // Build the operation tree respecting precedence
  return buildOperationTree(operandNodes, operators);
}

/**
 * Pretty-prints an AST for debugging
 */
export function printAST(node: ASTNode, indent: string = ""): string {
  switch (node.type) {
    case "literal":
      return `${indent}Literal(${node.value})`;

    case "variable":
      return `${indent}Variable(${node.name})`;

    case "function":
      let funcStr = `${indent}Function(${node.name})`;

      // Print arguments
      if (node.args.length > 0) {
        funcStr += "\n" + indent + "  args:";
        node.args.forEach((arg, i) => {
          if (arg.type === "string") {
            funcStr += "\n" + indent + `    [${i}] "${arg.value}"`;
          } else {
            // Function-style argument with params
            funcStr += "\n" + indent + `    [${i}] ${arg.name}(...)`;
            arg.params.forEach((param, j) => {
              funcStr +=
                "\n" +
                printAST(param, indent + "      ").replace(
                  indent + "      ",
                  indent + `      param[${j}]: `,
                );
            });
          }
        });
      }

      // Print body if present
      if (node.body) {
        funcStr += "\n" + indent + "  body:";
        funcStr += "\n" + printAST(node.body, indent + "    ");
      }

      return funcStr;

    case "global":
      let globalStr = `${indent}GlobalFormula(${node.name})`;
      if (node.argument) {
        globalStr += "\n" + printAST(node.argument, indent + "  ");
      }
      return globalStr;

    case "mathFunction":
      let mathStr = `${indent}MathFunction(${node.name})`;
      if (node.argument) {
        mathStr += "\n" + printAST(node.argument, indent + "  ");
      }
      return mathStr;

    case "binaryOp":
      return (
        `${indent}BinaryOp(${node.operator})\n` +
        printAST(node.left, indent + "  ") +
        "\n" +
        printAST(node.right, indent + "  ")
      );

    case "unaryOp":
      return (
        `${indent}UnaryOp(${node.operator})\n` +
        printAST(node.operand, indent + "  ")
      );
  }
}
