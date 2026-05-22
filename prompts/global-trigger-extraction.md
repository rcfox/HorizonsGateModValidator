# Job Description

Global triggers are stored in `./Tactics/Data.cs` in the `globalTriggers` dictionary, keyed by name. The canonical list is built in `Data.loadGlobalTriggers()` via a long sequence of `globalTriggers.Add(...)` statements. Each entry is a `Trigger` object holding a `name`, optional flags, an optional requirement formula (`reqFormula`), an optional list of `Element` enum values that fire it (`triggeredByElement`), and an ordered list of `TriggerEffect` actions.

Global triggers can also be created or extended by data files via the `GlobalTrigger` and `GlobalTriggerEffect` row types handled in `./Tactics/DataManager.cs`. Those data-driven additions are out of scope for this extraction; only document the entries built in `loadGlobalTriggers()`.

For every global trigger I want to record:

* Its name (the dictionary key used by `Data.globalTriggers[name]`).
* A one-line summary modders can use to identify it at a glance.
* When it fires, described in game terms (not "ZoneManager.cs:1394 calls executeTrigger").
* Which concrete dispatchers actually invoke it (engine call sites in `./Tactics/*` or `./Tactics.Dialog/*`, dialog effects, or other triggers that name it).
* Its requirement formula, if any (omit when the default `"1"` is used).
* The `Element` enum values that fire it, if any.
* Any non-default trigger flags (see Flags below).
* The full ordered list of `TriggerEffect`s with their per-effect parameters and a game-terms description.
* Notes covering caveats, runtime mutation of effect parameters by engine code, naming-vs-internal-aliasID mismatches, or anything else a modder should be warned about.
* The source line of the `globalTriggers.Add(...)` call in `Data.cs` (for traceability).

## How TriggerEffect parameters reach a Task

When a `TriggerEffect` fires, the engine constructs a `Task` from it (see `Task(TriggerEffect)` constructor in `./Tactics/Task.cs`). The mapping is:

| `TriggerEffect` field | Task input | Notes |
|---|---|---|
| `effectID` | `TaskType` (parsed via `Enum.TryParse`) | If `effectID` parses as a `TaskType`, it is treated as a task name; the Task constructor falls through to that switch case in `executeTask`. |
| `sValue` | `strings[0]` | |
| `sValue2` | `strings[1]` | |
| `fValue` | `floats[0]` | |
| `xValue`, `yValue` | `tileCoords[0]` | combined into a single `TileCoord(xValue, yValue)` |
| `bValue1` | `bools[0]` | |
| `bValue2` | `bools[1]` | |
| `fReq` | `Task.fReq` | additional formula gate on the task |
| `delay` | handled by `executeTriggerEffect` before the task is constructed | delays execution via `ZoneManager.triggerTimers`; not passed to the Task itself |

When the `effectID` is a comma-separated taskString (e.g. `"cameraAtPoint,9,2,@0.01"`), the Task constructor takes the `createTaskFromSingleString` path instead — see `Task.cs`. The `sValue`/`fValue`/etc. on the TriggerEffect are ignored in that case.

## Where to look up effect behaviour

For each effect's `effectID`, the canonical implementation lives in `./Tactics/Task.cs` under the `executeTask` switch on `TaskType` (or the parallel switch in `executeTask_old`). Read the case body to write the effect description.

* `tasks.json` is **generated** from `Task.cs`; do not use it as the primary source. Reading Task.cs directly produces more accurate descriptions and surfaces flag semantics (the meaning of `bools[0]`/`bools[1]`/`floats[0]`/etc.) that the generated docs may flatten.
* If a task case body delegates to a helper method on `ZoneManager`, `Actor`, `Game1`, `InputManager`, `Tasker`, `SoundManager`, `UIManager`, or `Globals`, briefly read the helper to confirm what it actually does in game terms.
* If the effectID does not match any `TaskType`, also check the legacy `executeTriggerEffect_old` switch in `./Tactics/TriggerEffect.cs` for the case body. Note in `errors.md` when a global-trigger effect resolves only via the legacy switch.
* If the effectID is empty, treat the effect as a no-op placeholder and note this in `errors.md`.

