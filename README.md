# Horizon's Gate Mod Validator

## Installation

```bash
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

## Schema Extraction

The property schemas and type aliases are extracted from C# class files using `extract_schema.cjs`:

```bash
node extract_schema.cjs
```
This generates `src/mod-schema.json`


**Note**: The extraction script expects the decompiled C# source code in `../Tactics/` directory. The pre-generated schema is already included in `src/mod-schema.json`, so you don't need to run extraction unless updating from new C# code.

