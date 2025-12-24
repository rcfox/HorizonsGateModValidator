/**
 * Formula Correction Position Tests
 *
 * Tests for BUG: formula-validator.ts uses indexOf() to find correction positions
 *
 * ISSUE: formula-validator.ts:98 uses `formula.indexOf(textToFind)` which always
 * finds the FIRST occurrence. For formulas with repeated operators/values, this
 * generates incorrect correction positions for later occurrences.
 *
 * EXAMPLE:
 *   Formula: "m:foo+m:bar+m:foo"
 *   If the SECOND "foo" is invalid, indexOf("m:foo") finds the FIRST one
 *   Result: Correction points to wrong location
 *
 * EXPECTED: Corrections should point to the actual error location
 * CURRENT: Corrections for repeated values point to the first occurrence
 */

import { describe, test, expect } from 'vitest';
import { ModValidator } from '../src/validator.js';
import type { Correction } from '../src/types.js';

/**
 * Helper to extract the actual text at correction bounds
 */
function extractCorrectionText(content: string, correction: Correction): string {
  const lines = content.split('\n');
  const line = lines[correction.startLine - 1] ?? '';
  return line.slice(correction.startColumn, correction.endColumn);
}

/**
 * Helper to find position of Nth occurrence of a substring
 */
function nthIndexOf(str: string, searchStr: string, n: number): number {
  let index = -1;
  for (let i = 0; i < n; i++) {
    index = str.indexOf(searchStr, index + 1);
    if (index === -1) return -1;
  }
  return index;
}

