# Horizon's Gate Mod Validator - Project Context

## Overview
A validator for Horizon's Gate game mod files. Validates mod syntax, object types, property types, and provides typo suggestions. Available as both a web UI and command-line tool.

## Usage

### Web UI
Open `public/index.html` in a browser to use the interactive validator with clickable corrections and auto-fix suggestions.

### Command-Line Interface
The CLI tool provides linter-style validation for mod files with support for batch processing.

**Build the CLI:**
```bash
npm run build:cli
```

**Basic usage:**
```bash
./dist/cli.js <paths...> [options]
```

**Options:**
- `-r, --recursive` - Recursively process directories (default: false)
- `-f, --format <type>` - Output format: `gcc` (default) or `json`
- `-e, --error-level <level>` - Minimum severity to display: `error`, `warning`, or `info` (default: `info`)
- `-V, --version` - Show version number
- `-h, --help` - Show help

**Examples:**
```bash
# Validate a single file
./dist/cli.js mods/mymod.txt

# Validate multiple files
./dist/cli.js mod1.txt mod2.txt

# Validate all .txt files in a directory
./dist/cli.js mods/

# Recursively validate all .txt files
./dist/cli.js mods/ -r

# Show only errors (hide warnings and info)
./dist/cli.js mods/ -e error

# Output as JSON for tooling integration
./dist/cli.js mods/ -f json

# Use shell globs (expanded by shell before CLI sees them)
./dist/cli.js mods/**/*.txt
```

**File discovery:**
- Explicitly specified files: Any extension is validated
- Directories: Only `.txt` files are processed by default
- Non-recursive by default (use `-r` to recurse)

**Exit codes:**
- `0` - Success (no messages printed at current error level)
- `1` - Failure (messages printed or file errors encountered)

**Output formats:**

*GCC-style (default):*
```
file.txt:55: error: Property '...' does not end with semicolon
file.txt:71: warning: Numeric enum value used for itemCategory
```

*JSON:*
```json
{
  "summary": {
    "filesProcessed": 1,
    "filesWithErrors": 1,
    "totalErrors": 2,
    "totalWarnings": 2,
    "totalInfo": 0
  },
  "files": [
    {
      "file": "example.txt",
      "valid": false,
      "messages": [ ... ]
    }
  ]
}
```

## Project Structure

### Source Files (`/src`)
- **cli.ts** - Command-line interface (compiles to `dist/cli.js`)
- **validator.ts** - Main validation orchestrator
- **parser.ts** - Parses mod file format into structured objects
- **lexer.ts** - Tokenizes mod file content
- **property-validator.ts** - Validates property values against expected types
- **formula-validator.ts** - Validates formula syntax and functions
- **string-similarity.ts** - Levenshtein distance for typo suggestions (MAX_EDIT_DISTANCE = 3)
- **types.ts** - TypeScript type definitions
- **mod-schema.json** - Generated schema with class definitions, type aliases, and enums
- **mod-schema.d.ts** - TypeScript definitions for schema

### Web UI (`/public`)
- **index.html** - Main validator page
- **app.js** - UI logic, theme management, validation triggers, auto-correction
- **styles.css** - Styling with light/dark mode support (defaults to system preference)
- **validator.bundle.js** - Built bundle (gitignored, generated at build time)

### Build Tools
- **extract_schema.cjs** - Extracts schema from C# source code in `/home/rcfox/code/hg/Tactics/`
- **build-bundle.js** - Creates browser bundle using esbuild

## Key Features

### Validation
- **Object type validation** - Checks against known types and aliases
- **Property validation** - Validates property names and types
- **Type-specific validation**:
  - Primitives: boolean, integer, float, byte, string
  - Vectors: Vector2, Vector3, Rectangle, TileCoord
  - Formulas: Complex validation with function/operator checking
  - Enums: Automatic validation for all enum types (15 total)
  - Lists: Validates list contents based on element type
- **Multi-line formula support** - Handles formulas split across lines
- **Semicolon validation** - Ensures proper semicolon placement

### Typo Correction
- Uses Levenshtein distance (max 3 edits) to suggest corrections
- Clickable correction links in the UI
- Auto-correction is undoable with Ctrl+Z (uses `document.execCommand`)
- Works for:
  - Object type names
  - Property names
  - Enum values
  - Handles multi-property lines (e.g., `ID=foo; sprite=232; itemCategory=armdgfor;`)

### Schema Extraction
- **Automatic extraction from C# source code**
- Handles:
  - Public fields and properties (including getters/setters)
  - Pattern fields (e.g., `bodyPartN` matches `bodyPart1`, `bodyPart2`, etc.)
  - Virtual properties from DataManager dictionary access
  - Consecutive case statements (fall-through cases)
  - Type aliases (58 aliases including `AvAffecterAoE` and `AvAffecterAOE`)
  - Dynamic categorization (definition/instance/nested)
