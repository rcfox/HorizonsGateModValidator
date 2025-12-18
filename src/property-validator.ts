/**
 * Property type validator
 * Validates that property values match their expected types
 */

import { FieldType, ValidationMessage, PropertyInfo } from './types.js';
import { validateFormula } from './formula-validator.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import modSchemaData from './mod-schema.json' with { type: 'json' };
import type { SchemaData } from './types.js';

export class PropertyValidator {
  private enums: Record<string, Record<string, number>>;

  constructor() {
    const data = modSchemaData as SchemaData;
    this.enums = data.enums;
  }

  /**
   * Validate a property value against its expected type
   */
  validateProperty(
    propertyName: string,
    value: string,
    expectedType: FieldType,
    propInfo: PropertyInfo,
    className: string
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const line = propInfo.valueStartLine;

    // Handle the special ! prefix for overwriting lists
    const hasOverwritePrefix = propertyName.startsWith('!');
    const cleanValue = value.trim();

    if (cleanValue === '') {
      // Empty values are generally allowed
      return messages;
    }

    switch (expectedType) {
      case 'boolean':
        if (!this.isValidBoolean(cleanValue)) {
          const similar = findSimilar(value, ['true', 'false'], MAX_EDIT_DISTANCE);
          const corrections = similar.map(s => ({
            filePath: propInfo.filePath,
            startLine: propInfo.valueStartLine,
            startColumn: propInfo.valueStartColumn,
            endLine: propInfo.valueEndLine,
            endColumn: propInfo.valueEndColumn,
            replacementText: s.value,
          }));
          messages.push({
            severity: 'error',
            message: `Invalid boolean value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected 'true' or 'false', got '${cleanValue}'`,
            corrections,
          });
        }
        break;

      case 'integer':
        if (!this.isValidInteger(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid integer value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected whole number, got '${cleanValue}'`,
          });
        }
        break;

      case 'float':
        if (!this.isValidFloat(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid float value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected number, got '${cleanValue}'`,
          });
        }
        break;

      case 'byte':
        if (!this.isValidByte(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid byte value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected number 0-255, got '${cleanValue}'`,
          });
        }
        break;

      case 'string':
        // Strings are always valid
        break;

      case 'Vector2':
        messages.push(...this.validateVector2(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'Vector3':
        messages.push(...this.validateVector3(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'Rectangle':
        messages.push(...this.validateRectangle(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'TileCoord':
        messages.push(...this.validateTileCoord(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'Color':
        // Color is handled specially with R, G, B properties
        break;

      case 'Formula':
        messages.push(...validateFormula(cleanValue, propInfo));
        break;

      case 'List<string>':
        messages.push(
          ...this.validateListString(propertyName, cleanValue, hasOverwritePrefix, propInfo.filePath, line)
        );
        break;

      case 'List<integer>':
        messages.push(
          ...this.validateListInteger(propertyName, cleanValue, hasOverwritePrefix, propInfo.filePath, line)
        );
        break;

      case 'List<float>':
        messages.push(...this.validateListFloat(propertyName, cleanValue, hasOverwritePrefix, propInfo.filePath, line));
        break;

      case 'List<Vector2>':
        messages.push(...this.validateVector2(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'List<TileCoord>':
        messages.push(...this.validateTileCoord(propertyName, cleanValue, propInfo.filePath, line));
        break;

      case 'List<Formula>':
        messages.push(...validateFormula(cleanValue, propInfo));
        break;

      default:
        // Check if this is an enum type (direct or namespaced)
        let resolvedEnumType = this.resolveEnumName(expectedType, className);
        if (resolvedEnumType) {
          messages.push(...this.validateEnum(propertyName, cleanValue, resolvedEnumType, propInfo));
          break;
        }

        // Check if this is a List<Enum> or HashSet<Enum> type
        const listEnumMatch = expectedType.match(/^(?:List|HashSet)<(\w+)>$/);
        if (listEnumMatch) {
          const enumName = listEnumMatch[1];
          if (!enumName) {
            throw new Error(`Failed to extract enum name from type '${expectedType}'`);
          }
          // Try to find the enum (might be namespaced)
          const resolvedEnumName = this.resolveEnumName(enumName, className);

          if (resolvedEnumName) {
            // List/HashSet of enum values - validate each comma-separated value
            const parts = cleanValue
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            for (const part of parts) {
              messages.push(...this.validateEnum(propertyName, part, resolvedEnumName, propInfo));
            }
            break;
          }
        }

        // Unknown type or complex type - issue warning but don't fail
        if (
          expectedType.startsWith('List<') ||
          expectedType.startsWith('Dictionary<') ||
          expectedType.startsWith('HashSet<')
        ) {
          // Collection types - generally accept comma-separated values
          break;
        }
        messages.push({
          severity: 'info',
          message: `Cannot validate type ${expectedType} for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
          context: 'Type validation not implemented for this type',
        });
        break;
    }

