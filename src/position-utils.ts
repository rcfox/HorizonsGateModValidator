/**
 * Shared position calculation utilities
 *
 * Used by formula parser, dynamic text parser, and other modules
 * that need to track positions within strings.
 */

import type { PositionInfo } from './types.js';

/**
 * Position in text with line, column, and absolute offset tracking
 */
export interface TextPosition {
  line: number; // Line offset from start (0-indexed)
  column: number; // Column on that line (0-indexed)
  offset: number; // Absolute character offset
}

/**
 * Calculate end position from start position and text
 * Handles multi-line text by counting newlines
 */
export function calculateEndPosition(startPos: TextPosition, text: string): { line: number; column: number } {
  let line = startPos.line;
  let column = startPos.column;

  for (const char of text) {
    if (char === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Create a complete PositionInfo from start position and text
 */
export function createPositionInfo(startPos: TextPosition, text: string): PositionInfo {
  const endPos = calculateEndPosition(startPos, text);
  return {
    startLine: startPos.line,
    startColumn: startPos.column,
    endLine: endPos.line,
    endColumn: endPos.column,
  };
}

/**
 * Advance position by a given text (for calculating relative positions)
 */
export function advancePosition(pos: TextPosition, text: string): TextPosition {
  const endPos = calculateEndPosition(pos, text);
  return {
    line: endPos.line,
    column: endPos.column,
    offset: pos.offset + text.length,
  };
}

/**
 * Create an initial TextPosition at the start of a string
 */
export function initialPosition(): TextPosition {
  return { line: 0, column: 0, offset: 0 };
}

/**
 * Convert a character offset to a TextPosition by scanning the string
 */
export function offsetToPosition(value: string, offset: number): TextPosition {
  let line = 0;
  let column = 0;

  for (let i = 0; i < offset && i < value.length; i++) {
    if (value[i] === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }

  return { line, column, offset };
}

/**
 * Convert relative position to absolute position in file
 */
export function toAbsolutePosition(pos: PositionInfo, baseStartLine: number, baseStartColumn: number): PositionInfo {
  return {
    startLine: baseStartLine + pos.startLine,
    startColumn: pos.startLine === 0 ? baseStartColumn + pos.startColumn : pos.startColumn,
    endLine: baseStartLine + pos.endLine,
    endColumn: pos.endLine === 0 ? baseStartColumn + pos.endColumn : pos.endColumn,
  };
}
