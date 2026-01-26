/**
 * Task String Validator
 *
 * Validates task strings against tasks.json metadata, including:
 * - Task name validation
 * - Parameter type inference (bool → float → string)
 * - @-prefix special parameter handling
 * - Parameter count validation (required/optional)
 * - Position tracking for precise error reporting
 */

import type {
  TaskMetadata,
  TasksData,
  TaskParameter,
  TaskUseCase,
  ParsedParameter,
  ParsedTaskString,
  PositionInfo,
  PropertyInfo,
  ValidationMessage,
} from './types.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import { isValidFloat } from './value-validators.js';
import { validateFormula } from './formula-validator.js';
import tasksJsonData from './tasks.json' with { type: 'json' };

export class TaskValidator {
  private tasks: Map<string, TaskMetadata>;
  private taskAliasMap: Map<string, string>;

  constructor() {
    // Load tasks.json and build lookup maps
    const data = tasksJsonData as TasksData;
    this.tasks = new Map();
    this.taskAliasMap = new Map();

    for (const task of data.tasks) {
      this.tasks.set(task.name, task);

      // Add canonical name to alias map
      this.taskAliasMap.set(task.name, task.name);

      // Add aliases to alias map
      if (task.aliases) {
        for (const alias of task.aliases) {
          this.taskAliasMap.set(alias, task.name);
        }
      }
    }

    // Fail fast if we couldn't load any tasks
    if (this.tasks.size === 0) {
      throw new Error('Failed to load tasks metadata from tasks.json');
    }
  }

