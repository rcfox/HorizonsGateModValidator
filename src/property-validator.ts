/**
 * Property type validator
 * Validates that property values match their expected types
 */

import { FieldType, ValidationMessage, PropertyInfo, ValidationErrorCode } from './types.js';
import { validateFormula } from './formula-validator.js';
import { validateDynamicText } from './dynamic-text-validator.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import modSchemaData from './mod-schema.json' with { type: 'json' };
import type { SchemaData } from './types.js';
import { TaskValidator } from './task-validator.js';
import { isValidBoolean, isValidInteger, isValidFloat, isValidByte } from './value-validators.js';

export class PropertyValidator {
  private enums: Record<string, Record<string, number>>;
  private taskValidator: TaskValidator;

  constructor() {
    const data = modSchemaData as SchemaData;
    this.enums = data.enums;
    this.taskValidator = new TaskValidator();
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
    //const hasOverwritePrefix = propertyName.startsWith('!');
    const cleanValue = value.trim();

    if (cleanValue === '') {
      // Empty values are generally allowed
      return messages;
    }

    // Special case: DialogNode/DialogOption/DialogNodeOverride.specialEffect - validate as task strings
    // TODO: Also validate trigger IDs when we have complete trigger metadata
    if (
      (className === 'DialogNode' || className === 'DialogOption' || className === 'DialogNodeOverride') &&
      propertyName === 'specialEffect' &&
      expectedType === 'List<string>'
    ) {
      // Each property assignment is one element in the list, so validate the entire value as a single task string
      // Pass className and propertyName for context-aware validation (implicit float 0)
      messages.push(...this.taskValidator.validateTaskString(cleanValue, propInfo, className, propertyName));
      return messages;
    }

    switch (expectedType) {
      case 'bool':
      case 'boolean':
        if (!isValidBoolean(cleanValue)) {
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
            errorCode: ValidationErrorCode.INVALID_BOOLEAN,
            errorCodeContext: { propertyName },
          });
        }
        break;

