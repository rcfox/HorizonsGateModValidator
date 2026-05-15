# Job Description

Global variables are stored in ./Tactics/GameState.cs in the globalVars dictionary. Throughout the decompiled C# code, global variables are used to track internal game state for various things.

Some global variables' names are composed from multiple parts, like "D_{dialogNodeId}" indicates if a dialogNode has been seen before.

Global variables are often set via the `setGlobalVar` function and accessed via `getGlobalVar` or related functions. They might also be set by direct dictionary manipulation.

For every instance of a global variable being set or read, I want to record:

* Its name (literal) or a templated name with placeholders for composed names.
* What the variable represents in game terms.
* Its value shape (flag, counter, modifier, id, enum, coord, cash, text, timestamp, composite).
* Its lifetime (how long the value persists).
* Where and how it gets set, and where it gets read.
* Cross-links to related variables.

## Descriptions
Each description should be self-contained. Don't describe a global variable in terms of another variable unless they are meant to be used together (in which case, link them via `related`).

Prefer richer, more accurate descriptions over brevity. Aim for 1-3 sentences.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code.

If more information is needed about how code is executed, look under one of the Tactics subdirectories of this directory. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly in `notes` and in ./mod-validator/out/errors.md, then continue.

# Outputs

Record any errors or uncertainties to ./mod-validator/out/errors.md and continue with the rest of the variables.

The extraction output must go into ./mod-validator/src/globalvars.jsonl as JSONL. Each line is one JSON object describing a single global variable (or a templated family).

Never overwrite or recreate ./mod-validator/src/globalvars.jsonl. Always read it before writing. Only append or modify existing content.

## Entry Schema

```jsonc
{
  "name": "playerFaction",                  // literal name, OR template like "favor_{factionID}"
  "isTemplate": true,                       // OMIT when false; required true if name contains {placeholder}
  "params": [                               // required when isTemplate=true; one entry per placeholder
    {"name": "factionID", "type": "Faction.ID", "note": "plus the special 'pirate' value"}
  ],
  "description": "1-3 sentences in game terms.",
  "valueShape": "id",                       // see Value Shapes below
  "idType": "Faction.ID",                   // required when valueShape=id
  "enumValues": ["letter", "cargo", ""],    // required when valueShape=enum
  "baseValue": 0.25,                        // required when valueShape=modifier
  "modKind": "additive",                    // required when valueShape=modifier
  "lifetime": "persistent",                 // see Lifetimes below
  "category": "economy",                    // see Categories below
  "setBy": [
    {"where": "GameState.refreshTradeSpecial", "op": "set", "note": "monthly rollover"}
  ],
  "readBy": [
    {"where": "GameState.generateGossip", "note": "gossip about local demand"}
  ],
  "related": ["next_tradeSpecial_locID", "tradeSpecial_goodsID"],  // optional
  "notes": "Free-text caveat about edge cases or unverified claims."  // optional
}
```

**IMPORTANT**: The example above is presented across multiple lines for ease of viewing. Write the actual individual JSON objects on a single line each, with no comments.

### Field requirements summary

| Field | Required | Notes |
|---|---|---|
| `name` | always | Literal or template string. Templates contain `{placeholder}` segments. |
| `isTemplate` | when template | Omit (or set false) for literal names. Set `true` when `name` contains `{...}`. |
| `params` | when `isTemplate=true` | One object per placeholder. |
| `description` | always | 1-3 sentences. |
| `valueShape` | always | One of the values from "Value Shapes" below. |
| `idType` | when `valueShape=id` | The ID space the value points into. |
| `enumValues` | when `valueShape=enum` | Closed set of observed string values. Include `""` if empty is meaningful. |
| `baseValue` | when `valueShape=modifier` | The default the modifier is applied to (number). |
| `modKind` | when `valueShape=modifier` | `additive` or `multiplicative`. |
| `lifetime` | always | One of the values from "Lifetimes" below. |
| `category` | always | One of the values from "Categories" below. |
| `setBy` | always | Array of `{where, op, note?}`; empty array `[]` only when the var is genuinely never set in code. |
| `readBy` | always | Array of `{where, note?}`; empty array `[]` for write-only output channels. |
| `related` | optional | List of other entries' `name` values that are logically grouped with this one. Templated names match by exact template string. |
| `notes` | optional | Caveats, inferred semantics, or anything the validator should flag. |

### Value Shapes

Choose the single shape that best matches how the variable is **used by readers**, not how it is stored (everything is stored as a string under the hood).

| Shape | Meaning | Example |
|---|---|---|
| `flag` | 0 or 1, used as a boolean | `mapCompleted`, `ignoreHardcore` |
| `counter` | Cumulative integer (possibly with min/max bounds noted in description) | `grovesDiscovered`, `playerRank`, `fame_explore` |
| `modifier` | Tuning knob added/multiplied to a built-in base | `partySizeMod`, `marketRateMaxMod` |
| `id` | Identifier of a tracked entity in another data space | `playerFaction` → Faction.ID |
| `enum` | One of a fixed set of strings | `royalQuestType` → letter/cargo/defeat/... |
| `coord` | Tile coordinate (single axis) | `playerX`, `treasureTCY` |
| `cash` | Money amount in player currency | `moneyReserves`, `gpCollect_{locationID}` |
| `text` | Human-readable display string | `questLog`, `investigatorAnswer_{actorID}` |
| `timestamp` | Set primarily so readers can query worldTime via `getGlobalVarWorldTime` / `getGlobalVarWorldTimeSinceAssigned` | `questComplete_clearden`, `tracking_30d_{itemTypeID}` |
| `composite` | Packed / free-form data not covered by the above (comma-separated lists, format depending on a sibling enum, etc.) | `fledFrom`, `royalQuestGoal` |