  /**
   * Validate that a task name exists (without validating parameters)
   *
   * @param taskName - The task name to validate
   * @param propInfo - Property information for position tracking
   * @returns Validation messages (hints for unknown tasks with suggestions)
   */
  validateTaskName(taskName: string, propInfo: PropertyInfo): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // Check if task exists (check aliases first)
    const canonicalName = this.taskAliasMap.get(taskName);
    if (!canonicalName) {
      // Find similar task names for suggestions
      const allTaskNames = Array.from(this.tasks.keys());
      const similar = findSimilar(taskName, allTaskNames, MAX_EDIT_DISTANCE);

      if (similar.length > 0) {
        // Found similar task names - likely a typo
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
          message: `Unknown task: '${taskName}'`,
          filePath: propInfo.filePath,
          line: propInfo.valueStartLine,
          corrections,
        });
      } else {
        // No similar task names
        messages.push({
          severity: 'error',
          message: `Unknown task: '${taskName}'`,
          filePath: propInfo.filePath,
          line: propInfo.valueStartLine,
        });
      }
    }

    return messages;
  }

  /**
   * Main entry point: Validate a task string
   *
   * @param taskString - The comma-separated task string to validate
   * @param propInfo - Property information for position tracking
   * @param objectType - Optional object type for context-aware validation
   * @param propertyName - Optional property name for context-aware validation
   * @returns Array of validation messages with position-based corrections
   */
  validateTaskString(
    taskString: string,
    propInfo: PropertyInfo,
    objectType?: string,
    propertyName?: string
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // Parse the task string with position tracking
    const parsed = this.parseTaskString(taskString);

    // Validate task name exists (check aliases first)
    const canonicalName = this.taskAliasMap.get(parsed.taskName);
    const task = canonicalName ? this.tasks.get(canonicalName) : undefined;
    if (!task) {
      // Find similar task names for suggestions
      const allTaskNames = Array.from(this.tasks.keys());
      const similar = findSimilar(parsed.taskName, allTaskNames, MAX_EDIT_DISTANCE);

      if (similar.length > 0) {
        // Found similar task names - likely a typo, report as error
        const corrections = similar.map(s => ({
          filePath: propInfo.filePath,
          startLine: propInfo.valueStartLine + parsed.taskNamePosition.startLine,
          startColumn:
            parsed.taskNamePosition.startLine === 0
              ? propInfo.valueStartColumn + parsed.taskNamePosition.startColumn
              : parsed.taskNamePosition.startColumn,
          endLine: propInfo.valueStartLine + parsed.taskNamePosition.endLine,
          endColumn:
            parsed.taskNamePosition.endLine === 0
              ? propInfo.valueStartColumn + parsed.taskNamePosition.endColumn
              : parsed.taskNamePosition.endColumn,
          replacementText: s.value,
        }));

        // These are hint messages because taskName might also refer to a trigger ID, which we don't validate yet.
        messages.push({
          severity: 'hint',
          message: `Unknown task: '${parsed.taskName}'`,
          filePath: propInfo.filePath,
          line: propInfo.valueStartLine + parsed.taskNamePosition.startLine,
          corrections,
        });
      } else {
        // No similar task names - might be a trigger name, report as hint
        messages.push({
          severity: 'hint',
          message: `Unknown task: '${parsed.taskName}'`,
          filePath: propInfo.filePath,
          line: propInfo.valueStartLine + parsed.taskNamePosition.startLine,
          context: 'Task name not found in tasks.json. This might be a trigger name (not yet validated).',
        });
      }

      return messages; // Can't validate parameters without task metadata
    }

    // Validate parameter syntax
    for (let i = 0; i < parsed.parameters.length; i++) {
      const param = parsed.parameters[i]!;
      messages.push(...this.validateParameterSyntax(param, propInfo, i, parsed.parameters.length));
    }

    // Validate parameter counts
    messages.push(
      ...this.validateParameterCounts(parsed.taskName, task, parsed.parameters, propInfo, objectType, propertyName)
    );

    return messages;
  }

  /**
   * Parse a task string into task name and parameters with position tracking
   *
   * Handles multi-line task strings (newlines preserved by parser)
   *
   * @param taskString - The raw task string (may contain newlines)
   * @returns Parsed task string with position-tracked elements
   */
  private parseTaskString(taskString: string): ParsedTaskString {
    // Split by comma while tracking positions
    const parts: Array<{ value: string; position: PositionInfo }> = [];
    let currentPart = '';
    let partStartLine = 0;
    let partStartColumn = 0;
    let currentLine = 0;
    let currentColumn = 0;

    for (let i = 0; i < taskString.length; i++) {
      const char = taskString[i]!;

      if (char === ',') {
        // Found a comma - save the current part
        parts.push({
          value: currentPart.trim(),
          position: {
            startLine: partStartLine,
            startColumn: partStartColumn,
            endLine: currentLine,
            endColumn: currentColumn,
          },
        });

        // Start a new part
        currentPart = '';
        currentColumn++;
        partStartLine = currentLine;
        partStartColumn = currentColumn;
      } else if (char === '\n') {
        // Newline - track line position
        currentPart += char;
        currentLine++;
        currentColumn = 0;
      } else {
        // Regular character
        if (currentPart === '' && char.trim() === '') {
          // Skip leading whitespace for position tracking
          currentColumn++;
          partStartColumn = currentColumn;
        } else {
          currentPart += char;
          currentColumn++;
        }
      }
    }

    // Add the last part (after final comma or only part)
    if (currentPart.trim() || parts.length === 0) {
      parts.push({
        value: currentPart.trim(),
        position: {
          startLine: partStartLine,
          startColumn: partStartColumn,
          endLine: currentLine,
          endColumn: currentColumn,
        },
      });
    }

    // First part is task name, rest are parameters
    const taskNamePart = parts[0] || {
      value: '',
      position: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
    };
    const paramParts = parts.slice(1);

    // Parse parameters with type inference
    const parameters: ParsedParameter[] = paramParts.map(part => this.parseParameter(part.value, part.position));

    return {
      taskName: taskNamePart.value,
      taskNamePosition: taskNamePart.position,
      parameters,
    };
  }

  /**
   * Parse a single parameter with @ prefix detection and type inference
   *
   * @param param - The parameter string
   * @param position - Position of the parameter in the task string
   * @returns Parsed parameter with type and position
   */
  private parseParameter(param: string, position: PositionInfo): ParsedParameter {
    // Check for @ prefixes in order matching Task.cs:682-749
    // Order matters: @F and @A are checked BEFORE @G (they use 'continue' in C#)
    // @G is a preprocessing substitution that modifies the parameter, then other @ prefixes are checked

    // @F - Formula (processed before @G, cannot combine with @G)
    if (param.startsWith('@F')) {
      return {
        type: 'formula',
        source: '@F',
        formula: param.substring(2),
        ...position,
      };
    }

    // @A - Actor ID (processed before @G, cannot combine with @G)
    if (param.startsWith('@A')) {
      return {
        type: 'string',
        source: '@A',
        value: param.substring(2),
        ...position,
      };
    }

    // @G - Global variable substitution (preprocessing step)
    // Can be combined with other @ prefixes: @R@Gvar, @X@Gvar, etc.
    // Format: <prefix>@G<varname> becomes <prefix><varValue> after substitution
    if (param.includes('@G')) {
      const atGIndex = param.indexOf('@G');
      const prefix = param.substring(0, atGIndex);
      const varName = param.substring(atGIndex + 2);

      // After @G substitution, the prefix determines the type
      // Since we can't substitute at parse time, we analyze the prefix

      // @R@Gvar → formula after substitution
      if (prefix === '@R') {
        return {
          type: 'formula',
          source: '@R',
          formula: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @XYA@Gvar → tileCoord after substitution
      if (prefix === '@XYA') {
        return {
          type: 'tileCoord',
          source: '@XYA',
          value: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @X@Gvar → tileCoord (X coordinate) after substitution
      if (prefix === '@X') {
        return {
          type: 'tileCoord',
          source: '@X',
          value: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @Y@Gvar → tileCoord (Y coordinate) after substitution
      if (prefix === '@Y') {
        return {
          type: 'tileCoord',
          source: '@Y',
          value: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @T@Gvar → tileCoord (travel point) after substitution
      if (prefix === '@T') {
        return {
          type: 'tileCoord',
          source: '@T',
          value: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @S@Gvar → string after substitution
      if (prefix === '@S') {
        return {
          type: 'string',
          source: '@S',
          value: '', // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // @@Gvar → delay after substitution
      if (prefix === '@') {
        return {
          type: 'delay',
          source: '@',
          delayValue: 0, // Will be filled by @G substitution at runtime
          globalVarName: varName,
          ...position,
        };
      }

      // prefix@Gvar or just @Gvar → type unknown until runtime substitution
      // We can't validate the type, so return a special globalVarSubstitution type
      return {
        type: 'globalVarSubstitution',
        source: '@G',
        varName,
        originalParam: param,
        ...position,
      };
    }

    // Other @ prefixes (processed after @G would have been substituted)
    // These cannot have @G in them at this point

    // @R - Formula (redundant with @F)
    if (param.startsWith('@R')) {
      return {
        type: 'formula',
        source: '@R',
        formula: param.substring(2),
        ...position,
      };
    }

    // @XYA must be checked before @X/@Y
    if (param.startsWith('@XYA')) {
      return {
        type: 'tileCoord',
        source: '@XYA',
        value: param.substring(4),
        ...position,
      };
    }

    // @X - X coordinate
    if (param.startsWith('@X')) {
      const value = param.substring(2);
      return {
        type: 'tileCoord',
        source: '@X',
        value,
        ...position,
      };
    }

    // @Y - Y coordinate
    if (param.startsWith('@Y')) {
      const value = param.substring(2);
      return {
        type: 'tileCoord',
        source: '@Y',
        value,
        ...position,
      };
    }

    // @T - Travel point
    if (param.startsWith('@T')) {
      return {
        type: 'tileCoord',
        source: '@T',
        value: param.substring(2),
        ...position,
      };
    }

    // @S - Force string
    if (param.startsWith('@S')) {
      return {
        type: 'string',
        source: '@S',
        value: param.substring(2),
        ...position,
      };
    }

    // @ - Delay (single @ followed by number)
    if (param.startsWith('@') && param.length > 1) {
      const value = param.substring(1);
      const delayValue = parseFloat(value);
      return {
        type: 'delay',
        source: '@',
        delayValue,
        ...position,
      };
    }

    // No @ prefix - use standard type inference (bool → float → string)
    // Based on Task.cs:738-749

    // Try bool
    const lowerParam = param.toLowerCase();
    if (lowerParam === 'true' || lowerParam === 'false') {
      return {
        type: 'bool',
        value: lowerParam === 'true',
        source: 'plain',
        ...position,
      };
    }

    // Try float
    const floatValue = parseFloat(param);
    if (!isNaN(floatValue) && /^-?(\d+\.?\d*|\d*\.\d+)([eE][+-]?\d+)?$/.test(param)) {
      return {
        type: 'float',
        value: floatValue,
        source: 'plain',
        ...position,
      };
    }

    // Default to string
    return {
      type: 'string',
      value: param,
      source: 'plain',
      ...position,
    };
  }

  /**
   * Validate syntax of a parsed parameter
   *
   * @param parsed - The parsed parameter
   * @param propInfo - Property information for absolute position calculation
   * @param paramIndex - Index of this parameter (for delay position hint)
   * @param totalParams - Total number of parameters (for delay position hint)
   * @returns Validation messages with position-based corrections
   */
  private validateParameterSyntax(
    parsed: ParsedParameter,
    propInfo: PropertyInfo,
    paramIndex: number,
    totalParams: number
  ): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // Convert relative position to absolute
    const absoluteLine = propInfo.valueStartLine + parsed.startLine;

    switch (parsed.type) {
      case 'formula':
        // Skip validation if @G is present (value will be filled at runtime)
        if (parsed.globalVarName) {
          // @G substitution - value will be filled at runtime, nothing to validate
        } else if (parsed.formula.trim() === '') {
          messages.push({
            severity: 'error',
            message: `${parsed.source} prefix requires non-empty formula`,
            filePath: propInfo.filePath,
            line: absoluteLine,
            context: `Formula string cannot be empty`,
          });
        } else {
          // Validate formula syntax
          // Create a PropertyInfo representing the formula's position within the task string
          const formulaPropInfo: PropertyInfo = {
            filePath: propInfo.filePath,
            nameStartLine: propInfo.valueStartLine,
            nameStartColumn: propInfo.valueStartColumn,
            nameEndColumn: propInfo.valueEndColumn,
            valueStartLine: propInfo.valueStartLine + parsed.startLine,
            valueStartColumn: parsed.startColumn + (parsed.startLine === 0 ? propInfo.valueStartColumn : 0),
            valueEndLine: propInfo.valueStartLine + parsed.endLine,
            valueEndColumn: parsed.endColumn + (parsed.endLine === 0 ? propInfo.valueStartColumn : 0),
            value: parsed.formula,
          };
          const formulaMessages = validateFormula(parsed.formula, formulaPropInfo, 'taskParameter', 'Task');
          messages.push(...formulaMessages);
        }
        break;

      case 'string':
        if (parsed.source === '@A' || parsed.source === '@S') {
          // Skip empty check if @G is present (value will be filled at runtime)
          if (!parsed.globalVarName && parsed.value.trim() === '') {
            messages.push({
              severity: 'error',
              message: `${parsed.source} prefix requires non-empty value`,
              filePath: propInfo.filePath,
              line: absoluteLine,
              context: parsed.source === '@A' ? 'Actor reference cannot be empty' : 'String value cannot be empty',
            });
          }
        }
        break;

      case 'tileCoord':
        if (parsed.source === '@T' || parsed.source === '@XYA') {
          // Skip empty check if @G is present (value will be filled at runtime)
          if (!parsed.globalVarName && parsed.value.trim() === '') {
            messages.push({
              severity: 'error',
              message: `${parsed.source} prefix requires non-empty value`,
              filePath: propInfo.filePath,
              line: absoluteLine,
              context: parsed.source === '@T' ? 'Travel point ID cannot be empty' : 'Actor reference cannot be empty',
            });
          }
        } else if (parsed.source === '@X' || parsed.source === '@Y') {
          // Skip validation if @G is present (value will be filled at runtime)
          if (!parsed.globalVarName && !isValidFloat(parsed.value)) {
            messages.push({
              severity: 'error',
              message: `Coordinate value must be a valid number`,
              filePath: propInfo.filePath,
              line: absoluteLine,
              context: `Expected float value, got '${parsed.value}'`,
            });
          }
        }
        break;

      case 'globalVarSubstitution':
        if (parsed.varName.trim() === '') {
          messages.push({
            severity: 'error',
            message: `@G prefix requires non-empty variable name`,
            filePath: propInfo.filePath,
            line: absoluteLine,
            context: `Global variable name cannot be empty`,
          });
        }
        break;

      case 'delay':
        // Skip validation if @G is present (value will be filled at runtime)
        if (!parsed.globalVarName && isNaN(parsed.delayValue)) {
          messages.push({
            severity: 'error',
            message: `Delay value must be a valid number`,
            filePath: propInfo.filePath,
            line: absoluteLine,
            context: `Expected float value for delay`,
          });
        }
        // Hint if delay is in the middle (not first, not last)
        if (paramIndex > 0 && paramIndex < totalParams - 1) {
          messages.push({
            severity: 'hint',
            message: `Delay parameter (@) in middle of task string may be confusing`,
            filePath: propInfo.filePath,
            line: absoluteLine,
            context: `Delay parameters are typically placed at the beginning or end of the task string`,
          });
        }
        break;
    }

    // Check for @G global variable substitution in any parameter type
    if ('globalVarName' in parsed && parsed.globalVarName !== undefined) {
      if (parsed.globalVarName.trim() === '') {
        messages.push({
          severity: 'error',
          message: `@G prefix requires non-empty variable name`,
          filePath: propInfo.filePath,
          line: absoluteLine,
          context: `Global variable name cannot be empty`,
        });
      }
    }

    return messages;
  }

  /**
   * Validate parameter counts against task metadata
   *
   * @param taskName - The task name
   * @param task - Task metadata
   * @param parameters - Parsed parameters
   * @param propInfo - Property information for error reporting
   * @param objectType - Optional object type for context-aware validation
   * @param propertyName - Optional property name for context-aware validation
   * @returns Validation messages
   */
  private validateParameterCounts(
    taskName: string,
    task: TaskMetadata,
    parameters: ParsedParameter[],
    propInfo: PropertyInfo,
    objectType?: string,
    propertyName?: string
  ): ValidationMessage[] {
    // Count how many parameters go to each array/field
    const destinations = this.inferParameterDestinations(parameters);

    // Special case: DialogNode/DialogOption/DialogNodeOverride.specialEffect adds implicit float 0
    const hasImplicitFloat =
      (objectType === 'DialogNode' || objectType === 'DialogOption' || objectType === 'DialogNodeOverride') &&
      propertyName === 'specialEffect';
    const destinationsWithImplicit = hasImplicitFloat
      ? { ...destinations, floats: destinations.floats + 1 }
      : destinations;

    // Try to match against each use case
    const useCaseResults = task.uses.map(useCase => {
      const messages: ValidationMessage[] = [];

      // Extract requirements from metadata
      const requiredCounts = this.extractParameterRequirements(useCase.required);
      const optionalCounts = this.extractParameterRequirements(useCase.optional);

      // Validate required parameters
      for (const [arrayName, requiredCount] of Object.entries(requiredCounts)) {
        if (arrayName.endsWith('_unlimited')) continue; // Skip marker entries
        const actualCount = destinationsWithImplicit[arrayName as keyof typeof destinationsWithImplicit] || 0;
        if (typeof actualCount === 'number' && actualCount < requiredCount) {
          messages.push({
            severity: 'error',
            message: `Task '${taskName}' requires at least ${requiredCount} ${arrayName} parameter(s), but got ${actualCount}`,
            filePath: propInfo.filePath,
            line: propInfo.valueStartLine,
            taskReference: taskName,
          });
        }
      }

      // Warn if too many parameters of a type (unless unlimited)
      for (const [arrayName, actualCount] of Object.entries(destinationsWithImplicit)) {
        if (typeof actualCount !== 'number') continue;

        // Check if this parameter type is unlimited (has [N+] notation)
        const isUnlimited =
          requiredCounts[`${arrayName}_unlimited`] === Infinity ||
          optionalCounts[`${arrayName}_unlimited`] === Infinity;

        if (isUnlimited) {
          // Skip "too many" warning for unlimited parameters
          continue;
        }

        const requiredCount = requiredCounts[arrayName] || 0;
        const optionalCount = optionalCounts[arrayName] || 0;
        const maxExpected = requiredCount + optionalCount;

        // For implicit float case: don't warn about too many if the implicit float is what causes us to exceed
        if (hasImplicitFloat && arrayName === 'floats') {
          const actualWithoutImplicit = destinations.floats;
          // Only skip warning if we're within range without implicit, but over with it
          if (actualWithoutImplicit <= maxExpected && actualCount > maxExpected) {
            // The implicit float is what put us over, don't warn
            continue;
          }
        }

        if (actualCount > maxExpected) {
          // For error messages, report the actual user-provided count, not including implicit float
          const reportedCount = (hasImplicitFloat && arrayName === 'floats')
            ? destinations.floats
            : actualCount;

          messages.push({
            severity: 'warning',
            message: `Task '${taskName}' expects at most ${maxExpected} ${arrayName} parameter(s), but got ${reportedCount}`,
            filePath: propInfo.filePath,
            line: propInfo.valueStartLine,
            context: `Extra parameters may be ignored`,
            taskReference: taskName,
          });
        }
      }

      return { messages, useCase, requiredCounts };
    });

    // Find use cases that match (no error messages)
    const matchingUseCases = useCaseResults.filter(result => result.messages.every(msg => msg.severity !== 'error'));

    // If at least one use case matches, return only warnings from the best match
    if (matchingUseCases.length > 0) {
      // Pick the best match by preferring use cases that:
      // 1. Use more of the provided parameters (fewer "too many" warnings)
      // 2. Have all required parameters satisfied
      const bestMatch = matchingUseCases.reduce((best, current) => {
        const bestWarnings = best.messages.filter(m => m.severity === 'warning').length;
        const currentWarnings = current.messages.filter(m => m.severity === 'warning').length;

        // Prefer use case with fewer warnings
        if (currentWarnings < bestWarnings) return current;
        if (currentWarnings > bestWarnings) return best;

        // If tied on warnings, prefer the one with more required parameters (more specific match)
        const bestRequired = Object.values(best.requiredCounts).filter(v => typeof v === 'number' && v > 0).length;
        const currentRequired = Object.values(current.requiredCounts).filter(v => typeof v === 'number' && v > 0).length;

        return currentRequired > bestRequired ? current : best;
      });
      const resultMessages = [...bestMatch.messages];

      // Add info message if implicit float is being used to meet requirements
      if (hasImplicitFloat) {
        const requiredFloats = bestMatch.requiredCounts['floats'] || 0;
        const optionalFloats =
          bestMatch.requiredCounts['floats'] !== undefined ||
          bestMatch.requiredCounts['floats_unlimited'] !== undefined;

        // Show info if the implicit float helps meet required or optional float parameters
        if (requiredFloats > 0 || optionalFloats) {
          const providedFloats = destinations.floats;
          const neededFloats = requiredFloats - providedFloats;

          if (neededFloats > 0) {
            // Implicit float(s) are helping to meet requirements
            resultMessages.push({
              severity: 'info',
              message: `Task's float parameter is implicitly filled with 0`,
              filePath: propInfo.filePath,
              line: propInfo.valueStartLine,
              context: `'${propertyName}' appends a value of 0 the end of the floats array to fill in a single missing value.`,
              suggestion: 'Add the 0 value explicitly',
              suggestionIsAction: true,
              correctionIcon: '🔧',
              corrections: [
                {
                  filePath: propInfo.filePath,
                  startLine: propInfo.valueEndLine,
                  startColumn: propInfo.valueEndColumn,
                  endLine: propInfo.valueEndLine,
                  endColumn: propInfo.valueEndColumn,
                  replacementText: ',0',
                },
              ],
            });
          }
        }
      }

      return resultMessages;
    }

    // Find the closest use case (fewest missing required parameters) and report specific errors
    const getMissingParams = (useCase: TaskUseCase) => {
      const missingParams: Array<{ param: TaskParameter; arrayName: string; requiredIndex: number }> = [];

      for (const param of useCase.required) {
        // Parse the parameter name to get array name and index (handles both [N] and [N+])
        const match = param.name.match(/^(\w+)\[(\d+)\+?\]$/);
        if (match) {
          const arrayName = match[1]!;
          const requiredIndex = parseInt(match[2]!, 10);
          const actualCount = destinationsWithImplicit[arrayName as keyof typeof destinationsWithImplicit];

          // If actualCount <= requiredIndex, this parameter is missing
          if (typeof actualCount === 'number' && actualCount <= requiredIndex) {
            missingParams.push({ param, arrayName, requiredIndex });
          }
        }
      }

      return missingParams;
    };

    const useCaseMissingCounts = task.uses.map(useCase => ({
      useCase,
      missingParams: getMissingParams(useCase),
    }));

    const closestMatch = useCaseMissingCounts.reduce((best, current) =>
      current.missingParams.length < best.missingParams.length ? current : best
    );

    const messages: ValidationMessage[] = [];

    // Emit error for each missing required parameter
    for (const missing of closestMatch.missingParams) {
      messages.push({
        severity: 'error',
        message: `Task '${taskName}' is missing required parameter ${missing.param.name}`,
        filePath: propInfo.filePath,
        line: propInfo.valueStartLine,
        context: missing.param.description,
        taskReference: taskName,
      });
    }

    // If there are multiple use cases, emit info message
    if (task.uses.length > 1) {
      messages.push({
        severity: 'info',
        message: `Task '${taskName}' has ${task.uses.length} use cases. Check the documentation to confirm the intended use case.`,
        filePath: propInfo.filePath,
        line: propInfo.valueStartLine,
        taskReference: taskName,
      });
    }

    return messages;
  }

  /**
   * Infer where parameters will end up (which arrays/fields)
   *
   * @param parameters - Parsed parameters
   * @returns Counts for each destination
   */
  private inferParameterDestinations(parameters: ParsedParameter[]): {
    strings: number;
    floats: number;
    bools: number;
    tileCoords: number;
    hasFormula: boolean;
    hasDelay: boolean;
  } {
    const destinations = {
      strings: 0,
      floats: 0,
      bools: 0,
      tileCoords: 0,
      hasFormula: false,
      hasDelay: false,
    };

    for (const param of parameters) {
      switch (param.type) {
        case 'string':
          destinations.strings++;
          break;
        case 'float':
          destinations.floats++;
          break;
        case 'bool':
          destinations.bools++;
          break;
        case 'tileCoord':
          // Only count @Y, @T, and @XYA as they actually add TileCoords
          // @X only sets the x coordinate and doesn't add a TileCoord until @Y
          if (param.source !== '@X') {
            destinations.tileCoords++;
          }
          break;
        case 'formula':
          destinations.hasFormula = true;
          break;
        case 'delay':
          destinations.hasDelay = true;
          break;
        case 'globalVarSubstitution':
          // @G is substituted at runtime, would need runtime type inference
          // For now, assume it becomes a string
          destinations.strings++;
          break;
      }
    }

    return destinations;
  }

  /**
   * Extract parameter requirements from task metadata
   *
   * Parses "strings[0]", "floats[1]", "strings[1+]" into minimum counts
   * The [1+] notation means "1 or more" (unlimited)
   *
   * @param params - Task parameters from metadata
   * @returns Map of array names to minimum required counts (Infinity means unlimited)
   */
  private extractParameterRequirements(params: TaskParameter[]): Record<string, number> {
    const requirements: Record<string, number> = {};

    for (const param of params) {
      // Check for [N+] pattern (e.g., strings[1+] means unlimited starting from index 1)
      const matchPlus = param.name.match(/^(\w+)\[(\d+)\+\]$/);
      if (matchPlus) {
        const arrayName = matchPlus[1]!;
        const startIndex = parseInt(matchPlus[2]!, 10);
        const minCount = startIndex + 1; // strings[1+] means at least 2 elements (index 0 and 1)

        requirements[arrayName] = Math.max(requirements[arrayName] || 0, minCount);
        // Mark as unlimited by also storing Infinity (we'll check this separately)
        requirements[`${arrayName}_unlimited`] = Infinity;
        continue;
      }

      // Check for regular [N] pattern (e.g., strings[0])
      const match = param.name.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        const arrayName = match[1]!;
        const index = parseInt(match[2]!, 10);
        const minCount = index + 1; // Array index 0 means we need at least 1 element

        requirements[arrayName] = Math.max(requirements[arrayName] || 0, minCount);
      }
    }

    return requirements;
  }
}
