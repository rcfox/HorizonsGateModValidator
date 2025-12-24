/**
 * Numeric Literal Parsing Tests
 *
 * Tests for BUG: formula-parser.ts incorrectly rejects valid numeric formats
 *
 * ISSUE: The condition `operand === numValue.toString()` is too strict.
 * It rejects valid numbers like "5.0", ".5", "5.", and scientific notation.
 *
 * GAME BEHAVIOR (verified in Tactics/Formula.cs):
 * - The game's Evaluate() uses XPath's number() function which is very lenient
 * - Accepts: "5", "5.0", ".5", "5.", "1e5", "1.5e-3", etc.
 * - For function-style arguments, int.TryParse fails on decimals, then falls through
 *   to recursive Formula evaluation which uses number()
 *
 * EXPECTED: These should all parse as literal nodes with correct numeric values
 * CURRENT: Many are incorrectly treated as global formula references
 */

import { describe, test, expect } from 'vitest';
import { parseFormula, type ASTNode, type LiteralNode } from '../src/formula-parser.js';

type LiteralTestCase = {
  formula: string;
  expectedValue: number;
  currentlyFailing?: boolean;
};

function checkLiterals(testCases: LiteralTestCase[]) {
  test.each(testCases)('$formula → $expectedValue', ({ formula, expectedValue, currentlyFailing }) => {
    if (currentlyFailing) {
      expect(() => {
        const ast = parseFormula(formula);
        // If it parses, check if it's a literal with correct value
        if (ast.type === 'literal') {
          expect(ast.value).toBe(expectedValue);
        } else {
          // Currently parsing as wrong node type (likely 'global')
          throw new Error(`Expected literal node, got ${ast.type}`);
        }
      }).toThrow(); // Mark as expected to fail for now
    } else {
      const ast = parseFormula(formula);
      expect(ast).toEqual({ type: 'literal', value: expectedValue } satisfies LiteralNode);
    }
  });
}

describe('Numeric Literal Parsing - Bug: Too Strict Validation', () => {
  describe('Integer formats', () => {
    checkLiterals([
      { formula: '5', expectedValue: 5 },
      { formula: '0', expectedValue: 0 },
      { formula: '123', expectedValue: 123 },
    ]);
  });

  describe('Decimal formats (CURRENTLY FAILING)', () => {
    checkLiterals([
      { formula: '5.0', expectedValue: 5, currentlyFailing: true },
      { formula: '3.14', expectedValue: 3.14 },
      { formula: '5.', expectedValue: 5, currentlyFailing: true },
      { formula: '.5', expectedValue: 0.5, currentlyFailing: true },
      { formula: '0.5', expectedValue: 0.5 },
    ]);

    test('parses negative decimal: "-.1"', () => {
      // This is parsed as unary operator with operand, not a simple literal
      const ast = parseFormula('-.1');
      expect(ast).toMatchObject({
        type: 'unaryOp',
        operator: '-',
        operand: { type: 'literal', value: 0.1 }
      });
    });
  });

  describe('Scientific notation (CURRENTLY FAILING)', () => {
    checkLiterals([
      { formula: '1e5', expectedValue: 100000, currentlyFailing: true },
      { formula: '2E3', expectedValue: 2000, currentlyFailing: true },
      { formula: '1.5e10', expectedValue: 1.5e10, currentlyFailing: true },
      { formula: '2.5E-3', expectedValue: 0.0025, currentlyFailing: true },
      { formula: '1e+3', expectedValue: 1000, currentlyFailing: true },
    ]);
  });

  describe('Complex expressions with decimal literals', () => {
    test('parses decimal in addition: "5.0+3"', () => {
      const ast = parseFormula('5.0+3');
      expect(ast).toMatchObject({
        type: 'binaryOp',
        operator: '+',
        left: { type: 'literal', value: 5 },
        right: { type: 'literal', value: 3 }
      });
    });

    test('parses leading decimal in multiplication: ".5*2"', () => {
      const ast = parseFormula('.5*2');
      expect(ast).toMatchObject({
        type: 'binaryOp',
        operator: '*',
        left: { type: 'literal', value: 0.5 },
        right: { type: 'literal', value: 2 }
      });
    });
  });

  describe('Function-style arguments with decimals', () => {
    test('parses decimal in m:distance(): "m:distance(32.5)"', () => {
      const ast = parseFormula('m:distance(32.5)');
      expect(ast).toMatchObject({
        type: 'function',
        name: 'm',
        args: [{
          type: 'functionStyle',
          name: 'distance',
          params: [{ type: 'literal', value: 32.5 }]
        }]
      });
    });

    test('parses trailing zero in d:foo(): "d:foo(5.0)"', () => {
      const ast = parseFormula('d:foo(5.0)');
      expect(ast).toMatchObject({
        type: 'function',
        name: 'd',
        args: [{
          type: 'functionStyle',
          name: 'foo',
          params: [{ type: 'literal', value: 5 }]
        }]
      });
    });
  });

  describe('Invalid formats (should not be literals)', () => {
    test('non-numeric identifier becomes global formula', () => {
      const ast = parseFormula('abc');
      expect(ast).toEqual({ type: 'global', name: 'abc', argument: undefined });
    });

    test('mixed alphanumeric becomes global formula', () => {
      const ast = parseFormula('5abc');
      expect(ast).toEqual({ type: 'global', name: '5abc', argument: undefined });
    });
  });
});

/**
 * NOTES FOR FIX (affects 3 locations):
 *
 * Replace:
 *   if (!isNaN(numValue) && operand === numValue.toString())
 *
 * With:
 *   const num = Number(operand);
 *   if (!isNaN(num) && isFinite(num))
 *
 * Locations:
 * 1. formula-parser.ts:242 - parseOperand()
 * 2. formula-parser.ts:286 - parseParenthesizedOperand()
 * 3. formula-parser.ts:321 - parseFunctionStyleArg()
 */
