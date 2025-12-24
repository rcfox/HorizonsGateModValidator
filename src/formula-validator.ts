/**
 * Formula validator
 * Validates formula syntax using the AST parser and validator
 */

import { ValidationMessage, Correction, PropertyInfo } from './types.js';
import { parseFormula, validateAST, type ValidationError } from './formula-parser.js';

/**
 * Validate a formula string using the AST parser and validator
 */
export function validateFormula(
  formula: string,
  propInfo: PropertyInfo,
  propertyName: string,
  objectType: string
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (!formula || formula.trim().length === 0) {
    // Empty formula is valid (defaults to 0 or empty)
    return messages;
  }

  const allowXParameter = objectType === 'FormulaGlobal' && propertyName === 'formula';

  try {
    const ast = parseFormula(formula);
    const validationErrors = validateAST(ast, undefined, allowXParameter);

    // Convert AST validation errors to ValidationMessages
    for (const error of validationErrors) {
      const corrections = createCorrections(formula, error, propInfo);

      // Calculate actual line number for multi-line formulas
      // Node positions are relative to formula start, so add to property value start line
      const errorLine = propInfo.valueStartLine + error.node.startLine;

      messages.push({
        ...error, // FIXME: Look into unifying ValidationError and ValidationMessage
        severity: 'error',
        filePath: propInfo.filePath,
        line: errorLine,
        formulaReference: error.operatorName ?? undefined,
        corrections: corrections.length > 0 ? corrections : undefined,
      });
    }
  } catch (e: unknown) {
    // Parse error
    const errorMessage = e instanceof Error ? e.message : String(e);
    messages.push({
      severity: 'error',
      message: `Formula parse error: ${errorMessage}`,
      filePath: propInfo.filePath,
      line: propInfo.valueStartLine,
    });
  }

  return messages;
}

/**
 * Create position-based corrections from formula validation error
 */
function createCorrections(_formula: string, error: ValidationError, propInfo: PropertyInfo): Correction[] {
  if (error.suggestions.length === 0) {
    return [];
  }

  // Use position information from the AST node (now includes line and column)
  const nodeStartLine = error.node.startLine;
  const nodeStartColumn = error.node.startColumn;
  const nodeEndLine = error.node.endLine;
  const nodeEndColumn = error.node.endColumn;

  // Calculate absolute position by combining node position with property value position
  // Node positions are relative to the start of the formula value
  const startLine = propInfo.valueStartLine + nodeStartLine;
  const endLine = propInfo.valueStartLine + nodeEndLine;

  // For the first line of the node, add the property value's start column
  // For subsequent lines, use the column as-is (relative to start of line)
  const startColumn = nodeStartLine === 0 ? propInfo.valueStartColumn + nodeStartColumn : nodeStartColumn;
  const endColumn = nodeEndLine === 0 ? propInfo.valueStartColumn + nodeEndColumn : nodeEndColumn;

  // Create a correction for each suggestion
  return error.suggestions.map(suggestion => ({
    filePath: propInfo.filePath,
    startLine,
    startColumn,
    endLine,
    endColumn,
    replacementText: suggestion,
  }));
}
