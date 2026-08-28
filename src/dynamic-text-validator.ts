/**
 * Dynamic Text Tag Validator
 *
 * Validates dynamic text tags against dynamic-text.json metadata.
 *
 * Features:
 * - Tag name validation with typo suggestions
 * - Required/optional argument validation
 * - Formula detection and validation for formula-like arguments
 * - Command sub-tag validation for <cmd=> tags
 * - Position tracking for precise error reporting
 */

import type {
  DynamicTextArgument,
  DynamicTextData,
  DynamicTextTag,
  DynamicTextCommand,
  DynamicTextUseCase,
  ParsedDynamicTextTag,
  ParsedDynamicTextArgument,
  PropertyInfo,
  ValidationMessage,
} from './types.js';
import { ValidationErrorCode } from './types.js';
import { findSimilar, MAX_EDIT_DISTANCE } from './string-similarity.js';
import { validateFormula } from './formula-validator.js';
import { parseDynamicText, containsDynamicText } from './dynamic-text-parser.js';
import { toAbsolutePosition } from './position-utils.js';
import dynamicTextJsonData from './dynamic-text.json' with { type: 'json' };

// Build lookup maps at module load time
const data = dynamicTextJsonData as DynamicTextData;

const tags: Map<string, DynamicTextTag> = new Map();
const tagAliasMap: Map<string, string> = new Map(); // alias -> canonical name
const commands: Map<string, DynamicTextCommand> = new Map();
const commandAliasMap: Map<string, string> = new Map(); // command alias -> canonical name

for (const tag of data.tags) {
  tags.set(tag.name, tag);
  tagAliasMap.set(tag.name, tag.name);

  for (const alias of tag.aliases) {
    tagAliasMap.set(alias, tag.name);
  }

  // Build command maps for <cmd=> tag
  if (tag.commands) {
    for (const cmd of tag.commands) {
      commands.set(cmd.name, cmd);
      commandAliasMap.set(cmd.name, cmd.name);

      for (const alias of cmd.aliases) {
        commandAliasMap.set(alias, cmd.name);
      }
    }
  }
}

if (tags.size === 0) {
  throw new Error('Failed to load dynamic text metadata from dynamic-text.json');
}

// Every entry must describe at least one use case; the arity checks below have
// no meaningful answer for an entry with none.
for (const [name, tag] of tags) {
  if (tag.uses.length === 0) {
    throw new Error(`Dynamic text tag '${name}' has no use cases in dynamic-text.json`);
  }
}
for (const [name, command] of commands) {
  if (command.uses.length === 0) {
    throw new Error(`Dynamic text command '${name}' has no use cases in dynamic-text.json`);
  }
}

/**
 * Check if a string looks like a formula (contains arithmetic operators or colon-prefixed operators)
 */
function looksLikeFormula(_value: string): boolean {
  // NOTE: I ran into some false positives, so I'm just disabling this check.
  // In the future, I'll try to get the type of the arguments so I know which ones to parse.
  return false;
}

/**
 * Get argument count for "too many arguments" check.
 * Excludes trailing empty argument (from trailing = convention).
 */
function getArgumentCountForTooManyCheck(args: ParsedDynamicTextArgument[]): number {
  if (args.length > 0 && args[args.length - 1]?.value === '') {
    return args.length - 1;
  }
  return args.length;
}

/**
 * Get argument count for "missing required" check.
 * All arguments count, including empty ones (empty = default value).
 */
function getArgumentCountForMissingCheck(args: ParsedDynamicTextArgument[]): number {
  return args.length;
}

/**
 * A tag or command may accept several distinct argument shapes, one per use case.
 * A count is only wrong when no use case can accept it, so the bounds are taken
 * across all uses rather than from any single one.
 */
type ArityProblem =
  | { kind: 'missing'; argument: DynamicTextArgument }
  | { kind: 'tooMany'; maxAccepted: number; provided: number };

/**
 * The use case demanding the fewest required arguments. Its argument names are
 * what a modder who supplied too few arguments is most likely reaching for.
 */
function leastDemandingUse(uses: DynamicTextUseCase[]): DynamicTextUseCase {
  const [first, ...rest] = uses;
  if (!first) {
    throw new Error('Dynamic text entry has no use cases');
  }
  return rest.reduce((fewest, use) => (use.required.length < fewest.required.length ? use : fewest), first);
}