## How to determine `whenFired` and `firedBy`

Determine the engine-side dispatchers by grepping for the trigger name across `./Tactics/` and `./Tactics.Dialog/`:

1. Direct fires: `Data.globalTriggers["<name>"].executeTrigger(...)` — these are the canonical engine call sites and should be quoted in `firedBy` with a game-terms summary.
2. Indirect fires via the `trigger` task effect (`Task.cs` `trigger` case): any trigger or dialog effect can fire by name. Use the generic `"Other triggers via the 'trigger' task effect"` or `"Dialog effects"` for these. Do not enumerate every possible caller.
3. Auto-installation by zones: `Zone.cs` clones `tEnterProcZone` into every procgen zone and clones any global trigger whose name appears in a zone's `LevelData.triggers` list. When a trigger's name strongly implies zone attachment (e.g. `tEnterPort`, `tEnterLoc`, `tEnterDojo`, `tEnterGrove`), record this as `"Zones that list '<name>' in their LevelData triggers"`. Mark this as an inference in `notes` if not confirmed against actual LevelData.
4. Element-driven fires: when `triggeredByElement` is non-empty, the engine fires the trigger when the named element is raised on a containing zone. State which game event raises each element (e.g. `combatWon` is raised by the combat-end path on victory).

`whenFired` is the game-terms prose sentence; `firedBy` is the structured list of concrete dispatchers. Keep them coordinated — every dispatcher in `firedBy` should be reflected in the prose, and vice versa.

## Flags and their defaults

The `Trigger` class (`./Tactics/Trigger.cs`) has several booleans. Only record flags in the JSONL when they differ from the default below.

| Flag | Default for non-zone trigger | Default for zone trigger | Meaning |
|---|---|---|---|
| `triggerImmediatelyOnEnteringZone` | `false` | `false` | Fires the moment the zone containing the trigger loads, regardless of position. |
| `disableOnZoneEntry` | `true` | `false` | When `true`, the trigger is disabled after the first zone entry until something re-enables it. |
| `onlyExecuteOnce` | `false` | `false` | When `true`, the trigger flags itself in `triggersFlaggedAsDone` per zone and cannot fire again in that zone. |
| `triggerForEveryStepInArea` | `false` | `false` | Fires on every player step inside the trigger's area, instead of only the first. |
| `triggerOnPlayerActorOnly` | `false` | `false` | Restricts firing so only the player actor satisfies the actor-source check. |
| `travelModeOnly` | `false` | `false` | Restricts firing to overworld travel mode (combat mode blocks it). |

All `loadGlobalTriggers` entries are constructed with `zoneTrigger=false`, so the non-zone defaults apply. Verify against the constructor in `Trigger.cs` before recording a flag as "non-default."

## Descriptions

Each description (trigger summary, effect description, whenFired prose) should be self-contained. Don't describe a trigger or effect in terms of another trigger/task unless they are meant to be used together (in which case, link them by name).

Prefer richer, more accurate descriptions over brevity. Aim for 1-3 sentences in the trigger `summary` and effect `description` fields. The `whenFired` field can be longer when there are multiple firing paths.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code. Game-term descriptions take priority over source-code references; fall back to source code only when you cannot phrase the behaviour in game terms.

If more information is needed about how code is executed, grep across `./Tactics/` and `./Tactics.Dialog/` for the relevant class or method name. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly in `notes` and in `./mod-validator/out/errors.md`, then continue.

# Outputs

Record any errors, uncertainty, runtime mutations, or naming quirks to `./mod-validator/out/errors.md` and continue with the rest of the triggers. Use the following structure, one section per trigger:

```
## <triggerName>
- <one-line description of the issue or uncertainty>
- <additional notes if needed>
```

Append new sections to the bottom of the file; never overwrite existing entries.

