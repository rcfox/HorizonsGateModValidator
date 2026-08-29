# Job Description

Global triggers are stored in `./Tactics/Data.cs` in the `globalTriggers`
dictionary, keyed by name. The canonical list is built in
`Data.loadGlobalTriggers()` via a long sequence of `globalTriggers.Add(...)`
statements. Each entry is a `Trigger` object holding a name, optional flags, an
optional requirement formula, an optional list of `Element` values that fire it,
and an ordered list of trigger effects.

Global triggers can also be created or extended by data files via the
`GlobalTrigger` and `GlobalTriggerEffect` row types handled in
`./Tactics/DataManager.cs`. Those data-driven additions are out of scope; only
document the entries built in `loadGlobalTriggers()`.

For each global trigger, capture:

* Its name — the dictionary key mods look it up by.
* A one-line summary a modder can identify it by at a glance.
* When it fires, and which dispatchers actually fire it.
* Its requirement formula, the elements that fire it, and any non-default flags.
* The full ordered list of effects, with their parameters and a game-terms
  description of each.
* Anything a modder should be warned about.

# Shared rules

Read these before starting. The rules in them apply in full.

* `./mod-validator/prompts/shared/descriptions.md`
* `./mod-validator/prompts/shared/deferred-behaviour.md`
* `./mod-validator/prompts/shared/evidence.md`
* `./mod-validator/prompts/shared/investigation.md`
* `./mod-validator/prompts/shared/review-log.md`
* `./mod-validator/prompts/shared/execution.md`

This job has no `uses` array, no inputs and no aliases, so `use-cases.md`,
`inputs.md`, `input-types.md` and `aliases.md` do not apply.

## Bindings

| Placeholder | Value |
|---|---|
| `{ENTITY}` / `{ENTITY_PLURAL}` | global trigger / global triggers |
| `{DATA_FILE}` | `./mod-validator/src/globalTriggers.jsonl` |
| `{EVIDENCE_FILE}` | `./mod-validator/out/globalTriggers.evidence.jsonl` |
| `{ENTITY_KEY_NOTE}` | The dictionary key, which may differ from the internal alias ID — see Naming quirks. |
| `{USE_FIELD_REQUIRED}` | never — entries have no `uses` array, so omit the field |
| `{ENUMERATION_ORDER}` | the order the `globalTriggers.Add(...)` calls appear in `loadGlobalTriggers` |
| `{RESUME_RULE}` | the next `globalTriggers.Add(...)` call in `Data.cs` after the one recorded by the last entry's `sourceLine` |
| `{COMPLETENESS_CHECK}` | Every `globalTriggers.Add(...)` call in `loadGlobalTriggers` has an entry, and every entry's `sourceLine` points at its own `Add` call. |
| `{DEFERRED_EXAMPLE}` | An effect with a non-zero `delay` does not run when the trigger fires; it is queued and runs later. Say so in that effect's description. |

# How effect parameters reach a task

When a trigger effect fires, the engine builds a task from it (the
`Task(TriggerEffect)` constructor in `./Tactics/Task.cs`). The mapping:

| Effect field | Task input | Notes |
|---|---|---|
| `effectID` | `TaskType` | Parsed via `Enum.TryParse`. If it parses, the task's switch case runs. |
| `sValue` | `strings[0]` | |
| `sValue2` | `strings[1]` | |
| `fValue` | `floats[0]` | |
| `xValue`, `yValue` | `tileCoords[0]` | Combined into a single tile coordinate. |
| `bValue1` | `bools[0]` | |
| `bValue2` | `bools[1]` | |
| `fReq` | the task's own requirement formula | An additional gate on the task. |
| `delay` | — | Handled before the task is constructed; delays execution rather than being passed to the task. |

When the `effectID` is a comma-separated task string (for example
`"cameraAtPoint,9,2,@0.01"`), the constructor takes the single-string path
instead, and the effect's `sValue` / `fValue` and friends are ignored. Say so in
that effect's description, because a modder copying the pattern will otherwise
expect those fields to apply.

# Where to look up effect behaviour

For each `effectID`, the implementation lives in `./Tactics/Task.cs` under the
`executeTask` switch on `TaskType`. Read the case body and write the effect's
description from it.