describe('Formula Correction Positions - Bug: indexOf() Finds First Occurrence', () => {
  describe('Repeated unknown operators in formulas', () => {
    test('FAILING: second occurrence of unknown m: operator gets wrong correction position', () => {
      const modContent = `[Action] ID=test;

[AvAffecter] ID=test;
\tmagnitude=m:unknownOp1+m:unknownOp2;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      // Find validation errors for unknown operators
      const unknownOp1Msg = result.errors.find(e => e.message.includes("Unknown operator: 'm:unknownOp1'"));
      const unknownOp2Msg = result.errors.find(e => e.message.includes("Unknown operator: 'm:unknownOp2'"));

      expect(unknownOp1Msg).toBeDefined();
      expect(unknownOp2Msg).toBeDefined();

      const formula = 'm:unknownOp1+m:unknownOp2';

      // First operator correction should be correct
      if (unknownOp1Msg?.corrections?.[0]) {
        const correction1 = unknownOp1Msg.corrections[0];
        const extracted1 = formula.slice(correction1.startColumn, correction1.endColumn);
        expect(extracted1).toBe('m:unknownOp1');

        // Position should be at start of formula (column 0 in the value)
        expect(correction1.startColumn).toBe(0);
      }

      // SECOND operator correction is WRONG due to indexOf() bug
      if (unknownOp2Msg?.corrections?.[0]) {
        const correction2 = unknownOp2Msg.corrections[0];
        const extracted2 = formula.slice(correction2.startColumn, correction2.endColumn);

        // EXPECTED: Should extract "m:unknownOp2"
        // CURRENT: Extracts "m:unknownOp1" because indexOf() finds first "m:"
        expect(extracted2).toBe('m:unknownOp2');

        // EXPECTED: Should be after the '+' operator (column 14)
        // CURRENT: Points to first occurrence (column 0)
        const expectedColumn = formula.indexOf('m:unknownOp2');
        expect(correction2.startColumn).toBe(expectedColumn);
      }
    });

    test('FAILING: three occurrences with middle one invalid', () => {
      const modContent = `[AvAffecter] ID=test;
\tmagnitude=m:distance(5)+m:wrongOp+m:distance(10);`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const wrongOpMsg = result.errors.find(e => e.message.includes("Unknown operator: 'm:wrongOp'"));
      expect(wrongOpMsg).toBeDefined();

      if (wrongOpMsg?.corrections?.[0]) {
        const correction = wrongOpMsg.corrections[0];
        const formula = 'm:distance(5)+m:wrongOp+m:distance(10)';
        const extracted = formula.slice(correction.startColumn, correction.endColumn);

        // Should point to the MIDDLE occurrence
        expect(extracted).toBe('m:wrongOp');

        const expectedColumn = formula.indexOf('m:wrongOp');
        expect(correction.startColumn).toBe(expectedColumn);
      }
    });
  });

  describe('Repeated values in different positions', () => {
    test('FAILING: same function name used multiple times', () => {
      const modContent = `[AvAffecter] ID=test;
\tmagnitude=d:foo+d:bar+d:foo;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      // Assuming both "foo" references might be flagged (depending on validator state)
      const fooMessages = result.errors.filter(e => e.message.includes('d:foo'));

      if (fooMessages.length >= 2) {
        const formula = 'd:foo+d:bar+d:foo';

        // First occurrence
        const correction1 = fooMessages[0]?.corrections?.[0];
        if (correction1) {
          const extracted1 = formula.slice(correction1.startColumn, correction1.endColumn);
          expect(extracted1).toContain('foo');
          expect(correction1.startColumn).toBe(formula.indexOf('d:foo'));
        }

        // Second occurrence should point to second "d:foo", not first
        const correction2 = fooMessages[1]?.corrections?.[0];
        if (correction2) {
          const extracted2 = formula.slice(correction2.startColumn, correction2.endColumn);
          expect(extracted2).toContain('foo');

          // Should be the SECOND occurrence
          const secondOccurrence = nthIndexOf(formula, 'd:foo', 2);
          expect(correction2.startColumn).toBe(secondOccurrence);
        }
      }
    });

    test('FAILING: repeated unknown enum values', () => {
      const modContent = `[Action] ID=test;
\tactionType=badValue;

[Action] ID=test2;
\tactionType=goodValue;

[Action] ID=test3;
\tactionType=badValue;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const badValueMsgs = result.errors.filter(e =>
        e.message.includes('badValue') && e.message.includes('actionType')
      );

      // Should have two errors for "badValue"
      expect(badValueMsgs.length).toBe(2);

      // Both should point to their respective lines
      expect(badValueMsgs[0]?.line).toBe(2);
      expect(badValueMsgs[1]?.line).toBe(6);

      // Corrections should point to actual occurrences
      if (badValueMsgs[0]?.corrections?.[0]) {
        expect(badValueMsgs[0].corrections[0].startLine).toBe(2);
      }
      if (badValueMsgs[1]?.corrections?.[0]) {
        expect(badValueMsgs[1].corrections[0].startLine).toBe(6);
      }
    });
  });

  describe('Multi-line formulas with repeated values', () => {
    test('FAILING: repeated operators across lines', () => {
      // Multi-line formulas are supported per CLAUDE.md
      const modContent = `[AvAffecter] ID=test;
\tmagnitude=m:unknownOp+
\t\tc:HP+
\t\tm:unknownOp;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const unknownMsgs = result.errors.filter(e => e.message.includes("Unknown operator: 'm:unknownOp'"));

      // Should have two errors, one per occurrence
      expect(unknownMsgs.length).toBe(2);

      // First occurrence on line 2
      expect(unknownMsgs[0]?.line).toBe(2);

      // Second occurrence on line 4
      expect(unknownMsgs[1]?.line).toBe(4);
    });
  });
});

/**
 * NOTES FOR FIX:
 *
 * The issue is in formula-validator.ts createCorrections() function.
 * Current approach (line 98):
 *   const relativePosition = formula.indexOf(textToFind);
 *
 * This always finds the FIRST occurrence.
 *
 * Possible fixes:
 * 1. Track character positions during AST parsing (extend AST nodes with position info)
 * 2. Search from an expected position based on AST traversal order
 * 3. Use a more sophisticated search that considers context
 *
 * The cleanest fix is #1: Add position tracking to the formula parser's AST nodes,
 * similar to how the main parser tracks positions for property names and values.
 *
 * This would require:
 * - Extending ASTNode types with startColumn/endColumn
 * - Tracking positions during tokenization in formula-parser.ts
 * - Using those positions directly in createCorrections()
 */
