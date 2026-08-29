#!/usr/bin/env node
/**
 * Extracts the game's own task documentation from the decompiled source into
 * ./src/task-descriptions.json, which build-data.cjs merges onto the extracted
 * task data as `officialDescription` and `consoleCommand`.
 *
 * Two tables in ./Tactics/Data.cs hold it:
 *
 *   taskDescriptions.Add(Task.TaskType.<name>, "...")   - documented tasks
 *   consoleCommandDescriptions.Add("<name>", "...")     - developer console commands
 *
 * A task documented in both tables with DIFFERENT text is an error: the two are
 * describing the same task in two voices - usually the task form versus the
 * console form - and picking one silently would hide whichever the game actually
 * shows. Identical text in both tables is just a duplicate and is taken as-is.
 *
 * Usage:
 *   node extract-task-descriptions.cjs
 *   node extract-task-descriptions.cjs --check           # report, write nothing
 *   node extract-task-descriptions.cjs --prefer=task     # resolve conflicts, task table wins
 *   node extract-task-descriptions.cjs --prefer=console  # resolve conflicts, console table wins
 */

const fs = require('fs');
const path = require('path');

const GAME_VERSION = '1.6.06';
const DATA_CS = path.resolve(__dirname, '..', 'Tactics', 'Data.cs');
const OUT = path.join(__dirname, 'src', 'task-descriptions.json');

const check = process.argv.includes('--check');
const preferArg = process.argv.find(a => a.startsWith('--prefer='));
const prefer = preferArg ? preferArg.slice('--prefer='.length) : null;
if (prefer !== null && prefer !== 'task' && prefer !== 'console') {
  console.error(`--prefer must be 'task' or 'console', got '${prefer}'`);
  process.exit(1);
}

const warnings = [];

if (!fs.existsSync(DATA_CS)) {
  console.error(`Missing required file: ${DATA_CS}`);
  process.exit(1);
}
const source = fs.readFileSync(DATA_CS, 'utf8').split('\n');

const TASK_RE = /^\s*taskDescriptions\.Add\(Task\.TaskType\.(\w+),\s*"(.*)"\);\s*$/;
const CONSOLE_RE = /^\s*consoleCommandDescriptions\.Add\("([^"]+)",\s*"(.*)"\);\s*$/;

const failures = [];
const taskDescriptions = new Map(); // TaskType name -> { text, line }
const consoleDescriptions = new Map();

source.forEach((text, index) => {
  const line = index + 1;
  let m = TASK_RE.exec(text);
  if (m) {
    if (taskDescriptions.has(m[1])) {
      failures.push(
        `Data.cs:${line}: taskDescriptions has a second entry for '${m[1]}' ` +
          `(first at line ${taskDescriptions.get(m[1]).line})`
      );
    }
    taskDescriptions.set(m[1], { text: m[2], line });
    return;
  }
  m = CONSOLE_RE.exec(text);
  if (m) {
    if (consoleDescriptions.has(m[1])) {
      failures.push(
        `Data.cs:${line}: consoleCommandDescriptions has a second entry for '${m[1]}' ` +
          `(first at line ${consoleDescriptions.get(m[1]).line})`
      );
    }
    consoleDescriptions.set(m[1], { text: m[2], line });
  }
});

// Documented in both tables. Identical text is a harmless duplicate; different
// text is two accounts of the same task and needs a person to choose.
let duplicates = 0;
let resolved = 0;
for (const [name, entry] of consoleDescriptions) {
  const other = taskDescriptions.get(name);
  if (!other) continue;
  if (other.text === entry.text) {
    duplicates++;
    continue;
  }
  if (prefer === 'task') {
    consoleDescriptions.set(name, { ...entry, text: other.text });
    resolved++;
  } else if (prefer === 'console') {
    taskDescriptions.delete(name);
    resolved++;
  } else {
    failures.push(
      `'${name}' is documented differently in both tables. Pass --prefer=task or --prefer=console, ` +
        `or reconcile them in the source.\n` +
        `    taskDescriptions   Data.cs:${other.line}: "${other.text}"\n` +
        `    consoleCommands    Data.cs:${entry.line}: "${entry.text}"`
    );
  }
}

/**
 * Both tables key on a TaskType name, which may be an alias of the canonical
 * entry the extraction recorded. Resolve each to its canonical name so the
 * descriptions land on the entry that exists in tasks.json.
 */
