/**
 * Formula Parsing Tests - SYNTAX ONLY
 *
 * Tests that formulas are correctly parsed into AST nodes.
 * This file tests SYNTAX validation - whether the formula text is structurally valid.
 *
 * BELONGS HERE (parser/syntax errors):
 * - Invalid formula structure: abs:(1-2), abs:-2, min:+5
 * - Bare words with parentheses where not function-style: distance(5)
 * - Invalid characters after colon: abs:&
 * - Spaces in wrong places: min: d:foo
 * - Unary + operator: 5*+2
 *
 * DOES NOT BELONG HERE (validator/semantic errors - use formula-validation.test.ts instead):
 * - Wrong parameter types: m:distance(foo) - parses successfully, validator catches it
 * - Unknown operators: m:unknownFunc - parses successfully, validator catches it
 * - Wrong argument counts: min:5 (missing formula body) - parses successfully, validator catches it
 * - 'x' parameter without allowXParameter flag: d:fireDmg(x) - parses successfully, validator catches it
 *
 * Rule of thumb: If parseFormula() throws an error, test it here.
 *                If validateAST() catches it after parsing, test it in formula-validation.test.ts.
 */

import { describe, test, expect } from 'vitest';
import { parseFormula, ASTNode } from '../src/formula-parser.js';
import { stripPositions, type WithoutPosition } from './test-utils.js';

type ValidTestCase = {
  formula: string;
  expectedAST: WithoutPosition<ASTNode>;
};

type InvalidTestCase = {
  formula: string;
  error: string;
};

function checkValidFormulas(testCases: ValidTestCase[]) {
  test.each(testCases)('$formula', ({ formula, expectedAST }) => {
    const ast = parseFormula(formula);
    expect(stripPositions(ast)).toEqual(expectedAST);
  });
}

