#!/usr/bin/env node
/**
 * Verifies every extraction job's data file against its citation sidecar.
 *
 * Each job in DOMAINS pairs a data file under ./src with an evidence file under
 * ./out. Two independent checks run over each pair:
 *
 *   1. Citation integrity - every evidence record points at a real line whose
 *      text actually contains the recorded snippet verbatim.
 *   2. Claim coverage - every claim the job's schema requires has at least one
 *      supporting evidence record, and no record supports a claim that does not
 *      exist in the data.
 *
 * Jobs whose data file is absent are skipped: an extraction that has not been
 * run yet is not a failure. A job whose data file exists without its evidence
 * file is a failure.
 *
 * Usage:
 *   node check-evidence.cjs                  # every job with a data file
 *   node check-evidence.cjs tasks formula    # named jobs only
 *   node check-evidence.cjs --complete       # also run end-of-run completeness
 *
 * The --complete checks (worklist coverage, cross-reference resolution) only
 * hold once a run has finished, so they are opt-in.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(__dirname, 'src', 'mod-schema.json');

/**
 * Vocabularies this checker enforces come from three places, and it matters
 * which is which when the game updates.
 *
 *   1. Derived from mod-schema.json (below, after the schema is loaded). These
 *      follow the decompiled code automatically, because the schema is
 *      re-extracted from it.
 *   2. Derived from a decompiled source file directly, where the schema does not
 *      reach - the formula context vocabulary. Also follows the code.
 *   3. Fixed here, because they are documentation taxonomy rather than anything
 *      the code declares. These do not drift with a game version; they change
 *      only when we decide to describe things differently, and each one mirrors
 *      a table in a prompt that must be edited alongside it.
 */

/** Category 3: mirrors the tables in prompts/shared/input-types.md. */
const PRIMITIVE_TYPES = ['string', 'float', 'integer', 'boolean', 'formula'];
const RESOURCE_TYPES = ['texture', 'font', 'color', 'sound', 'song', 'globalVar'];

/** Category 3: mirrors the tables in prompts/global-var-extraction.md. */
const VALUE_SHAPES = [
  'flag', 'counter', 'modifier', 'id', 'enum',
  'coord', 'cash', 'text', 'timestamp', 'composite',
];
const LIFETIMES = ['persistent', 'perRun', 'perCombat', 'perZone', 'perDay', 'perDialog'];
const CATEGORIES = [
  'achievement', 'combat', 'dialog', 'difficulty', 'economy', 'experience',
  'exploration', 'faction', 'fame', 'items', 'journal', 'player', 'quest',
  'statistics', 'ui', 'world_state', 'uncertain',
];

/**
 * Category 3, for tasks: these are conceptual groupings of ambient state, not
 * identifiers the code declares - 'actor' covers the task's actorID and the
 * actor derived from it, 'triggerArea' covers the bounds passed to executeTask.
 * There is nothing to derive them from; they mirror the table in
 * prompts/task-extraction.md.
 *
 * The formula vocabulary IS a list of identifiers - the parameters of
 * Formula.calculate - so it is read from the source instead. See
 * formulaContextVocabulary().
 */
const TASK_CONTEXT_VOCABULARY = ['actor', 'player', 'zone', 'dialogNode', 'triggerArea'];

// --- domain definitions ------------------------------------------------------

/**
 * Each domain describes one extraction job.
 *
 *   hasUses    - whether evidence records carry a `use` index.
 *   extraTypes - type names valid for this job on top of the shared vocabulary.
 *   coverage   - registers the claims this job's schema requires, and validates
 *                the parts of the entry the sidecar cannot speak to.
 */
