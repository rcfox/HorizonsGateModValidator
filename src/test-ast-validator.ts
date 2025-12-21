/**
 * Tests for the AST validator
 */

import { parseFormula } from './formula-parser.js';
import { validateAST, formatValidationErrors } from './formula-ast-validator.js';

console.log('AST Validator Test Results\n');
console.log('='.repeat(80));

const testCases = [
  // Valid formulas
  { formula: 'c:HP', expectValid: true },
  { formula: 't:STR', expectValid: true },
  { formula: 'min:5:c:HP', expectValid: true },
  { formula: 'between:10:20:c:STR', expectValid: true },
  { formula: 'abs:c:HP-10', expectValid: true },
  { formula: 'm:distance(32)', expectValid: true },
  { formula: 'd:gswordDmg', expectValid: true },
  { formula: 'd:gswordDmg(3)', expectValid: true },

  // Invalid: wrong number of arguments
  { formula: 'between:10:c:STR', expectValid: false, reason: 'between needs 3 args (min, max, formula)' },
  { formula: 'abs:5:10', expectValid: false, reason: 'abs only takes 1 arg (formula)' },

  // Invalid: wrong argument types
  { formula: 'min:abc:c:HP', expectValid: false, reason: 'min expects numeric threshold' },

  // Invalid: using colon syntax for function-style operators
  { formula: 'd:foo:bar', expectValid: false, reason: 'd should use parentheses' },
  { formula: 'd:foo(bar)', expectValid: false, reason: "operator 'd' expects float" },

  // Valid complex formulas
  { formula: 'c:STR*2+5', expectValid: true },
  { formula: 'floor:c:DEX/2', expectValid: true },
];

for (const test of testCases) {
  console.log(`\nFormula: ${test.formula}`);
  console.log(`Expected: ${test.expectValid ? 'VALID' : 'INVALID'}`);
  if (test.reason) {
    console.log(`Reason: ${test.reason}`);
  }
  console.log('-'.repeat(80));

  try {
    const ast = parseFormula(test.formula);
    const errors = validateAST(ast);

    if (errors.length === 0) {
      console.log('✓ VALID - No validation errors');
    } else {
      console.log('✗ INVALID - Validation errors:');
      console.log(formatValidationErrors(errors));
    }

    // Check if result matches expectation
    const isValid = errors.length === 0;
    if (isValid === test.expectValid) {
      console.log(`Result: PASS ✓`);
    } else {
      console.log(`Result: FAIL ✗ (expected ${test.expectValid ? 'valid' : 'invalid'})`);
    }
  } catch (e: any) {
    console.log(`Parse Error: ${e.message}`);
    console.log(`Result: ${test.expectValid ? 'FAIL' : 'PASS'} (parse error)`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('\nTest completed!');