function checkInvalidFormulas(testCases: InvalidTestCase[]) {
  test.each(testCases)('$formula (error: $error)', ({ formula, error }) => {
    expect(() => parseFormula(formula)).toThrow(new RegExp(error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });
}

describe('Formula Parsing', () => {
  describe('Literals', () => {
    checkValidFormulas([
      { formula: '5', expectedAST: { type: 'literal', value: 5 } },
      { formula: '0', expectedAST: { type: 'literal', value: 0 } },
      { formula: '123', expectedAST: { type: 'literal', value: 123 } },
      // { formula: '1e+3', expectedAST: { type: 'literal', value: 1000 } }, // FIXME: Look into this later.
    ]);
  });

  describe('Variables', () => {
    checkValidFormulas([
      { formula: 'x', expectedAST: { type: 'variable', name: 'x' } },
      { formula: 'X', expectedAST: { type: 'variable', name: 'X' } },
    ]);
  });

  describe('Binary operations', () => {
    checkValidFormulas([
      {
        formula: '5+3',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: { type: 'literal', value: 5 },
          right: { type: 'literal', value: 3 },
        },
      },
      {
        formula: '10-2*3',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: { type: 'literal', value: 10 },
          right: {
            type: 'binaryOp',
            operator: '*',
            left: { type: 'literal', value: 2 },
            right: { type: 'literal', value: 3 },
          },
        },
      },
      {
        formula: 'c:HP+5',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
          right: { type: 'literal', value: 5 },
        },
      },
      {
        formula: '1*-3',
        expectedAST: {
          type: 'binaryOp',
          operator: '*',
          left: { type: 'literal', value: 1 },
          right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 3 } },
        },
      },
      {
        formula: 'c:HP+t:HP',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
          right: {
            type: 'function',
            name: { type: 'functionName', value: 't' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'c:STR*2+5',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'binaryOp',
            operator: '*',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'c' },
              args: [{ type: 'string', value: 'STR' }],
              body: undefined,
            },
            right: { type: 'literal', value: 2 },
          },
          right: { type: 'literal', value: 5 },
        },
      },
    ]);
  });

  describe('Unary operations', () => {
    checkValidFormulas([
      {
        formula: '-5',
        expectedAST: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 5 } },
      },
      {
        formula: '-c:HP',
        expectedAST: {
          type: 'unaryOp',
          operator: '-',
          operand: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
        },
      },
      {
        formula: '-1*-1*-1+-1*-1*-1--1/-1',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: {
            type: 'binaryOp',
            operator: '+',
            left: {
              type: 'binaryOp',
              operator: '*',
              left: {
                type: 'binaryOp',
                operator: '*',
                left: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
                right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
              },
              right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
            },
            right: {
              type: 'binaryOp',
              operator: '*',
              left: {
                type: 'binaryOp',
                operator: '*',
                left: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
                right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
              },
              right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
            },
          },
          right: {
            type: 'binaryOp',
            operator: '/',
            left: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
            right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
          },
        },
      },
      // Test that binary minus followed by unary minus works correctly
      {
        formula: '1--1',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: { type: 'literal', value: 1 },
          right: { type: 'unaryOp', operator: '-', operand: { type: 'literal', value: 1 } },
        },
      },
    ]);

    // Invalid unary operations
    checkInvalidFormulas([
      { formula: '5*+2', error: "unary '+' is not supported" },
      { formula: '--1', error: 'multiple unary operators apply to the same operand' },
      { formula: '---1', error: 'multiple unary operators apply to the same operand' },
    ]);
  });

  describe('Function calls', () => {
    checkValidFormulas([
      {
        formula: 'c:HP',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'c' },
          args: [{ type: 'string', value: 'HP' }],
          body: undefined,
        },
      },
      // Underscores are allowed WITHIN identifiers (verified against Tactics/Data.cs)
      // Game examples: c:skill_Aim, c:skill_Sword, d:d_vicious, sa:cannon_longShot
      // Note: Leading underscores (c:_foo) are correctly rejected and not used by the game
      {
        formula: 'c:skill_Sword',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'c' },
          args: [{ type: 'string', value: 'skill_Sword' }],
          body: undefined,
        },
      },
      {
        formula: 'd:d_vicious',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'd' },
          args: [{ type: 'string', value: 'd_vicious' }],
          body: undefined,
        },
      },
      {
        formula: 't:STR',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 't' },
          args: [{ type: 'string', value: 'STR' }],
          body: undefined,
        },
      },
      {
        formula: 'cb:DEX',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'cb' },
          args: [{ type: 'string', value: 'DEX' }],
          body: undefined,
        },
      },
      {
        formula: 'w:damage',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'w' },
          args: [{ type: 'string', value: 'damage' }],
          body: undefined,
        },
      },
      {
        formula: 'w2:accuracy',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'w2' },
          args: [{ type: 'string', value: 'accuracy' }],
          body: undefined,
        },
      },
      // Test aliases: w -> weapon, W -> weapon, C -> c
      {
        formula: 'W:damage',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'W' },
          args: [{ type: 'string', value: 'damage' }],
          body: undefined,
        },
      },
      {
        formula: 'weapon:damage',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'weapon' },
          args: [{ type: 'string', value: 'damage' }],
          body: undefined,
        },
      },
      {
        formula: 'C:HP',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'C' },
          args: [{ type: 'string', value: 'HP' }],
          body: undefined,
        },
      },
      {
        formula: 'min:5:c:HP',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'min' },
          args: [{ type: 'string', value: '5' }],
          body: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'max:10:t:STR+5',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'max' },
            args: [{ type: 'string', value: '10' }],
            body: {
              type: 'function',
              name: { type: 'functionName', value: 't' },
              args: [{ type: 'string', value: 'STR' }],
              body: undefined,
            },
          },
          right: { type: 'literal', value: 5 },
        },
      },
      {
        formula: 'between:10:20:c:STR',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'between' },
          args: [
            { type: 'string', value: '10' },
            { type: 'string', value: '20' },
          ],
          body: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'STR' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'abs:c:HP-10',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'abs' },
            args: [],
            body: {
              type: 'function',
              name: { type: 'functionName', value: 'c' },
              args: [{ type: 'string', value: 'HP' }],
              body: undefined,
            },
          },
          right: { type: 'literal', value: 10 },
        },
      },
      {
        formula: 'floor:c:DEX/2',
        expectedAST: {
          type: 'binaryOp',
          operator: '/',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'floor' },
            args: [],
            body: {
              type: 'function',
              name: { type: 'functionName', value: 'c' },
              args: [{ type: 'string', value: 'DEX' }],
              body: undefined,
            },
          },
          right: { type: 'literal', value: 2 },
        },
      },
      {
        formula: 'swapCasterTarget:t:HP',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'swapCasterTarget' },
          args: [],
          body: {
            type: 'function',
            name: { type: 'functionName', value: 't' },
            args: [{ type: 'string', value: 'HP' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'itemAt:10:20:chest',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'itemAt' },
          args: [
            { type: 'string', value: '10' },
            { type: 'string', value: '20' },
            { type: 'string', value: 'chest' },
          ],
          body: undefined,
        },
      },
    ]);

    // Invalid function calls - colon syntax errors
    checkInvalidFormulas([
      { formula: 'abs:(1-2)', error: 'parentheses cannot appear' },
      { formula: 'abs:-2', error: 'math operator cannot appear' },
      { formula: 'min:+5', error: 'math operator cannot appear' },
      { formula: 'min: d:foo', error: 'space cannot appear after colon' },
      { formula: 'abs:&', error: 'colon must be followed by a letter or digit' },
      { formula: 'd:_test', error: 'colon must be followed by a letter or digit' },
    ]);
  });

  describe('Global formulas', () => {
    checkValidFormulas([
      { formula: 'gswordDmg', expectedAST: { type: 'global', name: 'gswordDmg', argument: undefined } },
      {
        formula: 'd:gswordDmg',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'd' },
          args: [{ type: 'string', value: 'gswordDmg' }],
          body: undefined,
        },
      },
      {
        formula: 'd:fireDmg(foo)', // FIXME: This should fail -> Only a float inside of the parentheses should be accepted.
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'd' },
          args: [
            {
              type: 'functionStyle',
              name: 'fireDmg',
              params: [{ type: 'global', name: 'foo' }],
            },
          ],
          body: undefined,
        },
      },
      // Test operators that delegate to 'd': dMin0, dMax0, etc.
      {
        formula: 'dMin0:gswordDmg',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'dMin0' },
          args: [{ type: 'string', value: 'gswordDmg' }],
          body: undefined,
        },
      },
      {
        formula: 'dMax0:fireDmg(5)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'dMax0' },
          args: [
            {
              type: 'functionStyle',
              name: 'fireDmg',
              params: [{ type: 'literal', value: 5 }],
            },
          ],
          body: undefined,
        },
      },
      // Test 'x' parameter in function-style arguments (used in FormulaGlobal formulas)
      {
        formula: 'd:fireDmg(x)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'd' },
          args: [
            {
              type: 'functionStyle',
              name: 'fireDmg',
              params: [{ type: 'variable', name: 'x' }],
            },
          ],
          body: undefined,
        },
      },
    ]);

    // Invalid global formulas - function-style parameters with formula expressions
    checkInvalidFormulas([
      { formula: 'd:foo(1+1)', error: 'function-style argument contains formula operators' },
      { formula: 'd:bar(10-5)', error: 'function-style argument contains formula operators' },
    ]);

    // Invalid global formulas - identifiers with non-word characters
    checkInvalidFormulas([
      { formula: 'hp>50', error: 'global formula names must only contain letters, digits, and underscores' },
      { formula: 'foo<bar', error: 'global formula names must only contain letters, digits, and underscores' },
      { formula: 'test=value', error: 'global formula names must only contain letters, digits, and underscores' },
    ]);
  });

  describe('Math functions', () => {
    checkValidFormulas([
      // Note: 1+distance is valid - 'distance' alone as a global is OK, only distance(...) with parens is invalid
      {
        formula: 'm:distance(32)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'm' },
          args: [
            {
              type: 'functionStyle',
              name: 'distance',
              params: [{ type: 'literal', value: 32 }],
            },
          ],
          body: undefined,
        },
      },
      //FIXME: m:distance(foo) should fail.
      {
        formula: 'm:rand(100)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'm' },
          args: [
            {
              type: 'functionStyle',
              name: 'rand',
              params: [{ type: 'literal', value: 100 }],
            },
          ],
          body: undefined,
        },
      },
      // Test operators that delegate to 'm': mMin0, mIs0, etc.
      {
        formula: 'mMin0:distance(32)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'mMin0' },
          args: [
            {
              type: 'functionStyle',
              name: 'distance',
              params: [{ type: 'literal', value: 32 }],
            },
          ],
          body: undefined,
        },
      },
      {
        formula: 'mIs0:rand(100)',
        expectedAST: {
          type: 'function',
          name: { type: 'functionName', value: 'mIs0' },
          args: [
            {
              type: 'functionStyle',
              name: 'rand',
              params: [{ type: 'literal', value: 100 }],
            },
          ],
          body: undefined,
        },
      },
      // Regression test: identifiers ending with 'e' should not be treated as scientific notation
      // Previously, the regex /[eE]$/ incorrectly matched any identifier ending with 'e',
      // causing "m:distance+1" to be parsed as a single operand "m:distance+1"
      {
        formula: 'm:distance+1',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'm' },
            args: [{ type: 'string', value: 'distance' }],
            body: undefined,
          },
          right: { type: 'literal', value: 1 },
        },
      },
      {
        formula: 'someValue-2',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: { type: 'global', name: 'someValue' },
          right: { type: 'literal', value: 2 },
        },
      },
    ]);

    // Invalid math functions - bare words with parentheses, formula expressions in parameters
    checkInvalidFormulas([
      { formula: 'distance(5)', error: 'parentheses can only be used with function-style operators' },
      { formula: 'm:distance(5*2)', error: 'function-style argument contains formula operators' },
    ]);
  });

  describe('Complex expressions', () => {
    checkValidFormulas([
      {
        formula: 'c:STR+min:10:t:HP*2',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'STR' }],
            body: undefined,
          },
          right: {
            type: 'binaryOp',
            operator: '*',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'min' },
              args: [{ type: 'string', value: '10' }],
              body: {
                type: 'function',
                name: { type: 'functionName', value: 't' },
                args: [{ type: 'string', value: 'HP' }],
                body: undefined,
              },
            },
            right: { type: 'literal', value: 2 },
          },
        },
      },
      {
        formula: 'floor:c:DEX/2+t:DEX/2',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'binaryOp',
            operator: '/',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'floor' },
              args: [],
              body: {
                type: 'function',
                name: { type: 'functionName', value: 'c' },
                args: [{ type: 'string', value: 'DEX' }],
                body: undefined,
              },
            },
            right: { type: 'literal', value: 2 },
          },
          right: {
            type: 'binaryOp',
            operator: '/',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 't' },
              args: [{ type: 'string', value: 'DEX' }],
              body: undefined,
            },
            right: { type: 'literal', value: 2 },
          },
        },
      },
      {
        formula: 'min:0:t:HP-c:ATK',
        expectedAST: {
          type: 'binaryOp',
          operator: '-',
          left: {
            type: 'function',
            name: { type: 'functionName', value: 'min' },
            args: [{ type: 'string', value: '0' }],
            body: {
              type: 'function',
              name: { type: 'functionName', value: 't' },
              args: [{ type: 'string', value: 'HP' }],
              body: undefined,
            },
          },
          right: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'ATK' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'floor:c:critChance/100*c:ATK',
        expectedAST: {
          type: 'binaryOp',
          operator: '*',
          left: {
            type: 'binaryOp',
            operator: '/',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'floor' },
              args: [],
              body: {
                type: 'function',
                name: { type: 'functionName', value: 'c' },
                args: [{ type: 'string', value: 'critChance' }],
                body: undefined,
              },
            },
            right: { type: 'literal', value: 100 },
          },
          right: {
            type: 'function',
            name: { type: 'functionName', value: 'c' },
            args: [{ type: 'string', value: 'ATK' }],
            body: undefined,
          },
        },
      },
      {
        formula: 'c:rank * -1 + c:MagAtk * -0.25',
        expectedAST: {
          type: 'binaryOp',
          operator: '+',
          left: {
            type: 'binaryOp',
            operator: '*',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'c' },
              args: [{ type: 'string', value: 'rank' }],
              body: undefined,
            },
            right: {
              type: 'unaryOp',
              operator: '-',
              operand: { type: 'literal', value: 1 },
            },
          },
          right: {
            type: 'binaryOp',
            operator: '*',
            left: {
              type: 'function',
              name: { type: 'functionName', value: 'c' },
              args: [{ type: 'string', value: 'MagAtk' }],
              body: undefined,
            },
            right: {
              type: 'unaryOp',
              operator: '-',
              operand: { type: 'literal', value: 0.25 },
            },
          },
        },
      },
    ]);
  });
});
