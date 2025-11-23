/**
 * Formula validator
 * Validates formula syntax based on the game's formula system
 */

import { ValidationMessage } from './types.js';

/**
 * Known formula functions and their argument counts
 * Format: functionName -> [minArgs, maxArgs, description]
 */
const FORMULA_FUNCTIONS: Record<string, [number, number, string]> = {
  // Comparison & Logic
  'lessThan': [2, 2, 'lessThan:value:expression'],
  'moreThan': [2, 2, 'moreThan:value:expression'],
  'is': [2, 2, 'is:value:expression'],
  'isNot': [2, 2, 'isNot:value:expression'],
  'min': [2, 2, 'min:value:expression'],
  'max': [2, 2, 'max:value:expression'],
  'between': [3, 3, 'between:min:max:expression'],

  // Math functions
  'abs': [1, 1, 'abs:expression'],
  'floor': [1, 1, 'floor:expression'],
  'ceiling': [1, 1, 'ceiling:expression'],
  'round': [1, 1, 'round:expression'],
  'not': [1, 1, 'not:expression'],
  'debug': [1, 1, 'debug:expression'],

  // Actor properties
  'c': [1, 1, 'c:propertyName (caster property)'],
  'C': [1, 1, 'C:propertyName (caster property)'],
  'cb': [1, 1, 'cb:propertyName (caster base)'],
  'CB': [1, 1, 'CB:propertyName (caster base)'],
  't': [1, 1, 't:propertyName (target property)'],
  'T': [1, 1, 'T:propertyName (target property)'],
  'tb': [1, 1, 'tb:propertyName (target base)'],
  'TB': [1, 1, 'TB:propertyName (target base)'],

  // Conditional checks
  'cIs': [2, 2, 'cIs:actorValue:value'],
  'cIs1': [1, 1, 'cIs1:actorValue'],
  'tIs': [2, 2, 'tIs:actorValue:value'],
  'tIs1': [1, 1, 'tIs1:actorValue'],
  'tIs99': [1, 1, 'tIs99:actorValue'],
  'cIsMoreThan': [2, 2, 'cIsMoreThan:av:value'],
  'cIsGreaterThan': [2, 2, 'cIsGreaterThan:av:value'],
  'cIsLessThan': [2, 2, 'cIsLessThan:av:value'],
  'tIsMoreThan': [2, 2, 'tIsMoreThan:av:value'],
  'tIsGreaterThan': [2, 2, 'tIsGreaterThan:av:value'],
  'tIsLessThan': [2, 2, 'tIsLessThan:av:value'],

  // Weapon & Items
  'w': [1, 1, 'w:propertyName (weapon)'],
  'W': [1, 1, 'W:propertyName (weapon)'],
  'weapon': [1, 1, 'weapon:propertyName'],
  'w2': [1, 1, 'w2:propertyName (offhand)'],
  'W2': [1, 1, 'W2:propertyName (offhand)'],
  'weapon2': [1, 1, 'weapon2:propertyName'],
  'item': [1, 1, 'item:itemID'],
  'itemWithin': [2, 2, 'itemWithin:itemID:distance'],
  'itemsMoreThan': [2, 2, 'itemsMoreThan:itemID:count'],
  'itemsZoneMoreThan': [2, 2, 'itemsZoneMoreThan:itemID:count'],
  'itemAt': [3, 3, 'itemAt:itemID:x:y'],
  'itemsZone': [1, 1, 'itemsZone:itemID'],
  'itemsZoneOrParty': [1, 1, 'itemsZoneOrParty:itemID'],
  'canItemFit': [1, 1, 'canItemFit:itemID'],
  'itemValue': [1, 1, 'itemValue:itemID'],
  'buyPrice': [1, 1, 'buyPrice:itemID'],
  'partyItem': [1, 1, 'partyItem:itemID'],
  'partyItem_g': [1, 1, 'partyItem_g:itemID'],
  'cargoItem': [1, 1, 'cargoItem:itemID'],
  'cargoItem_g': [1, 1, 'cargoItem_g:itemID'],

  // Global variables
  'g': [1, 1, 'g:variableName'],
  'g1': [1, 1, 'g1:variableName'],
  'gIs': [2, 2, 'gIs:varName:value'],
  'gIsNot': [2, 2, 'gIsNot:varName:value'],
  'gIs0': [1, 1, 'gIs0:varName'],
  'gIs1': [1, 1, 'gIs1:varName'],
  'gIs2': [1, 1, 'gIs2:varName'],
  'gIsLessThan': [2, 2, 'gIsLessThan:varName:value'],
  'gIsMoreThan': [2, 2, 'gIsMoreThan:varName:value'],
  'gIsGreaterThan': [2, 2, 'gIsGreaterThan:varName:value'],
  'gIsString': [2, 2, 'gIsString:varName:string'],
  'gTime': [1, 1, 'gTime:varName'],
  'gTimeSince': [1, 1, 'gTimeSince:varName'],
  'gTimeSinceLessThan': [2, 2, 'gTimeSinceLessThan:varName:value'],
  'gTimeSinceLessThanOrEqual': [2, 2, 'gTimeSinceLessThanOrEqual:varName:value'],
  'gTimeSinceMoreThan': [2, 2, 'gTimeSinceMoreThan:varName:value'],
  'gTimeSinceMoreThanOrNeverAssigned': [2, 2, 'gTimeSinceMoreThanOrNeverAssigned:varName:value'],

  // Distance & Position
  'distance': [0, 0, 'distance (between caster and target)'],
  'tileDistance': [0, 0, 'tileDistance'],
  'tiledistance': [0, 0, 'tiledistance'],
  'distanceFleet': [1, 1, 'distanceFleet:fleetID'],
  'distanceRaw': [0, 0, 'distanceRaw'],
  'distFromCaster': [0, 0, 'distFromCaster'],
  'geo': [2, 2, 'geo:x:y'],
  'geo1': [2, 2, 'geo1:x:y'],
  'geo0': [2, 2, 'geo0:x:y'],
  'geo2': [2, 2, 'geo2:x:y'],
  'geoXY': [0, 0, 'geoXY'],

  // Combat & Status
  'hostile': [0, 0, 'hostile'],
  'cHostile': [0, 0, 'cHostile'],
  'tHostile': [0, 0, 'tHostile'],
  'sameHostile': [0, 0, 'sameHostile'],
  'diffHostile': [0, 0, 'diffHostile'],
  'incapped': [0, 0, 'incapped'],
  'evasionFacing': [0, 0, 'evasionFacing'],
  'evaFacing': [0, 0, 'evaFacing'],
  'evafacing': [0, 0, 'evafacing'],
  'frontFacing': [0, 0, 'frontFacing'],
  'backFacing': [0, 0, 'backFacing'],
  'dark': [0, 0, 'dark'],

  // Counting
  'partySize': [0, 0, 'partySize'],
  'landingPartySize': [0, 0, 'landingPartySize'],
  'crewSize': [0, 0, 'crewSize'],
  'fleetSize': [0, 0, 'fleetSize'],
  'barracksSize': [0, 0, 'barracksSize'],
  'numEnemiesWithinX': [1, 1, 'numEnemiesWithinX:distance'],
  'numEnemiesWithin1': [0, 0, 'numEnemiesWithin1'],
  'numAlliesWithin': [1, 1, 'numAlliesWithin:distance'],

  // Random
  'rand': [1, 1, 'rand:max'],
  'randSign': [0, 0, 'randSign'],
  'randID': [1, 1, 'randID:seed'],

  // Support Abilities
  'sa': [1, 1, 'sa:abilityName'],
  'csa': [1, 1, 'csa:abilityName'],
  'support': [1, 1, 'support:abilityName'],
  'notsa': [1, 1, 'notsa:abilityName'],
  'tsa': [1, 1, 'tsa:abilityName'],
  'nottsa': [1, 1, 'nottsa:abilityName'],

  // Data lookups
  'Data': [1, 1, 'Data:value'],
  'data': [1, 1, 'data:value'],
  'd': [1, 1, 'd:value'],
  'D': [1, 1, 'D:value'],
  'dMin0': [1, 1, 'dMin0:value'],
  'dMax0': [1, 1, 'dMax0:value'],
  'dMax1': [1, 1, 'dMax1:value'],
  'dMaxNeg1': [1, 1, 'dMaxNeg1:value'],

  // Math
  'Math': [1, 1, 'Math:expression'],
  'math': [1, 1, 'math:expression'],
  'm': [1, 1, 'm:expression'],
  'M': [1, 1, 'M:expression'],
  'mMin0': [1, 1, 'mMin0:expression'],

  // Mod checks
  'mod': [1, 1, 'mod:modID'],
  'modEnabled': [1, 1, 'modEnabled:modID'],

  // Misc
  'money': [0, 0, 'money'],
  'actor': [1, 1, 'actor:actorID'],
  'targetExists': [0, 0, 'targetExists'],
  'targetExistsAndIsntCaster': [0, 0, 'targetExistsAndIsntCaster'],
};

