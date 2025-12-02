/**
 * Tests for the formula parser
 */

import { parseFormula, printAST } from "./formula-parser.js";

// Test cases based on common formula patterns from Horizon's Gate
const testCases = [
  // Simple literals and variables
  "5",
  "x",

  // Basic arithmetic
  "5+3",
  "10-2*3",
  "c:HP+5",
  "1*-3",

  // Function calls with colons
  "c:HP",
  "t:STR",
  "cb:DEX",

  // Functions with operators
  "c:HP+t:HP",
  "c:STR*2+5",

  // Min/max functions
  "min:5:c:HP",
  "max:10:t:STR+5",

  // Comparison functions
  "lessThan:50:c:HP",
  "moreThan:10:t:DEX*2",

  // Between function
  "between:10:20:c:STR",

  // Math functions
  "abs:c:HP-10",
  "floor:c:DEX/2",
  "round:c:STR*1.5",

  // Global formulas with arguments
  "gswordDmg",
  "distance(5)",

  // Complex nested formulas
  "c:STR+min:10:t:HP*2",
  "floor:c:DEX/2+t:DEX/2",

  // Swap functions
  "swapCasterTarget:t:HP",
  "swapCasterID:actor1:c:STR",

  // Weapon functions
  "w:damage",
  "w2:accuracy",

  // Complex real-world examples
  "c:STR*2+5",
  "min:0:t:HP-c:ATK",
  "floor:c:critChance/100*c:ATK",

  // m: and d: operators with function-style arguments (special case)
  "m:distance(32)",
  "m:rand(100)",
  "d:gswordDmg",
  "d:fireDmg(foo)",

  // Invalid syntax - should produce errors
  "abs:(1-2)",
  "abs:-2",
  "min:+5",
  "min: d:foo",
  "abs:&",

  // Colon-style with multiple args
  "itemAt:10:20:chest",

  // Unary operators
  "-5",
  "1*-3",
  "10+-3",
  "-c:HP",

  // Invalid unary plus (crashes game)
  "5*+2",

  "-52 + c:MagAtk * 2",
  "52 + c:MagAtk * 2",
];

console.log("Formula Parser Test Results\n");
console.log("=".repeat(80));

for (const formula of testCases) {
  console.log(`\nFormula: ${formula}`);
  console.log("-".repeat(80));

  try {
    const ast = parseFormula(formula);
    console.log(printAST(ast));
  } catch (error) {
    console.log(`ERROR: ${error}`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("\nTest completed!");
