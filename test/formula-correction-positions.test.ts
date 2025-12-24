/**
 * Formula Correction Position Tests
 */

import { describe, test, expect } from 'vitest';
import { ModValidator } from '../src/validator.js';
import { expectToBeDefined } from './test-utils.js';

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
    test('second occurrence of unknown m: operator gets correct correction position', () => {
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

    test('three occurrences with middle one invalid', () => {
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
    test('same function name used multiple times', () => {
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

    test('repeated unknown operators in different objects', () => {
      const modContent = `[AvAffecter] ID=test;
\tmagnitude=m:badOp;

[AvAffecter] ID=test2;
\tmagnitude=m:distance(5);

[AvAffecter] ID=test3;
\tmagnitude=m:badOp;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const badOpMsgs = result.errors.filter(e => e.message.includes('m:badOp'));

      // Should have two errors for "m:badOp"
      expect(badOpMsgs.length).toBe(2);
      expectToBeDefined(badOpMsgs[0]);
      expectToBeDefined(badOpMsgs[1]);

      // Both should point to their respective lines (line 2 and line 8)
      expect(badOpMsgs[0].line).toBe(2);
      expect(badOpMsgs[1].line).toBe(8);

      // Corrections should point to actual occurrences (if they exist)
      if (badOpMsgs[0].corrections) {
        expect(badOpMsgs[0].corrections[0]).toMatchObject({ startLine: 2, endLine: 2 });
      }
      if (badOpMsgs[1].corrections) {
        expect(badOpMsgs[1].corrections[0]).toMatchObject({ startLine: 8, endLine: 8 });
      }
    });
  });

  describe('Multi-line formulas with repeated values', () => {
    test('repeated operators across lines', () => {
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
