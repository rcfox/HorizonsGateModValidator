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
  enums: Record<string, Record<string, number>>;
}

/**
 * Property with metadata and position information
 */
export interface PropertyInfo {
  value: string;

  // Property name position (always single line)
  nameStartLine: number;
  nameStartColumn: number;
  nameEndColumn: number;

  // Property value position (can be multi-line)
  valueStartLine: number;
  valueStartColumn: number;
  valueEndLine: number;
  valueEndColumn: number;
}

/**
 * Parsed object representation with position information
 */
export interface ParsedObject {
  type: string;
  properties: Map<string, PropertyInfo>;
  startLine: number;
  endLine: number;

  // Type name position (always single line)
  typeStartLine: number;
  typeStartColumn: number;
  typeEndColumn: number;
  typeBracketEndColumn: number; // Position after the closing ]
}

/**
 * Validation result types
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Position-based correction for auto-fixing issues
 *
 * Positions use:
 * - Lines: 1-indexed (matches editor display)
 * - Columns: 0-indexed (matches JavaScript string indexing)
 * - endColumn: exclusive (like substring/slice)
 *
 * Invariant: startLine <= endLine
 * Multi-line: Only property values can span multiple lines
 */
export interface Correction {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  replacementText: string;
}

export interface ValidationMessage {
  severity: ValidationSeverity;
  message: string;
  line?: number;
  context?: string;
  suggestion?: string; // Override text for corrections (e.g., "Add a semicolon" instead of "Did you mean:")
  correctionIcon?: string; // Override icon for corrections (e.g., "🔧" for fixes, default "💡" for typos)
  corrections?: Correction[]; // Suggested corrections for typos
  formulaReference?: string; // Operator name for linking to formula reference page
  documentationUrl?: string; // External documentation URL
  documentationLabel?: string; // Label for the documentation link
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
