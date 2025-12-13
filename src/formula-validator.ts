/**
 * Formula validator
 * Validates formula syntax using the AST parser and validator
 */

import { ValidationMessage, Correction, PropertyInfo } from './types.js';
import { parseFormula, validateAST, type ValidationError, type ASTNode, type FunctionArg } from './formula-parser.js';

/**
 * Validate a formula string using the AST parser and validator
 */
export function validateFormula(formula: string, propInfo: PropertyInfo): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (!formula || formula.trim().length === 0) {
    // Empty formula is valid (defaults to 0 or empty)
    return messages;
  }

  try {
    // Step 1: Parse the formula into an AST
    const ast = parseFormula(formula);

    // Step 2: Validate the AST against formula.json metadata
    const validationErrors = validateAST(ast);

    // Convert AST validation errors to ValidationMessages
    for (const error of validationErrors) {
      const corrections = createCorrections(formula, error, propInfo);

      messages.push({
        severity: 'error',
        message: error.message,
        line: propInfo.valueStartLine,
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
      line: propInfo.valueStartLine,
    });
  }

  return messages;
}

/**
 * Create position-based corrections from formula validation error
 */
function createCorrections(formula: string, error: ValidationError, propInfo: PropertyInfo): Correction[] {
  if (error.suggestions.length === 0) {
    return [];
  }

  // Get the incorrect text from the node
  const incorrectText = getNodeText(error.node);
  if (!incorrectText) {
    return [];
  }

  // Check if any suggestion includes an operator prefix (e.g., "m:distance")
  // This handles cases where suggestions have prefixes that need to be included in the search
  let textToFind = incorrectText;
  const colonSuggestions = error.suggestions.filter(s => s.includes(':'));
  if (colonSuggestions.length > 0) {
    const first = colonSuggestions[0];
    if (!first) {
      throw new Error('Invalid suggestion');
    }

    // Extract the prefix from the first colonsuggestion (they should all have the same prefix)
    const colonIndex = first.indexOf(':');
    if (colonIndex > 0) {
      const prefix = first.substring(0, colonIndex + 1);
      // Check if the formula contains "prefix:incorrectText"
      const prefixedText = prefix + incorrectText;
      if (formula.includes(prefixedText)) {
        textToFind = prefixedText;
      }
    }
  }

  // Find the position of the incorrect text in the formula
  const relativePosition = formula.indexOf(textToFind);
  if (relativePosition === -1) {
    return [];
  }

  // Calculate absolute position within the value
  // For now, assume single-line formulas (multi-line support would need line tracking)
  const startColumn = propInfo.valueStartColumn + relativePosition;
  const endColumn = startColumn + textToFind.length;

  // Create a correction for each suggestion
  return error.suggestions.map(suggestion => ({
    startLine: propInfo.valueStartLine,
    startColumn,
    endLine: propInfo.valueEndLine,
    endColumn,
    replacementText: suggestion,
  }));
}

/**
 * Extract the text to be replaced from an AST node
 */
function getNodeText(node: ASTNode | FunctionArg): string | null {
  if ('type' in node) {
    switch (node.type) {
      case 'function':
        return node.name;
      case 'global':
        return node.name;
      case 'mathFunction':
        return node.name;
      case 'string':
        return node.value;
      case 'functionStyle':
        return node.name;
      default:
        return null;
    }
  }
  return null;
}
