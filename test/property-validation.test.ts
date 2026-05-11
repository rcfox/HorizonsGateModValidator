/**
 * Property Validation Tests
 * Tests that property values are validated correctly against their expected types
 */

import { describe, test } from 'vitest';
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

    // BUG: Invalid float regex allows malformed values
    // ISSUE: property-validator.ts:219 regex /^-?\d*\.?\d*([eE][+-]?\d+)?$/
    //        allows zero digits before AND after decimal point
    // GAME BEHAVIOR: float.Parse() throws FormatException for these values
    describe('Invalid formats (CURRENTLY FAILING - should error)', () => {
      checkTestCases('float', [
        { value: '.', error: 'Invalid float' }, // Just a decimal point
        { value: '-', error: 'Invalid float' }, // Just a minus sign
        { value: 'e5', error: 'Invalid float' }, // Missing mantissa
        { value: '-.', error: 'Invalid float' }, // Minus and decimal only
      ]);
    });
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

  describe('Collection (List and HashSet) validation', () => {
    const validator = new PropertyValidator();

    test('validates single List<integer> element', () => {
      const propInfo = createPropertyInfo('42');
      const messages = validator.validateProperty('testProp', '42', 'List<integer>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('validates comma-separated List<integer> elements', () => {
      const propInfo = createPropertyInfo('1,2,3');
      const messages = validator.validateProperty('testProp', '1,2,3', 'List<integer>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid integer in List<integer>', () => {
      const propInfo = createPropertyInfo('1,abc,3');
      const messages = validator.validateProperty('testProp', '1,abc,3', 'List<integer>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid integer value', severity: 'error' });
    });

    test('validates comma-separated List<float> elements', () => {
      const propInfo = createPropertyInfo('1.5,2.7,3.14');
      const messages = validator.validateProperty('testProp', '1.5,2.7,3.14', 'List<float>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid float in List<float>', () => {
      const propInfo = createPropertyInfo('1.5,abc,3.14');
      const messages = validator.validateProperty('testProp', '1.5,abc,3.14', 'List<float>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid float value', severity: 'error' });
    });

    test('HashSet<integer> rejects invalid integer the same as List<integer>', () => {
      const propInfo = createPropertyInfo('abc');
      const messages = validator.validateProperty('testProp', 'abc', 'HashSet<integer>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid integer value', severity: 'error' });
    });
  });

  describe('Dictionary validation', () => {
    const validator = new PropertyValidator();

    test('accepts valid Dictionary<string, string> entry', () => {
      const propInfo = createPropertyInfo('armR=ekrast_armR');
      const messages = validator.validateProperty('testProp', 'armR=ekrast_armR', 'Dictionary<string, string>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('accepts valid Dictionary<string, integer> entry', () => {
      const propInfo = createPropertyInfo('myKey=42');
      const messages = validator.validateProperty('testProp', 'myKey=42', 'Dictionary<string, integer>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid integer in Dictionary<string, integer>', () => {
      const propInfo = createPropertyInfo('myKey=notAnInt');
      const messages = validator.validateProperty('testProp', 'myKey=notAnInt', 'Dictionary<string, integer>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid integer value', severity: 'error' });
    });

    test('accepts valid Dictionary<string, int> entry', () => {
      const propInfo = createPropertyInfo('myKey=7');
      const messages = validator.validateProperty('testProp', 'myKey=7', 'Dictionary<string, int>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('accepts valid Dictionary<string, float> entry', () => {
      const propInfo = createPropertyInfo('myKey=1.5');
      const messages = validator.validateProperty('testProp', 'myKey=1.5', 'Dictionary<string, float>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid float in Dictionary<string, float>', () => {
      const propInfo = createPropertyInfo('myKey=notAFloat');
      const messages = validator.validateProperty('testProp', 'myKey=notAFloat', 'Dictionary<string, float>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid float value', severity: 'error' });
    });

    test('accepts valid Dictionary<string, List<float>> entry (single append)', () => {
      const propInfo = createPropertyInfo('myKey=3.14');
      const messages = validator.validateProperty('testProp', 'myKey=3.14', 'Dictionary<string, List<float>>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid float in Dictionary<string, List<float>>', () => {
      const propInfo = createPropertyInfo('myKey=notAFloat');
      const messages = validator.validateProperty('testProp', 'myKey=notAFloat', 'Dictionary<string, List<float>>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid float value', severity: 'error' });
    });

    test('accepts valid Dictionary<string, List<string>> entry without validation', () => {
      const propInfo = createPropertyInfo('myKey=anything');
      const messages = validator.validateProperty('testProp', 'myKey=anything', 'Dictionary<string, List<string>>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('raises info for unsupported Dictionary value type', () => {
      const propInfo = createPropertyInfo('myKey=someValue');
      const messages = validator.validateProperty('testProp', 'myKey=someValue', 'Dictionary<string, Actor>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Cannot validate type Actor', severity: 'info' });
    });

    test('raises info for Dictionary<string, List<Keyframe>>', () => {
      const propInfo = createPropertyInfo('myKey=someValue');
      const messages = validator.validateProperty('testProp', 'myKey=someValue', 'Dictionary<string, List<Keyframe>>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Cannot validate type Keyframe', severity: 'info' });
    });

    test('errors on missing = in Dictionary entry', () => {
      const propInfo = createPropertyInfo('noEqualsSign');
      const messages = validator.validateProperty('testProp', 'noEqualsSign', 'Dictionary<string, string>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid Dictionary entry', severity: 'error' });
    });

    test('errors on empty Dictionary key', () => {
      const propInfo = createPropertyInfo('=value');
      const messages = validator.validateProperty('testProp', '=value', 'Dictionary<string, string>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Empty Dictionary key', severity: 'error' });
    });

    test('validates integer key in Dictionary<integer, string>', () => {
      const propInfo = createPropertyInfo('42=value');
      const messages = validator.validateProperty('testProp', '42=value', 'Dictionary<integer, string>', propInfo, 'TestClass');
      expectValid(messages);
    });

    test('rejects invalid integer key in Dictionary<integer, string>', () => {
      const propInfo = createPropertyInfo('notAnInt=value');
      const messages = validator.validateProperty('testProp', 'notAnInt=value', 'Dictionary<integer, string>', propInfo, 'TestClass');
      expectMessage(messages, { text: 'Invalid integer value', severity: 'error' });
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