/**
 * The largest number of arguments any use case will consume.
 */
function maxAcceptedArgumentCount(uses: DynamicTextUseCase[]): number {
  return uses.reduce((max, use) => Math.max(max, use.required.length + use.optional.length), 0);
}

/**
 * Check a written argument list against every use case of a tag or command.
 */
function checkArgumentCounts(uses: DynamicTextUseCase[], args: ParsedDynamicTextArgument[]): ArityProblem[] {
  const problems: ArityProblem[] = [];
  const mostPermissive = leastDemandingUse(uses);
  const providedForMissing = getArgumentCountForMissingCheck(args);
  const providedForTooMany = getArgumentCountForTooManyCheck(args);

  if (providedForMissing < mostPermissive.required.length) {
    const missing = mostPermissive.required[providedForMissing];
    if (!missing) {
      throw new Error('Missing argument index is out of range for the use case that reported it');
    }
    problems.push({ kind: 'missing', argument: missing });
  }

  const maxAccepted = maxAcceptedArgumentCount(uses);
  if (providedForTooMany > maxAccepted) {
    problems.push({ kind: 'tooMany', maxAccepted, provided: providedForTooMany });
  }

  return problems;
}

/**
 * Validate a string property value for dynamic text tags
 * Returns empty array if value doesn't contain '<'
 */
export function validateDynamicText(value: string, propInfo: PropertyInfo): ValidationMessage[] {
  if (!containsDynamicText(value)) {
    return [];
  }

  const messages: ValidationMessage[] = [];
  const segments = parseDynamicText(value);

  for (const segment of segments) {
    if (segment.type === 'tag') {
      messages.push(...validateTag(segment, propInfo));
    }
  }

  return messages;
}

/**
 * Validate a single tag
 */
function validateTag(tag: ParsedDynamicTextTag, propInfo: PropertyInfo): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  // Look up canonical tag name (check for undefined, not truthiness, since "" is a valid tag name)
  const canonicalName = tagAliasMap.get(tag.tagName);
  const tagMetadata = canonicalName !== undefined ? tags.get(canonicalName) : undefined;

  if (!tagMetadata) {
    messages.push(...validateUnknownTag(tag, propInfo));
    return messages;
  }

  // Special handling for command tags
  if (canonicalName === 'command') {
    messages.push(...validateCommandTag(tag, propInfo));
    return messages;
  }

  // Validate argument counts
  messages.push(...validateArgumentCounts(tag, tagMetadata, propInfo));

  // Check for nested brackets in arguments
  messages.push(...validateNoNestedBrackets(tag.arguments, propInfo));

  // Validate formula-like arguments
  messages.push(...validateFormulaArguments(tag.arguments, propInfo));

  // Check for trailing =
  messages.push(...validateTrailingEquals(tag, propInfo));

  return messages;
}

/**
 * Validate an unknown tag (produce error with suggestions)
 */
function validateUnknownTag(tag: ParsedDynamicTextTag, propInfo: PropertyInfo): ValidationMessage[] {
  const allTagNames = Array.from(tagAliasMap.keys());
  const similar = findSimilar(tag.tagName, allTagNames, MAX_EDIT_DISTANCE);

  const absoluteTagNamePos = toAbsolutePosition(
    tag.tagNamePosition,
    propInfo.valueStartLine,
    propInfo.valueStartColumn
  );

  if (similar.length > 0) {
    const corrections = similar.map(s => ({
      filePath: propInfo.filePath,
      startLine: absoluteTagNamePos.startLine,
      startColumn: absoluteTagNamePos.startColumn,
      endLine: absoluteTagNamePos.endLine,
      endColumn: absoluteTagNamePos.endColumn,
      replacementText: s.value,
    }));

    return [
      {
        severity: 'error',
        message: `Unknown dynamic text tag: '${tag.tagName}'`,
        filePath: propInfo.filePath,
        line: absoluteTagNamePos.startLine,
        corrections,
        errorCode: ValidationErrorCode.UNKNOWN_DYNAMIC_TAG,
        errorCodeContext: { tagName: tag.tagName },
      },
    ];
  }

  return [
    {
      severity: 'error',
      message: `Unknown dynamic text tag: '${tag.tagName}'`,
      filePath: propInfo.filePath,
      line: absoluteTagNamePos.startLine,
      errorCode: ValidationErrorCode.UNKNOWN_DYNAMIC_TAG,
      errorCodeContext: { tagName: tag.tagName },
    },
  ];
}

