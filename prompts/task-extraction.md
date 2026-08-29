# Job Description

In `./Tactics/Task.cs`, in the `executeTask` function, there is a switch
statement over the `TaskType` enum. Each enum name is the name of a task.

For each of these tasks, capture:

* The name of the task.
* For each of the task's use cases: what it does, what each input does, the type
  of each input, which inputs are required or optional, and which contextual
  values the use case depends on.
* Any aliases found.

# Shared rules

Read these before starting. The rules in them apply in full.

* `./mod-validator/prompts/shared/descriptions.md`
* `./mod-validator/prompts/shared/use-cases.md`
* `./mod-validator/prompts/shared/inputs.md`
* `./mod-validator/prompts/shared/input-types.md`
* `./mod-validator/prompts/shared/aliases.md`
* `./mod-validator/prompts/shared/deferred-behaviour.md`
* `./mod-validator/prompts/shared/evidence.md`
* `./mod-validator/prompts/shared/investigation.md`
* `./mod-validator/prompts/shared/review-log.md`
* `./mod-validator/prompts/shared/execution.md`

## Bindings

| Placeholder | Value |
|---|---|
| `{ENTITY}` / `{ENTITY_PLURAL}` | task / tasks |
| `{DATA_FILE}` | `./mod-validator/src/tasks.jsonl` |
| `{EVIDENCE_FILE}` | `./mod-validator/out/tasks.evidence.jsonl` |
| `{INPUT_LABEL}` | `strings[N]`, `floats[N]`, `bools[N]`, `tileCoords[N]` |
| `{INPUT_CONTAINER}` | the `strings`, `floats`, `bools` and `tileCoords` arrays |
| `{VARIADIC_LABEL}` | `strings[1+]` |
| `{OPTIONALITY_ENCODING}` | membership in the use's `required` or `optional` array |
| `{CONTEXT_INPUT_RULE}` | See Contextual values below — `actorID` and the values derived from it are never inputs. |
| `{INPUT_ORDER}` | `strings`, then `floats`, then `bools`, then `tileCoords`; ascending index within each |
| `{ALIAS_SELECTOR}` | the `type` variable holding the `TaskType` |
| `{ALIAS_EXCEPTIONS}` | None. |
| `{EXTRA_TYPES}` | `taskString` — a whole comma-separated task written as one value, run as a nested task. |
| `{ENTITY_KEY_NOTE}` | The canonical task name. |
| `{USE_FIELD_REQUIRED}` | always |
| `{ENUMERATION_ORDER}` | the order the case labels appear in the `executeTask` switch |
| `{RESUME_RULE}` | the switch statement: locate **every** case label (canonical name plus all aliases listed in the entry) belonging to the last recorded task, and start with the next case label following the last of those occurrences in source order |
| `{COMPLETENESS_CHECK}` | Every `TaskType` case label in `executeTask` is covered by an entry. |
| `{DEFERRED_EXAMPLE}` | Tasks that schedule work on a timer, queue an actor action, or hand a follow-up task to the tasker fall under this rule; describe when the effect actually lands, not just that it was queued. |

# How a task is supplied

A task can be supplied two ways, which affects how values are provided:

* As a **taskString** — one comma-separated string (`taskName,arg0,arg1,…`).
  Commas delimit arguments, so a single value cannot contain a comma; there is no
  limit on the number of arguments.
* As a **trigger effect** — `strings[0]` and `strings[1]` come from distinct
  object properties (so those values may contain commas), and the form provides
  at most 2 `strings`, 2 `floats`, 2 `bools`, and one X and one Y (a single
  `tileCoords[0]`).

This is why some tasks accept a combined `"a,b"` value (to pack two values into
one slot), and why inputs beyond `strings[1]` / `floats[1]` / `bools[1]`, or
beyond a single tile coordinate, can only be provided via the taskString form.

Where a task's inputs push past what the trigger-effect form can carry, say so in
the relevant input's description — a modder writing a trigger effect needs to
know the value cannot reach the task that way.

# Contextual values

`actorID`, and the `actor` variable derived from it via `getActor(actorID)`, are
the task's *contextual actor* — the actor the task runs on, provided by the
trigger or dialog context rather than as a mod-supplied argument. It is not an
input: never list it. Tasks described as acting on "the contextual actor" use
this when no explicit actor-ID input is given.

Record the contextual values a use case actually reads in a `context` array on
that use. Use only these names:

| Context | Meaning |
|---|---|
| `actor` | The contextual actor the task runs on. |
| `player` | The player actor or the player's party. |
| `zone` | The zone the task runs in, or its contents. |
| `dialogNode` | The dialog node the task was invoked from. |
| `triggerArea` | The tile bounds handed to the task by the trigger that fired it. |

Only include a context value when the code actually reads it. Set `"context": []`
when none is read. If a use case depends on some other ambient state that
materially changes what a modder gets, record that in the review log rather than
inventing a context name.

# The tileCoords padding exception