const DOMAINS = [
  {
    name: 'dynamic-text',
    data: 'src/dynamic-text.jsonl',
    evidence: 'out/dynamic-text.evidence.jsonl',
    hasUses: true,
    extraTypes: [],
    coverage: coverUses,
    nested: { field: 'commands', keyOf: (entry, child) => `${entry.name}/${child.name}` },
  },
  {
    name: 'tasks',
    data: 'src/tasks.jsonl',
    evidence: 'out/tasks.evidence.jsonl',
    hasUses: true,
    extraTypes: ['taskString'],
    coverage: coverUses,
  },
  {
    name: 'formula',
    data: 'src/formula.jsonl',
    evidence: 'out/formula.evidence.jsonl',
    hasUses: true,
    extraTypes: ['mathOperator'],
    coverage: coverFormula,
  },
  {
    name: 'globalTriggers',
    data: 'src/globalTriggers.jsonl',
    evidence: 'out/globalTriggers.evidence.jsonl',
    hasUses: false,
    extraTypes: [],
    coverage: coverGlobalTriggers,
  },
  {
    name: 'globalvars',
    data: 'src/globalvars.jsonl',
    evidence: 'out/globalvars.evidence.jsonl',
    hasUses: false,
    extraTypes: [],
    coverage: coverGlobalVars,
    complete: completeGlobalVars,
  },
];

// --- shared helpers ----------------------------------------------------------

function loadSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Missing required file: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}
const SCHEMA = loadSchema();

/**
 * A class the checker derives a vocabulary from. Missing means the schema was
 * re-extracted from a version that no longer declares it, which is a fact about
 * the game worth stopping for rather than checking around.
 */
function schemaClass(name) {
  const definition = SCHEMA.schema[name];
  if (!definition || !Array.isArray(definition.fields)) {
    console.error(
      `mod-schema.json declares no '${name}' class, so its vocabulary cannot be derived. ` +
        `Re-run 'node extract_schema.cjs', or update check-evidence.cjs if the class is genuinely gone.`
    );
    process.exit(1);
  }
  return definition;
}

function schemaEnum(name) {
  const values = SCHEMA.enums[name];
  if (!values) {
    console.error(`mod-schema.json declares no '${name}' enum, so its values cannot be derived.`);
    process.exit(1);
  }
  return Object.keys(values);
}

const SCHEMA_TYPES = [...Object.keys(SCHEMA.schema), ...Object.keys(SCHEMA.enums)];

// Category 1: derived from the schema, so a version that adds a flag, a trigger
// effect parameter or an element is accepted without editing this file.
const TRIGGER_FLAGS = schemaClass('Trigger')
  .fields.filter(field => field.type === 'boolean')
  .map(field => field.name);
const TRIGGER_EFFECT_FIELDS = schemaClass('TriggerEffect').fields.map(field => field.name);
const ELEMENT_VALUES = schemaEnum('Element');

/** ID spaces a globalvars entry may point into. */
const ID_SPACES = new Set([...SCHEMA_TYPES, 'int', 'string']);

/**
 * Category 2: the formula context vocabulary is the parameter list of
 * Formula.calculate, which mod-schema.json does not cover. Read lazily, so a
 * run that checks other jobs does not need the decompiled source present.
 */
let formulaContextCache = null;
function formulaContextVocabulary() {
  if (formulaContextCache !== null) return formulaContextCache;

  const lines = sourceLines('./Tactics/Formula.cs');
  if (lines === null) {
    console.error(`Cannot derive the formula context vocabulary: ./Tactics/Formula.cs not found.`);
    process.exit(1);
  }
  const signature = lines.join('\n').match(/public\s+float\s+calculate\s*\(([^)]*)\)/);
  if (signature === null) {
    console.error(
      `Cannot derive the formula context vocabulary: no 'public float calculate(...)' signature ` +
        `in ./Tactics/Formula.cs. Update check-evidence.cjs if the entry point was renamed.`
    );
    process.exit(1);
  }
  formulaContextCache = signature[1]
    .split(',')
    .map(parameter => parameter.trim().split('=')[0].trim().split(/\s+/).pop())
    .filter(name => name !== undefined && name !== '');
  return formulaContextCache;
}

