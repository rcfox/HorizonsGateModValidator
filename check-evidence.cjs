#!/usr/bin/env node
/**
 * Verifies ./src/dynamic-text.jsonl against ./out/dynamic-text.evidence.jsonl.
 *
 * Two independent checks:
 *   1. Citation integrity - every evidence record points at a real line whose
 *      text actually contains the recorded snippet verbatim.
 *   2. Claim coverage - every use description, every required/optional input,
 *      and every alias has at least one supporting evidence record.
 *
 * Exits non-zero if anything fails. Intended to be run after an extraction run.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(__dirname, 'src', 'dynamic-text.jsonl');
const EVIDENCE_PATH = path.join(__dirname, 'out', 'dynamic-text.evidence.jsonl');
const SCHEMA_PATH = path.join(__dirname, 'src', 'mod-schema.json');

const CLAIM_PATTERN = /^(behaviour|required:.+|optional:.+|type:.+|alias:.+)$/;

/**
 * Argument types an extraction run is allowed to use. Primitives and named game
 * resources are fixed; object-reference and enum types are taken from the schema
 * so this stays in sync when the schema is re-extracted. Type aliases are
 * deliberately excluded - references must use the canonical type name.
 */
const PRIMITIVE_TYPES = ['string', 'float', 'integer', 'formula'];
const RESOURCE_TYPES = ['texture', 'font', 'color', 'globalVar'];

function loadAllowedTypes() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Missing required file: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return new Set([
    ...PRIMITIVE_TYPES,
    ...RESOURCE_TYPES,
    ...Object.keys(schema.schema),
    ...Object.keys(schema.enums),
  ]);
}
const ALLOWED_TYPES = loadAllowedTypes();

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required file: ${filePath}`);
    process.exit(1);
  }
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((text, index) => ({ text, lineNo: index + 1 }))
    .filter(({ text }) => text.trim() !== '')
    .map(({ text, lineNo }) => {
      try {
        return { value: JSON.parse(text), lineNo };
      } catch (err) {
        console.error(`${path.relative(REPO_ROOT, filePath)}:${lineNo}: invalid JSON: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Lines of a cited source file, or null if it does not exist.
 * Cached so a large evidence set reads each file once.
 */
const sourceCache = new Map();
function sourceLines(relPath) {
  if (!sourceCache.has(relPath)) {
    const abs = path.resolve(REPO_ROOT, relPath);
    sourceCache.set(relPath, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null);
  }
  return sourceCache.get(relPath);
}

// --- Check 1: citation integrity -------------------------------------------

const evidence = readJsonl(EVIDENCE_PATH);
const evidenceIndex = new Map(); // `${tag}\t${use}\t${claim}` -> count

for (const { value: rec, lineNo } of evidence) {
  const where = `evidence:${lineNo}`;
  const before = failures.length;

  // 'tag' may legitimately be the empty string: the dynamic-text switch has a
  // `case "":` label, recorded as an entry whose name is "".
  if (typeof rec.tag !== 'string') {
    fail(where, `field 'tag' must be a string`);
  }
  for (const field of ['claim', 'file', 'snippet']) {
    if (typeof rec[field] !== 'string' || rec[field] === '') {
      fail(where, `field '${field}' must be a non-empty string`);
    }
  }
  if (!Number.isInteger(rec.use) || rec.use < 0) {
    fail(where, `field 'use' must be a non-negative integer, got ${JSON.stringify(rec.use)}`);
  }
  if (!Number.isInteger(rec.line) || rec.line < 1) {
    fail(where, `field 'line' must be a 1-based integer, got ${JSON.stringify(rec.line)}`);
  }
  if (typeof rec.claim === 'string' && !CLAIM_PATTERN.test(rec.claim)) {
    fail(where, `unrecognised claim '${rec.claim}'`);
  }
  if (failures.length > before) continue;

  const lines = sourceLines(rec.file);
  if (lines === null) {
    fail(where, `cited file does not exist: ${rec.file}`);
    continue;
  }
  if (rec.line > lines.length) {
    fail(where, `cited line ${rec.line} is past end of ${rec.file} (${lines.length} lines)`);
    continue;
  }
  if (!lines[rec.line - 1].includes(rec.snippet)) {
    fail(where, [
      `snippet not found at ${rec.file}:${rec.line}`,
      `    wanted: ${JSON.stringify(rec.snippet)}`,
      `    actual: ${JSON.stringify(lines[rec.line - 1].trim())}`,
    ].join('\n'));
    continue;
  }

  const key = `${rec.tag}\t${rec.use}\t${rec.claim}`;
  evidenceIndex.set(key, (evidenceIndex.get(key) ?? 0) + 1);
}

