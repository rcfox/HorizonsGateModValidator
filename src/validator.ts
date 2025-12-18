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
  private functionalAliases: Record<string, string>;
  private propertyValidator = new PropertyValidator();
  private parsedObjectsCache: Map<string, ParsedObject[]> = new Map();

  constructor() {
    const data = modSchemaData as SchemaData;
    this.schema = data.schema;
    this.typeAliases = data.typeAliases;
    this.functionalAliases = data.functionalAliases;
  }

  private resolveTypeAlias(typeName: string): string {
    return this.typeAliases[typeName] || typeName;
  }

  private resolveFunctionalAlias(typeName: string): string {
    return this.functionalAliases[typeName] || typeName;
  }

  validate(content: string, filePath: string): ValidationResult {
    const parser = new ModParser(content, filePath);

    const { objects, errors: parseErrors } = parser.parse();

    // Cache parsed objects for cross-file validation
    this.parsedObjectsCache.set(filePath, objects);

    const objMessages = objects.flatMap(obj => this.validateObject(obj));
    const structureMessages = this.validateActionStructures(objects);
    // NOTE: checkDuplicateIds now runs separately via getCrossFileValidationMessages()

    const allMessages = [...parseErrors, ...objMessages, ...structureMessages];

    const errors = allMessages.filter(m => m.severity === 'error');
    const warnings = allMessages.filter(m => m.severity === 'warning');
    const hints = allMessages.filter(m => m.severity === 'hint');
    const info = allMessages.filter(m => m.severity === 'info');

    return {
      errors,
      warnings,
      hints,
      info,
    };
  }

  /**
   * Get validation messages that require checking across all files
   * (e.g., duplicate IDs across files)
   */
  getCrossFileValidationMessages(): ValidationMessage[] {
    const allObjects = Array.from(this.parsedObjectsCache.values()).flat();
    return this.checkDuplicateIds(allObjects);
  }

  /**
   * Clear the entire cache
   */
  clearCache(): void {
    this.parsedObjectsCache.clear();
  }

  /**
   * Remove a specific file from the cache
   */
  removeFromCache(filePath: string): void {
    this.parsedObjectsCache.delete(filePath);
  }

  private checkDuplicateIds(objects: ParsedObject[]): ValidationMessage[] {
    const messages: ValidationMessage[] = [];
    const objectIds: Map<string, Map<string, ParsedObject[]>> = new Map();

    // Collect all objects with IDs, grouped by type and ID
    for (const obj of objects) {
      const classSchema = this.schema[this.resolveTypeAlias(obj.type)];
      if (classSchema?.category !== 'definition') {
        continue;
      }

      const objId = obj.properties.get('ID')?.value;
      if (!objId) {
        continue;
      }

      // If cloning from the same ID, that means we're extending it not duplicating it.
      if (classSchema.supportsCloneFrom && obj.properties.get('cloneFrom')?.value === objId) {
        continue;
      }

      // Treat things like ActionAoE and ActionAOE as the same.
      const resolvedType = this.resolveFunctionalAlias(obj.type);
      if (!objectIds.has(resolvedType)) {
        objectIds.set(resolvedType, new Map());
      }
      const typeIds = objectIds.get(resolvedType);
      if (!typeIds) {
        throw new Error(`Type IDs for ${resolvedType} not initialized`);
      }

      const objsWithSameId = typeIds.get(objId);
      typeIds.set(objId, [...(objsWithSameId ?? []), obj]);
    }

    // For each ID used more than once, create a single message with all locations
    for (const [resolvedType, typeIds] of objectIds) {
      for (const [objId, objs] of typeIds) {
        if (objs.length <= 1) {
          continue; // Not a duplicate
        }

        // Create corrections for all uses
        const corrections = objs.map(obj => {
          const idProp = obj.properties.get('ID');
          if (!idProp) {
            throw new Error(`Object missing ID property: ${obj.type}`);
          }
          return {
            filePath: idProp.filePath,
            startLine: idProp.valueStartLine,
            startColumn: idProp.valueStartColumn,
            endLine: idProp.valueEndLine,
            endColumn: idProp.valueEndColumn,
            replacementText: idProp.value, // Same as original (for navigation only)
            displayText: `${idProp.filePath}:${idProp.valueStartLine}`,
          };
        });

        // Use the first occurrence's location for the message
        const firstObj = objs[0];
        if (!firstObj) {
          throw new Error('Objects array should not be empty');
        }
        const firstIdProp = firstObj.properties.get('ID');
        if (!firstIdProp) {
          throw new Error(`First object missing ID property: ${firstObj.type}`);
        }

        messages.push({
          severity: 'warning',
          message: `ID '${objId}' for ${resolvedType} used in ${objs.length} instances`,
          filePath: firstIdProp.filePath,
          line: firstIdProp.valueStartLine,
          suggestion: 'Uses:',
          correctionIcon: '🎯',
          corrections,
          isCrossFile: true,
        });
      }
    }

    return messages;
  }

  private validateObject(obj: ParsedObject): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    const resolvedType = this.resolveTypeAlias(obj.type);
    const classSchema = this.schema[resolvedType];

    if (!classSchema) {
      const allTypes = [...Object.keys(this.schema), ...Object.keys(this.typeAliases)];
      const similar = findSimilar(obj.type, allTypes, MAX_EDIT_DISTANCE);
      const corrections = similar.map(s => ({
        filePath: obj.filePath,
        startLine: obj.typeStartLine,
        startColumn: obj.typeStartColumn,
        endLine: obj.typeStartLine,
        endColumn: obj.typeEndColumn,
        replacementText: s.value,
      }));

      messages.push({
        severity: 'error',
        message: `Unknown object type: ${obj.type}`,
        filePath: obj.filePath,
        line: obj.startLine,
        context: 'This object type is not recognized',
        corrections,
      });
      return messages;
    }

    if (classSchema.category === 'definition' && !obj.properties.has('ID')) {
      messages.push({
        severity: 'error',
        message: `Object type ${obj.type} requires an ID property`,
        filePath: obj.filePath,
        line: obj.startLine,
        suggestion: 'Add: ID = yourUniqueID;',
      });
    }

    if (obj.properties.has('cloneFrom') && classSchema.supportsCloneFrom === false) {
      messages.push({
        severity: 'warning',
        message: `Object type ${obj.type} does not support cloneFrom`,
        filePath: obj.filePath,
        line: obj.startLine,
        context: 'The cloneFrom property will be ignored',
      });
    }

    messages.push(...this.validateProperties(obj, classSchema, resolvedType));

    return messages;
  }

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
        // Skip property name validation for Actor type (it dynamically handles extra properties)
        if (resolvedTypeName === 'Actor') {
          // For Actor, skip the unknown property check entirely
          continue;
        }

        // Unknown property - likely a typo that will break the mod
        const typeDisplay = resolvedTypeName !== obj.type ? `${obj.type} (${resolvedTypeName})` : obj.type;

        // Find similar property names
        const allProperties = Array.from(knownFields.keys());
        const similar = findSimilar(cleanPropName, allProperties, MAX_EDIT_DISTANCE);
        const corrections = similar.map(s => ({
          filePath: propInfo.filePath,
          startLine: propInfo.nameStartLine,
          startColumn: propInfo.nameStartColumn,
          endLine: propInfo.nameStartLine,
          endColumn: propInfo.nameEndColumn,
          replacementText: s.value,
        }));

        messages.push({
          severity: 'hint',
          message: `Unknown property '${cleanPropName}' for ${typeDisplay}`,
          filePath: propInfo.filePath,
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

  getKnownObjectTypes(): string[] {
    return Object.keys(this.schema);
  }

  getObjectSchema(type: string): ClassSchema | null {
    return this.schema[type] || null;
  }

  /**
   * Validate Action structure:
   * [Action] must be followed by [ActionAoE], then one or more [AvAffecter]+[AvAffecterAoE] pairs
   * All IDs must match the Action's ID
   */
  private validateActionStructures(objects: ParsedObject[]): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    const validateActionId = (obj: ParsedObject, actionId: string): boolean => {
      const idProp = obj.properties.get('ID');
      if (!idProp) {
        messages.push({
          severity: 'error',
          message: `${obj.type} for Action '${actionId}' is missing ID property`,
          filePath: obj.filePath,
          line: obj.startLine,
          suggestion: `Add: ID=${actionId};`,
          correctionIcon: '🔧',
          corrections: [
            {
              filePath: obj.filePath,
              startLine: obj.startLine,
              startColumn: obj.typeBracketEndColumn,
              endLine: obj.startLine,
              endColumn: obj.typeBracketEndColumn,
              replacementText: ` ID=${actionId};`,
            },
          ],
        });
        return false;
      }

      if (idProp.value !== actionId) {
        messages.push({
          severity: 'error',
          message: `${obj.type} ID '${idProp.value}' does not match Action ID '${actionId}'`,
          filePath: obj.filePath,
          line: idProp.valueStartLine,
          corrections: [
            {
              filePath: idProp.filePath,
              startLine: idProp.valueStartLine,
              startColumn: idProp.valueStartColumn,
              endLine: idProp.valueEndLine,
              endColumn: idProp.valueEndColumn,
              replacementText: actionId,
            },
          ],
        });
        return false;
      }
      return true;
    };

    const validateAction = (action: ParsedObject): boolean => {
      const actionId = action.properties.get('ID')?.value;
      if (!actionId) {
        // We have another check for ID existing elsewhere.
        return false;
      }
      if (!action.nextObject) {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must be followed by [ActionAoE]`,
          filePath: action.filePath,
          line: action.endLine,
        });
        return false;
      }

      if (!validateActionAoE(action.nextObject, actionId)) {
        return false;
      }

      if (!action.nextObject.nextObject) {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must have at least one [AvAffecter] following after the [ActionAoE]`,
          filePath: action.filePath,
          line: action.endLine,
        });
        return false;
      }

      let currentObj: ParsedObject | null = action.nextObject;
      let firstAvAffecter = true;
      while ((currentObj = currentObj.nextObject)) {
        if (!validateAvAffecter(currentObj, actionId, firstAvAffecter)) {
          return false;
        }

        if (!currentObj.nextObject) {
          messages.push({
            severity: 'error',
            message: `AvAffecter for Action '${actionId}' must be followed by [AvAffecterAoE]`,
            filePath: currentObj.filePath,
            line: currentObj.endLine,
          });
          return false;
        }

        currentObj = currentObj.nextObject;
        if (!validateAvAffecterAoE(currentObj, actionId)) {
          return false;
        }

        firstAvAffecter = false;
      }
      return true;
    };

    const validateActionAoE = (obj: ParsedObject, actionId: string): boolean => {
      const nextType = this.resolveFunctionalAlias(obj.type);
      if (nextType !== 'ActionAoE') {
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' must be followed by [ActionAoE], but found [${obj.type}]`,
          filePath: obj.filePath,
          line: obj.startLine,
        });
        return false;
      }

      if (!validateActionId(obj, actionId)) {
        return false;
      }

      return true;
    };

    const validateAvAffecter = (obj: ParsedObject, actionId: string, firstAvAffecter: boolean): boolean => {
      const nextType = this.resolveFunctionalAlias(obj.type);
      if (nextType !== 'AvAffecter') {
        if (!firstAvAffecter) {
          // If this isn't the first AvAffecter, being a different type isn't an error,
          // it just marks the end of this Action definition.
          return false;
        }
        messages.push({
          severity: 'error',
          message: `Action '${actionId}' expected at least one [AvAffecter], but found [${obj.type}]`,
          filePath: obj.filePath,
          line: obj.startLine,
        });
        return false;
      }

      if (!validateActionId(obj, actionId)) {
        return false;
      }

      return true;
    };

    const validateAvAffecterAoE = (obj: ParsedObject, actionId: string): boolean => {
      const nextType = this.resolveFunctionalAlias(obj.type);
      if (nextType !== 'AvAffecterAoE') {
        messages.push({
          severity: 'error',
          message: `AvAffecter for Action '${actionId}' must be followed by [AvAffecterAoE], but found [${obj.type}]`,
          filePath: obj.filePath,
          line: obj.startLine,
        });
        return false;
      }

      if (!validateActionId(obj, actionId)) {
        return false;
      }

      return true;
    };

    const actions = objects.filter(obj => this.resolveFunctionalAlias(obj.type) === 'Action');
    for (const action of actions) {
      validateAction(action);
    }

    return messages;
  }
}
