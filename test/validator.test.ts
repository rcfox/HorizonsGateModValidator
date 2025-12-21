/**
 * End-to-End Validator Tests
 * Integration tests for full mod file validation
 */

import { describe, test, expect } from 'vitest';
import { ModValidator } from '../src/validator.js';
import { expectValid, expectMessage, expectToBeDefined } from './test-utils.js';

describe('Mod Validator Integration', () => {
  describe('Valid mod files', () => {
    test('validates simple action with no errors', () => {
      const modContent = `[Action] ID=testAction;
\tapplyWeaponBuffs=true;
\tcasterAnimation=broadswing;
[ActionAoE] ID=testAction;
[AvAffecter] ID=testAction;
[AvAffecterAoE] ID=testAction;
`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('validates action with nested objects', () => {
      const modContent = `[Action] ID=greatswordAttack;
\tapplyWeaponBuffs=true;

[ActionAoE] ID=greatswordAttack;
\tminRange=1;

[AvAffecter] ID=greatswordAttack;
\tactorValue=HP;
\tmagnitude=d:gswordDmg;

[AvAffecterAoE] ID=greatswordAttack;
\tminRange=0;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('validates formula properties', () => {
      const modContent = `[FormulaGlobal] ID=testFormula;
\tformula=c:STR*2+5;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('validates enum properties', () => {
      const modContent = `[ItemType] ID=testItem;
\titemCategory=weapon;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });
  });

  describe('Invalid mod files', () => {
    test('detects unknown object type', () => {
      const modContent = '[InvalidType] ID=test;';

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'Unknown object type', severity: 'error' });
    });

    test('detects unknown property name', () => {
      const modContent = `[Action] ID=test;
\tinvalidProperty=value;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'Unknown property', severity: 'hint' });
    });

    test('detects invalid boolean value', () => {
      const modContent = `[Action] ID=test;
\tapplyWeaponBuffs=yes;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'boolean', severity: 'error' });
    });

    test('detects invalid formula syntax', () => {
      const modContent = `[FormulaGlobal] ID=test;
\tformula=between:10:c:STR;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'argument', severity: 'error' });
    });

    test('detects missing required ID property', () => {
      const modContent = '[Action] applyWeaponBuffs=true;';

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'ID', severity: 'error' });
    });
  });

  describe('Typo suggestions', () => {
    test('suggests corrections for misspelled object types', () => {
      const modContent = '[Acton] ID=test;'; // Missing 'i' in Action

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'Unknown object type', severity: 'error' });
      const error = result.errors.find(e => e.message.includes('Unknown object type'));
      expectToBeDefined(error?.corrections);
      expect(error.corrections.length).toBeGreaterThan(0);

      const correction = error.corrections[0]!;
      expect(correction.replacementText).toBe('Actor');
      expect(correction.startLine).toBe(1);
      expect(correction.startColumn).toBe(1);
      expect(correction.endLine).toBe(1);
      expect(correction.endColumn).toBe(6);
    });

    test('suggests corrections for misspelled property names', () => {
      const modContent = `[Action] ID=test;
\tapplyWeponBuffs=true;`; // Missing 'a' in Weapon

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'Unknown property', severity: 'hint' });
      const hint = result.hints.find(h => h.message.includes('Unknown property'));
      expectToBeDefined(hint?.corrections);
      expect(hint.corrections.length).toBeGreaterThan(0);

      const correction = hint.corrections[0]!;
      expect(correction.replacementText).toBe('applyWeaponBuffs');
      expect(correction.startLine).toBe(2);
      expect(correction.startColumn).toBe(1);
      expect(correction.endLine).toBe(2);
      expect(correction.endColumn).toBe(16);
    });
  });

  describe('Action structure validation', () => {
    test('validates correct action structure', () => {
      const modContent = `[Action] ID=test;
[ActionAoE] ID=test;
[AvAffecter] ID=test;
[AvAffecterAoE] ID=test;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('detects mismatched IDs in action structure', () => {
      const modContent = `[Action] ID=test1;
[ActionAoE] ID=test2;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'does not match', severity: 'error' });
    });

    test('detects missing ActionAoE', () => {
      const modContent = `[Action] ID=test;
[AvAffecter] ID=test;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'must be followed', severity: 'error' });
    });
  });

  describe('Type aliases', () => {
    test('handles type aliases correctly', () => {
      const modContent = `[AvAffecter] ID=test;
\tactorValue=HP;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('handles functional aliases', () => {
      const modContent = `[AvAffecterAOE] ID=test; [AvAffecterAoE] ID=test2;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });
  });

  describe('Vector validation', () => {
    test('validates Vector2 format', () => {
      const modContent = `[Item] ID=test;
\toffset=10,20;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });

    test('detects invalid Vector2 format', () => {
      const modContent = `[Item] ID=test;
\toffset=10;`; // offset is Vector2, needs two values

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectMessage(result, { text: 'Invalid Vector2', severity: 'error' });
    });
  });

  describe('Multi-line formulas', () => {
    test('validates multi-line formula', () => {
      const modContent = `[FormulaGlobal] ID=complexFormula;
\tformula=c:HP+
\t\tc:STR*2+
\t\tfloor:c:DEX/2;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });
  });

  describe('Comments', () => {
    test('ignores comments in validation', () => {
      const modContent = `-- This is a test item type
[ItemType] ID=test;
-- Comment in the middle of the object
\tweight=1;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });
  });

  describe('Empty and whitespace', () => {
    test('validates empty file without errors', () => {
      const validator = new ModValidator();
      const result = validator.validate('', 'test.txt');

      expectValid(result);
    });

    test('handles whitespace-only file', () => {
      const validator = new ModValidator();
      const result = validator.validate('   \n\n\t\t\n   ', 'test.txt');

      expectValid(result);
    });

    test('allows empty property values', () => {
      const modContent = `[ItemType] ID=test;
\tdescription=;`;

      const validator = new ModValidator();
      const result = validator.validate(modContent, 'test.txt');

      expectValid(result);
    });
  });
});