    return messages;
  }

  private isValidBoolean(value: string): boolean {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'false';
  }

  private isValidInteger(value: string): boolean {
    return /^-?\d+$/.test(value);
  }

  private isValidFloat(value: string): boolean {
    // Support regular floats and scientific notation (e.g., 1.5e10, 2.5E-3)
    return /^-?\d+\.?\d*([eE][+-]?\d+)?$/.test(value);
  }

  private isValidByte(value: string): boolean {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  }

  /**
   * Resolve an enum name to its actual key in the enums registry
   * Tries className.enumName first, then just enumName
   */
  private resolveEnumName(enumName: string, className: string): string | null {
    // First try the namespaced version
    const namespacedName = `${className}.${enumName}`;
    if (this.enums[namespacedName]) {
      return namespacedName;
    }

    // Fall back to the simple name
    if (this.enums[enumName]) {
      return enumName;
    }

    return null;
  }

  private validateEnum(
    propertyName: string,
    value: string,
    enumName: string,
    propInfo: PropertyInfo
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const line = propInfo.valueStartLine;
    const enumValues = this.enums[enumName];

    if (!enumValues) {
      // Enum not found in schema, just check it's a valid identifier
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        messages.push({
          severity: 'warning',
          message: `Invalid ${enumName} value '${value}' for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
        });
      }
      return messages;
    }

    // Check if value is a numeric string
    const numericValue = parseInt(value, 10);
    if (!isNaN(numericValue) && value === numericValue.toString()) {
      // Special case for Element enum with custom values (> 2000)
      if (enumName === 'Element' && numericValue > 2000) {
        messages.push({
          severity: 'info',
          message: `Custom Element value detected: ${value}`,
          filePath: propInfo.filePath,
          line,
          context: `Custom element values (> 2000) are reserved for modders`,
          suggestion: `Check the modder community document to ensure this value hasn't been taken and to reserve a section`,
          documentationUrl:
            'https://docs.google.com/document/d/15H0QN-tm2ERGXdeV2esavm6u-eaNniliTs4ZlAML79U/edit?tab=t.0#heading=h.75sdxuctqmty',
          documentationLabel: 'Modder Community Element Registry',
        });
        return messages;
      }

      // Find the enum name(s) that correspond to this numeric value
      const matchingNames = Object.entries(enumValues)
        .filter(([_, enumVal]) => enumVal === numericValue)
        .map(([name, _]) => name);

      if (matchingNames.length > 0) {
        const corrections = matchingNames.map(name => ({
          filePath: propInfo.filePath,
          startLine: propInfo.valueStartLine,
          startColumn: propInfo.valueStartColumn,
          endLine: propInfo.valueEndLine,
          endColumn: propInfo.valueEndColumn,
          replacementText: name,
        }));
        messages.push({
          severity: 'warning',
          message: `Numeric enum value used for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
          context: `Use the enum name instead of the numeric value '${value}'`,
          corrections,
        });
      } else {
        messages.push({
          severity: 'error',
          message: `Invalid ${enumName} numeric value for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
          context: `'${value}' is not a valid ${enumName} value`,
          suggestion: `Use enum names instead of numbers`,
        });
      }
      return messages;
    }

    // Check if value is in the enum (enumValues is now an object mapping names to numeric values)
    const enumNames = Object.keys(enumValues);
    if (!enumNames.includes(value)) {
      // Find similar enum values
      const similar = findSimilar(value, enumNames, MAX_EDIT_DISTANCE);
      const corrections = similar.map(s => ({
        filePath: propInfo.filePath,
        startLine: propInfo.valueStartLine,
        startColumn: propInfo.valueStartColumn,
        endLine: propInfo.valueEndLine,
        endColumn: propInfo.valueEndColumn,
        replacementText: s.value,
      }));

      messages.push({
        severity: 'error',
        message: `Invalid ${enumName} value '${value}' for ${propertyName}`,
        filePath: propInfo.filePath,
        line,
        corrections,
      });
    }

    return messages;
  }

  private validateVector2(name: string, value: string, filePath: string, line: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 2) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 for ${name}`,
        filePath,
        line,
        context: `Expected format: x,y (got ${parts.length} values)`,
      });
      return messages;
    }

    const x = parts[0];
    if (!x) {
      messages.push({
        severity: 'error',
        message: `Missing X component for Vector2 in ${name}`,
        filePath,
        line,
        context: `Expected format: x,y`,
      });
    } else if (!this.isValidFloat(x)) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 X value for ${name}`,
        filePath,
        line,
        context: `Expected number, got '${x}'`,
      });
    }

    const y = parts[1];
    if (!y) {
      messages.push({
        severity: 'error',
        message: `Missing Y component for Vector2 in ${name}`,
        filePath,
        line,
        context: `Expected format: x,y`,
      });
    } else if (!this.isValidFloat(y)) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 Y value for ${name}`,
        filePath,
        line,
        context: `Expected number, got '${y}'`,
      });
    }

    return messages;
  }

  private validateVector3(name: string, value: string, filePath: string, line: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 3) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector3 for ${name}`,
        filePath,
        line,
        context: `Expected format: x,y,z (got ${parts.length} values)`,
      });
      return messages;
    }

    const componentNames = ['X', 'Y', 'Z'];
    for (let i = 0; i < 3; i++) {
      const component = parts[i];
      if (!component) {
        messages.push({
          severity: 'error',
          message: `Missing ${componentNames[i]} component for Vector3 in ${name}`,
          filePath,
          line,
          context: `Expected format: x,y,z`,
        });
      } else if (!this.isValidFloat(component)) {
        messages.push({
          severity: 'error',
          message: `Invalid Vector3 ${componentNames[i]} value for ${name}`,
          filePath,
          line,
          context: `Expected number, got '${component}'`,
        });
      }
    }

    return messages;
  }

  private validateRectangle(name: string, value: string, filePath: string, line: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 4) {
      messages.push({
        severity: 'error',
        message: `Invalid Rectangle for ${name}`,
        filePath,
        line,
        context: `Expected format: x,y,width,height (got ${parts.length} values)`,
      });
      return messages;
    }

    const componentNames = ['X', 'Y', 'Width', 'Height'];
    for (let i = 0; i < 4; i++) {
      const component = parts[i];
      if (!component) {
        messages.push({
          severity: 'error',
          message: `Missing ${componentNames[i]} component for Rectangle in ${name}`,
          filePath,
          line,
          context: `Expected format: x,y,width,height`,
        });
      } else if (!this.isValidInteger(component)) {
        messages.push({
          severity: 'error',
          message: `Invalid Rectangle ${componentNames[i]} value for ${name}`,
          filePath,
          line,
          context: `Expected integer, got '${component}'`,
        });
      }
    }

    return messages;
  }

  private validateTileCoord(name: string, value: string, filePath: string, line: number): ValidationMessage[] {
    // TileCoord is same as Vector2
    return this.validateVector2(name, value, filePath, line);
  }

  private validateListString(
    _name: string,
    _value: string,
    _isOverwrite: boolean,
    _filePath: string,
    _line: number
  ): ValidationMessage[] {
    // Strings in lists are comma-separated
    // With ! prefix, it overwrites the list, otherwise appends
    // Empty strings are allowed if it's a single append
    return [];
  }

  private validateListInteger(
    name: string,
    value: string,
    isOverwrite: boolean,
    filePath: string,
    line: number
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    if (isOverwrite) {
      // Comma-separated list of integers
      const parts = value
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      for (const part of parts) {
        if (!this.isValidInteger(part)) {
          messages.push({
            severity: 'error',
            message: `Invalid integer in list for ${name}`,
            filePath,
            line,
            context: `Expected integer, got '${part}'`,
          });
        }
      }
    } else {
      // Single integer to append
      if (!this.isValidInteger(value)) {
        messages.push({
          severity: 'error',
          message: `Invalid integer for ${name}`,
          filePath,
          line,
          context: `Expected integer, got '${value}'`,
        });
      }
    }

    return messages;
  }

  private validateListFloat(
    name: string,
    value: string,
    isOverwrite: boolean,
    filePath: string,
    line: number
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    if (isOverwrite) {
      // Comma-separated list of floats
      const parts = value
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      for (const part of parts) {
        if (!this.isValidFloat(part)) {
          messages.push({
            severity: 'error',
            message: `Invalid float in list for ${name}`,
            filePath,
            line,
            context: `Expected number, got '${part}'`,
          });
        }
      }
    } else {
      // Single float to append
      if (!this.isValidFloat(value)) {
        messages.push({
          severity: 'error',
          message: `Invalid float for ${name}`,
          filePath,
          line,
          context: `Expected number, got '${value}'`,
        });
      }
    }

    return messages;
  }
}
