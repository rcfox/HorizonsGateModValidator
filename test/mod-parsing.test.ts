/**
 * Mod File Parsing Tests
 * Tests that mod files are correctly parsed into structured objects
 */

import { describe, test, expect } from 'vitest';
import { ModParser } from '../src/parser.js';
import { expectValid } from './test-utils.js';

describe('Mod File Parsing', () => {
  describe('Simple object parsing', () => {
    test('parses single object with one property', () => {
      const input = '[Action] ID=test;';
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
      expect(objects[0]?.type).toBe('Action');
      expect(objects[0]?.properties.size).toBe(1);
      expect(objects[0]?.properties.get('ID')?.value).toBe('test');
    });

    test('parses single object with multiple properties on same line', () => {
      const input = '[Action] ID=test; applyWeaponBuffs=true;';
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
      expect(objects[0]?.properties.size).toBe(2);
      expect(objects[0]?.properties.get('ID')?.value).toBe('test');
      expect(objects[0]?.properties.get('applyWeaponBuffs')?.value).toBe('true');
    });

    test('parses single object with properties on multiple lines', () => {
      const input = `[Action] ID=test;
\tapplyWeaponBuffs=true;
\tcasterAnimation=broadswing;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
      expect(objects[0]?.properties.size).toBe(3);
      expect(objects[0]?.properties.get('ID')?.value).toBe('test');
      expect(objects[0]?.properties.get('applyWeaponBuffs')?.value).toBe('true');
      expect(objects[0]?.properties.get('casterAnimation')?.value).toBe('broadswing');
    });
  });

  describe('Multiple objects', () => {
    test('parses multiple objects in sequence', () => {
      const input = `[Action] ID=test;
[Item] ID=sword;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(2);
      expect(objects[0]?.type).toBe('Action');
      expect(objects[1]?.type).toBe('Item');
    });

    test('links objects with previousObject and nextObject', () => {
      const input = `[Action] ID=test;
[ActionAoE] ID=test;
[AvAffecter] ID=test;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects } = parser.parse();

      expect(objects).toHaveLength(3);
      expect(objects[0]?.previousObject).toBeNull();
      expect(objects[0]?.nextObject).toBe(objects[1]);
      expect(objects[1]?.previousObject).toBe(objects[0]);
      expect(objects[1]?.nextObject).toBe(objects[2]);
      expect(objects[2]?.previousObject).toBe(objects[1]);
      expect(objects[2]?.nextObject).toBeNull();
    });
  });

  describe('Multi-line property values', () => {
    test('handles formula spanning multiple lines', () => {
      const input = `[FormulaGlobal] ID=test;
\tformula=c:HP+
\t\tc:STR*2+
\t\t5;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
      const formula = objects[0]?.properties.get('formula')?.value;
      expect(formula).toBeDefined();
      expect(formula).toContain('c:HP+');
      expect(formula).toContain('c:STR*2+');
      expect(formula).toContain('5');
    });
  });

  describe('Comments', () => {
    test('ignores comment lines', () => {
      const input = `-- This is a comment
[Action] ID=test;
-- Another comment
\tapplyWeaponBuffs=true;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
      expect(objects[0]?.properties.size).toBe(2);
    });
  });

  describe('Position tracking', () => {
    test('tracks object type position', () => {
      const input = '[Action] ID=test;';
      const parser = new ModParser(input, 'test.txt');
      const { objects } = parser.parse();

      const obj = objects[0];
      expect(obj?.typeStartLine).toBe(1);
      expect(obj?.typeStartColumn).toBe(1);
      expect(obj?.typeEndColumn).toBe(7); // "Action" is 6 characters, ends at column 7
    });

    test('tracks property name and value positions', () => {
      const input = '[Action] ID=test;';
      const parser = new ModParser(input, 'test.txt');
      const { objects } = parser.parse();

      const propInfo = objects[0]?.properties.get('ID');
      expect(propInfo?.nameStartLine).toBe(1);
      expect(propInfo?.valueStartLine).toBe(1);
      expect(propInfo?.value).toBe('test');
    });
  });

  describe('Special property prefixes', () => {
    test('parses properties with ! prefix', () => {
      const input = '[Action] !element=fire,ice;';
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects[0]?.properties.has('!element')).toBe(true);
      expect(objects[0]?.properties.get('!element')?.value).toBe('fire,ice');
    });

    test('parses properties with + suffix', () => {
      const input = '[Trigger] topX+=5;';
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects[0]?.properties.has('topX+')).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('reports missing closing bracket', () => {
      const input = '[Action ID=test;';
      const parser = new ModParser(input, 'test.txt');
      const { errors } = parser.parse();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes(']'))).toBe(true);
    });

    test('reports unexpected tokens outside object definition', () => {
      const input = 'invalidToken=value;';
      const parser = new ModParser(input, 'test.txt');
      const { errors } = parser.parse();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain('Unexpected token');
    });
  });

  describe('Empty and whitespace handling', () => {
    test('parses empty file', () => {
      const input = '';
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(0);
    });

    test('ignores leading and trailing whitespace', () => {
      const input = `

[Action] ID=test;

`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(1);
    });

    test('handles tabs and spaces in indentation', () => {
      const input = `[Action] ID=test;
\t\tapplyWeaponBuffs=true;
  \t  casterAnimation=broadswing;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects[0]?.properties.size).toBe(3);
    });
  });

  describe('Type aliases', () => {
    test('parses objects with aliased types', () => {
      const input = `[AvAffecter] ID=test;
[AvAffecterAoE] ID=test;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects).toHaveLength(2);
      expect(objects[0]?.type).toBe('AvAffecter');
      expect(objects[1]?.type).toBe('AvAffecterAoE');
    });
  });

  describe('Pattern fields', () => {
    test('parses numbered pattern fields', () => {
      const input = `[Action] bodyPart1=head; bodyPart2=chest;`;
      const parser = new ModParser(input, 'test.txt');
      const { objects, errors } = parser.parse();

      expectValid(errors);
      expect(objects[0]?.properties.has('bodyPart1')).toBe(true);
      expect(objects[0]?.properties.has('bodyPart2')).toBe(true);
    });
  });
});
