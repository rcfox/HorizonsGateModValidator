/**
 * Formula metadata extracted from formula.json
 * This module loads and processes the formula operator definitions
 */

import formulaData from "./formula.json" with { type: "json" };

export interface FormulaArgument {
  name: string;
  type: string;
  description: string;
}

export interface FormulaUse {
  description: string;
  returns: string;
  example: string;
  arguments?: FormulaArgument[];
}

export interface FormulaOperator {
  name: string;
  category: string;
  isFunctionStyle: boolean;
  alternateDelimiters?: string[];
  delegatesTo?: string; // For operators like mIs0, mMin0 that validate functionName against m: sub-operators
  aliases?: string[];
  uses: FormulaUse[];
}

export interface FormulaData {
  gameVersion: string;
  operators: FormulaOperator[];
}

const data = formulaData as FormulaData;

/**
 * Map from operator name (or alias) to canonical operator name
 * Examples: "w" -> "weapon", "W" -> "weapon", "weapon" -> "weapon"
 */
export const operatorAliasMap = new Map<string, string>();

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

/**
 * Map of operators to their alternate delimiters
 * Examples: gIs -> [","], gIsNot -> [","]
 */
export const operatorAlternateDelimiters = new Map<string, string[]>();

// Build the maps from formula.json data
for (const op of data.operators) {
  const args = op.uses[0]?.arguments || [];

  // Add canonical name to alias map
  operatorAliasMap.set(op.name, op.name);

  // Add aliases to alias map
  if (op.aliases) {
    for (const alias of op.aliases) {
      operatorAliasMap.set(alias, op.name);
    }
  }

  // Count non-formula arguments
  const nonFormulaArgs = args.filter((a) => a.type !== "formula");
  operatorArgCounts.set(op.name, nonFormulaArgs.length);

  // Track operators with formula bodies
  if (args.some((a) => a.type === "formula")) {
    operatorsWithFormulaBodies.add(op.name);
  }

  // Track operators with alternate delimiters
  if (op.alternateDelimiters && op.alternateDelimiters.length > 0) {
    operatorAlternateDelimiters.set(op.name, op.alternateDelimiters);
  }
}

/**
 * Resolve an operator name or alias to its canonical name
 * Returns undefined if the operator doesn't exist
 * Examples: "w" -> "weapon", "W" -> "weapon", "weapon" -> "weapon"
 */
export function resolveOperatorAlias(nameOrAlias: string): string | undefined {
  return operatorAliasMap.get(nameOrAlias);
}

/**
 * Check if an operator uses function-style syntax (parentheses)
 * Accepts both operator names and aliases
 */
export function isFunctionStyle(operatorName: string): boolean {
  const canonical = resolveOperatorAlias(operatorName);
  return canonical ? functionStyleOperators.has(canonical) : false;
}

/**
 * Get the number of non-formula arguments for an operator
 * Accepts both operator names and aliases
 */
export function getArgCount(operatorName: string): number {
  const canonical = resolveOperatorAlias(operatorName);
  return canonical ? (operatorArgCounts.get(canonical) ?? 0) : 0;
}

/**
 * Check if an operator takes a formula as an argument
 * Accepts both operator names and aliases
 */
export function hasFormulaBody(operatorName: string): boolean {
  const canonical = resolveOperatorAlias(operatorName);
  return canonical ? operatorsWithFormulaBodies.has(canonical) : false;
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

/**
 * Get alternate delimiters for an operator (e.g., [","] for gIs)
 * Accepts both operator names and aliases
 * Returns undefined if the operator doesn't support alternate delimiters
 */
export function getAlternateDelimiters(operatorName: string): string[] | undefined {
  const canonical = resolveOperatorAlias(operatorName);
  return canonical ? operatorAlternateDelimiters.get(canonical) : undefined;
}

/**
 * Get the operator that this operator delegates to (e.g., "m" for mIs0)
 * Accepts both operator names and aliases
 * Returns undefined if the operator doesn't delegate
 */
export function getDelegatesTo(operatorName: string): string | undefined {
  const canonical = resolveOperatorAlias(operatorName);
  if (!canonical) return undefined;

  const operator = data.operators.find(op => op.name === canonical);
  return operator?.delegatesTo;
}
