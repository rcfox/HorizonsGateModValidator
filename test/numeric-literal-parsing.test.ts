/**
 * Numeric Literal Parsing Tests
 */

import { describe, test, expect } from 'vitest';
import { parseFormula } from '../src/formula-parser.js';
import { stripPositions } from './test-utils.js';

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
      expect(stripPositions(ast)).toEqual({ type: 'literal', value: expectedValue });
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

  describe('Decimal formats', () => {
    checkLiterals([
      { formula: '5.0', expectedValue: 5 },
      { formula: '3.14', expectedValue: 3.14 },
      { formula: '5.', expectedValue: 5 },
      { formula: '.5', expectedValue: 0.5 },
      { formula: '0.5', expectedValue: 0.5 },
    ]);

    test('parses negative decimal: "-.1"', () => {
      // This is parsed as unary operator with operand, not a simple literal
      const ast = parseFormula('-.1');
      expect(ast).toMatchObject({
        type: 'unaryOp',
        operator: '-',
        operand: { type: 'literal', value: 0.1 },
      });
    });
  });

  describe('Scientific notation', () => {
    checkLiterals([
      { formula: '1e5', expectedValue: 100000 },
      { formula: '2E3', expectedValue: 2000 },
      { formula: '1.5e10', expectedValue: 1.5e10 },
      { formula: '2.5E-3', expectedValue: 0.0025 },
      { formula: '1e+3', expectedValue: 1000 },
    ]);
  });

  describe('Complex expressions with decimal literals', () => {
    test('parses decimal in addition: "5.0+3"', () => {
      const ast = parseFormula('5.0+3');
      expect(ast).toMatchObject({
        type: 'binaryOp',
        operator: '+',
        left: { type: 'literal', value: 5 },
        right: { type: 'literal', value: 3 },
      });
    });

    test('parses leading decimal in multiplication: ".5*2"', () => {
      const ast = parseFormula('.5*2');
      expect(ast).toMatchObject({
        type: 'binaryOp',
        operator: '*',
        left: { type: 'literal', value: 0.5 },
        right: { type: 'literal', value: 2 },
      });
    });
  });

  describe('Function-style arguments with decimals', () => {
    test('parses decimal in m:distance(): "m:distance(32.5)"', () => {
      const ast = parseFormula('m:distance(32.5)');
      expect(ast).toMatchObject({
        type: 'function',
        name: { type: 'functionName', value: 'm' },
        args: [
          {
            type: 'functionStyle',
            name: 'distance',
            params: [{ type: 'literal', value: 32.5 }],
          },
        ],
      });
    });

    test('parses trailing zero in d:foo(): "d:foo(5.0)"', () => {
      const ast = parseFormula('d:foo(5.0)');
      expect(ast).toMatchObject({
        type: 'function',
        name: { type: 'functionName', value: 'd' },
        args: [
          {
            type: 'functionStyle',
            name: 'foo',
            params: [{ type: 'literal', value: 5 }],
          },
        ],
      });
    });
  });

  describe('Invalid formats (should not be literals)', () => {
    test('non-numeric identifier becomes global formula', () => {
      const ast = parseFormula('abc');
      expect(stripPositions(ast)).toEqual({ type: 'global', name: 'abc' });
    });

    test('mixed alphanumeric becomes global formula', () => {
      const ast = parseFormula('5abc');
      expect(stripPositions(ast)).toEqual({ type: 'global', name: '5abc' });
    });
  });
});