The task constructor always pads `tileCoords` to at least one element,
defaulting to `(-1,-1)`, so `tileCoords[0]` can never throw. This overrides the
required-vs-optional rules in `shared/inputs.md` for `tileCoords[0]` only:

* Treat `tileCoords[0]` as **optional by default**. A direct access with no gate
  stays optional, because it cannot crash — say in its description what the
  off-map default means for the behaviour.
* Treat it as **required** only for a use case gated on a real tile being
  present: a branch guarded by `num != -1` or
  `tileCoord != TileCoord.NegativeOne`, where `num`, `num2` and `tileCoord` alias
  `tileCoords[0].X` / `.Y`.

`tileCoords[1]` and higher follow the normal rules.

# Worked examples of the rules

These name real tasks, and are the intended reading of the shared rules:

* **Splitting on input shape.** `setGlobalVar` stores a text value via
  `strings[0]` + `strings[1]`, or a number via `strings[0]` + `floats[0]` — two
  use cases, and in each one the other input is not listed at all. `strings[0]`
  is required in both.
* **Not splitting on a value.** `playSong` (`strings[0]` of `"travel"` /
  `"combat"` plays the zone's configured music, anything else names a song),
  `talk` (a valid versus empty `strings[0]` talks to an actor versus to no one),
  and `setZonePalettes` (an inner switch on `strings[0]` picks which palette to
  set) are each **one** use case, with the variants explained in that input's
  description.
* **Gate-the-use-case guard.** `setGlobalVar`'s branch-gated `strings[1]` is
  required for its use case, not optional, even though it sits behind a count
  check — the check decides which behaviour runs, it does not supply a default.
* **A variadic run.** `addJournalGoal` joins `strings[0]` and every following
  string into one value, so its input is `strings[0+]`.

# Outputs

## Task data

Entries go into `./mod-validator/src/tasks.jsonl`:

```
{
  "name": "exampleTask",
  "uses": [
    {
      "description": "...",
      "context": ["actor"],
      "required": [
        {
          "name": "strings[0]",
          "type": "globalVar",
          "description": "The name of the global variable to write."
        },
        {
          "name": "strings[1]",
          "type": "Actor",
          "description": "The ID of the actor to use."
        }
      ],
      "optional": []
    },
    {
      "description": "...",
      "context": [],
      "required": [
        {
          "name": "strings[0]",
          "type": "globalVar",
          "description": "The name of the global variable to write."
        },
        {
          "name": "floats[0]",
          "type": "integer",
          "description": "The number of actors to choose."
        }
      ],
      "optional": [
        {
          "name": "bools[0]",
          "type": "boolean",
          "description": "If true, chooses all actors. Otherwise, none are chosen."
        }
      ]
    }
  ],
  "aliases": [
    "example"
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | always | Canonical task name, as spelled in the `TaskType` enum. |
| `uses` | always | At least one, ordered per `shared/use-cases.md`. |
| `uses[].description` | always | 2-4 sentences, in game terms. |
| `uses[].context` | always | Array, possibly empty. Names from the Contextual values table. |
| `uses[].required` | always | Array, possibly empty. Ordered per `{INPUT_ORDER}`. |
| `uses[].optional` | always | Array, possibly empty. Ordered per `{INPUT_ORDER}`. |
| `uses[].*[].name` | always | `strings[0]`, `floats[1]`, `strings[2+]`, and so on. |
| `uses[].*[].type` | always | One name from `shared/input-types.md`, or `taskString`. |
| `uses[].*[].description` | always | 1-2 sentences saying what the input controls. |
| `aliases` | always | Array, possibly empty, ordered lexicographically. |

Do not add an `officialDescription` field. The game's own task documentation is
merged in as a separate step after this extraction, and a value written here
would be overwritten or duplicated.

## Typing a task input

The array an input lives in constrains its type but does not decide it. A
`floats[N]` input is not automatically `float`: it may be an `integer` count, or
an index into an enum. A `strings[N]` input is `string` only when the value is
used as literal text — if it is looked up in a table, parsed as an enum, read as
a global variable name, evaluated as a formula, or run as a nested task, type it
accordingly.

`bools[N]` inputs are `boolean`. `tileCoords[N]` inputs carry no useful narrower
type; record them as `string` and let the description carry the meaning, since
the modder writes them as a coordinate pair the task form defines.

Cite the line that determines the type, per `shared/evidence.md` — for a task
that means the lookup, parse or evaluation the value is fed into, which is very
often in a helper rather than the case body itself.

## Evidence claims

The claim vocabulary for `{EVIDENCE_FILE}`:

| Claim | Supports | Required |
|---|---|---|
| `behaviour` | the use's `description` | one per use |
| `required:<name>` | that input's presence, required classification and description | one per required input |
| `optional:<name>` | that input's presence, optional classification and description | one per optional input |
| `type:<name>` | that input's `type` | one per input, required or optional |
| `context:<name>` | the use reading that contextual value | one per entry in `context` |
| `alias:<name>` | treating `<name>` as an alias; cite the fall-through case label | one per alias, recorded against use 0 |
