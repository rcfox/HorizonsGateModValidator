/**
 * Correction Bounds Tests
 * Tests that corrections have accurate position bounds for various scenarios
 */

import { describe, test, expect } from 'vitest';
import { ModValidator } from '../src/validator.js';
import type { Correction, ValidationMessage } from '../src/types.js';
import { expectToBeDefined } from './test-utils.js';

/**
 * Helper to extract the actual text at correction bounds
 */
function extractCorrectionText(content: string, correction: Correction): string {
  const lines = content.split('\n');

  if (correction.startLine === correction.endLine) {
    // Single-line correction
    const line = lines[correction.startLine - 1] ?? '';
    return line.slice(correction.startColumn, correction.endColumn);
  } else {
    // Multi-line correction
    const result: string[] = [];
    for (let i = correction.startLine - 1; i < correction.endLine; i++) {
      const line = lines[i] ?? '';
      if (i === correction.startLine - 1) {
        result.push(line.slice(correction.startColumn));
      } else if (i === correction.endLine - 1) {
        result.push(line.slice(0, correction.endColumn));
      } else {
        result.push(line);
      }
    }
    return result.join('\n');
  }
}

/**
 * Helper to find a message by partial text match
 */
function findMessage(messages: ValidationMessage[], text: string): ValidationMessage | undefined {
  return [...messages].find(m => m.message.includes(text));
}

