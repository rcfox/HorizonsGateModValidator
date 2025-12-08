/**
 * Main validator
 * Orchestrates all validation steps
 */

import { ValidationResult, ValidationMessage, ModSchema, ParsedObject, SchemaData, ClassSchema } from './types.js';
import { ModParser } from './parser.js';
import { PropertyValidator } from './property-validator.js';
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

    const parser = new ModParser(content);
    const { objects, errors: parseErrors } = parser.parse();

    for (const error of parseErrors) {
      if (error.severity === 'error') {
        errors.push(error);
      } else if (error.severity === 'warning') {
        warnings.push(error);
      } else {
        info.push(error);
      }
    }

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

    const structureMessages = this.validateActionStructures(objects);
    for (const msg of structureMessages) {
      if (msg.severity === 'error') {
        errors.push(msg);
      } else if (msg.severity === 'warning') {
        warnings.push(msg);
      } else {
        info.push(msg);
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
    return false;
  }

  /**
   * Validate a single parsed object
   */
  private validateObject(obj: ParsedObject): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // Check if object type is known
    if (!this.isKnownType(obj.type)) {
      // Find similar object type names
      const allTypes = [...Object.keys(this.schema), ...Object.keys(this.typeAliases)];
      const similar = findSimilar(obj.type, allTypes, MAX_EDIT_DISTANCE);
      const corrections = similar.map(s => ({
        startLine: obj.typeStartLine,
        startColumn: obj.typeStartColumn,
        endLine: obj.typeStartLine,
        endColumn: obj.typeEndColumn,
        replacementText: s.value,
      }));

      messages.push({
        severity: 'error',
        message: `Unknown object type: ${obj.type}`,
        line: obj.startLine,
        context: 'This object type is not recognized',
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
      // No schema available
      messages.push({
        severity: 'info',
        message: `No property schema available for ${obj.type}${resolvedType !== obj.type ? ` (alias of ${resolvedType})` : ''}`,
        line: obj.startLine,
        context: 'Property types will not be validated',
      });
    }

    return messages;
  }

  /**
   * Validate object properties against schema
   */
  private validateProperties(
    obj: ParsedObject,
    classSchema: ClassSchema,
    resolvedTypeName: string
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const knownFields = new Map<string, string>();
    const patternFields: Array<{
      base: string;
      type: string;
      suffix: 'number' | 'plus';
    }> = [];

    // Build map of known fields and pattern fields
    // Real fields take precedence over virtual properties
    for (const field of classSchema.fields) {
      if (field.pattern && field.name.endsWith('N')) {
        // This is a pattern field like "bodyPartN" - accepts numbered properties
        const baseName = field.name.substring(0, field.name.length - 1);
        patternFields.push({
          base: baseName,
          type: field.type,
          suffix: 'number',
        });
      } else if (field.pattern && field.name.endsWith('+')) {
        // This is a pattern field like "topX+" - accepts + suffixes
        const baseName = field.name.substring(0, field.name.length - 1);
        patternFields.push({
          base: baseName,
          type: field.type,
          suffix: 'plus',
        });
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

      // Remove the ! prefix and + suffixes for lookup
      let cleanPropName = propName;
      if (cleanPropName.startsWith('!')) {
        cleanPropName = cleanPropName.substring(1);
      }
      while (cleanPropName.endsWith('+')) {
        cleanPropName = cleanPropName.substring(0, cleanPropName.length - 1);
      }

      let fieldType = knownFields.get(cleanPropName);

      // Check if it matches a pattern field
      if (!fieldType) {
        for (const pattern of patternFields) {
          if (pattern.suffix === 'number') {
            // Pattern like "bodyPart1", "bodyPart2" - base name + number
            if (cleanPropName.startsWith(pattern.base) && /\d+$/.test(cleanPropName)) {
              fieldType = pattern.type;
              break;
            }
          } else if (pattern.suffix === 'plus') {
            // Pattern like "topX", "topX+", "topX++" - base name + optional + suffixes
            if (
              cleanPropName === pattern.base ||
              (cleanPropName.startsWith(pattern.base) && /^\+*$/.test(cleanPropName.substring(pattern.base.length)))
            ) {
              fieldType = pattern.type;
              break;
            }
          }
        }
      }

      if (!fieldType) {
        // Unknown property - likely a typo that will break the mod
        const typeDisplay = resolvedTypeName !== obj.type ? `${obj.type} (${resolvedTypeName})` : obj.type;

        // Find similar property names
        const allProperties = Array.from(knownFields.keys());
        const similar = findSimilar(cleanPropName, allProperties, MAX_EDIT_DISTANCE);
        const corrections = similar.map(s => ({
          startLine: propInfo.nameStartLine,
          startColumn: propInfo.nameStartColumn,
          endLine: propInfo.nameStartLine,
          endColumn: propInfo.nameEndColumn,
          replacementText: s.value,
        }));

        messages.push({
          severity: 'error',
          message: `Unknown property '${cleanPropName}' for ${typeDisplay}`,
          line: propInfo.nameStartLine,
          context: `Value: ${propValue}`,
          suggestion: corrections.length === 0 ? 'Check for typos in property name' : undefined,
          corrections,
        });
        continue;
      }

      // Validate property type
      // Use cleanPropName so corrections reference the base property name without + suffixes
      const typeMessages = this.propertyValidator.validateProperty(
        cleanPropName,
        propValue,
        fieldType,
        propInfo,
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

  /**
   * Validate Action structure:
   * [Action] must be followed by [ActionAoE], then one or more [AvAffecter]+[AvAffecterAoE] pairs
   * All IDs must match the Action's ID
   */
  private validateActionStructures(objects: ParsedObject[]): ValidationMessage[] {
    function normalizeTypeName(typeName: string): string {
      switch (typeName) {
        case 'ActionAOE':
          return 'ActionAoE';
        case 'AvAffecterAOE':
          return 'AvAffecterAoE';
        case 'ActorValueAffecter':
          return 'AvAffecter';
        default:
          return typeName;
      }
    }

    const messages: ValidationMessage[] = [];

    // Find all Action objects
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const normalizedType = normalizeTypeName(obj.type);

      if (normalizedType !== 'Action') {
        continue;
      }

      // 1. Action must have an ID
      const actionIdProp = obj.properties.get('ID');
      if (!actionIdProp) {
        // Already handled by existing validation
        continue;
      }
      const actionId = actionIdProp.value;

      // 2. Next object must be ActionAoE
      if (i + 1 >= objects.length) {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must be followed by [ActionAoE]`,
          line: obj.endLine,
        });
        continue;
      }

      const nextObj = objects[i + 1];
      const nextType = normalizeTypeName(nextObj.type);

      if (nextType !== 'ActionAoE') {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must be followed by [ActionAoE], but found [${nextObj.type}]`,
          line: nextObj.startLine,
        });
        continue;
      }

      // 3. ActionAoE must have matching ID
      const actionAoeIdProp = nextObj.properties.get('ID');
      if (!actionAoeIdProp) {
        messages.push({
          severity: 'error',
          message: `ActionAoE for Action '${actionId}' is missing ID property`,
          line: nextObj.startLine,
          suggestion: `Add: ID=${actionId};`,
          correctionIcon: '🔧',
          corrections: [
            {
              startLine: nextObj.startLine,
              startColumn: nextObj.typeBracketEndColumn,
              endLine: nextObj.startLine,
              endColumn: nextObj.typeBracketEndColumn,
              replacementText: ` ID=${actionId};`,
            },
          ],
        });
      } else if (actionAoeIdProp.value !== actionId) {
        messages.push({
          severity: 'error',
          message: `ActionAoE ID '${actionAoeIdProp.value}' does not match Action ID '${actionId}'`,
          line: actionAoeIdProp.valueStartLine,
          corrections: [
            {
              startLine: actionAoeIdProp.valueStartLine,
              startColumn: actionAoeIdProp.valueStartColumn,
              endLine: actionAoeIdProp.valueEndLine,
              endColumn: actionAoeIdProp.valueEndColumn,
              replacementText: actionId,
            },
          ],
        });
      }

      // 4. Must have at least one AvAffecter+AvAffecterAoE pair
      let j = i + 2;
      let foundAnyAffecter = false;

      while (j < objects.length) {
        const currentObj = objects[j];
        const currentType = normalizeTypeName(currentObj.type);

        // Stop if we hit another Action or unrelated object
        if (currentType === 'Action') {
          break;
        }

        // Check if this is AvAffecter
        if (currentType === 'AvAffecter') {
          foundAnyAffecter = true;

          // 5. AvAffecter must have matching ID
          const avAffecterIdProp = currentObj.properties.get('ID');
          if (!avAffecterIdProp) {
            messages.push({
              severity: 'error',
              message: `AvAffecter for Action '${actionId}' is missing ID property`,
              line: currentObj.startLine,
              suggestion: `Add: ID=${actionId};`,
              correctionIcon: '🔧',
              corrections: [
                {
                  startLine: currentObj.startLine,
                  startColumn: currentObj.typeBracketEndColumn,
                  endLine: currentObj.startLine,
                  endColumn: currentObj.typeBracketEndColumn,
                  replacementText: ` ID=${actionId};`,
                },
              ],
            });
          } else if (avAffecterIdProp.value !== actionId) {
            messages.push({
              severity: 'error',
              message: `AvAffecter ID '${avAffecterIdProp.value}' does not match Action ID '${actionId}'`,
              line: avAffecterIdProp.valueStartLine,
              corrections: [
                {
                  startLine: avAffecterIdProp.valueStartLine,
                  startColumn: avAffecterIdProp.valueStartColumn,
                  endLine: avAffecterIdProp.valueEndLine,
                  endColumn: avAffecterIdProp.valueEndColumn,
                  replacementText: actionId,
                },
              ],
            });
          }

          // 6. Next object after AvAffecter must be AvAffecterAoE
          if (j + 1 >= objects.length) {
            messages.push({
              severity: 'error',
              message: `AvAffecter for Action '${actionId}' must be followed by [AvAffecterAoE]`,
              line: currentObj.endLine,
            });
            break;
          }

          const nextAfterAvAffecter = objects[j + 1];
          const nextAfterAvAffecterType = normalizeTypeName(nextAfterAvAffecter.type);

          if (nextAfterAvAffecterType !== 'AvAffecterAoE') {
            messages.push({
              severity: 'error',
              message: `AvAffecter for Action '${actionId}' must be followed by [AvAffecterAoE], but found [${nextAfterAvAffecter.type}]`,
              line: nextAfterAvAffecter.startLine,
            });
          } else {
            // 7. AvAffecterAoE must have matching ID
            const avAffecterAoeIdProp = nextAfterAvAffecter.properties.get('ID');
            if (!avAffecterAoeIdProp) {
              messages.push({
                severity: 'error',
                message: `AvAffecterAoE for Action '${actionId}' is missing ID property`,
                line: nextAfterAvAffecter.startLine,
                suggestion: `Add: ID=${actionId};`,
                correctionIcon: '🔧',
                corrections: [
                  {
                    startLine: nextAfterAvAffecter.startLine,
                    startColumn: nextAfterAvAffecter.typeBracketEndColumn,
                    endLine: nextAfterAvAffecter.startLine,
                    endColumn: nextAfterAvAffecter.typeBracketEndColumn,
                    replacementText: ` ID=${actionId};`,
                  },
                ],
              });
            } else if (avAffecterAoeIdProp.value !== actionId) {
              messages.push({
                severity: 'error',
                message: `AvAffecterAoE ID '${avAffecterAoeIdProp.value}' does not match Action ID '${actionId}'`,
                line: avAffecterAoeIdProp.valueStartLine,
                corrections: [
                  {
                    startLine: avAffecterAoeIdProp.valueStartLine,
                    startColumn: avAffecterAoeIdProp.valueStartColumn,
                    endLine: avAffecterAoeIdProp.valueEndLine,
                    endColumn: avAffecterAoeIdProp.valueEndColumn,
                    replacementText: actionId,
                  },
                ],
              });
            }
            j++; // Skip the AvAffecterAoE we just validated
          }
        } else if (currentType !== 'AvAffecterAoE' && currentType !== 'ActionAoE') {
          // Found an unrelated object type, stop checking this Action
          break;
        }

        j++;
      }

      if (!foundAnyAffecter) {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must have at least one [AvAffecter]`,
          line: nextObj.endLine,
        });
      }
    }

    return messages;
  }
}