/**
 * Validate command sub-tag (<cmd=commandName=arg1=...=>)
 */
function validateCommandTag(tag: ParsedDynamicTextTag, propInfo: PropertyInfo): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const absoluteTagPos = toAbsolutePosition(tag.position, propInfo.valueStartLine, propInfo.valueStartColumn);

  if (tag.arguments.length === 0) {
    messages.push({
      severity: 'error',
      message: `Command tag requires a command name`,
      filePath: propInfo.filePath,
      line: absoluteTagPos.startLine,
      context: `Expected format: <cmd=commandName=...=>`,
      errorCode: ValidationErrorCode.COMMAND_MISSING_NAME,
    });
    return messages;
  }

  const commandArg = tag.arguments[0];
  if (!commandArg) {
    return messages;
  }

  const commandName = commandArg.value;
  const commandArgs = tag.arguments.slice(1);

  // Look up canonical command name
  const canonicalCmdName = commandAliasMap.get(commandName);
  const cmdMetadata = canonicalCmdName ? commands.get(canonicalCmdName) : undefined;

  if (!cmdMetadata) {
    messages.push(...validateUnknownCommand(commandArg, propInfo));
    return messages;
  }

  // Validate command argument counts against every use case
  for (const problem of checkArgumentCounts(cmdMetadata.uses, commandArgs)) {
    if (problem.kind === 'missing') {
      messages.push({
        severity: 'error',
        message: `Command '${commandName}' is missing required ${problem.argument.name}`,
        filePath: propInfo.filePath,
        line: absoluteTagPos.startLine,
        context: problem.argument.description,
        errorCode: ValidationErrorCode.COMMAND_MISSING_ARG,
        errorCodeContext: { commandName, argName: problem.argument.name },
      });
    } else {
      messages.push({
        severity: 'warning',
        message: `Command '${commandName}' has too many arguments`,
        filePath: propInfo.filePath,
        line: absoluteTagPos.startLine,
        context: `Expected at most ${problem.maxAccepted} argument(s), got ${problem.provided}`,
        errorCode: ValidationErrorCode.COMMAND_TOO_MANY_ARGS,
        errorCodeContext: { commandName },
      });
    }
  }

  // Check for nested brackets in command arguments
  messages.push(...validateNoNestedBrackets(commandArgs, propInfo));

  // Validate formula-like command arguments
  messages.push(...validateFormulaArguments(commandArgs, propInfo));

  // Check for trailing =
  messages.push(...validateTrailingEquals(tag, propInfo));

  return messages;
}

/**
 * Validate an unknown command (produce error with suggestions)
 */
function validateUnknownCommand(commandArg: ParsedDynamicTextArgument, propInfo: PropertyInfo): ValidationMessage[] {
  const commandName = commandArg.value;
  const allCmdNames = Array.from(commandAliasMap.keys());
  const similar = findSimilar(commandName, allCmdNames, MAX_EDIT_DISTANCE);

  const absoluteCmdPos = toAbsolutePosition(commandArg, propInfo.valueStartLine, propInfo.valueStartColumn);

  if (similar.length > 0) {
    const corrections = similar.map(s => ({
      filePath: propInfo.filePath,
      startLine: absoluteCmdPos.startLine,
      startColumn: absoluteCmdPos.startColumn,
      endLine: absoluteCmdPos.endLine,
      endColumn: absoluteCmdPos.endColumn,
      replacementText: s.value,
    }));

    return [
      {
        severity: 'error',
        message: `Unknown command: '${commandName}'`,
        filePath: propInfo.filePath,
        line: absoluteCmdPos.startLine,
        corrections,
        errorCode: ValidationErrorCode.UNKNOWN_DYNAMIC_COMMAND,
        errorCodeContext: { commandName },
      },
    ];
  }

  return [
    {
      severity: 'error',
      message: `Unknown command: '${commandName}'`,
      filePath: propInfo.filePath,
      line: absoluteCmdPos.startLine,
      errorCode: ValidationErrorCode.UNKNOWN_DYNAMIC_COMMAND,
      errorCodeContext: { commandName },
    },
  ];
}