The extraction output must go into `./mod-validator/src/globalTriggers.jsonl` as JSONL. Each line is one JSON object describing a single global trigger.

Never overwrite or recreate `./mod-validator/src/globalTriggers.jsonl`. Always append new entries. Do not use `Write`, since it overwrites the file. Only `Read` the file when resuming (to locate the last entry) or when modifying an existing line.

Do not write progress markers, sentinels, comments, or "TODO continue from X" entries into `globalTriggers.jsonl`. The file contains only valid trigger JSON objects, one per line.

## Entry Schema

```jsonc
{
  "name": "tEnterPort",                       // dictionary key in Data.globalTriggers
  "summary": "...",                           // 1-line modder-friendly description
  "whenFired": "...",                         // game-terms sentence(s) describing firing conditions
  "firedBy": [                                // ordered list of concrete dispatchers
    "Engine: ZoneManager.loadNewZone",
    "Port zones that list 'tEnterPort' in their LevelData triggers"
  ],
  "requirementFormula": "g:autosaveInOverworld",  // omit when reqFormula == "1"
  "triggeredByElement": ["combatWon"],        // omit when empty
  "flags": {                                  // omit when no flags differ from defaults
    "triggerImmediatelyOnEnteringZone": true,
    "disableOnZoneEntry": false
  },
  "effects": [                                // ordered as in source
    {
      "effectID": "fx",                       // TaskType name, or comma-separated taskString
      "sValue": "blackenScreen_load",         // omit when ""
      "sValue2": "...",                       // omit when ""
      "fValue": 1,                            // omit when 0
      "xValue": 9,                            // omit when -1
      "yValue": 2,                            // omit when -1
      "bValue1": true,                        // omit when false
      "bValue2": true,                        // omit when false
      "delay": 0.5,                           // omit when 0
      "fReq": "g:enableThing",                // omit when "1"
      "description": "..."                    // 1-2 sentences in game terms, grounded in Task.cs
    }
  ],
  "notes": "...",                             // optional: caveats, runtime mutations, bugs
  "sourceLine": 698                           // line of the globalTriggers.Add(...) call in Data.cs
}
```

**IMPORTANT**: The example above is presented across multiple lines for ease of viewing. Write the actual individual JSON objects on a single line each, with no comments.

### Field requirements summary

| Field | Required | Notes |
|---|---|---|
| `name` | always | The dictionary key. May differ from the internal `aliasID` constructor argument — see Naming Quirks below. |
| `summary` | always | One-line modder-friendly description. |
| `whenFired` | always | Game-terms prose describing firing conditions. |
| `firedBy` | always | Array of concrete dispatchers. Use `["Other triggers via 'trigger'", "Dialog effects"]` only as a fallback when no engine call site fires the trigger directly. |
| `requirementFormula` | when non-default | Omit when `reqFormula.formulaString == "1"`. |
| `triggeredByElement` | when non-empty | Array of `Element` enum names (e.g. `combatWon`, `combatLost`, `gameOver`, `use`). |
| `flags` | when any flag is non-default | Object whose keys are flag names, values are the non-default booleans. |
| `effects` | always | Ordered array. Empty `[]` only when the trigger has no effects (pure extension hook); note this in `summary` and in `errors.md`. |
| `effects[].effectID` | always | The string passed to the `TriggerEffect` constructor. May be empty (no-op placeholder) — note in `errors.md`. |
| `effects[].sValue` etc. | when non-default | Defaults: `sValue=""`, `sValue2=""`, `fValue=0`, `xValue=-1`, `yValue=-1`, `bValue1=false`, `bValue2=false`, `delay=0`, `fReq="1"`. Omit any field at its default. |
| `effects[].description` | always | 1-2 sentences in game terms. Must be grounded in the Task.cs case body (or legacy `executeTriggerEffect_old` switch when applicable). |
| `notes` | optional | Caveats, runtime mutations, internal-aliasID mismatches, naming-convention deviations. |
| `sourceLine` | always | Line number in `Data.cs` of the `globalTriggers.Add(...)` call. |