* If the `effectID` matches no `TaskType`, check the legacy
  `executeTriggerEffect_old` switch in `./Tactics/TriggerEffect.cs`. Note in the
  review log when an effect resolves only via the legacy switch.
* If the `effectID` is empty, treat the effect as a no-op placeholder and note it
  in the review log.
* `tasks.json` is generated output from another extraction job, not a source —
  see `shared/investigation.md`.

# Determining when a trigger fires

`whenFired` is game-terms prose; `firedBy` is a structured list of the concrete
dispatchers. Keep them coordinated — every dispatcher in `firedBy` should be
reflected in the prose, and vice versa.

Find the dispatchers by grepping for the trigger name across `./Tactics/` and
`./Tactics.Dialog/`:

1. **Direct fires** — `Data.globalTriggers["<name>"].executeTrigger(...)`. These
   are the canonical engine call sites. Describe each in game terms in
   `firedBy`, and cite the call site in the evidence record.
2. **Indirect fires** — any trigger or dialog effect can fire a trigger by name.
   Use the generic entries `"Other triggers, via a trigger effect that names it"`
   and `"Dialog effects"` for these; do not enumerate every possible caller.
3. **Auto-installation by zones** — `Zone.cs` clones `tEnterProcZone` into every
   procedurally generated zone, and clones any global trigger whose name appears
   in a zone's level data trigger list. When a trigger's name strongly implies
   zone attachment (`tEnterPort`, `tEnterLoc`, `tEnterDojo`, `tEnterGrove`),
   record `"Zones that list '<name>' among their triggers"`. Mark it as an
   inference in `notes` when it is not confirmed against actual level data.
4. **Element-driven fires** — when `triggeredByElement` is non-empty, the engine
   fires the trigger when that element is raised on a containing zone. State
   which game event raises each element.

`firedBy` entries are written in game terms like every other prose field: "when
the player enters a new zone", not the name of the method that calls it. The
method is what the evidence record cites.

# Flags and their defaults

Only record flags that differ from the default.

| Flag | Default | Meaning |
|---|---|---|
| `triggerImmediatelyOnEnteringZone` | `false` | Fires the moment the zone containing the trigger loads, regardless of position. |
| `disableOnZoneEntry` | `true` | Disabled after the first zone entry until something re-enables it. |
| `onlyExecuteOnce` | `false` | Flags itself as done per zone and cannot fire again in that zone. |
| `triggerForEveryStepInArea` | `false` | Fires on every player step inside the area, not only the first. |
| `triggerOnPlayerActorOnly` | `false` | Only the player actor satisfies the actor-source check. |
| `travelModeOnly` | `false` | Only fires in overworld travel mode; combat mode blocks it. |

The defaults above are the ones that apply to a trigger constructed with
`zoneTrigger = false`, which is how every `loadGlobalTriggers` entry is built.
Verify against the `Trigger` constructor in `./Tactics/Trigger.cs` before
recording a flag as non-default; a decompiled default that has changed since the
last run is exactly what this re-extraction exists to catch.

The set of flags is whatever booleans the trigger class declares, so a version
that adds one adds a flag here too. Record a new flag the same way, and note it
in the review log.

# Naming quirks

The `Trigger` constructor takes an alias ID as its first argument, separate from
the dictionary key. These usually match. When they do not:

* The dictionary key is what mods use for lookup, and is this entry's `name`.
* The internal alias ID is what the engine reports back in once-only flagging and
  debug logging.
* Record the mismatch in `notes` and in the review log.

# Effect parameters

An effect records the parameters the source actually sets, named exactly as the
trigger effect declares them. As of this writing the fields and their defaults
are:

| Field | Default |
|---|---|
| `sValue`, `sValue2` | `""` |
| `fValue` | `0` |
| `xValue`, `yValue` | `-1` |
| `bValue1`, `bValue2` | `false` |
| `delay` | `0` |
| `fReq` | `"1"` |
| `taskString` | `""` |
| `XYRefersToThisZone` | `true` |

Omit any field left at its default. Read the trigger effect class in
`./Tactics/TriggerEffect.cs` rather than trusting this table: a version that adds
a field or changes a default makes the table stale, and the field list the
checker enforces comes from the extracted schema, not from here.