/**
 * Validate argument counts against every use case in the tag metadata
 */
function validateArgumentCounts(
  tag: ParsedDynamicTextTag,
  tagMetadata: DynamicTextTag,
  propInfo: PropertyInfo
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  const absoluteTagPos = toAbsolutePosition(tag.position, propInfo.valueStartLine, propInfo.valueStartColumn);

  for (const problem of checkArgumentCounts(tagMetadata.uses, tag.arguments)) {
    if (problem.kind === 'missing') {
      messages.push({
        severity: 'error',
        message: `Tag '${tag.tagName}' is missing required ${problem.argument.name}`,
        filePath: propInfo.filePath,
        line: absoluteTagPos.startLine,
        context: problem.argument.description,
        errorCode: ValidationErrorCode.TAG_MISSING_ARG,
        errorCodeContext: { tagName: tag.tagName, argName: problem.argument.name },
      });
    } else {
      messages.push({
        severity: 'warning',
        message: `Tag '${tag.tagName}' has too many arguments`,
        filePath: propInfo.filePath,
        line: absoluteTagPos.startLine,
        context: `Expected at most ${problem.maxAccepted} argument(s), got ${problem.provided}`,
        errorCode: ValidationErrorCode.TAG_TOO_MANY_ARGS,
        errorCodeContext: { tagName: tag.tagName },
      });
    }
  }

  return messages;
}

/**
 * Check for nested angle brackets in arguments (not supported by game engine)
 */
function validateNoNestedBrackets(args: ParsedDynamicTextArgument[], propInfo: PropertyInfo): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  for (const arg of args) {
    if (arg.value.includes('<')) {
      const absoluteArgPos = toAbsolutePosition(arg, propInfo.valueStartLine, propInfo.valueStartColumn);
      messages.push({
        severity: 'error',
        message: `Nested angle brackets are not supported by the game`,
        filePath: propInfo.filePath,
        line: absoluteArgPos.startLine,
        context: `The '<' character in argument '${arg.value}' indicates a nested tag, which will not be handled by the game correctly.`,
        errorCode: ValidationErrorCode.NESTED_ANGLE_BRACKETS,
      });
    }
  }

  return messages;
}

/**
 * Validate formula-like arguments
 */
function validateFormulaArguments(args: ParsedDynamicTextArgument[], propInfo: PropertyInfo): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  for (const arg of args) {
    if (arg.value === '') continue;

    if (looksLikeFormula(arg.value)) {
      const absoluteArgPos = toAbsolutePosition(arg, propInfo.valueStartLine, propInfo.valueStartColumn);
      const formulaPropInfo: PropertyInfo = {
        filePath: propInfo.filePath,
        nameStartLine: propInfo.nameStartLine,
        nameStartColumn: propInfo.nameStartColumn,
        nameEndColumn: propInfo.nameEndColumn,
        valueStartLine: absoluteArgPos.startLine,
        valueStartColumn: absoluteArgPos.startColumn,
        valueEndLine: absoluteArgPos.endLine,
        valueEndColumn: absoluteArgPos.endColumn,
        value: arg.value,
      };
      const formulaMessages = validateFormula(arg.value, formulaPropInfo, 'dynamicTextArg', 'DynamicText');
      messages.push(...formulaMessages);
    }
  }

  return messages;
}

/**
 * Check for trailing = (info message if missing, only for tags with no arguments)
 */
function validateTrailingEquals(tag: ParsedDynamicTextTag, propInfo: PropertyInfo): ValidationMessage[] {
  // Only check trailing = for tags with no arguments
  // Tags with arguments don't need the trailing = convention
  if (tag.arguments.length > 0) {
    return [];
  }

  const absoluteTagPos = toAbsolutePosition(tag.position, propInfo.valueStartLine, propInfo.valueStartColumn);

  return [
    {
      severity: 'info',
      message: `Tag '${tag.tagName}' is missing trailing '='`,
      filePath: propInfo.filePath,
      line: absoluteTagPos.startLine,
      context: `Convention is to end tags with '=' even when there are no arguments (e.g., <${tag.tagName}=>)`,
      errorCode: ValidationErrorCode.TAG_MISSING_TRAILING_EQUALS,
      errorCodeContext: { tagName: tag.tagName },
    },
  ];
}