- **Important regex**: `/new\s+(\w+)\(\s*valuesDict\s*[,)]/` - Only matches when `valuesDict` is first argument (not nested like `valuesDict["key"]`)
- Filters out:
  - Static properties
  - Duplicate virtual properties (real fields take precedence)

### UI Features
- **Line numbers** with synchronized scrolling
- **Click error to jump to line** - Highlights and scrolls to error location
- **Auto-validation** - Debounced (1s delay) on input
- **Light/Dark mode** - Defaults to system preference, persisted in localStorage
- **Sample code** - Intentionally includes errors to demonstrate validation

## Important Implementation Details

### Multi-line Values
Parser continues collecting value tokens across newlines until it finds a line starting with `IDENTIFIER=` (new property pattern).

### Position Tracking
The parser tracks precise positions for all elements to enable accurate corrections:

**PropertyInfo** contains:
- `value: string` - The property value
- `nameStartLine`, `nameStartColumn`, `nameEndColumn` - Position of the property name
- `valueStartLine`, `valueStartColumn`, `valueEndLine`, `valueEndColumn` - Position of the property value
  - Values can span multiple lines (e.g., formulas)
  - Columns are 0-indexed, lines are 1-indexed
  - endColumn is exclusive (like JavaScript slice)

**ParsedObject** contains:
- `typeStartLine`, `typeStartColumn`, `typeEndColumn` - Position of the object type name (text between `[` and `]`)
- `typeBracketEndColumn` - Position immediately after the closing `]` bracket (useful for inserting properties after the object type declaration)

This position tracking enables exact text replacement without any text searching or pattern matching.

### Type Aliases
Mod code allows for object type aliases where a new name is used for an actual class name.
Some common examples are:
- `AvAffecter` → `ActorValueAffecter`
- `AvAffecterAoE` / `AvAffecterAOE` → `AreaOfEffect`
- `ActionAOE` → `AreaOfEffect`
But there are many more.

### Enum Validation
**Known issue**: Some enums have naming collisions (e.g., `specialProperty` exists in both Action and ItemType). These need to be namespaced.

All enums are automatically validated - no hardcoded enum names required.

### Correction Logic
The correction system uses position-based text replacement for accuracy and simplicity:

**Correction Interface**:
```typescript
interface Correction {
  startLine: number;      // 1-indexed (line number)
  startColumn: number;    // 0-indexed (character position in line)
  endLine: number;        // 1-indexed (>= startLine for multi-line)
  endColumn: number;      // 0-indexed (exclusive, like slice)
  replacementText: string;
}
```

**How it works**:
1. Validators create corrections with exact positions from the parser's position tracking
2. UI receives correction objects with precise start/end coordinates
3. `applyCorrection()` converts line/column to absolute character position
4. Text is replaced using `document.execCommand('insertText')` for undo support
5. No text searching, pattern matching, or similarity checking in the UI

**Key benefits**:
- Exact, reliable text replacement
- Supports multi-line values (formulas)
- Simple UI logic (~35 lines vs ~100 lines of text-searching)
- No ambiguity with duplicate property names

## Build & Deployment

### Commands
- `npm run build` - Compile TypeScript to `/dist`
- `npm run build:cli` - Build CLI tool (same as `build`, but semantic)
- `npm run build:bundle` - Build + create browser bundle
- `node extract_schema.cjs` - Re-extract schema from C# source

## Development Notes

### Line Endings
All files use Unix line endings (`\n`)

### C# Source Location
Schema extraction expects decompiled C# files in the parent directory of the root of this project.

### Common Pitfalls
1. Consecutive case statements in DataManager.cs require special handling
2. Real fields always take precedence over virtual properties

## Sample Mod Format
```
[Action] ID=greatswordAttack;
	applyWeaponBuffs=true;
	casterAnimation=broadswing;

[AvAffecter]
	ID=greatswordAttack;
	actorValue=HP;
	magnitude=d:gswordDmg;
	element=melee;
	element=physical;
```

## Future TODOs
- [X] Add a section of "known issues" to the top of the page.
- [X] Namespace colliding enum names (e.g., `Action.specialProperty` vs `ItemType.specialProperty`)
- [X] Handle missing virtual properties on Trigger: topX, topY, btmX, btmY
- [ ] Better formula parsing: handle arguments for operators, no dangling expressions, @ expressions (@F, @G, etc.)
- [ ] Task handling: required arguments, task enum check
- [ ] Dialog handling: Text formatting tags (ie: <foo=bar>)