// --- Check 2: claim coverage -----------------------------------------------

const seenKeys = new Set();

function checkEntry(entry, tagKey, where) {
  if (!Array.isArray(entry.uses) || entry.uses.length === 0) {
    fail(where, `'${tagKey}' has no uses`);
    return;
  }

  entry.uses.forEach((use, useIndex) => {
    const need = (claim, what) => {
      const key = `${tagKey}\t${useIndex}\t${claim}`;
      seenKeys.add(key);
      if (!evidenceIndex.has(key)) {
        fail(where, `'${tagKey}' use ${useIndex}: no evidence for ${what} (claim '${claim}')`);
      }
    };

    need('behaviour', 'the use description');

    for (const kind of ['required', 'optional']) {
      if (!Array.isArray(use[kind])) {
        fail(where, `'${tagKey}' use ${useIndex}: '${kind}' must be an array`);
        continue;
      }
      for (const arg of use[kind]) {
        if (typeof arg.name !== 'string' || arg.name === '') {
          fail(where, `'${tagKey}' use ${useIndex}: ${kind} input is missing a string 'name'`);
          continue;
        }
        if (typeof arg.description !== 'string' || arg.description === '') {
          fail(where, `'${tagKey}' use ${useIndex}: ${kind} input '${arg.name}' has no description`);
        }
        if (typeof arg.type !== 'string' || arg.type === '') {
          fail(where, `'${tagKey}' use ${useIndex}: ${kind} input '${arg.name}' has no type`);
        } else if (!ALLOWED_TYPES.has(arg.type)) {
          fail(
            where,
            `'${tagKey}' use ${useIndex}: ${kind} input '${arg.name}' has unknown type '${arg.type}' ` +
              `(not a primitive, a named resource, or a class/enum in mod-schema.json)`
          );
        }
        need(`${kind}:${arg.name}`, `${kind} input '${arg.name}'`);
        need(`type:${arg.name}`, `the type of input '${arg.name}'`);
      }
    }
  });

  if (!Array.isArray(entry.aliases)) {
    fail(where, `'${tagKey}' is missing an 'aliases' array`);
    return;
  }
  for (const alias of entry.aliases) {
    // Aliases belong to the entry, not a use; they are recorded against use 0.
    const key = `${tagKey}\t0\talias:${alias}`;
    seenKeys.add(key);
    if (!evidenceIndex.has(key)) {
      fail(where, `'${tagKey}': no evidence for alias '${alias}' (claim 'alias:${alias}')`);
    }
  }
}

for (const { value: entry, lineNo } of readJsonl(DATA_PATH)) {
  const where = `dynamic-text.jsonl:${lineNo}`;
  if (typeof entry.name !== 'string') {
    fail(where, `entry is missing a string 'name'`);
    continue;
  }
  checkEntry(entry, entry.name, where);

  if (entry.commands !== undefined) {
    if (!Array.isArray(entry.commands)) {
      fail(where, `'${entry.name}' has a non-array 'commands' field`);
    } else {
      for (const cmd of entry.commands) {
        if (typeof cmd.name !== 'string') {
          fail(where, `'${entry.name}' has a subcommand with no string 'name'`);
          continue;
        }
        checkEntry(cmd, `${entry.name}/${cmd.name}`, where);
      }
    }
  }
}

for (const key of evidenceIndex.keys()) {
  if (!seenKeys.has(key)) {
    const [tag, use, claim] = key.split('\t');
    fail('evidence', `orphan record: '${tag}' use ${use} claim '${claim}' matches nothing in dynamic-text.jsonl`);
  }
}

// --- Report ----------------------------------------------------------------

if (failures.length > 0) {
  for (const f of failures) console.error(f);
  console.error(`\n${failures.length} problem(s) found.`);
  process.exit(1);
}
console.log(`OK: ${evidence.length} evidence records verified, all claims covered.`);