# Runtime mutation of effect parameters

Some triggers' effects have their parameter fields overwritten by engine code
immediately before firing. Search for assignments like
`Data.globalTriggers["<name>"].triggerEffects[<i>].<field> = ...` across
`./Tactics/`.

When this happens:

* Record the static value from `Data.cs` in the effect's parameters, so the
  output faithfully reflects what `loadGlobalTriggers` defines.
* Describe the mutation in the trigger's `notes` in game terms — what the value
  really ends up being, and when.
* Cite the writing line in the evidence record for that effect.

# Procedurally generated effects

A trigger's effect list may be built by a loop rather than a flat sequence of
`Add` calls; `tCredits` is the canonical example. When it is:

* Expand the static effects before and after the loop into individual entries as
  usual.
* For the loop body, emit a single placeholder effect with a sentinel `effectID`
  of the form `_loop_<lo>_to_<hi>`, and a `description` summarising the loop's
  behaviour and the per-iteration effect template.
* Note the procedural construction in the review log, so a reader knows the
  output is not fully expanded.

# Outputs

## Trigger data

Entries go into `./mod-validator/src/globalTriggers.jsonl`:

```
{
  "name": "tEnterPort",
  "summary": "...",
  "whenFired": "...",
  "firedBy": [
    "The engine, when the player arrives at a port",
    "Port zones that list 'tEnterPort' among their triggers"
  ],
  "requirementFormula": "g:autosaveInOverworld",
  "triggeredByElement": ["combatWon"],
  "flags": {
    "triggerImmediatelyOnEnteringZone": true,
    "disableOnZoneEntry": false
  },
  "effects": [
    {
      "effectID": "fx",
      "sValue": "blackenScreen_load",
      "fValue": 1,
      "xValue": 9,
      "yValue": 2,
      "bValue1": true,
      "delay": 0.5,
      "fReq": "g:enableThing",
      "description": "..."
    }
  ],
  "notes": "...",
  "sourceLine": 698
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | always | The dictionary key. |
| `summary` | always | One line, in game terms. |
| `whenFired` | always | Game-terms prose. May run several sentences when there are several firing paths. |
| `firedBy` | always | Array of dispatchers in game terms. Fall back to the generic indirect-fire entries only when no engine call site fires the trigger directly. |
| `requirementFormula` | when non-default | Omit when the formula is `"1"`. |
| `triggeredByElement` | when non-empty | Array of `Element` names. |
| `flags` | when any differs | Object of flag name to non-default boolean. Omit entirely when all are default. |
| `effects` | always | Ordered as in source. Empty `[]` only for a trigger that is a pure extension hook; say so in `summary` and note it in the review log. |
| `effects[].effectID` | always | Task name, comma-separated task string, or a `_loop_` sentinel. May be empty for a no-op placeholder. |
| `effects[].<parameter>` | when non-default | Any field of a trigger effect — see the Effect parameters section above. Omit any field at its default. |
| `effects[].description` | always | 1-2 sentences in game terms, grounded in the task's case body. |
| `notes` | optional | Caveats, runtime mutations, alias-ID mismatches. |
| `sourceLine` | always | Line in `Data.cs` of this trigger's `globalTriggers.Add(...)` call. |

## Evidence claims

Entries have no `uses` array, so evidence records for this job omit the `use`
field. The claim vocabulary for `{EVIDENCE_FILE}`:

| Claim | Supports | Required |
|---|---|---|
| `summary` | the entry's `summary` | one per entry |
| `whenFired` | the firing conditions described in prose | one per entry |
| `firedBy:<index>` | that dispatcher actually firing this trigger; cite the call site, or the mechanism for a generic entry | one per `firedBy` entry |
| `requirementFormula` | the recorded formula | when the field is present |
| `triggeredByElement` | the recorded elements | when the field is present |
| `flag:<name>` | that flag's non-default value | one per flag in `flags` |
| `effect:<index>:params` | the effect's `effectID` and parameter values; cite the constructing line in `Data.cs` | one per effect |
| `effect:<index>:behaviour` | the effect's `description`; cite the task case body that implements it | one per effect |
