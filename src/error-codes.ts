/**
 * Validation error codes and their required context types.
 *
 * ValidationErrorCode is a const object used at runtime to emit codes.
 * ErrorContext is a discriminated union that encodes, for each code, exactly
 * which errorCodeContext keys are required (or that errorCodeContext must be
 * absent). This is consumed as:
 *
 *   type ValidationMessage = BaseValidationMessage & ErrorContext;
 *
 * so every message object literal is type-checked against the right context
 * shape for its errorCode.
 */

export const ValidationErrorCode = {
  // Parser
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  EXPECTED_TYPE_NAME: 'EXPECTED_TYPE_NAME',
  EXPECTED_CLOSING_BRACKET: 'EXPECTED_CLOSING_BRACKET',
  EXPECTED_EQUALS: 'EXPECTED_EQUALS',
  MISSING_SEMICOLON: 'MISSING_SEMICOLON',

  // Object / schema
  UNKNOWN_OBJECT_TYPE: 'UNKNOWN_OBJECT_TYPE',
  MISSING_ID_PROPERTY: 'MISSING_ID_PROPERTY',
  UNSUPPORTED_CLONE_FROM: 'UNSUPPORTED_CLONE_FROM',
  UNKNOWN_PROPERTY: 'UNKNOWN_PROPERTY',
  EMPTY_MAGNITUDE: 'EMPTY_MAGNITUDE',
  DUPLICATE_ID_IDENTICAL: 'DUPLICATE_ID_IDENTICAL',
  DUPLICATE_ID_CONFLICTING: 'DUPLICATE_ID_CONFLICTING',
  TRIGGER_EFFECT_AMBIGUOUS: 'TRIGGER_EFFECT_AMBIGUOUS',
  TRIGGER_EFFECT_INCOMPLETE: 'TRIGGER_EFFECT_INCOMPLETE',
  ACTION_MISSING_ID: 'ACTION_MISSING_ID',
  ACTION_ID_MISMATCH: 'ACTION_ID_MISMATCH',
  ACTION_MISSING_AOE: 'ACTION_MISSING_AOE',
  ACTION_MISSING_AVAFFECTER: 'ACTION_MISSING_AVAFFECTER',
  ACTION_WRONG_NEXT_TYPE: 'ACTION_WRONG_NEXT_TYPE',
  AVAFFECTER_MISSING_AOE: 'AVAFFECTER_MISSING_AOE',
  AVAFFECTER_WRONG_NEXT_TYPE: 'AVAFFECTER_WRONG_NEXT_TYPE',

  // Property type validation
  INVALID_BOOLEAN: 'INVALID_BOOLEAN',
  INVALID_INTEGER: 'INVALID_INTEGER',
  INVALID_FLOAT: 'INVALID_FLOAT',
  INVALID_BYTE: 'INVALID_BYTE',
  TOO_MANY_LIST_VALUES: 'TOO_MANY_LIST_VALUES',
  INVALID_DICT_ENTRY: 'INVALID_DICT_ENTRY',
  EMPTY_DICT_KEY: 'EMPTY_DICT_KEY',
  INVALID_ENUM_VALUE: 'INVALID_ENUM_VALUE',
  INVALID_ENUM_NUMERIC: 'INVALID_ENUM_NUMERIC',
  NUMERIC_ENUM_VALUE: 'NUMERIC_ENUM_VALUE',
  CUSTOM_ELEMENT_VALUE: 'CUSTOM_ELEMENT_VALUE',
  UNVALIDATED_TYPE: 'UNVALIDATED_TYPE',
  INVALID_VECTOR2: 'INVALID_VECTOR2',
  VECTOR2_MISSING_COMPONENT: 'VECTOR2_MISSING_COMPONENT',
  VECTOR2_INVALID_COMPONENT: 'VECTOR2_INVALID_COMPONENT',
  INVALID_VECTOR3: 'INVALID_VECTOR3',
  VECTOR3_MISSING_COMPONENT: 'VECTOR3_MISSING_COMPONENT',
  VECTOR3_INVALID_COMPONENT: 'VECTOR3_INVALID_COMPONENT',
  INVALID_RECTANGLE: 'INVALID_RECTANGLE',
  RECTANGLE_MISSING_COMPONENT: 'RECTANGLE_MISSING_COMPONENT',
  RECTANGLE_INVALID_COMPONENT: 'RECTANGLE_INVALID_COMPONENT',

  // Task validation
  UNKNOWN_TASK: 'UNKNOWN_TASK',
  EMPTY_FORMULA_PARAM: 'EMPTY_FORMULA_PARAM',
  EMPTY_STRING_PARAM: 'EMPTY_STRING_PARAM',
  EMPTY_TILE_COORD_PARAM: 'EMPTY_TILE_COORD_PARAM',
  INVALID_COORDINATE: 'INVALID_COORDINATE',
  EMPTY_GLOBAL_VAR: 'EMPTY_GLOBAL_VAR',
  INVALID_DELAY: 'INVALID_DELAY',
  DELAY_MIDDLE_POSITION: 'DELAY_MIDDLE_POSITION',
  TASK_PARAM_TOO_FEW: 'TASK_PARAM_TOO_FEW',
  TASK_TOO_MANY_PARAMS: 'TASK_TOO_MANY_PARAMS',
  TASK_MISSING_PARAM: 'TASK_MISSING_PARAM',
  TASK_MULTIPLE_USE_CASES: 'TASK_MULTIPLE_USE_CASES',
  TASK_IMPLICIT_FLOAT: 'TASK_IMPLICIT_FLOAT',
  TASK_CONSOLE_COMMAND: 'TASK_CONSOLE_COMMAND',
  TASK_DEPRECATED: 'TASK_DEPRECATED',

  // Formula validation
  FORMULA_PARSE_ERROR: 'FORMULA_PARSE_ERROR',
  UNKNOWN_OPERATOR: 'UNKNOWN_OPERATOR',
  OPERATOR_WRONG_SYNTAX: 'OPERATOR_WRONG_SYNTAX',
  OPERATOR_WRONG_ARG_COUNT: 'OPERATOR_WRONG_ARG_COUNT',
  OPERATOR_UNEXPECTED_BODY: 'OPERATOR_UNEXPECTED_BODY',
  OPERATOR_WRONG_PARAM_TYPE: 'OPERATOR_WRONG_PARAM_TYPE',
  OPERATOR_WRONG_ARG_TYPE: 'OPERATOR_WRONG_ARG_TYPE',
  OPERATOR_NO_PARAMS: 'OPERATOR_NO_PARAMS',

  // Dynamic text validation
  UNKNOWN_DYNAMIC_TAG: 'UNKNOWN_DYNAMIC_TAG',
  COMMAND_MISSING_NAME: 'COMMAND_MISSING_NAME',
  UNKNOWN_DYNAMIC_COMMAND: 'UNKNOWN_DYNAMIC_COMMAND',
  COMMAND_MISSING_ARG: 'COMMAND_MISSING_ARG',
  COMMAND_TOO_MANY_ARGS: 'COMMAND_TOO_MANY_ARGS',
  TAG_MISSING_ARG: 'TAG_MISSING_ARG',
  TAG_TOO_MANY_ARGS: 'TAG_TOO_MANY_ARGS',
  NESTED_ANGLE_BRACKETS: 'NESTED_ANGLE_BRACKETS',
  TAG_MISSING_TRAILING_EQUALS: 'TAG_MISSING_TRAILING_EQUALS',
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCode)[keyof typeof ValidationErrorCode];