### Naming quirks

The `Trigger` constructor takes an `aliasID` string as its first argument, separate from the dictionary key passed to `globalTriggers.Add(key, new Trigger(aliasID, ...))`. These usually match. When they do not:

* The dictionary key (`name` in this extraction) is what mods use for lookup.
* The internal `aliasID` is what the engine reports back from `trigger.aliasID` (used in once-only flagging, debug logging).
* Record any mismatch in `notes` and in `errors.md`.

### Runtime mutation of effect parameters

Some triggers' effects have their `sValue`/`fValue`/`xValue`/`yValue`/`bValue1` fields overwritten by engine code immediately before firing (search for assignments like `Data.globalTriggers["<name>"].triggerEffects[<i>].<field> = ...` across `./Tactics/`). When this happens:

* Record the static value from `Data.cs` in the effect's parameters (so the JSONL faithfully reflects what `loadGlobalTriggers` defines).
* Mention the mutation in the trigger's `notes`, citing the writing file and approximate line.

### Procedurally generated effects

A trigger's `triggerEffects` list may be built by a loop in `loadGlobalTriggers` rather than as a flat sequence of `triggerEffects.Add(...)` calls (`tCredits` is the canonical example). When this happens:

* Expand the static effects (those before/after the loop) into individual JSONL effect entries as usual.
* For the loop body, emit a single placeholder effect with a sentinel `effectID` (e.g. `_loop_<lo>_to_<hi>`) and a `description` summarising the loop's behaviour and the per-iteration effect template. Note the loop's source-line range so a reader can find it.
* Mention the procedural construction in `errors.md` so modders know the JSONL is not fully expanded.

# Execution Methodology

This is a long-running, unattended extraction process. Do not request user input, confirmations or additional permissions. Proceed autonomously using the provided tools and instructions. Do not stop to report progress.

In the order of appearance in `loadGlobalTriggers`, process triggers **one-by-one**.

For each trigger, before writing its JSONL entry:

1. Locate the `globalTriggers.Add(<key>, new Trigger(...))` line and all subsequent lines that mutate the same key (`globalTriggers[<key>].triggerEffects.Add(...)`, flag assignments, `reqFormula = ...`, `triggeredByElement.Add(...)`) until the next `globalTriggers.Add(...)` for a different key.
2. For each `TriggerEffect`, look up its `effectID` in `./Tactics/Task.cs`'s `executeTask` switch (or `executeTask_old`, or the legacy `executeTriggerEffect_old` switch in `./Tactics/TriggerEffect.cs` if no `TaskType` matches). Write the effect's `description` from the case body.
3. Grep across `./Tactics/` and `./Tactics.Dialog/` for `globalTriggers["<key>"]` to identify direct engine call sites (`executeTrigger(...)` invocations and runtime parameter mutations).
4. Resolve any flag, formula, or element on the trigger.

After processing each trigger, append its output to `./mod-validator/src/globalTriggers.jsonl`.

Do not wait to finish all triggers before writing output.

It is expected that the process of extracting all triggers may be interrupted because it does not fit within the token budget of one window. Do not adjust your behaviour according to the remaining token budget.

If processing is interrupted, on the next run read `./mod-validator/src/globalTriggers.jsonl`, identify the last trigger recorded (by `name` and `sourceLine`), and resume from the next `globalTriggers.Add(...)` call in `Data.cs`. Do not reprocess completed triggers.

If the last trigger entry appears incomplete or malformed, delete that line from `./mod-validator/src/globalTriggers.jsonl` and reprocess that trigger.

Do not invent scripts to automate the population of any data.

Do not attempt to estimate total effort or validate global correctness.

Do not summarize, explain, or restate the extracted information in the message buffer.

Do not emit parsed data to the message buffer.

Never claim completion unless all `globalTriggers.Add(...)` calls in `loadGlobalTriggers` have been processed. If processing stops early, stop silently. Do not write a partial completion summary, a "stopped at X" note, or any wrap-up message.
