/**
 * Formula validator
 * Validates formula syntax using the AST parser and validator
 */

import { ValidationMessage, Correction, PropertyInfo } from './types.js';
import { parseFormula, validateAST, type ValidationError, type ASTNode, type FunctionArg } from './formula-parser.js';

export class FormulaValidator {
  private errors: ValidationMessage[] = [];
  private warnings: ValidationMessage[] = [];

  /**
   * Validate a formula string using the AST parser and validator
   */
  validate(formula: string, propInfo?: PropertyInfo): { errors: ValidationMessage[]; warnings: ValidationMessage[] } {
    this.errors = [];
    this.warnings = [];

    const line = propInfo?.valueStartLine;

    if (!formula || formula.trim().length === 0) {
      // Empty formula is valid (defaults to 0 or empty)
      return { errors: this.errors, warnings: this.warnings };
    }

    try {
      // Step 1: Parse the formula into an AST
      const ast = parseFormula(formula);

      // Step 2: Validate the AST against formula.json metadata
      const validationErrors = validateAST(ast);

      // Convert AST validation errors to ValidationMessages
      for (const error of validationErrors) {
        // Convert suggestions to position-based corrections
        const corrections = propInfo && error.suggestions
          ? this.createCorrections(formula, error, propInfo)
          : undefined;

        this.addError(error.message, line, undefined, error.operatorName, corrections);
      }
    } catch (e: any) {
      // Parse error
      this.addError(`Formula parse error: ${e.message}`, line);
    }

    return { errors: this.errors, warnings: this.warnings };
  }

  /**
   * Create position-based corrections from formula validation error
   */
  private createCorrections(formula: string, error: ValidationError, propInfo: PropertyInfo): Correction[] {
    if (!error.suggestions || error.suggestions.length === 0) {
      return [];
    }

    // Get the incorrect text from the node
    let incorrectText = this.getNodeText(error.node);
    if (!incorrectText) {
      return [];
    }

    // Check if suggestions include an operator prefix (e.g., "m:distance")
    // If so, we need to search for the full "prefix:text" in the formula
    const firstSuggestion = error.suggestions[0];
    const colonIndex = firstSuggestion.indexOf(':');
    if (colonIndex > 0) {
      const prefix = firstSuggestion.substring(0, colonIndex + 1);
      // Check if the formula contains "prefix:incorrectText"
      const prefixedText = prefix + incorrectText;
      if (formula.includes(prefixedText)) {
        incorrectText = prefixedText;
      }
    }

    // Find the position of the incorrect text in the formula
    const relativePosition = formula.indexOf(incorrectText);
    if (relativePosition === -1) {
      return [];
    }

    // Calculate absolute position within the value
    // For now, assume single-line formulas (multi-line support would need line tracking)
    const startColumn = propInfo.valueStartColumn + relativePosition;
    const endColumn = startColumn + incorrectText.length;

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
  private getNodeText(node: ASTNode | FunctionArg): string | null {
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

  private addError(message: string, line?: number, context?: string, formulaReference?: string, corrections?: Correction[]): void {
    this.errors.push({
      severity: 'error',
      message,
      line,
      context,
      formulaReference,
      corrections,
    });
  }

  private addWarning(message: string, line?: number, context?: string): void {
    this.warnings.push({
      severity: 'warning',
      message,
      line,
      context,
    });
  }
}