      case 'int':
      case 'integer':
        if (!isValidInteger(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid integer value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected whole number, got '${cleanValue}'`,
            errorCode: ValidationErrorCode.INVALID_INTEGER,
            errorCodeContext: { propertyName },
          });
        }
        break;

      case 'float':
        if (!isValidFloat(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid float value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected number, got '${cleanValue}'`,
            errorCode: ValidationErrorCode.INVALID_FLOAT,
            errorCodeContext: { propertyName },
          });
        }
        break;

      case 'byte':
        if (!isValidByte(cleanValue)) {
          messages.push({
            severity: 'error',
            message: `Invalid byte value for ${propertyName}`,
            filePath: propInfo.filePath,
            line,
            context: `Expected number 0-255, got '${cleanValue}'`,
            errorCode: ValidationErrorCode.INVALID_BYTE,
            errorCodeContext: { propertyName },
          });
        }
        break;

      case 'string':
        // Validate dynamic text tags in string values
        messages.push(...validateDynamicText(cleanValue, propInfo));
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
        messages.push(...validateFormula(cleanValue, propInfo, propertyName, className));
        break;

      default:
        // Check if this is an enum type (direct or namespaced)
        let resolvedEnumType = this.resolveEnumName(expectedType, className);
        if (resolvedEnumType) {
          messages.push(...this.validateEnum(propertyName, cleanValue, resolvedEnumType, propInfo));
          break;
        }

        // Check if this is a List<X> or HashSet<X> type — split on commas and validate each element
        const collectionMatch = expectedType.match(/^(?:List|HashSet)<(.+)>$/);
        if (collectionMatch) {
          const elementType = collectionMatch[1]!;
          const baseName = propertyName.startsWith('!') ? propertyName.slice(1) : propertyName;

          // Types that DataManager parses as fixed-size CSV (components within a single element)
          const compoundComponentCount: Partial<Record<string, number>> = {
            Vector2: 2,
            TileCoord: 2,
            Rectangle: 4,
          };

          const componentCount = compoundComponentCount[elementType];
          if (componentCount !== undefined) {
            const allParts = cleanValue.split(',').map(p => p.trim());
            if (allParts.length > componentCount) {
              messages.push({
                severity: 'warning',
                message: `Too many comma-separated values for ${expectedType}`,
                filePath: propInfo.filePath,
                line,
                context: `${elementType} uses ${componentCount} components; extra values are silently ignored by the game`,
                suggestion: `Use separate property assignments for each element`,
                errorCode: ValidationErrorCode.TOO_MANY_LIST_VALUES,
                errorCodeContext: { propertyName, elementType },
              });
            }
            messages.push(...this.validateProperty(baseName, allParts.slice(0, componentCount).join(','), elementType, propInfo, className));
          } else {
            const parts = cleanValue
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            for (const part of parts) {
              messages.push(...this.validateProperty(baseName, part, elementType, propInfo, className));
            }
          }
          break;
        }

        // Check if this is a Dictionary type
        const dictMatch = expectedType.match(/^Dictionary<(\w+),\s*(.+)>$/);
        if (dictMatch) {
          const keyType = dictMatch[1]!;
          const valueType = dictMatch[2]!;
          messages.push(...this.validateDictionaryEntry(propertyName, cleanValue, keyType, valueType, propInfo, className));
          break;
        }
        messages.push({
          severity: 'info',
          message: `Cannot validate type ${expectedType} for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
          context: 'Type validation not implemented for this type',
          errorCode: ValidationErrorCode.UNVALIDATED_TYPE,
          errorCodeContext: { propertyName, typeName: expectedType },
        });
        break;
    }

    return messages;
  }

  /**
   * Validate a value as a task string
   * Public method for use by validator.ts for context-aware validation
   */
  validateTaskString(
    value: string,
    propInfo: PropertyInfo,
    objectType?: string,
    propertyName?: string
  ): ValidationMessage[] {
    return this.taskValidator.validateTaskString(value, propInfo, objectType, propertyName);
  }

  /**
   * Validate that a task name exists (without validating parameters)
   * Public method for use by validator.ts
   */
  validateTaskName(taskName: string, propInfo: PropertyInfo): ValidationMessage[] {
    return this.taskValidator.validateTaskName(taskName, propInfo);
  }

  /**
   * Validate a dictionary entry in the form "key=value".
   * Key and value types are validated via the common validateProperty path.
   */
  private validateDictionaryEntry(
    propertyName: string,
    value: string,
    keyType: string,
    valueType: string,
    propInfo: PropertyInfo,
    className: string
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const line = propInfo.valueStartLine;

    const equalsIndex = value.indexOf('=');
    if (equalsIndex === -1) {
      messages.push({
        severity: 'error',
        message: `Invalid Dictionary entry for ${propertyName}`,
        filePath: propInfo.filePath,
        line,
        context: `Expected format: key=value, got '${value}'`,
        errorCode: ValidationErrorCode.INVALID_DICT_ENTRY,
        errorCodeContext: { propertyName },
      });
      return messages;
    }

    const key = value.substring(0, equalsIndex).trim();
    const dictValue = value.substring(equalsIndex + 1).trim();
    const baseName = propertyName.startsWith('!') ? propertyName.slice(1) : propertyName;

    if (key.length === 0) {
      messages.push({
        severity: 'error',
        message: `Empty Dictionary key for ${baseName}`,
        filePath: propInfo.filePath,
        line,
        context: 'Dictionary keys must be non-empty',
        errorCode: ValidationErrorCode.EMPTY_DICT_KEY,
        errorCodeContext: { propertyName: baseName },
      });
    } else {
      messages.push(...this.validateProperty(baseName, key, keyType, propInfo, className));
    }

    if (dictValue.length > 0) {
      messages.push(...this.validateProperty(baseName, dictValue, valueType, propInfo, className));
    }

    return messages;
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
          errorCode: ValidationErrorCode.INVALID_ENUM_VALUE,
          errorCodeContext: { propertyName, enumName },
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
          errorCode: ValidationErrorCode.CUSTOM_ELEMENT_VALUE,
          errorCodeContext: { propertyName },
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
          errorCode: ValidationErrorCode.NUMERIC_ENUM_VALUE,
          errorCodeContext: { propertyName, enumName },
        });
      } else {
        messages.push({
          severity: 'error',
          message: `Invalid ${enumName} numeric value for ${propertyName}`,
          filePath: propInfo.filePath,
          line,
          context: `'${value}' is not a valid ${enumName} value`,
          suggestion: `Use enum names instead of numbers`,
          errorCode: ValidationErrorCode.INVALID_ENUM_NUMERIC,
          errorCodeContext: { propertyName, enumName },
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
        errorCode: ValidationErrorCode.INVALID_ENUM_VALUE,
        errorCodeContext: { propertyName, enumName },
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
        errorCode: ValidationErrorCode.INVALID_VECTOR2,
        errorCodeContext: { propertyName: name },
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
        errorCode: ValidationErrorCode.VECTOR2_MISSING_COMPONENT,
        errorCodeContext: { propertyName: name, component: 'X' },
      });
    } else if (!isValidFloat(x)) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 X value for ${name}`,
        filePath,
        line,
        context: `Expected number, got '${x}'`,
        errorCode: ValidationErrorCode.VECTOR2_INVALID_COMPONENT,
        errorCodeContext: { propertyName: name, component: 'X' },
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
        errorCode: ValidationErrorCode.VECTOR2_MISSING_COMPONENT,
        errorCodeContext: { propertyName: name, component: 'Y' },
      });
    } else if (!isValidFloat(y)) {
      messages.push({
        severity: 'error',
        message: `Invalid Vector2 Y value for ${name}`,
        filePath,
        line,
        context: `Expected number, got '${y}'`,
        errorCode: ValidationErrorCode.VECTOR2_INVALID_COMPONENT,
        errorCodeContext: { propertyName: name, component: 'Y' },
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
        errorCode: ValidationErrorCode.INVALID_VECTOR3,
        errorCodeContext: { propertyName: name },
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
          errorCode: ValidationErrorCode.VECTOR3_MISSING_COMPONENT,
          errorCodeContext: { propertyName: name, component: componentNames[i]! },
        });
      } else if (!isValidFloat(component)) {
        messages.push({
          severity: 'error',
          message: `Invalid Vector3 ${componentNames[i]} value for ${name}`,
          filePath,
          line,
          context: `Expected number, got '${component}'`,
          errorCode: ValidationErrorCode.VECTOR3_INVALID_COMPONENT,
          errorCodeContext: { propertyName: name, component: componentNames[i]! },
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
        errorCode: ValidationErrorCode.INVALID_RECTANGLE,
        errorCodeContext: { propertyName: name },
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
          errorCode: ValidationErrorCode.RECTANGLE_MISSING_COMPONENT,
          errorCodeContext: { propertyName: name, component: componentNames[i]! },
        });
      } else if (!isValidInteger(component)) {
        messages.push({
          severity: 'error',
          message: `Invalid Rectangle ${componentNames[i]} value for ${name}`,
          filePath,
          line,
          context: `Expected integer, got '${component}'`,
          errorCode: ValidationErrorCode.RECTANGLE_INVALID_COMPONENT,
          errorCodeContext: { propertyName: name, component: componentNames[i]! },
        });
      }
    }

    return messages;
  }

  private validateTileCoord(name: string, value: string, filePath: string, line: number): ValidationMessage[] {
    // TileCoord is same as Vector2
    return this.validateVector2(name, value, filePath, line);
  }
}
