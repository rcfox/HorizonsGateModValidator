/**
 * Formula Parsing Tests
 * Tests that formulas are correctly parsed into AST nodes
 */

import { describe, test, expect } from 'vitest';
import { parseFormula } from '../src/formula-parser.js';

describe('Formula Parsing', () => {
  describe('Valid formulas', () => {
    const validFormulas = [
      // Simple literals and variables
      '5',
      'x',

      // Basic arithmetic
      '5+3',
      '10-2*3',
      'c:HP+5',
      '1*-3',

      // Function calls with colons
      'c:HP',
      't:STR',
      'cb:DEX',

      // Functions with operators
      'c:HP+t:HP',
      'c:STR*2+5',

      // Min/max functions
      'min:5:c:HP',
      'max:10:t:STR+5',

      // Comparison functions
      'lessThan:50:c:HP',
      'moreThan:10:t:DEX*2',

      // Between function
      'between:10:20:c:STR',

      // Math functions
      'abs:c:HP-10',
      'floor:c:DEX/2',
      'round:c:STR*1.5',

      // Global formulas with arguments
      'gswordDmg',
      'distance(5)',

      // Complex nested formulas
      'c:STR+min:10:t:HP*2',
      'floor:c:DEX/2+t:DEX/2',

      // Swap functions
      'swapCasterTarget:t:HP',
      'swapCasterID:actor1:c:STR',

      // Weapon functions
      'w:damage',
      'w2:accuracy',

      // Complex real-world examples
      'c:STR*2+5',
      'min:0:t:HP-c:ATK',
      'floor:c:critChance/100*c:ATK',

      // m: and d: operators with function-style arguments
      'm:distance(32)',
      'm:rand(100)',
      'd:gswordDmg',
      'd:fireDmg(foo)',

      // Colon-style with multiple args
      'itemAt:10:20:chest',

      // Unary operators
      '-5',
      '1*-3',
      '10+-3',
      '-c:HP',
      '-52 + c:MagAtk * 2',
      '52 + c:MagAtk * 2',
    ];

    test.each(validFormulas)('parses valid formula: %s', (formula) => {
      expect(() => parseFormula(formula)).not.toThrow();
      const ast = parseFormula(formula);
      expect(ast).toBeDefined();
    });
  });

  describe('Invalid formulas', () => {
    const invalidFormulas = [
      { input: 'abs:(1-2)', reason: 'grouping with parentheses not supported' },
      { input: 'abs:-2', reason: 'invalid unary minus in colon function' },
      { input: 'min:+5', reason: 'incomplete min function' },
      { input: 'min: d:foo', reason: 'space after colon' },
      { input: 'abs:&', reason: 'invalid character' },
      { input: '5*+2', reason: 'unary plus crashes game' },
    ];

    test.each(invalidFormulas)('rejects invalid formula: $input ($reason)', ({ input }) => {
      expect(() => parseFormula(input)).toThrow();
    });
  });
});
