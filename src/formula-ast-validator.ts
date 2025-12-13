/**
 * AST Validator - Validates parsed formula ASTs against formula.json metadata
 * Checks argument counts, types, and calling conventions
 */

import {
  ASTNode,
  FunctionCallNode,
  FunctionArg,
  BinaryOperationNode,
  UnaryOperationNode,
  MathFunctionNode,
} from './formula-parser.js';
import formulaData from './formula.json' with { type: 'json' };
import { findSimilar } from './string-similarity.js';
import {
  resolveOperatorAlias,
  type FormulaArgument,
  type FormulaOperator,
  type FormulaData,
} from './formula-metadata.js';

const data = formulaData as FormulaData;

// Build lookup map for operators (by canonical name)
const operatorMap = new Map<string, FormulaOperator>();
for (const op of data.operators) {
  operatorMap.set(op.name, op);
}

export interface ValidationError {
  message: string;
  node: ASTNode | FunctionArg;
  path: string; // Path to the node in the tree for context
  operatorName: string | null; // Operator name for linking to formula reference
  suggestions: string[]; // Suggested corrections for typos
}

/**
 * Validates an AST against formula.json metadata
 * Returns array of validation errors (empty if valid)
 */
export function validateAST(ast: ASTNode, path: string = 'root'): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (ast.type) {
    case 'literal':
    case 'variable':
      // These are always valid
      break;

    case 'function':
      errors.push(...validateFunctionCall(ast, path));
      break;

    case 'global':
      // Global formula references - could validate against known globals
      // but we don't have that data in formula.json
      if (ast.argument) {
        errors.push(...validateAST(ast.argument, `${path}.argument`));
      }
      break;

    case 'mathFunction':
      // Math functions use function-style syntax
      errors.push(...validateMathFunction(ast, path));
      break;

    case 'binaryOp':
      errors.push(...validateBinaryOp(ast, path));
      break;

    case 'unaryOp':
      errors.push(...validateUnaryOp(ast, path));
      break;
  }

  return errors;
}

/**
 * Validates a function call node
 */
function validateFunctionCall(node: FunctionCallNode, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Resolve alias to canonical name
  const canonicalName = resolveOperatorAlias(node.name);
  const operator = canonicalName ? operatorMap.get(canonicalName) : undefined;

  if (!operator) {
    // Find similar operator names for suggestions (include both names and aliases)
    const allOperatorNames = Array.from(operatorMap.keys());
    const allAliases: string[] = [];
    for (const op of data.operators) {
      if (op.aliases) {
        allAliases.push(...op.aliases);
      }
    }
    const allNames = [...allOperatorNames, ...allAliases];
    const similar = findSimilar(node.name, allNames);
    const suggestions = similar.map(s => s.value);

    errors.push({
      message: `Unknown operator: '${node.name}'`,
      node,
      path,
      operatorName: null,
      suggestions,
    });
    return errors;
  }

  // Special case: m/M and d/D (and their aliases), and operators that delegate to them,
  // are marked as isFunctionStyle but they use colon syntax.
  // The "function style" refers to their arguments, not their calling convention
  // Resolve the canonical name to check (handles aliases like "M", "D", "Data", etc.)
  const isMathOperator =
    canonicalName === 'm' || canonicalName === 'd' || operator.delegatesTo === 'm' || operator.delegatesTo === 'd';
  if (operator.isFunctionStyle && !isMathOperator) {
    errors.push({
      message: `Operator '${node.name}' requires function-style syntax with parentheses, not colon-separated. Example: ${operator.uses[0]?.example || node.name + '(...)'}`,
      node,
      path,
      operatorName: node.name,
      suggestions: [],
    });
  }

  // Find use cases that match the provided argument count
  const providedArgs = node.args.length + (node.body ? 1 : 0);
  const matchingUses = operator.uses.filter(use => {
    const expectedArgCount = use.arguments?.length || 0;
    return expectedArgCount === providedArgs;
  });

  // If no use cases match the argument count, report an error
  if (matchingUses.length === 0) {
    // Build a list of all possible argument patterns
    const possiblePatterns = operator.uses.map(use => {
      const args = use.arguments || [];
      if (args.length === 0) {
        return `${node.name} (no arguments)`;
      }
      return `${node.name}:${args.map(a => a.name).join(':')}`;
    });

    errors.push({
      message: `Operator '${node.name}' does not have a use case with ${providedArgs} argument(s). Possible patterns: ${possiblePatterns.join(' OR ')}`,
      node,
      path,
      operatorName: node.name,
      suggestions: [],
    });

    // Skip argument validation since no use case matches
    if (node.body) {
      errors.push(...validateAST(node.body, `${path}.body`));
    }
    return errors;
  }

  // Use the first matching use case for argument type validation
  // (In most cases, there's only one matching use case per argument count)
  const expectedArgs = matchingUses[0]?.arguments ?? [];

  // Validate each argument type
  node.args.forEach((arg, i) => {
    const expectedArg = expectedArgs[i];
    if (!expectedArg) return;

    errors.push(...validateFunctionArg(arg, expectedArg, node.name, `${path}.args[${i}]`));
  });

  // Validate body if present
  if (node.body) {
    const formulaArgIndex = expectedArgs.findIndex(a => a.type === 'formula');
    if (formulaArgIndex === -1) {
      errors.push({
        message: `Operator '${node.name}' does not expect a formula body`,
        node,
        path: `${path}.body`,
        operatorName: node.name,
        suggestions: [],
      });
    } else {
      // Recursively validate the body
      errors.push(...validateAST(node.body, `${path}.body`));
    }
  }

  return errors;
}

