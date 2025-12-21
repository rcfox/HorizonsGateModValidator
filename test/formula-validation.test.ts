/**
 * Formula AST Validation Tests
 * Tests that parsed formulas are validated correctly against formula metadata
 */

import { describe, test, expect } from 'vitest';
import { parseFormula } from '../src/formula-parser.js';
import { validateAST } from '../src/formula-ast-validator.js';

describe('Formula AST Validation', () => {
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
    { formula: 'between:10:c:STR', expectValid: false, reason: 'argument' },
    { formula: 'abs:5:10', expectValid: false, reason: 'Unknown operator' }, // abs only takes 1 arg, '5' parsed as operator

    // Invalid: wrong argument types
    { formula: 'min:abc:c:HP', expectValid: false, reason: 'expect' },

    // Invalid: using colon syntax for function-style operators
    { formula: 'd:foo:bar', expectValid: false, reason: 'argument' },
    { formula: 'd:foo(bar)', expectValid: false, reason: 'expect' },

    // Valid complex formulas
    { formula: 'c:STR*2+5', expectValid: true },
    { formula: 'floor:c:DEX/2', expectValid: true },
  ];

  test.each(testCases)('$formula', ({ formula, expectValid, reason }) => {
    const ast = parseFormula(formula);
    const errors = validateAST(ast);

    if (expectValid) {
      expect(errors).toHaveLength(0);
    } else {
      expect(errors.length).toBeGreaterThan(0);

      // Require reason for invalid tests to ensure we verify error messages
      if (!reason) {
        throw new Error('Test with expectValid: false must specify a reason to check error message');
      }

      // Check that at least one error message contains the expected reason substring
      const hasExpectedMessage = errors.some(
        e =>
          e.message.toLowerCase().includes(reason.toLowerCase()) ||
          e.context?.toLowerCase().includes(reason.toLowerCase())
      );

      expect(hasExpectedMessage).toBe(true);
    }
  });
});