/**
 * Known formula variables (that don't require function call syntax)
 */
const FORMULA_VARIABLES = new Set([
  'x', 'X', // Variable x
  'hostile', 'incapped', 'distance', 'tileDistance', 'tiledistance',
  'money', 'targetExists', 'dark', 'partySize', 'crewSize', 'fleetSize',
  'frontFacing', 'backFacing', 'evasionFacing', 'evaFacing',
]);

/**
 * Valid operators in formulas
 */
const FORMULA_OPERATORS = new Set(['+', '-', '*', '/', '%']);

export class FormulaValidator {
  private errors: ValidationMessage[] = [];
  private warnings: ValidationMessage[] = [];

  /**
   * Validate a formula string
   */
  validate(formula: string, line?: number): { errors: ValidationMessage[]; warnings: ValidationMessage[] } {
    this.errors = [];
    this.warnings = [];

    if (!formula || formula.trim().length === 0) {
      // Empty formula is valid (defaults to 0 or empty)
      return { errors: this.errors, warnings: this.warnings };
    }

    // Remove all spaces for parsing (game does this)
    const cleanFormula = formula.replace(/\s/g, '');

    // Split by operators to get operands
    const operands = this.splitByOperators(cleanFormula);

    // Validate each operand
    for (const operand of operands) {
      if (operand.trim().length > 0) {
        this.validateOperand(operand, line);
      }
    }

    return { errors: this.errors, warnings: this.warnings };
  }