/**
 * Validates that a parameter (ASTNode) matches the expected type
 * This is used for validating parameters inside function-style arguments like d:foo(5)
 */
function validateParameterType(
  param: ASTNode,
  expectedArg: FormulaArgument,
  operatorName: string,
  path: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (expectedArg.type) {
    case 'integer':
    case 'float':
    case 'byte':
      // Parameter should be a literal number, not a complex formula
      if (param.type !== 'literal') {
        errors.push({
          message: `Parameter '${expectedArg.name}' of operator '${operatorName}' expects a ${expectedArg.type}, but got a formula expression`,
          node: param,
          path,
          operatorName,
          suggestions: [],
        });
      }
      break;

    case 'boolean':
      // Should be a literal 0/1 or true/false
      if (param.type !== 'literal') {
        errors.push({
          message: `Parameter '${expectedArg.name}' of operator '${operatorName}' expects a boolean, but got a formula expression`,
          node: param,
          path,
          operatorName,
          suggestions: [],
        });
      }
      break;

    case 'string':
      // String type - this is more complex, would need to check if it's a simple identifier
      break;

    case 'formula':
      // Formula type - any valid formula is acceptable
      break;

    default:
      // Other types - we don't validate these yet
      break;
  }

  return errors;
}

/**
 * Validates a single function argument against expected type
 */
