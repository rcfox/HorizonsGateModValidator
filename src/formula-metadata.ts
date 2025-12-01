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
  aliases?: string[];
  uses: FormulaUse[];
}

interface FormulaData {
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