function loadTaskEntries() {
  const jsonl = path.join(__dirname, 'src', 'tasks.jsonl');
  const json = path.join(__dirname, 'src', 'tasks.json');
  if (fs.existsSync(jsonl)) {
    return fs
      .readFileSync(jsonl, 'utf8')
      .split('\n')
      .filter(l => l.trim() !== '')
      .map(l => JSON.parse(l));
  }
  if (fs.existsSync(json)) {
    const parsed = JSON.parse(fs.readFileSync(json, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.tasks;
  }
  console.error('Neither src/tasks.jsonl nor src/tasks.json exists; nothing to key descriptions against.');
  process.exit(1);
}

const entries = loadTaskEntries();
const canonicalOf = new Map();
for (const entry of entries) {
  canonicalOf.set(entry.name, entry.name);
  for (const alias of entry.aliases ?? []) canonicalOf.set(alias, entry.name);
}

/** canonical name -> { texts: [{ key, text, line }], consoleCommand } */
const merged = new Map();
function record(key, text, line, isConsole) {
  const canonical = canonicalOf.get(key);
  if (!canonical) {
    // A TaskType with no case body in executeTask is documented but not extracted;
    // it falls through to the default arm rather than doing anything of its own.
    warnings.push(`Data.cs:${line}: '${key}' matches no task entry, canonical or alias; description skipped`);
    return;
  }
  const entry = merged.get(canonical) ?? { texts: [], consoleCommand: false };
  entry.texts.push({ key, text, line });
  entry.consoleCommand = entry.consoleCommand || isConsole;
  merged.set(canonical, entry);
}

for (const [name, entry] of taskDescriptions) record(name, entry.text, entry.line, false);
for (const [name, entry] of consoleDescriptions) record(name, entry.text, entry.line, true);

/**
 * Several TaskType names can share one entry once aliases are folded, and each
 * may carry its own description. The entry's own name wins; failing that, a
 * single distinct text wins; anything else needs a person to look at it.
 */
function chooseDescription(canonical, entry) {
  const own = entry.texts.find(t => t.key === canonical);
  if (own) return own.text;

  const distinct = [...new Set(entry.texts.map(t => t.text))];
  if (distinct.length === 1) return distinct[0];

  const kept = entry.texts[0];
  const discarded = entry.texts.filter(t => t.text !== kept.text);
  warnings.push(
    `'${canonical}' has no description of its own and its aliases disagree; keeping '${kept.key}' ` +
      `(Data.cs:${kept.line}) and discarding ${discarded.map(d => `'${d.key}' (Data.cs:${d.line})`).join(', ')}`
  );
  return kept.text;
}

if (failures.length > 0) {
  if (warnings.length > 0) console.error('');
  for (const f of failures) console.error(f);
  console.error(`\n${failures.length} conflict(s) found; nothing written.`);
  process.exit(1);
}

const descriptions = [...merged.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, value]) => {
    const row = { name, officialDescription: chooseDescription(name, value) };
    if (value.consoleCommand) row.consoleCommand = true;
    return row;
  });

for (const w of warnings) console.warn(`warning: ${w}`);

const output = { gameVersion: GAME_VERSION, taskDescriptions: descriptions };
const text = JSON.stringify(output, null, 2) + '\n';
const changed = !fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text;
if (!check && changed) fs.writeFileSync(OUT, text);

const folded = descriptions.length - (taskDescriptions.size + consoleDescriptions.size);
if (duplicates > 0) console.log(`${duplicates} description(s) appear identically in both tables`);
if (resolved > 0) console.log(`${resolved} conflict(s) resolved by --prefer=${prefer}`);
console.log(
  `${taskDescriptions.size} task description(s) + ${consoleDescriptions.size} console command description(s) ` +
    `-> ${descriptions.length} entries` +
    (folded !== 0 ? ` (${-folded} folded onto a canonical name)` : '')
);
console.log(`${descriptions.filter(d => d.consoleCommand).length} marked as console commands`);
console.log(check ? (changed ? 'src/task-descriptions.json WOULD CHANGE' : 'src/task-descriptions.json up to date') : changed ? 'wrote src/task-descriptions.json' : 'src/task-descriptions.json unchanged');