### Lifetimes

| Lifetime | Meaning |
|---|---|
| `persistent` | Survives across mission runs and save/load. |
| `perRun` | Cleared at the start or end of a mission run (typically by `tSetRefreshGlobals` or the scoreScreen flow). |
| `perCombat` | Reset at combat start or combat end. |
| `perZone` | Reset on zone transition. |
| `perDay` | Refreshed on the new-day rollover. |
| `perDialog` | Short-lived within a dialog/UI session. |

### `setBy.op` vocabulary

| Op | Meaning |
|---|---|
| `set` | Direct assignment via `setGlobalVar(...)`. |
| `clear` | Removed via `clearGlobalVar(...)` or assigned an "empty" value (`0`, `""`). |
| `inc` | `modGlobalVar(..., +x)` with x > 0. |
| `dec` | `modGlobalVar(..., -x)` with x > 0. |
| `mod` | `modGlobalVar(...)` where the sign varies at runtime. |
| `init` | Seeded once at game start (typically `tStartGame`). |
| `appendString` | String concatenation via `setGlobalVar(..., getGlobalVar_string(...) + ...)`. |
| `snapshot` | One-shot capture of another value at a specific event (e.g., entering combat). |

When the operation is genuinely unknown, omit `op`; the `where` and `note` fields are still useful on their own.

### `setBy.where` / `readBy.where` conventions

* Concrete code locations: `"File.Method"` (e.g., `"GameState.refreshTradeSpecial"`).
* Trigger-based setters from `Data.cs`: `"<triggerID> trigger"` (e.g., `"tStartGame trigger"`).
* Dialog-data setters that live in `.txt` content files outside the decompiled C#: `"dialog specialEffect"` or `"<topic> dialog flow"` (e.g., `"trainer dialog flow"`).
* Modder-tunable knobs with no built-in setter: `"mod-defined"`.

### Categories

Reuse one of: `achievement`, `combat`, `dialog`, `difficulty`, `economy`, `experience`, `exploration`, `faction`, `fame`, `items`, `journal`, `player`, `quest`, `statistics`, `ui`, `world_state`, `uncertain`. Use `uncertain` only when no other category fits and the var's purpose is genuinely unclear.

### Worked examples

Literal flag (combat lifetime):
```
{"name":"turnNumber","description":"Index of the current combat turn, incremented at the start of each new turn.","valueShape":"counter","lifetime":"perCombat","category":"combat","setBy":[{"where":"ZoneManager.startNewTurn","op":"inc"}],"readBy":[{"where":"Actor","note":"records lastHPDamageTaken_turnNumber"}]}
```

Modifier:
```
{"name":"partySizeMod","description":"Additive modifier to the maximum landing party size. Default base is 5.","valueShape":"modifier","baseValue":5,"modKind":"additive","lifetime":"persistent","category":"player","setBy":[{"where":"mod-defined","op":"set"}],"readBy":[{"where":"GameState.getMaxPartySize"}]}
```

Templated id family:
```
{"name":"favor_{factionID}","isTemplate":true,"params":[{"name":"factionID","type":"Faction.ID","note":"plus the special 'pirate' value"}],"description":"Player's favor score with a specific faction. Clamped between -99 and getMaxFavor.","valueShape":"counter","lifetime":"persistent","category":"faction","setBy":[{"where":"GameState.modFavor","op":"mod","note":"clamped"},{"where":"tStartGame trigger","op":"set","note":"seeds favor_pirate to -9999"}],"readBy":[{"where":"FleetManager","note":"hostile engagement at <= -30"},{"where":"ItemType.getBuyPrice","note":"favor-based discount"}]}
```

Enum:
```
{"name":"royalQuestType","description":"Type of the player's active royal quest. Empty or '0' if no royal quest is active.","valueShape":"enum","enumValues":["letter","cargo","defeat","defeatbattle","defeatelite","alliance","item","grove",""],"lifetime":"persistent","category":"quest","setBy":[{"where":"GameState.refreshRoyalQuest","op":"set"}],"readBy":[{"where":"GameState.refreshRoyalQuest"}],"related":["royalQuestGoal","royalQuestFaction","questType"]}
```

### Schema invariants (validator-checkable)

* If `name` contains a `{` segment, then `isTemplate` must be `true` and `params` must include one entry per placeholder.
* `params[].type` should reference a known ID space (`Faction.ID`, `Location.ID`, `Actor.ID`, `ItemType.ID`, `ActorClass.ID`, `ActorValue.ID`, `Action.ID`, `ActorValueAffecter.ID`, `Zone.ID`, `DialogNode.ID`, `Sprite.ID`, `SetPiece.ID`) or a primitive (`int`, `string`).
* `valueShape=id` requires `idType`.
* `valueShape=enum` requires `enumValues`.
* `valueShape=modifier` requires `baseValue` and `modKind`.
* Entries named in `related` should themselves exist in the file (cross-links must resolve to other entries' `name` values).

# Execution Methodology

This is a long-running, unattended extraction process. Do not request user input, confirmations or additional permissions. Proceed autonomously using the provided tools and instructions. Do not stop to report progress.

Do not invent scripts to automate the population of any data.

Do not attempt to estimate total effort or validate global correctness.

Do not summarize, explain, or restate the extracted information in the message buffer.

Do not emit parsed data to the message buffer.