/** Lines of a cited file, or null when it does not exist. Read once per file. */
const sourceCache = new Map();
function sourceLines(relPath) {
  if (!sourceCache.has(relPath)) {
    const abs = path.resolve(REPO_ROOT, relPath);
    sourceCache.set(relPath, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null);
  }
  return sourceCache.get(relPath);
}

function readJsonl(absPath, failures) {
  const rel = path.relative(REPO_ROOT, absPath);
  return fs
    .readFileSync(absPath, 'utf8')
    .split('\n')
    .map((text, index) => ({ text, lineNo: index + 1 }))
    .filter(({ text }) => text.trim() !== '')
    .map(({ text, lineNo }) => {
      try {
        return { value: JSON.parse(text), lineNo };
      } catch (err) {
        failures.push(`${rel}:${lineNo}: invalid JSON: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

// --- coverage builders -------------------------------------------------------

/**
 * Registers the claims required by an entry shaped as { uses, aliases }, where
 * each use carries `required` / `optional` input arrays. Shared by the
 * dynamic-text and tasks jobs, which differ only in their type vocabulary and
 * in tasks carrying a `context` array.
 */
function coverUses(entry, key, ctx) {
  const { need, fail, allowedTypes, domain } = ctx;

  if (!Array.isArray(entry.uses) || entry.uses.length === 0) {
    fail(`'${key}' has no uses`);
    return;
  }

  entry.uses.forEach((use, useIndex) => {
    need(useIndex, 'behaviour', 'the use description');

    if (!isNonEmptyString(use.description)) {
      fail(`'${key}' use ${useIndex}: missing a description`);
    }

    for (const kind of ['required', 'optional']) {
      if (!Array.isArray(use[kind])) {
        fail(`'${key}' use ${useIndex}: '${kind}' must be an array`);
        continue;
      }
      for (const input of use[kind]) {
        if (!isNonEmptyString(input.name)) {
          fail(`'${key}' use ${useIndex}: ${kind} input is missing a string 'name'`);
          continue;
        }
        if (!isNonEmptyString(input.description)) {
          fail(`'${key}' use ${useIndex}: ${kind} input '${input.name}' has no description`);
        }
        checkType(input, allowedTypes, `'${key}' use ${useIndex}: ${kind} input '${input.name}'`, fail);
        need(useIndex, `${kind}:${input.name}`, `${kind} input '${input.name}'`);
        need(useIndex, `type:${input.name}`, `the type of input '${input.name}'`);
      }
    }

    coverContext(use, key, useIndex, ctx, domain.name);
  });

  coverAliases(entry, key, ctx);
}

function coverFormula(entry, key, ctx) {
  const { need, fail, allowedTypes, domain } = ctx;

  if (typeof entry.isFunctionStyle !== 'boolean') {
    fail(`'${key}' is missing a boolean 'isFunctionStyle'`);
  } else {
    need(0, 'functionStyle', `the 'isFunctionStyle' value`);
  }

  if (entry.delegatesTo !== undefined) {
    if (entry.delegatesTo !== 'd' && entry.delegatesTo !== 'm') {
      fail(`'${key}': 'delegatesTo' must be "d" or "m", got ${JSON.stringify(entry.delegatesTo)}`);
    } else {
      need(0, 'delegatesTo', 'the delegation target');
    }
  }

  if (!Array.isArray(entry.uses) || entry.uses.length === 0) {
    fail(`'${key}' has no uses`);
    return;
  }

  entry.uses.forEach((use, useIndex) => {
    need(useIndex, 'behaviour', 'the use description');
    need(useIndex, 'returns', `the 'returns' value`);

    if (!isNonEmptyString(use.description)) {
      fail(`'${key}' use ${useIndex}: missing a description`);
    }
    if (use.returns !== 'float' && use.returns !== 'boolean') {
      fail(`'${key}' use ${useIndex}: 'returns' must be "float" or "boolean", got ${JSON.stringify(use.returns)}`);
    }
    if (!isNonEmptyString(use.example)) {
      fail(`'${key}' use ${useIndex}: missing an 'example'`);
    }

    if (!Array.isArray(use.arguments)) {
      fail(`'${key}' use ${useIndex}: 'arguments' must be an array`);
    } else {
      if (entry.isFunctionStyle === true && use.arguments.length > 0) {
        fail(`'${key}' use ${useIndex}: marked function-style but declares ${use.arguments.length} argument(s)`);
      }
      for (const arg of use.arguments) {
        if (!isNonEmptyString(arg.name)) {
          fail(`'${key}' use ${useIndex}: an argument is missing a string 'name'`);
          continue;
        }
        if (!isNonEmptyString(arg.description)) {
          fail(`'${key}' use ${useIndex}: argument '${arg.name}' has no description`);
        }
        if (typeof arg.optional !== 'boolean') {
          fail(`'${key}' use ${useIndex}: argument '${arg.name}' needs a boolean 'optional'`);
        }
        checkType(arg, allowedTypes, `'${key}' use ${useIndex}: argument '${arg.name}'`, fail);
        need(useIndex, `argument:${arg.name}`, `argument '${arg.name}'`);
        need(useIndex, `type:${arg.name}`, `the type of argument '${arg.name}'`);
      }
    }

    coverContext(use, key, useIndex, ctx, domain.name);
  });

  coverAliases(entry, key, ctx);
}

function coverGlobalTriggers(entry, key, ctx) {
  const { need, fail } = ctx;

  for (const field of ['summary', 'whenFired']) {
    if (!isNonEmptyString(entry[field])) {
      fail(`'${key}' is missing '${field}'`);
    } else {
      need(null, field, `the '${field}' text`);
    }
  }

  if (!Array.isArray(entry.firedBy) || entry.firedBy.length === 0) {
    fail(`'${key}' needs a non-empty 'firedBy' array`);
  } else {
    entry.firedBy.forEach((_, index) => need(null, `firedBy:${index}`, `firedBy[${index}]`));
  }

  if (entry.requirementFormula !== undefined) {
    if (entry.requirementFormula === '1') {
      fail(`'${key}': 'requirementFormula' is the default "1" and must be omitted`);
    }
    need(null, 'requirementFormula', 'the requirement formula');
  }

  if (entry.triggeredByElement !== undefined) {
    if (!Array.isArray(entry.triggeredByElement) || entry.triggeredByElement.length === 0) {
      fail(`'${key}': 'triggeredByElement' must be a non-empty array when present`);
    } else {
      for (const element of entry.triggeredByElement) {
        if (!ELEMENT_VALUES.includes(element)) {
          fail(`'${key}': '${element}' is not a value of the Element enum`);
        }
      }
    }
    need(null, 'triggeredByElement', 'the triggering elements');
  }

  if (entry.flags !== undefined) {
    for (const [flag, value] of Object.entries(entry.flags)) {
      if (!TRIGGER_FLAGS.includes(flag)) {
        fail(`'${key}': unknown flag '${flag}'`);
        continue;
      }
      if (typeof value !== 'boolean') {
        fail(`'${key}': flag '${flag}' must be a boolean`);
      }
      need(null, `flag:${flag}`, `the non-default value of '${flag}'`);
    }
  }

  if (!Array.isArray(entry.effects)) {
    fail(`'${key}' is missing an 'effects' array`);
  } else {
    entry.effects.forEach((effect, index) => {
      if (typeof effect.effectID !== 'string') {
        fail(`'${key}' effect ${index}: 'effectID' must be a string`);
      }
      if (!isNonEmptyString(effect.description)) {
        fail(`'${key}' effect ${index}: missing a description`);
      }
      for (const field of Object.keys(effect)) {
        if (field !== 'description' && !TRIGGER_EFFECT_FIELDS.includes(field)) {
          fail(`'${key}' effect ${index}: '${field}' is not a field of TriggerEffect`);
        }
      }
      need(null, `effect:${index}:params`, `effect ${index}'s parameters`);
      need(null, `effect:${index}:behaviour`, `effect ${index}'s description`);
    });
  }

  checkSourceLine(entry, key, fail);
}

/** The Add call a trigger entry cites must really be that trigger's Add call. */
function checkSourceLine(entry, key, fail) {
  if (!Number.isInteger(entry.sourceLine) || entry.sourceLine < 1) {
    fail(`'${key}' needs a 1-based integer 'sourceLine'`);
    return;
  }
  const lines = sourceLines('./Tactics/Data.cs');
  if (lines === null) {
    fail(`'${key}': cannot verify sourceLine, ./Tactics/Data.cs not found`);
    return;
  }
  if (entry.sourceLine > lines.length) {
    fail(`'${key}': sourceLine ${entry.sourceLine} is past the end of ./Tactics/Data.cs`);
    return;
  }
  const line = lines[entry.sourceLine - 1];
  if (!line.includes(`globalTriggers.Add("${entry.name}"`)) {
    fail([
      `'${key}': sourceLine ${entry.sourceLine} is not this trigger's Add call`,
      `    actual: ${JSON.stringify(line.trim())}`,
    ].join('\n'));
  }
}

function coverGlobalVars(entry, key, ctx) {
  const { need, fail } = ctx;

  if (!isNonEmptyString(entry.description)) {
    fail(`'${key}' is missing a description`);
  } else {
    need(null, 'description', 'the description');
  }

  if (!VALUE_SHAPES.includes(entry.valueShape)) {
    fail(`'${key}': unknown valueShape ${JSON.stringify(entry.valueShape)}`);
  } else {
    need(null, 'valueShape', 'the value shape');
  }
  if (!LIFETIMES.includes(entry.lifetime)) {
    fail(`'${key}': unknown lifetime ${JSON.stringify(entry.lifetime)}`);
  } else {
    need(null, 'lifetime', 'the lifetime');
  }
  if (!CATEGORIES.includes(entry.category)) {
    fail(`'${key}': unknown category ${JSON.stringify(entry.category)}`);
  }

  // Shape-dependent fields, per the job's schema invariants.
  if (entry.valueShape === 'id') {
    if (!isNonEmptyString(entry.idType)) {
      fail(`'${key}': valueShape 'id' requires 'idType'`);
    } else if (!ID_SPACES.has(entry.idType)) {
      fail(`'${key}': idType '${entry.idType}' is not a class or enum in mod-schema.json`);
    }
  }
  if (entry.valueShape === 'enum' && (!Array.isArray(entry.enumValues) || entry.enumValues.length === 0)) {
    fail(`'${key}': valueShape 'enum' requires a non-empty 'enumValues'`);
  }
  if (entry.valueShape === 'modifier') {
    if (typeof entry.baseValue !== 'number') {
      fail(`'${key}': valueShape 'modifier' requires a numeric 'baseValue'`);
    }
    if (entry.modKind !== 'additive' && entry.modKind !== 'multiplicative') {
      fail(`'${key}': valueShape 'modifier' requires modKind 'additive' or 'multiplicative'`);
    }
  }

  const placeholders = [...entry.name.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  if (placeholders.length > 0) {
    if (entry.isTemplate !== true) {
      fail(`'${key}': name contains a placeholder, so 'isTemplate' must be true`);
    }
    const declared = Array.isArray(entry.params) ? entry.params.map(p => p.name) : [];
    for (const param of entry.params ?? []) {
      if (param.type !== undefined && !ID_SPACES.has(param.type)) {
        fail(`'${key}': param '${param.name}' has type '${param.type}', which is not a class or enum in mod-schema.json`);
      }
    }
    for (const placeholder of placeholders) {
      if (!declared.includes(placeholder)) {
        fail(`'${key}': placeholder '{${placeholder}}' has no entry in 'params'`);
      }
      need(null, `param:${placeholder}`, `the '${placeholder}' placeholder`);
    }
    for (const name of declared) {
      if (!placeholders.includes(name)) {
        fail(`'${key}': params declares '${name}', which is not a placeholder in the name`);
      }
    }
  } else if (entry.isTemplate === true) {
    fail(`'${key}': marked as a template but the name has no {placeholder}`);
  }

  for (const kind of ['setBy', 'readBy']) {
    if (!Array.isArray(entry[kind])) {
      fail(`'${key}': '${kind}' must be an array`);
      continue;
    }
    entry[kind].forEach((site, index) => {
      if (!isNonEmptyString(site.where)) {
        fail(`'${key}': ${kind}[${index}] is missing 'where'`);
      }
      need(null, `${kind}:${index}`, `${kind}[${index}]`);
    });
  }
}

/**
 * End-of-run checks for the globalvars job: every name on the worklist is
 * accounted for, and every cross-link resolves. Neither holds mid-run, which is
 * why they sit behind --complete.
 */
function completeGlobalVars(entries, fail) {
  const names = new Set(entries.map(e => e.name));
  const patterns = entries
    .filter(e => e.isTemplate === true)
    .map(e => new RegExp(`^${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[A-Za-z0-9_.-]+')}$`));

  for (const entry of entries) {
    for (const related of entry.related ?? []) {
      if (!names.has(related)) {
        fail(`'${entry.name}': related name '${related}' does not resolve to an entry`);
      }
    }
  }

  const worklistPath = path.join(__dirname, 'out', 'globalvars.worklist.md');
  if (!fs.existsSync(worklistPath)) {
    fail(`globalvars: out/globalvars.worklist.md is missing, so completeness cannot be checked`);
    return;
  }
  const errorsPath = path.join(__dirname, 'out', 'errors.md');
  const reviewLog = fs.existsSync(errorsPath) ? fs.readFileSync(errorsPath, 'utf8') : '';

  const worklist = fs
    .readFileSync(worklistPath, 'utf8')
    .split('\n')
    .map(line => line.split('<-')[0].trim())
    .filter(line => line !== '' && !line.startsWith('#'));

  for (const name of worklist) {
    if (names.has(name)) continue;
    if (patterns.some(pattern => pattern.test(name))) continue;
    if (reviewLog.includes(name)) continue;
    fail(`globalvars: worklist name '${name}' has no entry, no covering template, and no review-log note`);
  }
}

// --- coverage helpers shared by several domains ------------------------------

function coverAliases(entry, key, ctx) {
  const { need, fail } = ctx;
  if (!Array.isArray(entry.aliases)) {
    fail(`'${key}' is missing an 'aliases' array`);
    return;
  }
  // Aliases belong to the entry, not a use; they are recorded against use 0.
  for (const alias of entry.aliases) {
    need(0, `alias:${alias}`, `alias '${alias}'`);
  }
}

/** The context names a job's uses may declare, or null when it has no context field. */
function contextVocabulary(domainName) {
  if (domainName === 'tasks') return TASK_CONTEXT_VOCABULARY;
  if (domainName === 'formula') return formulaContextVocabulary();
  return null;
}

function coverContext(use, key, useIndex, ctx, domainName) {
  const { need, fail } = ctx;
  const vocabulary = contextVocabulary(domainName);
  if (vocabulary === null) return;

  if (!Array.isArray(use.context)) {
    fail(`'${key}' use ${useIndex}: 'context' must be an array`);
    return;
  }
  for (const name of use.context) {
    if (!vocabulary.includes(name)) {
      fail(`'${key}' use ${useIndex}: unknown context '${name}' (expected one of ${vocabulary.join(', ')})`);
      continue;
    }
    need(useIndex, `context:${name}`, `reading the '${name}' context`);
  }
}

function checkType(input, allowedTypes, where, fail) {
  if (!isNonEmptyString(input.type)) {
    fail(`${where} has no type`);
    return;
  }
  if (!allowedTypes.has(input.type)) {
    fail(
      `${where} has unknown type '${input.type}' ` +
        `(not a primitive, a named resource, a job-specific type, or a class/enum in mod-schema.json)`
    );
  }
}

// --- the run ----------------------------------------------------------------

function checkDomain(domain, runComplete) {
  const failures = [];
  const fail = message => failures.push(message);

  const dataPath = path.join(__dirname, domain.data);
  const evidencePath = path.join(__dirname, domain.evidence);

  if (!fs.existsSync(dataPath)) {
    return { skipped: `no ${domain.data}`, failures };
  }
  if (!fs.existsSync(evidencePath)) {
    fail(`${domain.name}: ${domain.data} exists but ${domain.evidence} does not`);
    return { failures };
  }

  const allowedTypes = new Set([
    ...PRIMITIVE_TYPES,
    ...RESOURCE_TYPES,
    ...domain.extraTypes,
    ...SCHEMA_TYPES,
  ]);

  // --- citation integrity ---
  const evidence = readJsonl(evidencePath, failures);
  const evidenceIndex = new Map(); // `${entity}\t${use}\t${claim}` -> count

  for (const { value: record, lineNo } of evidence) {
    const where = `${domain.evidence}:${lineNo}`;
    const before = failures.length;

    // 'entity' may legitimately be the empty string: the dynamic-text switch has
    // a `case "":` label, recorded as an entry whose name is "".
    if (typeof record.entity !== 'string') {
      fail(`${where}: field 'entity' must be a string`);
    }
    for (const field of ['claim', 'file', 'snippet']) {
      if (!isNonEmptyString(record[field])) {
        fail(`${where}: field '${field}' must be a non-empty string`);
      }
    }
    if (domain.hasUses) {
      if (!Number.isInteger(record.use) || record.use < 0) {
        fail(`${where}: field 'use' must be a non-negative integer, got ${JSON.stringify(record.use)}`);
      }
    } else if (record.use !== undefined) {
      fail(`${where}: this job's entries have no uses, so 'use' must be omitted`);
    }
    if (!Number.isInteger(record.line) || record.line < 1) {
      fail(`${where}: field 'line' must be a 1-based integer, got ${JSON.stringify(record.line)}`);
    }
    if (failures.length > before) continue;

    const lines = sourceLines(record.file);
    if (lines === null) {
      fail(`${where}: cited file does not exist: ${record.file}`);
      continue;
    }
    if (record.line > lines.length) {
      fail(`${where}: cited line ${record.line} is past end of ${record.file} (${lines.length} lines)`);
      continue;
    }
    if (!lines[record.line - 1].includes(record.snippet)) {
      fail([
        `${where}: snippet not found at ${record.file}:${record.line}`,
        `    wanted: ${JSON.stringify(record.snippet)}`,
        `    actual: ${JSON.stringify(lines[record.line - 1].trim())}`,
      ].join('\n'));
      continue;
    }

    const key = `${record.entity}\t${record.use ?? ''}\t${record.claim}`;
    evidenceIndex.set(key, (evidenceIndex.get(key) ?? 0) + 1);
  }

  // --- claim coverage ---
  const seenKeys = new Set();
  const entries = readJsonl(dataPath, failures);

  for (const { value: entry, lineNo } of entries) {
    const where = `${domain.data}:${lineNo}`;
    if (typeof entry.name !== 'string') {
      fail(`${where}: entry is missing a string 'name'`);
      continue;
    }

    const runCoverage = (target, key) => {
      const ctx = {
        domain,
        allowedTypes,
        fail: message => fail(`${where}: ${message}`),
        need: (use, claim, what) => {
          const indexKey = `${key}\t${domain.hasUses ? use ?? 0 : ''}\t${claim}`;
          seenKeys.add(indexKey);
          if (!evidenceIndex.has(indexKey)) {
            const scope = domain.hasUses ? ` use ${use ?? 0}` : '';
            fail(`${where}: '${key}'${scope}: no evidence for ${what} (claim '${claim}')`);
          }
        },
      };
      domain.coverage(target, key, ctx);
    };

    runCoverage(entry, entry.name);

    if (domain.nested && entry[domain.nested.field] !== undefined) {
      const children = entry[domain.nested.field];
      if (!Array.isArray(children)) {
        fail(`${where}: '${entry.name}' has a non-array '${domain.nested.field}' field`);
      } else {
        for (const child of children) {
          if (typeof child.name !== 'string') {
            fail(`${where}: '${entry.name}' has a ${domain.nested.field} member with no string 'name'`);
            continue;
          }
          runCoverage(child, domain.nested.keyOf(entry, child));
        }
      }
    }
  }

  for (const key of evidenceIndex.keys()) {
    if (!seenKeys.has(key)) {
      const [entity, use, claim] = key.split('\t');
      const scope = use === '' ? '' : ` use ${use}`;
      fail(`${domain.evidence}: orphan record: '${entity}'${scope} claim '${claim}' matches nothing in ${domain.data}`);
    }
  }

  if (runComplete && domain.complete) {
    domain.complete(entries.map(e => e.value), fail);
  }

  return { failures, records: evidence.length, entries: entries.length };
}

/**
 * Prints the vocabularies this run derived, so a human can confirm what a
 * schema re-extraction changed before trusting a pass or chasing a failure.
 */
function printVocabulary() {
  console.log(`Derived from mod-schema.json:`);
  console.log(`  Trigger flags:           ${TRIGGER_FLAGS.join(', ')}`);
  console.log(`  TriggerEffect fields:    ${TRIGGER_EFFECT_FIELDS.join(', ')}`);
  console.log(`  Element values:          ${ELEMENT_VALUES.length} value(s)`);
  console.log(`  Types (classes + enums): ${SCHEMA_TYPES.length} name(s)`);
  console.log(`Derived from ./Tactics/Formula.cs:`);
  console.log(`  Formula context:         ${formulaContextVocabulary().join(', ')}`);
  console.log(`Fixed here (documentation taxonomy, mirrors the prompts):`);
  console.log(`  Primitives:              ${PRIMITIVE_TYPES.join(', ')}`);
  console.log(`  Named resources:         ${RESOURCE_TYPES.join(', ')}`);
  console.log(`  Task context:            ${TASK_CONTEXT_VOCABULARY.join(', ')}`);
  console.log(`  Value shapes:            ${VALUE_SHAPES.join(', ')}`);
  console.log(`  Lifetimes:               ${LIFETIMES.join(', ')}`);
  console.log(`  Categories:              ${CATEGORIES.join(', ')}`);
}

function main() {
  const args = process.argv.slice(2);
  const runComplete = args.includes('--complete');
  const requested = args.filter(arg => !arg.startsWith('--'));

  if (args.includes('--vocabulary')) {
    printVocabulary();
    return;
  }

  const unknown = requested.filter(name => !DOMAINS.some(d => d.name === name));
  if (unknown.length > 0) {
    console.error(`Unknown job(s): ${unknown.join(', ')}`);
    console.error(`Known jobs: ${DOMAINS.map(d => d.name).join(', ')}`);
    process.exit(1);
  }

  const domains = requested.length > 0 ? DOMAINS.filter(d => requested.includes(d.name)) : DOMAINS;
  let total = 0;
  let checked = 0;

  for (const domain of domains) {
    const result = checkDomain(domain, runComplete);
    if (result.skipped) {
      console.log(`- ${domain.name}: skipped (${result.skipped})`);
      continue;
    }
    checked++;
    for (const failure of result.failures) console.error(failure);
    total += result.failures.length;
    if (result.failures.length === 0) {
      console.log(
        `- ${domain.name}: OK, ${result.records} evidence record(s) verified ` +
          `across ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'}.`
      );
    } else {
      console.error(`- ${domain.name}: ${result.failures.length} problem(s).\n`);
    }
  }

  if (checked === 0) {
    console.log('Nothing to check: no extraction output found.');
    return;
  }
  if (!runComplete) {
    console.log('(end-of-run completeness checks skipped; pass --complete to include them)');
  }
  if (total > 0) {
    console.error(`\n${total} problem(s) found.`);
    process.exit(1);
  }
}

main();
