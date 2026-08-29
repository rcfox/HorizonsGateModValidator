# Job Description

Global variables are the game's own persistent key/value store, held in the
`globalVars` dictionary in `./Tactics/GameState.cs`. The engine uses them to
track state of every kind, and mods read and write the same store.

They are usually set via `setGlobalVar` and read via `getGlobalVar` or
`getGlobalVar_string`, but they are also modified in place, cleared, read for
their assignment time, and occasionally manipulated through the dictionary
directly. Some names are composed at runtime from several parts — `D_{dialogNodeID}`
records whether a dialog node has been seen — and those are documented as one
templated family rather than one entry per possible name.

For each global variable or templated family, capture:

* Its literal name, or a template with placeholders for the composed parts.
* What it represents in game terms.
* Its value shape, its lifetime, and its category.
* Where it is set, and where it is read.
* Cross-links to related variables.

# Shared rules

Read these before starting. The rules in them apply in full.

* `./mod-validator/prompts/shared/descriptions.md`
* `./mod-validator/prompts/shared/evidence.md`
* `./mod-validator/prompts/shared/investigation.md`
* `./mod-validator/prompts/shared/review-log.md`
* `./mod-validator/prompts/shared/execution.md`

This job has no `uses` array, no inputs and no aliases, so `use-cases.md`,
`inputs.md`, `input-types.md` and `aliases.md` do not apply.

## Bindings

| Placeholder | Value |
|---|---|
| `{ENTITY}` / `{ENTITY_PLURAL}` | global variable / global variables |
| `{DATA_FILE}` | `./mod-validator/src/globalvars.jsonl` |
| `{EVIDENCE_FILE}` | `./mod-validator/out/globalvars.evidence.jsonl` |
| `{ENTITY_KEY_NOTE}` | The entry's `name`, including the `{placeholder}` segments for a templated family. |
| `{USE_FIELD_REQUIRED}` | never — entries have no `uses` array, so omit the field |
| `{ENUMERATION_ORDER}` | the order of the worklist file described below |
| `{RESUME_RULE}` | the worklist: find the last recorded entry's name in the worklist, and continue from the next worklist name that is not already covered by an entry |
| `{COMPLETENESS_CHECK}` | Every worklist name is covered — by an entry of its own, by a templated entry whose pattern it matches, or by a review-log note explaining why it is out of scope. |

Unlike the other extraction jobs, this one has no switch statement to walk. The
worklist below takes its place, and it is what makes the run resumable.

# Phase 1: build the worklist

Do this once, before extracting anything. If
`./mod-validator/out/globalvars.worklist.md` already exists, the worklist has
already been built: use it as-is and go straight to phase 2. Never rebuild or
reorder an existing worklist — the run's resume point depends on it staying
fixed.

Gather candidate names from all of these:

```
# names given as string literals to an accessor
grep -rhoE '(get|set|mod|clear|has)GlobalVar[A-Za-z_]*\("[^"]+"' ./Tactics/ ./Tactics.UI/ ./Tactics.Dialog/ | sed -E 's/.*\("//; s/"$//' | sort -u

# names built by concatenation - these become templated families
grep -rnE '(get|set|mod|clear|has)GlobalVar[A-Za-z_]*\("[^"]*" *\+' ./Tactics/ ./Tactics.UI/ ./Tactics.Dialog/
grep -rnE '(get|set|mod|clear|has)GlobalVar[A-Za-z_]*\([^)]*\+ *"' ./Tactics/ ./Tactics.UI/ ./Tactics.Dialog/

# direct manipulation of the dictionary
grep -rnE 'globalVars\[' ./Tactics/ ./Tactics.UI/ ./Tactics.Dialog/

# variables written by the engine's own triggers
grep -rnE 'TriggerEffect\("(set|mod|clear)GlobalVar' ./Tactics/Data.cs

# names used by the shipped game data, including ones no C# literal mentions
grep -rhoE '\bg:[A-Za-z0-9_]+' ./Data/ --include=*.txt | sed 's/^g://' | sort -u
```