  private splitByOperators(formula: string): string[] {
    // Split by operators while preserving negative numbers at start of formulas/functions
    const parts: string[] = [];
    let current = '';
    let inFunction = false;
    let depth = 0;

    for (let i = 0; i < formula.length; i++) {
      const char = formula[i];

      if (char === ':') {
        depth++;
        current += char;
      } else if (FORMULA_OPERATORS.has(char)) {
        // Check if this is a negative sign at start or after operator
        const isNegativeSign = char === '-' && (i === 0 || FORMULA_OPERATORS.has(formula[i - 1]) || formula[i - 1] === ':');

        if (isNegativeSign || depth > 0) {
          // Part of the current operand
          current += char;
        } else {
          // Operator separating operands
          if (current.length > 0) {
            parts.push(current);
          }
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      parts.push(current);
    }

    return parts;
  }

  private validateOperand(operand: string, line?: number): void {
    // Check if it's a number
    if (this.isNumber(operand)) {
      return; // Valid
    }

    // Check if it's a simple variable
    if (FORMULA_VARIABLES.has(operand)) {
      return; // Valid
    }

    // Check if it's a function call (contains ':')
    if (operand.includes(':')) {
      this.validateFunctionCall(operand, line);
    } else {
      // Unknown operand - could be a variable we don't know about
      // This is not necessarily an error as the game might accept it
      this.addWarning(
        `Unknown formula operand: ${operand}`,
        line,
        'This might be valid but is not in the known formula functions/variables list'
      );
    }
  }

  private validateFunctionCall(call: string, line?: number): void {
    const parts = call.split(':');
    const funcName = parts[0];
    const args = parts.slice(1);

    if (!FORMULA_FUNCTIONS[funcName]) {
      this.addWarning(
        `Unknown formula function: ${funcName}`,
        line,
        `Expected format: ${funcName}:arg1:arg2...`
      );
      return;
    }

    const [minArgs, maxArgs, description] = FORMULA_FUNCTIONS[funcName];

    if (args.length < minArgs || args.length > maxArgs) {
      this.addError(
        `Formula function ${funcName} expects ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} arguments, got ${args.length}`,
        line,
        `Expected: ${description}`
      );
    }

    // Recursively validate arguments that might be formulas
    for (const arg of args) {
      if (arg.includes('+') || arg.includes('*') || arg.includes('/') || arg.includes('%')) {
        // Argument is a sub-formula
        const subResult = this.validate(arg, line);
        this.errors.push(...subResult.errors);
        this.warnings.push(...subResult.warnings);
      }
    }
  }

  private isNumber(value: string): boolean {
    // Check if it's a valid number (including negative and decimals)
    return /^-?\d+\.?\d*$/.test(value);
  }

  private addError(message: string, line?: number, context?: string): void {
    this.errors.push({
      severity: 'error',
      message,
      line,
      context,
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
