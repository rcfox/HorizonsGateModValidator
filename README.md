# Game Mod Validator

A comprehensive validation tool for game mod files written in TypeScript. This tool validates mod file syntax, object types, property types, and formula expressions.

## Features

- ✅ **Syntax Validation** - Checks for proper bracket matching, semicolons, and comments
- ✅ **Object Type Validation** - Validates against 100+ known object types
- ✅ **Property Type Checking** - Validates boolean, integer, float, Vector2, Rectangle, Formula, and more
- ✅ **Formula Validation** - Comprehensive validation of formula syntax with 100+ known functions
- ✅ **Categorized Parsing** - Smart parsing based on object categories (definitions, nested, instances, special)
- ✅ **Clone Support** - Validates `cloneFrom` usage
- ✅ **User-Friendly Errors** - Clear error messages with line numbers and suggestions
- ✅ **Web Interface** - Clean, modern web UI for easy validation

## Project Structure

```
mod-validator/
├── src/
│   ├── types.ts                 # Core type definitions
│   ├── lexer.ts                 # Tokenizer
│   ├── parser.ts                # Parser
│   ├── object-registry.ts       # Registry of 100+ object types
│   ├── formula-validator.ts     # Formula syntax validator
│   ├── property-validator.ts    # Property type validator
│   ├── validator.ts             # Main validator orchestrator
│   ├── index.ts                 # Public API
│   ├── mod-schema.json          # Auto-generated property schemas
│   └── test.ts                  # Test suite
├── public/
│   ├── index.html               # Web UI
│   ├── styles.css               # Styles
│   └── app.js                   # Browser app
├── dist/                        # Compiled JavaScript output
└── package.json
```

## Installation

```bash
cd mod-validator
npm install
```

## Building

### Build TypeScript modules
```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Build browser bundle (for static HTML)
```bash
npm run build:bundle
```

This creates a single bundled JavaScript file at `public/validator.bundle.js` that can be used directly in HTML without a web server.

## Running Tests

```bash
npm test
```

Runs the test suite with various mod code examples.

## Using the Web Interface

### As a Static Page (No Server Required)

1. Build the bundle: `npm run build:bundle`
2. Open `public/index.html` directly in your browser (file:// protocol works!)
3. Paste your mod code and click "Validate"

The validator runs entirely in the browser with no server needed.

### Alternative: With a Web Server

If you prefer to use a web server:
```bash
npm run build:bundle
cd public
python3 -m http.server 8000
# Open http://localhost:8000
```

## Mod File Format

Mod files use a simple text format:

```
[ObjectType]
property1 = value1;
property2 = value2;

[AnotherType]
ID = uniqueID;
someProperty = value;
```

### Object Categories

The validator organizes object types into categories:

1. **Definition Objects** - Standalone definitions that support `cloneFrom`
   - TerrainType, ActorType, ItemType, Action, Animation, etc.

2. **Nested Property Objects** - Modify parent objects
   - TerrainLight, ActorTypeLight, ItemLight, ActorTypeAoE, etc.

3. **Nested List Objects** - Add to parent object lists
   - TerrainReaction, ItemEffect, ActorValueReaction, Keyframe, etc.

4. **Instance Objects** - Runtime/save state
   - Actor, Fleet, Zone, Location, Item, etc.

5. **Special Objects** - Triggers, level data, effects
   - Trigger, GlobalTrigger, LevelData, SetPiece, etc.

### Property Types

- `boolean` - true/false
- `integer` - Whole numbers
- `float` - Decimal numbers
- `byte` - Numbers 0-255
- `string` - Text values
- `Vector2` - Two comma-separated floats: `x,y`
- `Rectangle` - Four comma-separated ints: `x,y,width,height`
- `TileCoord` - Same as Vector2
- `Formula` - Mathematical expressions
- `List<T>` - Comma-separated values (use `!` prefix to overwrite)

### Formulas

Formulas support:

**Operators**: `+`, `-`, `*`, `/`, `%`

**Variables**:
- `x`, `X` - Variable x
- `c:property` - Caster property
- `t:property` - Target property
- `w:property` - Weapon property
- `g:variable` - Global variable

**Functions** (100+ supported):
- Math: `abs`, `floor`, `ceiling`, `round`, `min`, `max`
- Comparison: `lessThan`, `moreThan`, `is`, `isNot`, `between`
- Actor: `cIs`, `tIs`, `cIsMoreThan`, `tIsLessThan`
- Game state: `gIs`, `gIsMoreThan`, `gTime`, `gTimeSince`
- Items: `item`, `partyItem`, `cargoItem`, `itemValue`
- Distance: `distance`, `tileDistance`, `distanceFleet`
- Combat: `hostile`, `evasionFacing`, `frontFacing`, `dark`
- Counting: `partySize`, `crewSize`, `fleetSize`, `numEnemiesWithin`
- Random: `rand`, `randSign`, `randID`
- And many more...

### Special Features

- **Comments**: `--` starts a comment (rest of line ignored)
- **Clone From**: `cloneFrom = existingID` inherits properties
- **List Overwrite**: `!propertyName = val1,val2` overwrites instead of appending
- **Duplicate Keys**: Automatically handled with `+` suffix

## API Usage

```typescript
import { ModValidator } from './validator.js';

const validator = new ModValidator();
const result = validator.validate(modFileContent);

if (result.valid) {
    console.log('✓ Valid mod file!');
} else {
    console.log(`✗ ${result.errors.length} errors found`);
    result.errors.forEach(err => {
        console.log(`Line ${err.line}: ${err.message}`);
    });
}
```

## Schema Extraction

The property schemas and type aliases are extracted from C# class files using `extract_schema.cjs`:

```bash
node extract_schema.cjs
```

This generates `src/mod-schema.json` with:
- **Property schemas** for 21 classes (field names and types)
- **Type aliases** for 33+ object types (e.g., `ItemLight` → `Light`, `ItemEffect` → `ActorValueEffect`)

The type aliases are automatically detected from `DataManager.cs` by analyzing the `createDataFromDict` method.

**Note**: The extraction script expects the C# source code in `../Tactics/` directory. The pre-generated schema is already included in `src/mod-schema.json`, so you don't need to run extraction unless updating from new C# code.

## Development

### Watch Mode

```bash
npm run watch
```

Automatically recompiles on file changes.

### Adding New Object Types

1. Add to `object-registry.ts` with appropriate metadata
2. Extract schema if C# class exists: update `extract_schema.js`
3. Rebuild: `npm run build`

### Adding New Formula Functions

Edit `formula-validator.ts` and add to the `FORMULA_FUNCTIONS` map with:
- Function name
- Min/max argument counts
- Description

## Future Enhancements

- **Language Server Protocol (LSP)** - Real-time validation in editors
- **Auto-completion** - Suggest object types and properties
- **Go-to-definition** - Jump to referenced IDs
- **Semantic validation** - Check if referenced IDs actually exist
- **More property types** - Enum validation, reference validation
- **Better error recovery** - Continue parsing after errors

## License

ISC

## Contributing

This validator was built by analyzing decompiled game code to understand the mod format. The categorization approach allows handling 100+ object types with just 5 parsing strategies.

Contributions welcome! Please add tests for new features.