function validateFunctionArg(
  arg: FunctionArg,
  expectedArg: FormulaArgument,
  operatorName: string,
  path: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (arg.type === 'string') {
    // String argument - check if it matches expected type
    const value = arg.value;

    switch (expectedArg.type) {
      case 'integer':
      case 'float':
      case 'byte':
        // Should be a number
        if (isNaN(parseFloat(value))) {
          errors.push({
            message: `Argument '${expectedArg.name}' of operator '${operatorName}' expects a ${expectedArg.type}, but got non-numeric value: '${value}'`,
            node: arg,
            path,
            operatorName,
            suggestions: [],
          });
        }
        break;

      case 'boolean':
        // Should be true/false or 0/1
        if (!['true', 'false', '0', '1'].includes(value.toLowerCase())) {
          errors.push({
            message: `Argument '${expectedArg.name}' of operator '${operatorName}' expects a boolean, but got: '${value}'`,
            node: arg,
            path,
            operatorName,
            suggestions: [],
          });
        }
        break;

      case 'string':
        // For m: operators (and their aliases), or operators that delegate to m:,
        // check if m:value exists as an operator
        const canonicalOperatorName = resolveOperatorAlias(operatorName);
        const currentOperator = canonicalOperatorName ? operatorMap.get(canonicalOperatorName) : undefined;
        const delegatesTo = currentOperator?.delegatesTo;

        // Check if this is the m: operator itself, or an operator that delegates to m:
        if (canonicalOperatorName === 'm' || delegatesTo === 'm') {
          const fullOperatorName = `m:${value}`;
          // Resolve alias to canonical name (e.g., m:tileDistance -> m:distance)
          const canonicalFullName = resolveOperatorAlias(fullOperatorName);
          const specificOperator = canonicalFullName ? operatorMap.get(canonicalFullName) : undefined;

          if (!specificOperator) {
            // m:functionName not found - suggest similar m: operators (including aliases)
            const allMOperatorNames = Array.from(operatorMap.keys()).filter(name => name.startsWith('m:'));
            const allMAliases: string[] = [];
            for (const op of data.operators) {
              if (op.name.startsWith('m:') && op.aliases) {
                allMAliases.push(...op.aliases);
              }
            }
            const allMOperators = [...allMOperatorNames, ...allMAliases];
            const similar = findSimilar(fullOperatorName, allMOperators);
            // Preserve user's chosen alias prefix (e.g., "math:" or "mIs0:")
            const userPrefix = operatorName + ':';
            const suggestions = similar.map(s => s.value.replace(/^m:/, userPrefix));

            errors.push({
              message: `Unknown operator: '${operatorName}:${value}'`,
              node: arg,
              path,
              operatorName: null,
              suggestions,
            });
          }
        }
        // For d:, the formula name is defined at runtime, so we can't validate it
        break;

      case 'formula':
        errors.push({
          message: `Argument '${expectedArg.name}' of operator '${operatorName}' expects a formula expression, not a simple string`,
          node: arg,
          path,
          operatorName,
          suggestions: [],
        });
        break;

      default:
        // Other types like enums, we'd need more metadata to validate
        break;
    }
  } else if (arg.type === 'functionStyle') {
    // Function-style argument (only valid for m: and d: and their aliases, or operators that delegate to them)
    // For m: operators (or those that delegate to m:), try to look up m:functionName (e.g., m:distance) first
    let specificOperator: FormulaOperator | undefined;
    let specificOperatorName = operatorName;

    const canonicalArgOperatorName = resolveOperatorAlias(operatorName);
    const currentArgOperator = canonicalArgOperatorName ? operatorMap.get(canonicalArgOperatorName) : undefined;
    const argDelegatesTo = currentArgOperator?.delegatesTo;

    // Check if this is the m: operator itself, or an operator that delegates to m:
    if (canonicalArgOperatorName === 'm' || argDelegatesTo === 'm') {
      const fullOperatorName = `m:${arg.name}`;
      // Resolve alias to canonical name (e.g., m:tileDistance -> m:distance)
      const canonicalFullName = resolveOperatorAlias(fullOperatorName);
      specificOperator = canonicalFullName ? operatorMap.get(canonicalFullName) : undefined;
      if (specificOperator && canonicalFullName) {
        specificOperatorName = canonicalFullName;
      } else {
        // m:functionName not found - suggest similar m: operators (including aliases)
        const allMOperatorNames = Array.from(operatorMap.keys()).filter(name => name.startsWith('m:'));
        const allMAliases: string[] = [];
        for (const op of data.operators) {
          if (op.name.startsWith('m:') && op.aliases) {
            allMAliases.push(...op.aliases);
          }
        }
        const allMOperators = [...allMOperatorNames, ...allMAliases];
        const similar = findSimilar(fullOperatorName, allMOperators);
        // Preserve user's chosen alias prefix (e.g., "math:" or "mIs0:")
        const userPrefix = operatorName + ':';
        const suggestions = similar.map(s => s.value.replace(/^m:/, userPrefix));

        errors.push({
          message: `Unknown operator: '${operatorName}:${arg.name}'`,
          node: arg,
          path,
          operatorName: null,
          suggestions,
        });
        return errors;
      }
    }

    // If we didn't find a specific operator, fall back to the base operator
    // Resolve alias to canonical name (e.g., "data" -> "d", "Data" -> "d")
    const canonicalBaseOperatorName = resolveOperatorAlias(operatorName);

    // If this operator delegates to another (like dMin0 delegates to d), use the delegated operator
    // for parameter validation, since that's where the parameter metadata lives
    const baseOperatorName = argDelegatesTo || canonicalBaseOperatorName;
    const operator = specificOperator || (baseOperatorName ? operatorMap.get(baseOperatorName) : undefined);

    if (operator) {
      const firstUse = operator.uses[0];
      if (!firstUse) {
        throw new Error(`Operator ${operator.name} somehow has zero uses.`);
      }
      // Find the use case with the most arguments (includes parameters)
      const useWithParams = operator.uses.reduce(
        (max, use) => (use.arguments && use.arguments.length > (max.arguments?.length || 0) ? use : max),
        firstUse
      );

      // The parameters correspond to arguments after the first one (for d:) or all arguments (for m:functionName)
      const paramArguments = specificOperator
        ? useWithParams.arguments || [] // For m:distance, all arguments are parameters
        : useWithParams.arguments?.slice(1) || []; // For d:, skip formulaName

      if (paramArguments.length > 0) {
        // Validate each parameter against its expected type
        arg.params.forEach((param, i) => {
          const expectedParamArg = paramArguments[i];
          if (expectedParamArg) {
            // Check if the parameter is a literal that matches the expected type
            errors.push(
              ...validateParameterType(param, expectedParamArg, specificOperatorName, `${path}.params[${i}]`)
            );
          }
          // Also recursively validate the parameter's structure
          errors.push(...validateAST(param, `${path}.params[${i}]`));
        });
      } else {
        // No parameters expected, but some were provided
        if (arg.params.length > 0) {
          errors.push({
            message: `Function '${arg.name}' in operator '${specificOperatorName}' does not accept parameters`,
            node: arg,
            path,
            operatorName: specificOperatorName,
            suggestions: [],
          });
        }
      }
    } else {
      // Just validate the parameters recursively
      arg.params.forEach((param, i) => {
        errors.push(...validateAST(param, `${path}.params[${i}]`));
      });
    }
  }

  return errors;
}