describe('Correction Bounds', () => {
  describe('Misspelled property names', () => {
    test('corrects single misspelled property on same line as object type', () => {
      const modContent = '[Action] ID=test; applyWeponBuffs=true;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('applyWeponBuffs');
      expect(correction.replacementText).toBe('applyWeaponBuffs');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(33);
    });

    test('corrects misspelled property on separate line with indentation', () => {
      const modContent = `[Action] ID=test;
\tcasterAnimaton=broadswing;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('casterAnimaton');
      expect(correction.replacementText).toBe('casterAnimation');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(1); // After the tab
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(15);
    });

    test('corrects multiple properties with different indentation', () => {
      const modContent = `[Action] ID=test;
\tapplyWeponBuffs=true;
  casterAnimaton=broadswing;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expect(result.hints.length).toBeGreaterThanOrEqual(2);

      // Find both corrections
      const msgs = result.hints.filter(h => h.message.includes('Unknown property'));
      expect(msgs.length).toBe(2);

      // Sort by line number to ensure consistent order
      msgs.sort((a, b) => a.line - b.line);

      // First correction: applyWeponBuffs on line 2
      const msg1 = msgs[0]!;
      expectToBeDefined(msg1.corrections);
      const correction1 = msg1.corrections[0]!;
      expect(extractCorrectionText(modContent, correction1)).toBe('applyWeponBuffs');
      expect(correction1.replacementText).toBe('applyWeaponBuffs');
      expect(correction1.startLine).toBe(2);
      expect(correction1.startColumn).toBe(1);
      expect(correction1.endLine).toBe(2);
      expect(correction1.endColumn).toBe(16);

      // Second correction: casterAnimaton on line 3
      const msg2 = msgs[1]!;
      expectToBeDefined(msg2.corrections);
      const correction2 = msg2.corrections[0]!;
      expect(extractCorrectionText(modContent, correction2)).toBe('casterAnimaton');
      expect(correction2.replacementText).toBe('casterAnimation');
      expect(correction2.startLine).toBe(3);
      expect(correction2.startColumn).toBe(2);
      expect(correction2.endLine).toBe(3);
      expect(correction2.endColumn).toBe(16);
    });
  });

  describe('Misspelled enum values', () => {
    test('corrects misspelled enum value in element field', () => {
      const modContent = `[AvAffecter] ID=test;
\tactorValue=HP;
\telement=fysical;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'Invalid Element value');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('fysical');
      expect(correction.replacementText).toBe('physical');
      expect(correction.startLine).toBe(3);
      expect(correction.startColumn).toBe(9);
      expect(correction.endLine).toBe(3);
      expect(correction.endColumn).toBe(16);
    });
  });

  describe('Missing ID property', () => {
    test('corrects ActionAoE missing ID property', () => {
      const modContent = `[Action] ID=test;
[ActionAoE] minRange=1;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'missing ID property');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe(' ID=test;');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(11);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(11);
    });
  });

  describe('Property values with whitespace', () => {
    test('corrects property name when value has leading whitespace', () => {
      const modContent = `[Action] ID=test; casterAnimaton=  broadswing;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      // Should only correct the property name, not the value
      expect(extracted).toBe('casterAnimaton');
      expect(correction.replacementText).toBe('casterAnimation');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(32);
    });

    test('corrects property name when value has trailing whitespace', () => {
      const modContent = `[Action] ID=test; casterAnimaton=broadswing  ;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('casterAnimaton');
      expect(correction.replacementText).toBe('casterAnimation');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(32);
    });

    test('corrects property name when value has both leading and trailing whitespace', () => {
      const modContent = `[Action] ID=test; casterAnimaton=  broadswing  ;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('casterAnimaton');
      expect(correction.replacementText).toBe('casterAnimation');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(32);
    });

    test('corrects property with empty value', () => {
      const modContent = `[Action] ID=test; casterAnimaton=;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('casterAnimaton');
      expect(correction.replacementText).toBe('casterAnimation');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(32);
    });
  });

  describe('Multi-line property corrections', () => {
    test('corrects misspelled property in multi-line formula', () => {
      const modContent = `[FormulaGlobal] ID=test;
\tformla=c:HP+
\t\tc:STR*2;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('formla');
      expect(correction.replacementText).toBe('formula');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(1);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(7);
    });
  });

  describe('Misspelled object types', () => {
    test('corrects misspelled object type', () => {
      const modContent = '[Acton] ID=test;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'Unknown object type');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('Acton');
      // 'Actor' is closer than 'Action' (1 edit vs 2 edits)
      expect(correction.replacementText).toBe('Actor');
      expect(correction.startLine).toBe(1);
      expect(correction.endLine).toBe(1);
      expect(correction.startColumn).toBe(1); // After '['
      expect(correction.endColumn).toBe(6); // Before ']'
    });

    test('corrects object type with properties on same line', () => {
      const modContent = '[Itm] ID=test; weight=5;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'Unknown object type');
      expectToBeDefined(msg?.corrections);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('Itm');
      expect(correction.replacementText).toBe('Item');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(1);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(4);
    });
  });

  describe('Edge cases', () => {
    test('handles corrections at start of line', () => {
      const modContent = `[Action] ID=test;
applyWeponBuffs=true;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('applyWeponBuffs');
      expect(correction.replacementText).toBe('applyWeaponBuffs');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(0);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(15);
    });

    test('handles corrections at end of line', () => {
      const modContent = '[Action] ID=test; applyWeponBuffs=true';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.hints, 'Unknown property');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      const extracted = extractCorrectionText(modContent, correction);

      expect(extracted).toBe('applyWeponBuffs');
      expect(correction.replacementText).toBe('applyWeaponBuffs');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(18);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(33);
    });

    test('handles multiple corrections on same line', () => {
      const modContent = '[Action] ID=test; applyWeponBuffs=true; casterAnimaton=swing;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const allMessages = [...result.errors, ...result.warnings, ...result.hints];
      const withCorrections = allMessages.filter(m => m.corrections && m.corrections.length > 0);

      expect(withCorrections.length).toBe(2);

      // Sort by column to ensure consistent order
      withCorrections.sort((a, b) => {
        const colA = a.corrections?.[0]?.startColumn ?? 0;
        const colB = b.corrections?.[0]?.startColumn ?? 0;
        return colA - colB;
      });

      // First correction: applyWeponBuffs
      const msg1 = withCorrections[0]!;
      expectToBeDefined(msg1.corrections);
      const correction1 = msg1.corrections[0]!;
      expect(extractCorrectionText(modContent, correction1)).toBe('applyWeponBuffs');
      expect(correction1.replacementText).toBe('applyWeaponBuffs');
      expect(correction1.startLine).toBe(1);
      expect(correction1.startColumn).toBe(18);
      expect(correction1.endLine).toBe(1);
      expect(correction1.endColumn).toBe(33);

      // Second correction: casterAnimaton
      const msg2 = withCorrections[1]!;
      expectToBeDefined(msg2.corrections);
      const correction2 = msg2.corrections[0]!;
      expect(extractCorrectionText(modContent, correction2)).toBe('casterAnimaton');
      expect(correction2.replacementText).toBe('casterAnimation');
      expect(correction2.startLine).toBe(1);
      expect(correction2.startColumn).toBe(40);
      expect(correction2.endLine).toBe(1);
      expect(correction2.endColumn).toBe(54);
    });
  });

  describe('Mismatched ID in Action structure', () => {
    test('corrects ActionAoE with wrong ID', () => {
      const modContent = `[Action] ID=test;
[ActionAoE] ID=wrong;`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'does not match Action ID');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe('test');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(15);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(20);
    });
  });

  describe('Invalid boolean value', () => {
    test('corrects misspelled boolean value', () => {
      const modContent = '[Action] ID=test; applyWeaponBuffs=tru;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'Invalid boolean value');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe('true');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(35);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(38);
    });
  });

  describe('Numeric enum value', () => {
    test('corrects numeric enum value with enum name', () => {
      const modContent = '[AvAffecter] ID=test; element=1;';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.warnings, 'Numeric enum value');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe('magic');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(30);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(31);
    });
  });

  describe('Missing semicolon', () => {
    test('corrects property missing semicolon', () => {
      const modContent = '[Action] ID=test; applyWeaponBuffs=true';
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'does not end with semicolon');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe(';');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(39);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(39);
    });

    test('corrects property on separate line missing semicolon', () => {
      const modContent = `[Action] ID=test;
\tapplyWeaponBuffs=true`;
      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      const msg = findMessage(result.errors, 'does not end with semicolon');
      expectToBeDefined(msg?.corrections);
      expect(msg.corrections.length).toBeGreaterThan(0);

      const correction = msg.corrections[0]!;
      expect(correction.replacementText).toBe(';');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(22);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(22);
    });
  });
});
