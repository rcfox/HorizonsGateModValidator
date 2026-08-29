#!/usr/bin/env node
/**
 * Builds the reference data files under ./src from the JSONL an extraction run
 * produces, unifying every job on the same shape:
 *
 *   { "gameVersion": "...", "<collection>": [ ...entries ] }
 *
 * Each job reads ./src/<name>.jsonl when it exists. When it does not - because
 * that job has not been re-run since the last conversion - the existing
 * ./src/<name>.json is normalised in place instead, so a partial re-extraction
 * still leaves every file in the unified shape.
 *
 * Usage:
 *   node build-data.cjs                      # every job
 *   node build-data.cjs tasks formula        # named jobs only
 *   node build-data.cjs --game-version=1.6.07
 *   node build-data.cjs --check              # report what would change, write nothing
 */

const fs = require('fs');
const path = require('path');

/** Bump this when the decompiled source is updated to a new game build. */
const GAME_VERSION = '1.6.06';

const SRC = path.join(__dirname, 'src');

/**
 * sidecar names a generated file whose rows are merged onto the entries by name.
 * It is the only source for the fields it carries: anything merged in after
 * extraction is regenerated from the game's source, never carried forward from
 * the previous build, so a stale value cannot outlive the thing it described.
 *
 * drop names fields the extraction records for review but that should not ship
 * to the reference pages.
 */
const JOBS = [
  {
    name: 'tasks',
    collection: 'tasks',
    sidecar: { file: 'task-descriptions.json', collection: 'taskDescriptions' },
  },
  { name: 'formula', collection: 'operators' },
  { name: 'dynamic-text', collection: 'tags' },
  { name: 'globalTriggers', collection: 'globalTriggers', drop: ['sourceLine'] },
  { name: 'globalvars', collection: 'globalVars' },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const versionArg = args.find(a => a.startsWith('--game-version='));
const gameVersion = versionArg ? versionArg.slice('--game-version='.length) : GAME_VERSION;
const requested = args.filter(a => !a.startsWith('--'));

const unknown = requested.filter(n => !JOBS.some(j => j.name === n));
if (unknown.length > 0) {
  console.error(`Unknown job(s): ${unknown.join(', ')}`);
  console.error(`Known jobs: ${JOBS.map(j => j.name).join(', ')}`);
  process.exit(1);
}

const failures = [];

/** Entries of an existing .json, whatever shape it is in, keyed by name. */
function existingEntries(jsonPath, collection) {
  if (!fs.existsSync(jsonPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed[collection])) return parsed[collection];
  // An older file may have used a different collection name; take the sole array.
  const arrays = Object.values(parsed).filter(Array.isArray);
  if (arrays.length === 1) return arrays[0];
  return null;
}

function readJsonl(jsonlPath, job) {
  const entries = [];
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n');
  lines.forEach((text, index) => {
    if (text.trim() === '') return;
    try {
      entries.push(JSON.parse(text));
    } catch (err) {
      failures.push(`${job.name}: src/${job.name}.jsonl:${index + 1}: invalid JSON: ${err.message}`);
    }
  });
  return entries;
}

function buildJob(job) {
  const jsonlPath = path.join(SRC, `${job.name}.jsonl`);
  const jsonPath = path.join(SRC, `${job.name}.json`);
  const fromJsonl = fs.existsSync(jsonlPath);

  const old = existingEntries(jsonPath, job.collection);
  let entries;
  if (fromJsonl) {
    entries = readJsonl(jsonlPath, job);
  } else if (old !== null) {
    entries = old;
  } else {
    return { skipped: `no src/${job.name}.jsonl and no src/${job.name}.json` };
  }

  if (entries.length === 0) {
    failures.push(`${job.name}: no entries found`);
    return {};
  }

  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry.name !== 'string') {
      failures.push(`${job.name}: an entry has no string 'name'`);
      continue;
    }
    if (seen.has(entry.name)) failures.push(`${job.name}: duplicate entry name '${entry.name}'`);
    seen.add(entry.name);
  }

  // Fields merged in after extraction come from a generated sidecar and nowhere
  // else. A missing sidecar means those fields are simply absent this build.
  let merged = 0;
  let unmatched = 0;
  const sidecarPath = job.sidecar ? path.join(SRC, job.sidecar.file) : null;
  const haveSidecar = sidecarPath !== null && fs.existsSync(sidecarPath);

  if (job.sidecar && !haveSidecar) {
    failures.push(
      `${job.name}: ${job.sidecar.file} is missing. Generate it first, or the built file ` +
        `will silently lose the fields it supplies.`
    );
  } else if (haveSidecar) {
    const rows = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))[job.sidecar.collection];
    if (!Array.isArray(rows)) {
      failures.push(`${job.name}: ${job.sidecar.file} has no '${job.sidecar.collection}' array`);
    } else {
      const byName = new Map(rows.map(r => [r.name, r]));
      for (const entry of entries) {
        const row = byName.get(entry.name);
        if (!row) continue;
        for (const [field, value] of Object.entries(row)) {
          if (field !== 'name') entry[field] = value;
        }
        merged++;
      }
      for (const row of rows) {
        if (!seen.has(row.name)) unmatched++;
      }
    }
  }

  let dropped = 0;
  if (job.drop) {
    for (const entry of entries) {
      for (const field of job.drop) {
        if (entry[field] !== undefined) {
          delete entry[field];
          dropped++;
        }
      }
    }
  }

  const output = { gameVersion, [job.collection]: entries };
  const text = JSON.stringify(output, null, 2) + '\n';
  const changed = !fs.existsSync(jsonPath) || fs.readFileSync(jsonPath, 'utf8') !== text;
  if (!check && changed) fs.writeFileSync(jsonPath, text);

  return { count: entries.length, fromJsonl, dropped, changed, haveSidecar, merged, unmatched, sidecar: job.sidecar };
}

const jobs = requested.length > 0 ? JOBS.filter(j => requested.includes(j.name)) : JOBS;
for (const job of jobs) {
  const result = buildJob(job);
  if (result.skipped) {
    console.log(`- ${job.name}: skipped (${result.skipped})`);
    continue;
  }
  if (result.count === undefined) continue;

  const source = result.fromJsonl ? `${job.name}.jsonl` : `${job.name}.json (normalised in place)`;
  const state = check ? (result.changed ? 'WOULD CHANGE' : 'up to date') : result.changed ? 'written' : 'unchanged';
  console.log(`- ${job.name}: ${result.count} entries from ${source} -> {gameVersion, ${job.collection}[]} (${state})`);

  if (result.haveSidecar) {
    console.log(`    merged ${result.merged} row(s) from ${result.sidecar.file}`);
    if (result.unmatched > 0) {
      console.log(`    ${result.unmatched} row(s) in that file match no entry`);
    }
  }
  if (result.dropped > 0) {
    console.log(`    dropped ${result.dropped} review-only field(s) (${job.drop.join(', ')})`);
  }
}

if (failures.length > 0) {
  console.error();
  for (const f of failures) console.error(f);
  console.error(`\n${failures.length} problem(s) found; no files written for the affected job(s).`);
  process.exit(1);
}
console.log(`\ngameVersion: ${gameVersion}`);
