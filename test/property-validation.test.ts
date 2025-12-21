/**
 * Property Validation Tests
 * Tests that property values are validated correctly against their expected types
 */

import { describe, test, expect } from 'vitest';
import { PropertyValidator } from '../src/property-validator.js';
import type { FieldType, PropertyInfo } from '../src/types.js';
import { expectValid, expectMessage } from './test-utils.js';

// Helper to create minimal PropertyInfo for testing
function createPropertyInfo(value: string, filePath: string = 'test.txt', line: number = 1): PropertyInfo {
  return {
    value,
    filePath,
    nameStartLine: line,
    nameStartColumn: 0,
    nameEndColumn: 10,
    valueStartLine: line,
    valueStartColumn: 11,
    valueEndLine: line,
    valueEndColumn: 11 + value.length,
  };
}

type TestCase = { value: string; error?: string };

function checkTestCases(fieldType: FieldType, testCases: TestCase[]) {
  const validator = new PropertyValidator();
  test.each(testCases)('$value', ({ value, error }) => {
    const propInfo = createPropertyInfo(value);
    const messages = validator.validateProperty('testProp', value, fieldType, propInfo, 'TestClass');

    if (error) {
      expectMessage(messages, { text: error, severity: 'error' });
    } else {
      expectValid(messages);
    }
  });
}

describe('Property Validation', () => {
  describe('Boolean validation', () => {
    checkTestCases('boolean', [
      { value: 'true' },
      { value: 'false' },
      { value: 'TRUE' }, // Case-insensitive
      { value: 'FALSE' }, // Case-insensitive
      { value: '1', error: 'Invalid boolean' },
      { value: '0', error: 'Invalid boolean' },
      { value: 'yes', error: 'Invalid boolean' },
      { value: '' }, // Empty allowed
    ]);
  });

  describe('Integer validation', () => {
    checkTestCases('integer', [
      { value: '0' },
      { value: '123' },
      { value: '-456' },
      { value: '3.14', error: 'Invalid integer' },
      { value: '1.0', error: 'Invalid integer' },
      { value: 'abc', error: 'Invalid integer' },
      { value: '' }, // Empty allowed
    ]);
  });

  describe('Float validation', () => {
    checkTestCases('float', [
      { value: '0' },
      { value: '3.14' },
      { value: '-2.5' },
      { value: '.5' },
      { value: '-.1' },
      { value: '1.5e10' },
      { value: '2.5E-3' },
      { value: '-1.5e10' },
      { value: '-2.5E-3' },
      { value: 'abc', error: 'Invalid float' },
      { value: '' },
    ]);
  });

  describe('Byte validation', () => {
    checkTestCases('byte', [
      { value: '0' },
      { value: '255' },
      { value: '128' },
      { value: '-1', error: 'Invalid byte' },
      { value: '256', error: 'Invalid byte' },
      { value: '3.14', error: 'Invalid byte' },
      { value: 'abc', error: 'Invalid byte' },
      { value: '' },
    ]);
  });

  describe('Vector2 validation', () => {
    checkTestCases('Vector2', [
      { value: '1,2' },
      { value: '0.5, -3.14' },
      { value: '1', error: 'Invalid Vector2' },
      { value: '1,2,3', error: 'Invalid Vector2' },
      { value: 'a,1', error: 'Invalid Vector2 X' },
      { value: '1,a', error: 'Invalid Vector2 Y' },
      { value: 'a,b', error: 'Invalid Vector2 X' },
      { value: '' },
    ]);
  });

  describe('Vector3 validation', () => {
    checkTestCases('Vector3', [
      { value: '1,2,3' },
      { value: '0.5, -3.14, 2.71' },
      { value: '1,2', error: 'Invalid Vector3' },
      { value: '1,2,3,4', error: 'Invalid Vector3' },
      { value: 'a,1,1', error: 'Invalid Vector3 X' },
      { value: '1,a,1', error: 'Invalid Vector3 Y' },
      { value: '1,1,a', error: 'Invalid Vector3 Z' },
      { value: 'a,b,c', error: 'Invalid Vector3 X' },
      { value: '' },
    ]);
  });

  describe('Rectangle validation', () => {
    checkTestCases('Rectangle', [
      { value: '0,0,100,100' },
      { value: '-10, 20, 50, 30' },
      { value: '1,2,3', error: 'Invalid Rectangle' },
      { value: '1,2,3,4,5', error: 'Invalid Rectangle' },
      { value: '1.5,2,3,4', error: 'Invalid Rectangle' },
      { value: '' },
    ]);
  });

  describe('TileCoord validation', () => {
    checkTestCases('TileCoord', [
      { value: '10,20' },
      { value: '-5, 15' },
      { value: '1', error: 'Invalid Vector2' },
      { value: '1,2,3', error: 'Invalid Vector2' },
      { value: '' },
    ]);
  });

  describe('String validation', () => {
    const validator = new PropertyValidator();

    test('accepts any string value', () => {
      const testStrings = ['hello', '123', 'with spaces', 'special!@#$', ''];

      for (const value of testStrings) {
        const propInfo = createPropertyInfo(value);
        const messages = validator.validateProperty('testProp', value, 'string', propInfo, 'TestClass');
        expectValid(messages);
      }
    });
  });

  describe('List validation', () => {
    const validator = new PropertyValidator();

    test('validates List<integer> with ! prefix (overwrite)', () => {
      const propInfo = createPropertyInfo('1,2,3');
      const messages = validator.validateProperty('!testProp', '1,2,3', 'List<integer>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid integers in List<integer>', () => {
      const propInfo = createPropertyInfo('1,abc,3');
      const messages = validator.validateProperty('!testProp', '1,abc,3', 'List<integer>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid integer in list', severity: 'error' });
    });

    test('validates List<float> with ! prefix', () => {
      const propInfo = createPropertyInfo('1.5,2.7,3.14');
      const messages = validator.validateProperty('!testProp', '1.5,2.7,3.14', 'List<float>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid floats in List<float>', () => {
      const propInfo = createPropertyInfo('1.5,abc,3.14');
      const messages = validator.validateProperty('!testProp', '1.5,abc,3.14', 'List<float>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid float in list', severity: 'error' });
    });

    test('validates single integer append (no ! prefix)', () => {
      const propInfo = createPropertyInfo('42');
      const messages = validator.validateProperty('testProp', '42', 'List<integer>', propInfo, 'TestClass');
      expectValid(messages);
    });
  });

  describe('Empty values', () => {
    const validator = new PropertyValidator();

    test('allows empty values for most types', () => {
      const types = ['boolean', 'integer', 'float', 'byte', 'string', 'Vector2', 'Formula'];

      for (const valType of types) {
        const propInfo = createPropertyInfo('');
        const messages = validator.validateProperty('testProp', '', valType, propInfo, 'TestClass');
        expectValid(messages);
      }
    });
  });
});
