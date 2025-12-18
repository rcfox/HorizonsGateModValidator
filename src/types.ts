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

/**
 * Object category determines how the object is used in the game:
 *
 * - 'definition': Template types stored in Data collections (e.g., ActorType, ItemType)
 *   These define reusable templates that other objects reference by ID.
 *   Requires a unique ID property.
 *
 * - 'instance': Standalone objects created from templates (e.g., Actor, Item)
 *   These are individual instances that reference a definition type by ID.
 *   Actor instances reference ActorType, Item instances reference ItemType.
 *   Requires an ID property that references the template type.
 *
 * - 'nested': Component objects that are parts of other objects (e.g., Container, Location)
 *   These are nested within or attached to other objects and don't stand alone.
 *   May or may not have an ID depending on usage.
 *
 * - 'special': Types with special handling that don't fit normal patterns (e.g., Zone, HeightMap)
 *   These have custom loading/processing logic.
 */
export type ObjectCategory = 'definition' | 'nested' | 'instance' | 'special';

export interface ClassSchema {
  category: ObjectCategory;
  fields: FieldSchema[];
  supportsCloneFrom?: boolean;
}

export type ModSchema = Record<string, ClassSchema>;

/**
 * Schema data file format (includes schema, type aliases, functional aliases, and enums)
 */
export interface SchemaData {
  schema: ModSchema;
  typeAliases: Record<string, string>;
  functionalAliases: Record<string, string>;
  enums: Record<string, Record<string, number>>;
}

/**
 * Property with metadata and position information
 */
export interface PropertyInfo {
  value: string;
  filePath: string;

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
  filePath: string;
  properties: Map<string, PropertyInfo>;
  startLine: number;
  endLine: number;

  previousObject: ParsedObject | null;
  nextObject: ParsedObject | null;

  // Type name position (always single line)
  typeStartLine: number;
  typeStartColumn: number;
  typeEndColumn: number;
  typeBracketEndColumn: number; // Position after the closing ]
}

/**
 * Validation result types
 */
export const VALIDATION_SEVERITIES = ['error', 'warning', 'info'] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

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
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  replacementText: string;
}

export interface ValidationMessage {
  severity: ValidationSeverity;
  message: string;
  filePath: string;
  line: number;
  context?: string | undefined;
  suggestion?: string | undefined; // Override text for corrections (e.g., "Add a semicolon" instead of "Did you mean:")
  correctionIcon?: string | undefined; // Override icon for corrections (e.g., "🔧" for fixes, default "💡" for typos)
  corrections?: Correction[] | undefined; // Suggested corrections for typos
  formulaReference?: string | undefined; // Operator name for linking to formula reference page
  documentationUrl?: string | undefined; // External documentation URL
  documentationLabel?: string | undefined; // Label for the documentation link
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
 * Formula parsing types
 */
export interface FormulaToken {
  type: 'number' | 'operator' | 'function' | 'variable' | 'identifier';
  value: string;
  args?: string[]; // For function calls
}