Merge the results into `./mod-validator/out/globalvars.worklist.md`, one name per
line, sorted lexicographically, in this format:

```
# globalvars worklist
# built <date>; do not reorder or rebuild

favor_{factionID}    <- concatenation in GameState.modFavor
mapCompleted         <- literal
questLog             <- literal, also g: in Data/SystemData
```

Rules for the worklist:

* A name built by concatenation goes in once, as its template, not once per
  observed value.
* A name whose first segment is already covered by a template goes in only if it
  is a genuine special case worth its own entry — otherwise leave it out and let
  the template cover it.
* A name that a modder supplies at runtime (the accessor is handed a value from a
  task or dialog argument rather than a literal) is not a global variable of the
  game's own; do not list it.
* When in doubt, include the name. A name that turns out to be out of scope is
  cheap: record why in the review log during phase 2.

Write the worklist once, with `Write`, and then leave it alone. It is the only
file in these jobs that is not append-only, because it is written exactly once.

# Phase 2: extract

Work the worklist top to bottom, one name at a time, under
`shared/execution.md`. For each name:

1. Find every site that writes it and every site that reads it. Grep for the
   literal name, and for a template, for its fixed prefix.
2. Read enough of each site to say what the value means and when it changes.
3. Decide its value shape, lifetime and category from the vocabularies below.
4. Write the entry and its evidence records.

When a worklist name turns out to be covered by a family you have already
recorded, do not write a second entry. Record the decision in the review log,
naming both the worklist name and the covering template, so the completeness
check can account for it.

# Value shapes

Choose the single shape that best matches how the variable is **used by
readers**, not how it is stored — everything is a string underneath.

| Shape | Meaning | Example |
|---|---|---|
| `flag` | 0 or 1, used as a boolean | `mapCompleted`, `ignoreHardcore` |
| `counter` | Cumulative integer, bounds noted in the description | `grovesDiscovered`, `playerRank` |
| `modifier` | Tuning knob added to or multiplied with a built-in base | `partySizeMod`, `marketRateMaxMod` |
| `id` | Identifier of something in another data space | `playerFaction` |
| `enum` | One of a fixed set of strings | `royalQuestType` |
| `coord` | A single tile coordinate axis | `playerX`, `treasureTCY` |
| `cash` | Money in player currency | `moneyReserves`, `gpCollect_{locationID}` |
| `text` | Human-readable display string | `questLog` |
| `timestamp` | Set so readers can ask how long ago it was assigned | `questComplete_clearden` |
| `composite` | Packed or free-form data none of the above covers | `fledFrom`, `royalQuestGoal` |

# Lifetimes

| Lifetime | Meaning |
|---|---|
| `persistent` | Survives across mission runs and save/load. |
| `perRun` | Cleared at the start or end of a mission run. |
| `perCombat` | Reset at combat start or combat end. |
| `perZone` | Reset on zone transition. |
| `perDay` | Refreshed on the new-day rollover. |
| `perDialog` | Short-lived within a dialog or UI session. |

A lifetime other than `persistent` needs a clearing site to back it. If you
cannot find one, the variable is `persistent` — say so, and note in the review
log if that reading surprises you.

# Categories

Reuse one of: `achievement`, `combat`, `dialog`, `difficulty`, `economy`,
`experience`, `exploration`, `faction`, `fame`, `items`, `journal`, `player`,
`quest`, `statistics`, `ui`, `world_state`, `uncertain`. Use `uncertain` only
when no other category fits and the variable's purpose is genuinely unclear.

The three vocabularies above — shapes, lifetimes and categories — are
documentation choices rather than anything the game declares, so a version update
does not change them. `check-evidence.cjs` holds its own copy of each; if you
change one here, change it there too.

# Where it is set and read

`setBy` and `readBy` are structured code-location fields, not prose, and are the
one exception to the rule in `shared/descriptions.md` against naming code. Their
`note` fields are prose and follow the usual rules.

`op` vocabulary for `setBy`:

| Op | Meaning |
|---|---|
| `set` | Direct assignment. |
| `clear` | Removed, or assigned an empty value (`0`, `""`). |
| `inc` / `dec` | Modified by a fixed positive / negative amount. |
| `mod` | Modified by an amount whose sign varies at runtime. |
| `init` | Seeded once at game start. |
| `appendString` | Concatenated onto the existing value. |
| `snapshot` | One-shot capture of another value at a specific event. |

Omit `op` when the operation is genuinely unknown; `where` and `note` still carry
their weight.

`where` conventions:

* Code locations: `"File.Method"`, for example `"GameState.refreshTradeSpecial"`.
* Engine triggers from `Data.cs`: `"<triggerID> trigger"`.
* Setters that live in the shipped `.txt` content rather than the C#:
  `"dialog specialEffect"` or `"<topic> dialog flow"`.
* A knob with no built-in setter, meant for mods to set: `"mod-defined"`.

# Outputs

## Global variable data

Entries go into `./mod-validator/src/globalvars.jsonl`:

```
{
  "name": "favor_{factionID}",
  "isTemplate": true,
  "params": [{"name": "factionID", "type": "Faction", "note": "plus the special 'pirate' value"}],
  "description": "The player's standing with one faction. Clamped between -99 and the current maximum favor.",
  "valueShape": "counter",
  "lifetime": "persistent",
  "category": "faction",
  "setBy": [
    {"where": "GameState.modFavor", "op": "mod", "note": "clamped"},
    {"where": "tStartGame trigger", "op": "set", "note": "seeds pirate favor to -9999"}
  ],
  "readBy": [
    {"where": "FleetManager", "note": "hostile engagement at -30 or below"},
    {"where": "ItemType.getBuyPrice", "note": "favor-based discount"}
  ],
  "related": ["playerFaction"],
  "notes": "..."
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | always | Literal name, or a template containing `{placeholder}` segments. |
| `isTemplate` | when template | `true` when `name` contains `{...}`. Omit otherwise. |
| `params` | when `isTemplate` | One object per placeholder: `name`, `type`, optional `note`. |
| `description` | always | 1-3 sentences in game terms. |
| `valueShape` | always | One name from the Value shapes table. |
| `idType` | when `valueShape` is `id` | The ID space the value points into, as a canonical name from `mod-schema.json`. |
| `enumValues` | when `valueShape` is `enum` | The closed set of observed values. Include `""` when empty is meaningful. |
| `baseValue` | when `valueShape` is `modifier` | The number the modifier applies to. |
| `modKind` | when `valueShape` is `modifier` | `additive` or `multiplicative`. |
| `lifetime` | always | One name from the Lifetimes table. |
| `category` | always | One name from the Categories list. |
| `setBy` | always | Array of `{where, op?, note?}`. Empty only when genuinely never set in code. |
| `readBy` | always | Array of `{where, note?}`. Empty only for a write-only output channel. |
| `related` | optional | Names of other entries logically grouped with this one. Templates are referenced by their exact template string. |
| `notes` | optional | Caveats, inferred semantics, anything the validator should flag. |

`params[].type` should name a canonical class or enum from
`./mod-validator/src/mod-schema.json`, or a primitive (`int`, `string`). Every
name in `related` should resolve to another entry in the file.

## Evidence claims

Entries have no `uses` array, so evidence records for this job omit the `use`
field. The claim vocabulary for `{EVIDENCE_FILE}`:

| Claim | Supports | Required |
|---|---|---|
| `description` | what the variable represents | one per entry |
| `valueShape` | the recorded shape; cite a line showing how a reader uses the value | one per entry |
| `lifetime` | the recorded lifetime; cite the clearing site, or the setter when `persistent` | one per entry |
| `param:<name>` | that placeholder existing and its type; cite the line that composes the name | one per entry in `params` |
| `setBy:<index>` | that write site | one per `setBy` entry |
| `readBy:<index>` | that read site | one per `readBy` entry |

`category`, `related` and `notes` need no evidence records — they are
organisational judgement, not claims about the source.

A `setBy` or `readBy` entry whose `where` points at shipped `.txt` content rather
than C# cites that data file: the same file/line/snippet rules apply, and
`./Data/` paths are valid citations.
