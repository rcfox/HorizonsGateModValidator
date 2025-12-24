/**
 * Test utilities for validation testing
 */

import { expect } from 'vitest';
import type { ValidationMessage, ValidationResult, ValidationSeverity } from '../src/types.js';
import type { ASTNode, PositionInfo } from '../src/formula-parser.js';
import { AssertionError } from 'chai';

/**
 * Recursively remove position information from a type.
 */
export type WithoutPosition<T> = T extends readonly (infer E)[]
  ? readonly WithoutPosition<E>[]
  : T extends object
    ? Omit<
        {
          [K in keyof T]: WithoutPosition<T[K]>;
        },
        keyof PositionInfo
      >
    : T;

/**
 * Strip position information from an AST node for test comparisons.
 * Position tracking is tested separately; structure tests only care about the AST shape.
 * THIS IS ONLY ALLOWED TO BE USED IN TESTS
 */
export function stripPositions<T extends ASTNode>(node: T): WithoutPosition<T>;
export function stripPositions<T extends ASTNode>(node: readonly T[]): WithoutPosition<T>[];
export function stripPositions(node: ASTNode | readonly ASTNode[]): unknown {
  if (Array.isArray(node)) {
    return node.map(x => stripPositions(x));
  }

  const positionKeys: readonly (keyof PositionInfo)[] = ['startLine', 'startColumn', 'endLine', 'endColumn'];

  const entries = Object.entries(node)
    .filter(([key]) => !positionKeys.includes(key as keyof PositionInfo))
    .map(([key, value]) => [key, value !== null && typeof value === 'object' ? stripPositions(value) : value]);

  return Object.fromEntries(entries);
}

function assertExhaustive(_param: never): never {
  throw new Error('this should never run');
}

export function expectToBeDefined<T>(value: T | undefined | null): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new AssertionError('expected value to be defined', undefined, expectToBeDefined);
  }
}

/**
 * Assert that a validation result has no messages
 * Includes actual messages in assertion failure for better debugging
 */
export function expectValid(result: ValidationResult | ValidationMessage[]) {
  const assertMsg = 'Validation should have no messages';
  if (Array.isArray(result)) {
    expect(result, assertMsg).toMatchObject([]);
  } else {
    const expected: ValidationResult = { errors: [], warnings: [], hints: [], info: [] };
    expect(result, assertMsg).toMatchObject(expected);
  }
}

/**
 * Assert that validation result contains a message with specific text
 */
export function expectMessage(
  result: ValidationResult | ValidationMessage[],
  msg: { text: string; severity: ValidationSeverity }
) {
  let allMessages: ValidationMessage[] = [];
  let severityMessages: ValidationMessage[] = [];
  if (Array.isArray(result)) {
    allMessages = result;
    severityMessages = result.filter(m => m.severity === msg.severity);
  } else {
    allMessages = Object.values(result).flat() as ValidationResult[keyof ValidationResult];
    switch (msg.severity) {
      case 'error':
        severityMessages = result.errors;
        break;
      case 'warning':
        severityMessages = result.warnings;
        break;
      case 'hint':
        severityMessages = result.hints;
        break;
      case 'info':
        severityMessages = result.info;
        break;
      default:
        assertExhaustive(msg.severity);
    }
  }
  const foundMsg = severityMessages.find(e => e.message.toLowerCase().includes(msg.text.toLowerCase()));

  if (!foundMsg) {
    const messages = allMessages.map(e => JSON.stringify({ text: e.message, severity: e.severity })).join(', ');
    throw new Error(`Expected a ${msg.severity} message containing "${msg.text}", but got: [${messages}]`);
  }
}
