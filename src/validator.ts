/**
 * Main validator
 * Orchestrates all validation steps
 */

import { ValidationResult, ValidationMessage, ModSchema, ParsedObject, SchemaData, ClassSchema } from './types.js';
import { ModParser } from './parser.js';
import { PropertyValidator } from './property-validator.js';
import { getObjectTypeInfo, isKnownObjectType } from './object-registry.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import modSchemaData from './mod-schema.json' with { type: 'json' };

export class ModValidator {
  private schema: ModSchema;
  private typeAliases: Record<string, string>;
  private propertyValidator = new PropertyValidator();

  constructor() {
    const data = modSchemaData as SchemaData;
    this.schema = data.schema;
    this.typeAliases = data.typeAliases;
  }

  /**
   * Resolve a type alias to its actual class name
   */
  private resolveTypeAlias(typeName: string): string {
    return this.typeAliases[typeName] || typeName;
  }

  /**
   * Validate mod file content
   */
  validate(content: string): ValidationResult {
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const info: ValidationMessage[] = [];

    // Step 1: Parse the content
    const parser = new ModParser(content);
    const { objects, errors: parseErrors } = parser.parse();

    // Add parse errors
    for (const error of parseErrors) {
      if (error.severity === 'error') {
        errors.push(error);
      } else if (error.severity === 'warning') {
        warnings.push(error);
      } else {
        info.push(error);
      }
    }

    // Step 2: Validate each object
    for (const obj of objects) {
      const objMessages = this.validateObject(obj);

      for (const msg of objMessages) {
        if (msg.severity === 'error') {
          errors.push(msg);
        } else if (msg.severity === 'warning') {
          warnings.push(msg);
        } else {
          info.push(msg);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
    };
  }

  /**
   * Check if a type is known (either in schema directly or as an alias)
   */
  private isKnownType(typeName: string): boolean {
    // Check if it's a direct schema entry
    if (this.schema[typeName]) {
      return true;
    }
    // Check if it's a type alias
    if (this.typeAliases[typeName]) {
      return true;
    }
    // Fall back to object registry for types not in schema
    return isKnownObjectType(typeName);
  }

  /**
   * Validate a single parsed object
   */
  private validateObject(obj: ParsedObject): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // Check if object type is known
    if (!this.isKnownType(obj.type)) {
      // Find similar object type names
      const allTypes = [
        ...Object.keys(this.schema),
        ...Object.keys(this.typeAliases)
      ];
      const similar = findSimilar(obj.type, allTypes, MAX_EDIT_DISTANCE);
      const corrections = similar.map(s => s.value);

      messages.push({
        severity: 'error',
        message: `Unknown object type: ${obj.type}`,
        line: obj.startLine,
        context: 'This object type is not recognized',
        suggestion: corrections.length > 0
          ? `Did you mean: ${corrections.join(', ')}?`
          : 'Check for typos in the object type name',
        corrections,
      });
      return messages; // Can't validate further without type info
    }

    // Validate properties against schema (resolve aliases)
    const resolvedType = this.resolveTypeAlias(obj.type);
    const classSchema = this.schema[resolvedType];

    // For types in schema, check for required ID
    if (classSchema && classSchema.category === 'definition' && !obj.properties.has('ID')) {
      messages.push({
        severity: 'error',
        message: `Object type ${obj.type} requires an ID property`,
        line: obj.startLine,
        suggestion: 'Add: ID = yourUniqueID;',
      });
    }

    // Check cloneFrom usage based on schema (if available)
    if (obj.properties.has('cloneFrom') && classSchema) {
      if (classSchema.supportsCloneFrom === false) {
        messages.push({
          severity: 'warning',
          message: `Object type ${obj.type} does not support cloneFrom`,
          line: obj.startLine,
          context: 'The cloneFrom property will be ignored',
        });
      }
    }

    if (classSchema) {
      messages.push(...this.validateProperties(obj, classSchema, resolvedType));
    } else {
      // No schema available - fall back to object registry if available
      const typeInfo = getObjectTypeInfo(obj.type);
      if (typeInfo) {
        // Use object registry for validation
        if (typeInfo.requiresID && !obj.properties.has('ID')) {
          messages.push({
            severity: 'error',
            message: `Object type ${obj.type} requires an ID property`,
            line: obj.startLine,
            suggestion: 'Add: ID = yourUniqueID;',
          });
        }
      } else {
        // No schema or registry info available
        messages.push({
          severity: 'info',
          message: `No property schema available for ${obj.type}${resolvedType !== obj.type ? ` (alias of ${resolvedType})` : ''}`,
          line: obj.startLine,
          context: 'Property types will not be validated',
        });
      }
    }

    return messages;
  }

  /**
   * Validate object properties against schema
   */
  private validateProperties(obj: ParsedObject, classSchema: ClassSchema, resolvedTypeName: string): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const knownFields = new Map<string, string>();
    const patternFields: Array<{base: string, type: string}> = [];

    // Build map of known fields and pattern fields
    // Real fields take precedence over virtual properties
    for (const field of classSchema.fields) {
      if (field.pattern && field.name.endsWith('N')) {
        // This is a pattern field like "bodyPartN" - accepts numbered properties
        const baseName = field.name.substring(0, field.name.length - 1);
        patternFields.push({ base: baseName, type: field.type });
      } else {
        // Only add if not already present (real fields come before virtual in the array)
        // or if this is a real field (not virtual) - prefer real fields over virtual
        const isVirtual = field.virtual === true;
        if (!knownFields.has(field.name) || !isVirtual) {
          knownFields.set(field.name, field.type);
        }
      }
    }

    // Validate each property
    for (const [propName, propInfo] of obj.properties) {
      const propValue = propInfo.value;
      const propLine = propInfo.line;

      // Remove the ! prefix and + suffixes for lookup
      let cleanPropName = propName;
      if (cleanPropName.startsWith('!')) {
        cleanPropName = cleanPropName.substring(1);
      }
      while (cleanPropName.endsWith('+')) {
        cleanPropName = cleanPropName.substring(0, cleanPropName.length - 1);
      }

      let fieldType = knownFields.get(cleanPropName);

      // Check if it matches a pattern field (e.g., bodyPart1, bodyPart2)
      if (!fieldType) {
        for (const pattern of patternFields) {
          if (cleanPropName.startsWith(pattern.base) && /\d+$/.test(cleanPropName)) {
            fieldType = pattern.type;
            break;
          }
        }
      }

      if (!fieldType) {
        // Unknown property - likely a typo that will break the mod
        const typeDisplay = resolvedTypeName !== obj.type ? `${obj.type} (${resolvedTypeName})` : obj.type;

        // Find similar property names
        const allProperties = Array.from(knownFields.keys());
        const similar = findSimilar(cleanPropName, allProperties, MAX_EDIT_DISTANCE);
        const corrections = similar.map(s => s.value);

        messages.push({
          severity: 'error',
          message: `Unknown property '${cleanPropName}' for ${typeDisplay}`,
          line: propLine,
          context: `Value: ${propValue}`,
          suggestion: corrections.length > 0
            ? `Did you mean: ${corrections.join(', ')}?`
            : 'Check for typos in property name',
          corrections,
        });
        continue;
      }

      // Validate property type
      const typeMessages = this.propertyValidator.validateProperty(
        propName,
        propValue,
        fieldType,
        propLine,
        resolvedTypeName
      );

      messages.push(...typeMessages);
    }

    return messages;
  }

  /**
   * Get all known object types
   */
  getKnownObjectTypes(): string[] {
    return Object.keys(this.schema);
  }

  /**
   * Get schema for a specific object type
   */
  getObjectSchema(type: string): ClassSchema | null {
    return this.schema[type] || null;
  }
}
