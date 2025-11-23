/**
 * Property type validator
 * Validates that property values match their expected types
 */

import { FieldType, ValidationMessage, ModSchema } from './types.js';
import { FormulaValidator } from './formula-validator.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import modSchemaData from './mod-schema.json' with { type: 'json' };
import type { SchemaData } from './types.js';

export class PropertyValidator {
  private formulaValidator = new FormulaValidator();
  private enums: Record<string, string[]>;

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
    line?: number
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

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
          messages.push({
            severity: 'error',
            message: `Invalid boolean value for ${propertyName}`,
            line,
            context: `Expected 'true' or 'false', got '${cleanValue}'`,
          });
        }
        break;

      case 'integer':
        if (!this.isValidInteger(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid integer value for ${propertyName}`,
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
            line,
            context: `Expected number 0-255, got '${cleanValue}'`,
          });
        }
        break;

      case 'string':
        // Strings are always valid
        break;

      case 'Vector2':
        messages.push(...this.validateVector2(propertyName, cleanValue, line));
        break;

      case 'Vector3':
        messages.push(...this.validateVector3(propertyName, cleanValue, line));
        break;

      case 'Rectangle':
        messages.push(...this.validateRectangle(propertyName, cleanValue, line));
        break;

      case 'TileCoord':
        messages.push(...this.validateTileCoord(propertyName, cleanValue, line));
        break;

      case 'Color':
        // Color is handled specially with R, G, B properties
        break;

      case 'Formula':
        const formulaResult = this.formulaValidator.validate(cleanValue, line);
        messages.push(...formulaResult.errors);
        messages.push(...formulaResult.warnings);
        break;

      case 'List<string>':
        messages.push(...this.validateListString(propertyName, cleanValue, hasOverwritePrefix, line));
        break;

      case 'List<integer>':
        messages.push(...this.validateListInteger(propertyName, cleanValue, hasOverwritePrefix, line));
        break;

      case 'List<float>':
        messages.push(...this.validateListFloat(propertyName, cleanValue, hasOverwritePrefix, line));
        break;

      case 'List<Vector2>':
        messages.push(...this.validateVector2(propertyName, cleanValue, line));
        break;

      case 'List<TileCoord>':
        messages.push(...this.validateTileCoord(propertyName, cleanValue, line));
        break;

      case 'List<Formula>':
        const listFormulaResult = this.formulaValidator.validate(cleanValue, line);
        messages.push(...listFormulaResult.errors);
        messages.push(...listFormulaResult.warnings);
        break;

      default:
        // Check if this is an enum type
        if (this.enums[expectedType]) {
          messages.push(...this.validateEnum(propertyName, cleanValue, expectedType, line));
          break;
        }

        // Check if this is a List<Enum> type
        const listEnumMatch = expectedType.match(/^List<(\w+)>$/);
        if (listEnumMatch && this.enums[listEnumMatch[1]]) {
          // List of enum values - validate each comma-separated value
          const parts = cleanValue.split(',').map(p => p.trim()).filter(p => p.length > 0);
          for (const part of parts) {
            messages.push(...this.validateEnum(propertyName, part, listEnumMatch[1], line));
          }
          break;
        }

        // Unknown type or complex type - issue warning but don't fail
        if (expectedType.startsWith('List<') || expectedType.startsWith('Dictionary<') || expectedType.startsWith('HashSet<')) {
          // Collection types - generally accept comma-separated values
          break;
        }
        messages.push({
          severity: 'info',
          message: `Cannot validate type ${expectedType} for ${propertyName}`,
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
    return /^-?\d+\.?\d*$/.test(value);
  }

  private isValidByte(value: string): boolean {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  }

  private validateEnum(propertyName: string, value: string, enumName: string, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const enumValues = this.enums[enumName];

    if (!enumValues) {
      // Enum not found in schema, just check it's a valid identifier
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        messages.push({
          severity: 'warning',
          message: `Invalid ${enumName} value for ${propertyName}`,
          line,
          context: `Expected an identifier, got '${value}'`,
        });
      }
      return messages;
    }

    // Check if value is in the enum
    if (!enumValues.includes(value)) {
      // Find similar enum values
      const similar = findSimilar(value, enumValues, MAX_EDIT_DISTANCE);
      const corrections = similar.map(s => s.value);

      messages.push({
        severity: 'error',
        message: `Invalid ${enumName} value for ${propertyName}`,
        line,
        context: `'${value}' is not a valid ${enumName}`,
        suggestion: corrections.length > 0
          ? `Did you mean: ${corrections.join(', ')}?`
          : `Valid values: ${enumValues.slice(0, 10).join(', ')}${enumValues.length > 10 ? ', ...' : ''}`,
        corrections,
      });
    }

    return messages;
  }

  private validateVector2(name: string, value: string, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 2) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 for ${name}`,
        line,
        context: `Expected format: x,y (got ${parts.length} values)`,
      });
      return messages;
    }

    if (!this.isValidFloat(parts[0])) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 X value for ${name}`,
        line,
        context: `Expected number, got '${parts[0]}'`,
      });
    }

    if (!this.isValidFloat(parts[1])) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 Y value for ${name}`,
        line,
        context: `Expected number, got '${parts[1]}'`,
      });
    }

    return messages;
  }

  private validateVector3(name: string, value: string, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 3) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector3 for ${name}`,
        line,
        context: `Expected format: x,y,z (got ${parts.length} values)`,
      });
      return messages;
    }

    for (let i = 0; i < 3; i++) {
      if (!this.isValidFloat(parts[i])) {
        messages.push({
          severity: 'error',
          message: `Invalid Vector3 component ${i} for ${name}`,
          line,
          context: `Expected number, got '${parts[i]}'`,
        });
      }
    }

    return messages;
  }

  private validateRectangle(name: string, value: string, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const parts = value.split(',').map(p => p.trim());

    if (parts.length !== 4) {
      messages.push({
        severity: 'error',
        message: `Invalid Rectangle for ${name}`,
        line,
        context: `Expected format: x,y,width,height (got ${parts.length} values)`,
      });
      return messages;
    }

    for (let i = 0; i < 4; i++) {
      if (!this.isValidInteger(parts[i])) {
        messages.push({
          severity: 'error',
          message: `Invalid Rectangle component ${i} for ${name}`,
          line,
          context: `Expected integer, got '${parts[i]}'`,
        });
      }
    }

    return messages;
  }

  private validateTileCoord(name: string, value: string, line?: number): ValidationMessage[] {
    // TileCoord is same as Vector2
    return this.validateVector2(name, value, line);
  }

  private validateListString(name: string, value: string, isOverwrite: boolean, line?: number): ValidationMessage[] {
    // Strings in lists are comma-separated
    // With ! prefix, it overwrites the list, otherwise appends
    // Empty strings are allowed if it's a single append
    return [];
  }

  private validateListInteger(name: string, value: string, isOverwrite: boolean, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    if (isOverwrite) {
      // Comma-separated list of integers
      const parts = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
      for (const part of parts) {
        if (!this.isValidInteger(part)) {
          messages.push({
            severity: 'error',
            message: `Invalid integer in list for ${name}`,
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
          line,
          context: `Expected integer, got '${value}'`,
        });
      }
    }

    return messages;
  }

  private validateListFloat(name: string, value: string, isOverwrite: boolean, line?: number): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    if (isOverwrite) {
      // Comma-separated list of floats
      const parts = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
      for (const part of parts) {
        if (!this.isValidFloat(part)) {
          messages.push({
            severity: 'error',
            message: `Invalid float in list for ${name}`,
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
          line,
          context: `Expected number, got '${value}'`,
        });
      }
    }

    return messages;
  }
}
