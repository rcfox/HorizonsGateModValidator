/**
 * Formula validator
 * Validates formula syntax using the AST parser and validator
 */

import { ValidationMessage, Correction, PropertyInfo, ValidationErrorCode } from './types.js';
import {
  parseFormula,
  substituteAtG,
  getActiveDeclarations,
  validateAST,
  type ValidationError,
} from './formula-parser.js';

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

  // @G<name> is a runtime string substitution. If declarations are active (set by the
  // orchestrator), substituteAtG resolves what it can. Anything unresolved means we can't
  // fully validate the post-substitution form, so emit info. If substitution hit the
  // iteration cap, the declarations likely cycle (e.g., a→b→a) — error and skip further
  // validation since we can't produce a meaningful AST.
  const declarations = getActiveDeclarations();
  const { result: effectiveFormula, hadSubstitution, recursionLimitHit } = substituteAtG(formula, declarations);

  if (recursionLimitHit) {
    messages.push({
      severity: 'error',
      message: `@G substitution recursion limit was reached while expanding formula '${formula}'; check declared values for a cycle.`,
      filePath: propInfo.filePath,
      line: propInfo.valueStartLine,
      errorCode: ValidationErrorCode.FORMULA_AT_G_RECURSION,
    });
    return messages;
  }

  const hasUnresolvedAtG = effectiveFormula.includes('@G');

  if (hasUnresolvedAtG) {
    messages.push({
      severity: 'info',
      message: `Formula contains @G runtime global-var substitution; cannot fully validate post-substitution form`,
      filePath: propInfo.filePath,
      line: propInfo.valueStartLine,
      errorCode: ValidationErrorCode.FORMULA_HAS_GLOBAL_VAR,
    });
  }

  const allowXParameter = objectType === 'FormulaGlobal' && propertyName === 'formula';

  try {
    const ast = parseFormula(effectiveFormula);
    const validationErrors = validateAST(ast, undefined, allowXParameter);

    // Convert AST validation errors to ValidationMessages
    for (const error of validationErrors) {
      // After substitution, AST positions refer to the substituted string, not the source.
      // Fall back to the property's value start so errors land on the right line.
      const corrections = hadSubstitution ? [] : createCorrections(formula, error, propInfo);
      const errorLine = hadSubstitution ? propInfo.valueStartLine : propInfo.valueStartLine + error.node.startLine;
      const contextNote = hadSubstitution ? `After @G substitution: '${effectiveFormula}'` : error.context;

      messages.push({
        ...error, // FIXME: Look into unifying ValidationError and ValidationMessage
        context: contextNote,
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
    const suffix = hadSubstitution ? ` (after @G substitution to '${effectiveFormula}')` : '';
    messages.push({
      severity: 'error',
      message: `Formula parse error: ${errorMessage}${suffix}`,
      filePath: propInfo.filePath,
      line: propInfo.valueStartLine,
      errorCode: ValidationErrorCode.FORMULA_PARSE_ERROR,
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
