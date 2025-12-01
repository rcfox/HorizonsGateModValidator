/**
 * Formula metadata extracted from formula.json
 * This module loads and processes the formula operator definitions
 */

import formulaData from "./formula.json" with { type: "json" };

interface FormulaArgument {
  name: string;
  type: string;
  description: string;
}

interface FormulaUse {
  description: string;
  returns: string;
  example: string;
  arguments?: FormulaArgument[];
}

interface FormulaOperator {
  name: string;
  category: string;
  isFunctionStyle: boolean;
  uses: FormulaUse[];
}

interface FormulaData {
  gameVersion: string;
  operators: FormulaOperator[];
}

const data = formulaData as FormulaData;

/**
 * Set of operators that use function-style syntax with parentheses: name(arg)
 * Examples: distance(5), d(gswordDmg)
 */
export const functionStyleOperators = new Set(
  data.operators.filter((op) => op.isFunctionStyle).map((op) => op.name),
);

/**
 * Map of operators to their non-formula argument count
 * Operators with formula arguments have those formulas as "bodies" in the AST
 */
export const operatorArgCounts = new Map<string, number>();

/**
 * Set of operators that take a formula as an argument (have a "body")
 * Examples: min:5:c:HP, abs:c:HP-10, lessThan:50:c:HP
 */
export const operatorsWithFormulaBodies = new Set<string>();

// Build the maps from formula.json data
for (const op of data.operators) {
  const args = op.uses[0]?.arguments || [];

  // Count non-formula arguments
  const nonFormulaArgs = args.filter((a) => a.type !== "formula");
  operatorArgCounts.set(op.name, nonFormulaArgs.length);

  // Track operators with formula bodies
  if (args.some((a) => a.type === "formula")) {
    operatorsWithFormulaBodies.add(op.name);
  }
}

/**
 * Check if an operator uses function-style syntax (parentheses)
 */
export function isFunctionStyle(operatorName: string): boolean {
  return functionStyleOperators.has(operatorName);
}

/**
 * Get the number of non-formula arguments for an operator
 */
export function getArgCount(operatorName: string): number {
  return operatorArgCounts.get(operatorName) ?? 0;
}

/**
 * Check if an operator takes a formula as an argument
 */
export function hasFormulaBody(operatorName: string): boolean {
  return operatorsWithFormulaBodies.has(operatorName);
}

/**
 * Get all operator names (for validation/autocomplete)
 */
export function getAllOperatorNames(): string[] {
  return data.operators.map((op) => op.name);
}

/**
 * Get operator categories
 */
export function getOperatorsByCategory(): Map<string, string[]> {
  const categoryMap = new Map<string, string[]>();

  for (const op of data.operators) {
    if (!categoryMap.has(op.category)) {
      categoryMap.set(op.category, []);
    }
    categoryMap.get(op.category)!.push(op.name);
  }

  return categoryMap;
}
