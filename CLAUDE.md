# Horizon's Gate Mod Validator - Project Context

## Overview
A web-based validator for Horizon's Gate game mod files. Validates mod syntax, object types, property types, and provides typo suggestions with clickable corrections.

## Project Structure

### Source Files (`/src`)
- **validator.ts** - Main validation orchestrator
- **parser.ts** - Parses mod file format into structured objects
- **lexer.ts** - Tokenizes mod file content
- **property-validator.ts** - Validates property values against expected types
- **formula-validator.ts** - Validates formula syntax and functions
- **string-similarity.ts** - Levenshtein distance for typo suggestions (MAX_EDIT_DISTANCE = 3)
- **object-registry.ts** - Fallback registry for types not in schema
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

### Property Line Numbers
Properties stored as `Map<string, PropertyInfo>` where `PropertyInfo = { value: string, line: number }` to track exact error locations.

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
When applying corrections, the code:
1. Splits line by semicolons to handle multiple properties
2. Uses `findSimilar()` to determine if correction matches property name or value
3. Finds correct text position accounting for line offsets
4. Uses `replaceTextUndoable()` for Ctrl+Z support

## Build & Deployment

### Commands
- `npm run build` - Compile TypeScript to `/dist`
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
- [ ] Namespace colliding enum names (e.g., `Action.specialProperty` vs `ItemType.specialProperty`)
- [ ] Handle missing virtual properties on Trigger: topX, topY, btmX, btmY
- [ ] Better formula parsing: handle arguments for operators, no dangling expressions, @ expressions (@F, @G, etc.)
- [ ] Task handling: required arguments, task enum check
- [ ] Dialog handling: Text formatting tags (ie: <foo=bar>)
