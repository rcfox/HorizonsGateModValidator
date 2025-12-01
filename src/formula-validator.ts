/**
 * Formula validator
 * Validates formula syntax using the AST parser and validator
 */

import { ValidationMessage } from './types.js';
import { parseFormula, validateAST, type ValidationError } from './formula-parser.js';

export class FormulaValidator {
  private errors: ValidationMessage[] = [];
  private warnings: ValidationMessage[] = [];

  /**
   * Validate a formula string using the AST parser and validator
   */
  validate(formula: string, line?: number): { errors: ValidationMessage[]; warnings: ValidationMessage[] } {
    this.errors = [];
    this.warnings = [];

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
        this.addError(error.message, line, undefined, error.operatorName, error.suggestions);
      }
    } catch (e: any) {
      // Parse error
      this.addError(`Formula parse error: ${e.message}`, line);
    }

    return { errors: this.errors, warnings: this.warnings };
  }

  private addError(message: string, line?: number, context?: string, formulaReference?: string, corrections?: string[]): void {
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
