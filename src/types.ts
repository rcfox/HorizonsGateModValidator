/**
 * Core type definitions for mod validation
 */

export type FieldType =
  | 'boolean'
  | 'integer'
  | 'float'
  | 'byte'
  | 'string'
  | 'Vector2'
  | 'Vector3'
  | 'Rectangle'
  | 'TileCoord'
  | 'Color'
  | 'Formula'
  | 'Element'
  | 'List<string>'
  | 'List<integer>'
  | 'List<float>'
  | 'List<Vector2>'
  | 'List<TileCoord>'
  | 'List<Formula>'
  | 'List<Element>'
  | 'HashSet<string>'
  | 'Dictionary<string, string>'
  | 'Dictionary<string, integer>'
  | 'Dictionary<string, float>'
  | string; // Allow unknown types

export interface FieldSchema {
  name: string;
  type: FieldType;
  csType: string;
  virtual?: boolean;
  pattern?: boolean;
}

export type ObjectCategory = 'definition' | 'nested' | 'instance' | 'special';

export interface ClassSchema {
  category: ObjectCategory;
  fields: FieldSchema[];
  supportsCloneFrom?: boolean;
}

export type ModSchema = Record<string, ClassSchema>;

/**
 * Schema data file format (includes schema, type aliases, and enums)
 */
export interface SchemaData {
  schema: ModSchema;
  typeAliases: Record<string, string>;
  enums: Record<string, string[]>;
}

/**
 * Property with metadata
 */
export interface PropertyInfo {
  value: string;
  line: number;
}

/**
 * Parsed object representation
 */
export interface ParsedObject {
  type: string;
  properties: Map<string, PropertyInfo>;
  startLine: number;
  endLine: number;
}

/**
 * Validation result types
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationMessage {
  severity: ValidationSeverity;
  message: string;
  line?: number;
  context?: string;
  suggestion?: string;
  corrections?: string[]; // Suggested corrections for typos
  formulaReference?: string; // Operator name for linking to formula reference page
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  info: ValidationMessage[];
}

/**
 * Token types for lexer
 */
export enum TokenType {
  LEFT_BRACKET = 'LEFT_BRACKET',
  RIGHT_BRACKET = 'RIGHT_BRACKET',
  EQUALS = 'EQUALS',
  SEMICOLON = 'SEMICOLON',
  IDENTIFIER = 'IDENTIFIER',
  STRING_VALUE = 'STRING_VALUE',
  COMMENT = 'COMMENT',
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

/**
 * Object type categorization based on parsing pattern
 */
export interface ObjectTypeInfo {
  category: ObjectCategory;
  parentType?: string; // For nested types
  propertyName?: string; // For nested single-property types
  isList?: boolean; // For nested list types
  requiresID: boolean;
  supportsCloneFrom: boolean;
}

/**
 * Formula parsing types
 */
export interface FormulaToken {
  type: 'number' | 'operator' | 'function' | 'variable' | 'identifier';
  value: string;
  args?: string[]; // For function calls
}
