/**
 * Dynamic Text Parser
 *
 * Parses dynamic text tags in string values.
 * Dynamic text tags use the format: <tagName=arg1=arg2=...=>
 *
 * The parser produces an array of segments, where each segment is either:
 * - A bare string (text outside of tags)
 * - A parsed tag with name, arguments, and position information
 */

import type {
  ParsedDynamicTextSegment,
  ParsedDynamicTextTag,
  ParsedDynamicTextBareString,
  ParsedDynamicTextArgument,
} from './types.js';
import {
  type TextPosition,
  createPositionInfo,
  advancePosition,
  offsetToPosition,
} from './position-utils.js';

/**
 * Parse a string value into dynamic text segments (tags and bare strings)
 */
export function parseDynamicText(value: string): ParsedDynamicTextSegment[] {
  const segments: ParsedDynamicTextSegment[] = [];
  let currentOffset = 0;

  while (currentOffset < value.length) {
    const tagStart = value.indexOf('<', currentOffset);

    if (tagStart === -1) {
      // No more tags, rest is bare string
      if (currentOffset < value.length) {
        const bareValue = value.substring(currentOffset);
        const startPos = offsetToPosition(value, currentOffset);
        segments.push(createBareString(bareValue, startPos));
      }
      break;
    }

    // Add bare string before tag if any
    if (tagStart > currentOffset) {
      const bareValue = value.substring(currentOffset, tagStart);
      const startPos = offsetToPosition(value, currentOffset);
      segments.push(createBareString(bareValue, startPos));
    }

    // Find tag end
    const tagEnd = value.indexOf('>', tagStart);
    if (tagEnd === -1) {
      // Unclosed tag - treat rest as bare string
      const bareValue = value.substring(tagStart);
      const startPos = offsetToPosition(value, tagStart);
      segments.push(createBareString(bareValue, startPos));
      break;
    }

    // Parse tag content (between < and >)
    const tagContent = value.substring(tagStart + 1, tagEnd);
    const tagStartPos = offsetToPosition(value, tagStart);
    const contentStartPos = offsetToPosition(value, tagStart + 1);

    const parsedTag = parseTagContent(tagContent, contentStartPos);

    // Set the full tag position (from < to >)
    const tagEndPos = offsetToPosition(value, tagEnd + 1);
    parsedTag.position = {
      startLine: tagStartPos.line,
      startColumn: tagStartPos.column,
      endLine: tagEndPos.line,
      endColumn: tagEndPos.column,
    };

    segments.push(parsedTag);
    currentOffset = tagEnd + 1;
  }

  return segments;
}

/**
 * Create a bare string segment
 */
function createBareString(value: string, startPos: TextPosition): ParsedDynamicTextBareString {
  return {
    type: 'bareString',
    value,
    position: createPositionInfo(startPos, value),
  };
}

/**
 * Parse tag content (the part between < and >)
 */
function parseTagContent(content: string, contentStartPos: TextPosition): ParsedDynamicTextTag {
  // Split by = to get tag name and arguments
  const parts = content.split('=');
  const rawTagName = parts[0] ?? '';
  const rawArgs = parts.slice(1);

  // Trim whitespace from tag name and calculate position adjustment
  const leadingWhitespace = rawTagName.length - rawTagName.trimStart().length;
  const tagName = rawTagName.trim();

  // Tag name position - advance past leading whitespace, then create position for trimmed name
  const tagNameStartPos = advancePosition(contentStartPos, rawTagName.substring(0, leadingWhitespace));
  const tagNamePosition = createPositionInfo(tagNameStartPos, tagName);

  // Calculate argument positions - advance past the full raw tag name and '='
  const arguments_: ParsedDynamicTextArgument[] = [];
  let currentPos = advancePosition(contentStartPos, rawTagName + '=');

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i] ?? '';
    const argPosition = createPositionInfo(currentPos, arg);

    arguments_.push({
      value: arg,
      startLine: argPosition.startLine,
      startColumn: argPosition.startColumn,
      endLine: argPosition.endLine,
      endColumn: argPosition.endColumn,
    });

    // Advance past this argument and the following '=' separator
    if (i < rawArgs.length - 1) {
      currentPos = advancePosition(currentPos, arg + '=');
    }
  }

  return {
    type: 'tag',
    tagName,
    tagNamePosition,
    arguments: arguments_,
    // Position will be set by caller
    position: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
  };
}

/**
 * Check if a string contains any dynamic text tags
 */
export function containsDynamicText(value: string): boolean {
  return value.includes('<');
}
