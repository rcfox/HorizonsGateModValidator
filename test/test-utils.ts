/**
 * Test utilities for validation testing
 */

import { expect } from 'vitest';
import type { ValidationMessage, ValidationResult, ValidationSeverity } from '../src/types.js';

function assertExhaustive(_param: never): never {
  throw new Error('this should never run');
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