/**
 * Validates a math function (function-style operator)
 */
function validateMathFunction(node: MathFunctionNode, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const operator = operatorMap.get(node.name);

  if (!operator) {
    errors.push({
      message: `Unknown function-style operator: '${node.name}'`,
      node,
      path,
      operatorName: null,
      suggestions: [],
    });
    return errors;
  }

  // Check if this operator should NOT use function-style syntax
  if (!operator.isFunctionStyle) {
    errors.push({
      message: `Operator '${node.name}' should use colon-separated syntax, not parentheses. Example: ${operator.uses[0]?.example || node.name + ':...'}`,
      node,
      path,
      operatorName: node.name,
      suggestions: [],
    });
  }

  // Validate the argument if present
  if (node.argument) {
    errors.push(...validateAST(node.argument, `${path}.argument`));
  }

  return errors;
}

/**
 * Validates a binary operation
 */
function validateBinaryOp(node: BinaryOperationNode, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate both operands
  errors.push(...validateAST(node.left, `${path}.left`));
  errors.push(...validateAST(node.right, `${path}.right`));

  return errors;
}

/**
 * Validates a unary operation
 */
function validateUnaryOp(node: UnaryOperationNode, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate the operand
  errors.push(...validateAST(node.operand, `${path}.operand`));

  return errors;
}

/**
 * Formats validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return 'No validation errors found.';
  }

  return errors.map((err, i) => `${i + 1}. [${err.path}] ${err.message}`).join('\n');
}