// Short alias used only within this file to keep the union readable.
const C = ValidationErrorCode;

/**
 * Discriminated union on errorCode that encodes the required errorCodeContext shape for each code.
 *
 * ACTION_MISSING_AVAFFECTER carries foundType?: string because one call site
 * knows what type was found and one does not.
 */
export type ErrorContext =
  // ── Parser ────────────────────────────────────────────────────────────────
  | { errorCode: typeof C.UNEXPECTED_TOKEN }
  | { errorCode: typeof C.EXPECTED_TYPE_NAME }
  | { errorCode: typeof C.EXPECTED_CLOSING_BRACKET }
  | { errorCode: typeof C.EXPECTED_EQUALS; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.MISSING_SEMICOLON; errorCodeContext: { propertyName: string } }

  // ── Object / schema ───────────────────────────────────────────────────────
  | { errorCode: typeof C.UNKNOWN_OBJECT_TYPE; errorCodeContext: { objectType: string } }
  | { errorCode: typeof C.MISSING_ID_PROPERTY; errorCodeContext: { objectType: string } }
  | { errorCode: typeof C.UNSUPPORTED_CLONE_FROM; errorCodeContext: { objectType: string } }
  | { errorCode: typeof C.UNKNOWN_PROPERTY; errorCodeContext: { propertyName: string; objectType: string } }
  | { errorCode: typeof C.EMPTY_MAGNITUDE }
  | { errorCode: typeof C.DUPLICATE_ID_IDENTICAL; errorCodeContext: { objectType: string; id: string } }
  | { errorCode: typeof C.DUPLICATE_ID_CONFLICTING; errorCodeContext: { objectType: string; id: string } }
  | { errorCode: typeof C.TRIGGER_EFFECT_AMBIGUOUS }
  | { errorCode: typeof C.TRIGGER_EFFECT_INCOMPLETE }
  | { errorCode: typeof C.ACTION_MISSING_ID; errorCodeContext: { objectType: string; actionId: string } }
  | { errorCode: typeof C.ACTION_ID_MISMATCH; errorCodeContext: { objectType: string; actionId: string } }
  | { errorCode: typeof C.ACTION_MISSING_AOE; errorCodeContext: { actionId: string } }
  | { errorCode: typeof C.ACTION_MISSING_AVAFFECTER; errorCodeContext: { actionId: string; foundType?: string } }
  | { errorCode: typeof C.ACTION_WRONG_NEXT_TYPE; errorCodeContext: { actionId: string; foundType: string } }
  | { errorCode: typeof C.AVAFFECTER_MISSING_AOE; errorCodeContext: { actionId: string } }
  | { errorCode: typeof C.AVAFFECTER_WRONG_NEXT_TYPE; errorCodeContext: { actionId: string; foundType: string } }

  // ── Property type validation ───────────────────────────────────────────────
  | { errorCode: typeof C.INVALID_BOOLEAN; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.INVALID_INTEGER; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.INVALID_FLOAT; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.INVALID_BYTE; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.TOO_MANY_LIST_VALUES; errorCodeContext: { propertyName: string; elementType: string } }
  | { errorCode: typeof C.INVALID_DICT_ENTRY; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.EMPTY_DICT_KEY; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.INVALID_ENUM_VALUE; errorCodeContext: { propertyName: string; enumName: string } }
  | { errorCode: typeof C.INVALID_ENUM_NUMERIC; errorCodeContext: { propertyName: string; enumName: string } }
  | { errorCode: typeof C.NUMERIC_ENUM_VALUE; errorCodeContext: { propertyName: string; enumName: string } }
  | { errorCode: typeof C.CUSTOM_ELEMENT_VALUE; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.UNVALIDATED_TYPE; errorCodeContext: { propertyName: string; typeName: string } }
  | { errorCode: typeof C.INVALID_VECTOR2; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.VECTOR2_MISSING_COMPONENT; errorCodeContext: { propertyName: string; component: string } }
  | { errorCode: typeof C.VECTOR2_INVALID_COMPONENT; errorCodeContext: { propertyName: string; component: string } }
  | { errorCode: typeof C.INVALID_VECTOR3; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.VECTOR3_MISSING_COMPONENT; errorCodeContext: { propertyName: string; component: string } }
  | { errorCode: typeof C.VECTOR3_INVALID_COMPONENT; errorCodeContext: { propertyName: string; component: string } }
  | { errorCode: typeof C.INVALID_RECTANGLE; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.RECTANGLE_MISSING_COMPONENT; errorCodeContext: { propertyName: string; component: string } }
  | { errorCode: typeof C.RECTANGLE_INVALID_COMPONENT; errorCodeContext: { propertyName: string; component: string } }

  // ── Task validation ────────────────────────────────────────────────────────
  | { errorCode: typeof C.UNKNOWN_TASK; errorCodeContext: { taskName: string } }
  | { errorCode: typeof C.EMPTY_FORMULA_PARAM; errorCodeContext: { source: string } }
  | { errorCode: typeof C.EMPTY_STRING_PARAM; errorCodeContext: { source: string } }
  | { errorCode: typeof C.EMPTY_TILE_COORD_PARAM; errorCodeContext: { source: string } }
  | { errorCode: typeof C.INVALID_COORDINATE }
  | { errorCode: typeof C.EMPTY_GLOBAL_VAR }
  | { errorCode: typeof C.INVALID_DELAY }
  | { errorCode: typeof C.DELAY_MIDDLE_POSITION }
  | { errorCode: typeof C.TASK_PARAM_TOO_FEW; errorCodeContext: { taskName: string; paramType: string } }
  | { errorCode: typeof C.TASK_TOO_MANY_PARAMS; errorCodeContext: { taskName: string; paramType: string } }
  | { errorCode: typeof C.TASK_MISSING_PARAM; errorCodeContext: { taskName: string; paramName: string } }
  | { errorCode: typeof C.TASK_MULTIPLE_USE_CASES; errorCodeContext: { taskName: string } }
  | { errorCode: typeof C.TASK_IMPLICIT_FLOAT; errorCodeContext: { propertyName: string } }
  | { errorCode: typeof C.TASK_CONSOLE_COMMAND; errorCodeContext: { taskName: string } }
  | { errorCode: typeof C.TASK_DEPRECATED; errorCodeContext: { taskName: string } }

  // ── Formula validation ─────────────────────────────────────────────────────
  | { errorCode: typeof C.FORMULA_PARSE_ERROR }
  | { errorCode: typeof C.UNKNOWN_OPERATOR; errorCodeContext: { operatorName: string } }
  | { errorCode: typeof C.OPERATOR_WRONG_SYNTAX; errorCodeContext: { operatorName: string } }
  | { errorCode: typeof C.OPERATOR_WRONG_ARG_COUNT; errorCodeContext: { operatorName: string } }
  | { errorCode: typeof C.OPERATOR_UNEXPECTED_BODY; errorCodeContext: { operatorName: string } }
  | { errorCode: typeof C.OPERATOR_WRONG_PARAM_TYPE; errorCodeContext: { operatorName: string; paramName: string } }
  | { errorCode: typeof C.OPERATOR_WRONG_ARG_TYPE; errorCodeContext: { operatorName: string; argName: string } }
  | { errorCode: typeof C.OPERATOR_NO_PARAMS; errorCodeContext: { operatorName: string } }

  // ── Dynamic text validation ────────────────────────────────────────────────
  | { errorCode: typeof C.UNKNOWN_DYNAMIC_TAG; errorCodeContext: { tagName: string } }
  | { errorCode: typeof C.COMMAND_MISSING_NAME }
  | { errorCode: typeof C.UNKNOWN_DYNAMIC_COMMAND; errorCodeContext: { commandName: string } }
  | { errorCode: typeof C.COMMAND_MISSING_ARG; errorCodeContext: { commandName: string; argName: string } }
  | { errorCode: typeof C.COMMAND_TOO_MANY_ARGS; errorCodeContext: { commandName: string } }
  | { errorCode: typeof C.TAG_MISSING_ARG; errorCodeContext: { tagName: string; argName: string } }
  | { errorCode: typeof C.TAG_TOO_MANY_ARGS; errorCodeContext: { tagName: string } }
  | { errorCode: typeof C.NESTED_ANGLE_BRACKETS }
  | { errorCode: typeof C.TAG_MISSING_TRAILING_EQUALS; errorCodeContext: { tagName: string } };
