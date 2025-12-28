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
 * Position information for tracking locations in source text
 * (relative to start, preserving line breaks)
 *
 * Used by formula parsing and task string parsing for precise error reporting
 */
export interface PositionInfo {
  startLine: number; // Line offset from start (0 for first line)
  startColumn: number; // Column on that line (0-indexed)
  endLine: number; // Line offset from start
  endColumn: number; // Column on that line (0-indexed, exclusive)
}

/**
 * Utility type to add position information to any type
 */
export type WithPosition<T> = T & PositionInfo;

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
 * Severity order for sorting and filtering (lower number = higher priority)
 */
export const SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  hint: 2,
  info: 3,
} as const;

export type ValidationSeverity = keyof typeof SEVERITY_ORDER;
export const VALIDATION_SEVERITIES = Object.keys(SEVERITY_ORDER) as ValidationSeverity[];

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
  displayText?: string; // Optional display text (e.g., "filename:line")
}

export interface ValidationMessage {
  severity: ValidationSeverity;
  message: string;
  filePath: string;
  line: number;
  context?: string | undefined;
  suggestion?: string | undefined; // Override text for corrections (e.g., "Add a semicolon" instead of "Did you mean:")
  suggestionIsAction?: boolean | undefined; // If true, then a list of corrections is not shown, only the suggestion, and it applies the first correction.
  correctionIcon?: string | undefined; // Override icon for corrections (e.g., "🔧" for fixes, default "💡" for typos)
  corrections?: Correction[] | undefined; // Suggested corrections for typos
  isCrossFile?: boolean | undefined; // True if this message came from cross-file validation (e.g., duplicate IDs)
  formulaReference?: string | undefined; // Operator name for linking to formula reference page
  documentationUrl?: string | undefined; // External documentation URL
  documentationLabel?: string | undefined; // Label for the documentation link
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  hints: ValidationMessage[];
  info: ValidationMessage[];
}

/**
 * Task parameter metadata from tasks.json
 */
export interface TaskParameter {
  name: string; // e.g., "strings[0]", "floats[1]", "tileCoords[0]"
  description: string;
}

/**
 * Task use case metadata from tasks.json
 */
export interface TaskUseCase {
  description: string;
  required: TaskParameter[];
  optional: TaskParameter[];
}

/**
 * Task metadata from tasks.json
 */
export interface TaskMetadata {
  name: string;
  uses: TaskUseCase[];
  aliases: string[];
}

/**
 * Root structure of tasks.json
 */
export interface TasksData {
  gameVersion: string;
  tasks: TaskMetadata[];
}

/**
 * Discriminated union for parsed task string parameters with position tracking
 * Each variant represents how the parameter will be processed by the game
 */
export type ParsedParameter =
  | WithPosition<{ type: 'string'; value: string; source: 'plain' | '@A' | '@S' }>
  | WithPosition<{ type: 'float'; value: number; source: 'plain' }>
  | WithPosition<{ type: 'bool'; value: boolean; source: 'plain' }>
  | WithPosition<{ type: 'tileCoord'; source: '@T' | '@XYA' | '@X' | '@Y'; value: string }>
  | WithPosition<{ type: 'formula'; source: '@F' | '@R'; formula: string }>
  | WithPosition<{ type: 'delay'; source: '@'; delayValue: number }>
  | WithPosition<{ type: 'globalVarSubstitution'; source: '@G'; varName: string; originalParam: string }>;

/**
 * Parsed task string with position information for all elements
 */
export interface ParsedTaskString {
  taskName: string;
  taskNamePosition: PositionInfo;
  parameters: ParsedParameter[];
}

/**
 * Display information for an object in the object viewer
 */
export interface ObjectDisplayInfo {
  type: string; // Object type name (original from mod file)
  normalizedType: string; // Normalized through functional aliases (for grouping)
  id: string | null; // ID property value, null if absent
  filePath: string; // Source file path
  position: {
    // Position for navigation and display
    typeStartLine: number;
    typeStartColumn: number;
    typeEndColumn: number;
  };
  uniqueKey: string; // "ID:value" or "file:line:column"
}

/**
 * Group of objects of the same type
 */
export interface ObjectGroup {
  typeName: string; // Object type name
  count: number; // Number of objects in group
  objects: ObjectDisplayInfo[]; // Objects in this group
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
