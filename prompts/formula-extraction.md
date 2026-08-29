# Job Description

In `./Tactics/Formula.cs`, in the `calculate` function, there is a
`switch (array[0])` statement. Each case is a formula operator. The
`evaluateMath` function in the same file contains a second switch, holding the
operators invoked via the `m:` prefix (for example `m:evasionFacing`).

For each of these operators, capture:

* The name of the operator, and whether it is function-style.
* For each of the operator's use cases: what it does, whether it returns a
  number or a 0/1 flag, what each argument does and what type it is, which
  arguments are optional, which context values it reads, and a representative
  example of usage.
* Any aliases found, and any delegation to another operator family.

# Shared rules

Read these before starting. The rules in them apply in full.

* `./mod-validator/prompts/shared/descriptions.md`
* `./mod-validator/prompts/shared/use-cases.md`
* `./mod-validator/prompts/shared/inputs.md`
* `./mod-validator/prompts/shared/input-types.md`
* `./mod-validator/prompts/shared/aliases.md`
* `./mod-validator/prompts/shared/evidence.md`
* `./mod-validator/prompts/shared/investigation.md`
* `./mod-validator/prompts/shared/review-log.md`
* `./mod-validator/prompts/shared/execution.md`

## Bindings

| Placeholder | Value |
|---|---|
| `{ENTITY}` / `{ENTITY_PLURAL}` | operator / operators |
| `{DATA_FILE}` | `./mod-validator/src/formula.jsonl` |
| `{EVIDENCE_FILE}` | `./mod-validator/out/formula.evidence.jsonl` |
| `{INPUT_LABEL}` | a short lowerCamelCase name describing the value — arguments are listed in the order they are written after the operator name, so the first entry is `array[1]`, the second `array[2]`, and so on |
| `{INPUT_CONTAINER}` | the `:`-separated segments after the operator name |
| `{VARIADIC_LABEL}` | the argument's name with a `+` appended |
| `{OPTIONALITY_ENCODING}` | the `optional` boolean on the argument object — `true` for optional, `false` for required |
| `{CONTEXT_INPUT_RULE}` | The values passed into the formula (caster, target, rank, and the rest) are context, not inputs — see Context values below. |
| `{INPUT_ORDER}` | the order the arguments are written in the operand, left to right |
| `{ALIAS_SELECTOR}` | the operator name — `array[0]` |
| `{ALIAS_EXCEPTIONS}` | See The `d` and `m` families below. |
| `{EXTRA_TYPES}` | `mathOperator` — the name of an operator in the `m:` family, supplied as a value. Global formula IDs use the canonical schema name `FormulaGlobal`, not `GlobalFormula`. |
| `{ENTITY_KEY_NOTE}` | The canonical operator name, including the `m:` prefix for `evaluateMath` operators. |
| `{USE_FIELD_REQUIRED}` | always |
| `{ENUMERATION_ORDER}` | the order the case labels appear in `calculate`'s switch, then the order they appear in `evaluateMath`'s switch |
| `{RESUME_RULE}` | the switch statements: locate **every** case label (canonical name plus all aliases listed in the entry) belonging to the last recorded operator, and start with the next case label following the last of those occurrences in source order, continuing into `evaluateMath` once `calculate` is exhausted |
| `{COMPLETENESS_CHECK}` | Every case label in `calculate` and in `evaluateMath` is covered by an entry, except the `m` / `M` / `Math` / `math` dispatch labels, which are recorded as the `m` operator itself. |

# Operator syntax

Formulas are strings like `c:HP+5*t:STR`, where operands are split by the
arithmetic operators `+`, `-`, `*`, `/` and `%`. Each operand is then split by
`:` into an array. `array[0]` is the operator name; the elements after it are its
arguments.

Some operators consume the entire remainder of the operand string as a
sub-formula rather than reading individual `:`-separated arguments. For example
`lessThan:50:c:HP` has `array[0] = "lessThan"` and `array[1] = "50"`, and then
constructs a sub-formula from the remaining text (`c:HP`). Give that argument the
type `formula`, and say in its description that it swallows everything to the end
of the operand.

## Function-style vs operator-style

`isFunctionStyle` says **where an operator's arguments are written**, not whether
it has any.

* `"isFunctionStyle": true` — arguments go in parentheses after the name:
  `m:tileDistance(3)`, `m:numAlliesWithin(2)`. An operator with no arguments at
  all is also function-style, since that is the syntax it would use if it had
  one: `m:evasionFacing`, `rank`, `x`.
* `"isFunctionStyle": false` — arguments are the `:`-separated segments:
  `lessThan:50:c:HP`, `c:HP`, `geo:fire`.

The validator enforces this both ways: parentheses on a colon-style operator and
colons on a function-style one are both reported as wrong syntax, so getting the
flag wrong makes correct mod text fail to validate.

`d` and `m` are the mixed case and the validator special-cases them: they are
called with colons, but the value they pass on is written in parentheses attached
to their first argument — `d:scalingDmg(5)`, `m:rand(100)`. Record them with
`"isFunctionStyle": false`.

## The `m:` prefix

Operators reached through `evaluateMath` are recorded with the `m:` prefix in
their name, for example `m:evasionFacing`. The `m`, `M`, `Math` and `math` case
labels in `calculate` are the dispatch mechanism into that switch and are
recorded as the single `m` operator, not as separate entries.

`mIs0` and `mMin0` (and their aliases) **are** recorded as separate operators,
because they apply their own logic around the `evaluateMath` call.

# Context values

Record the context a use case actually reads in a `context` array. Only these
names are valid:

| Context | Meaning |
|---|---|
| `caster` | The actor the formula is being evaluated for. |
| `target` | The actor the formula is being evaluated against. |
| `rank` | The rank of the action or ability the formula belongs to. |
| `x` | The parameter value passed into the formula by its caller. |
| `targetTC` | The tile being targeted. |
| `usingOffhandParams` | Whether the formula is being evaluated for the off-hand weapon. |
| `floorResult` | Whether the caller wants the result rounded down to a whole number. |

These are the values handed to a formula when it is evaluated. If the version
you are reading passes something this table does not list, record it under the
name the code gives it and note the addition in the review log — the checker
takes this vocabulary from the evaluation entry point itself, so a new parameter
is accepted automatically.

Include a context value only when the code actually reads it — a null-check or a
direct access. An operator that merely forwards its context onward to a
sub-formula it evaluates is reading nothing itself; the sub-formula's own
operators record what they read. Set `"context": []` when nothing is read.

# The `d` and `m` families

## Canonical naming

These families invert the usual longest-name rule from `shared/aliases.md`: the
**shorter** spelling is canonical, with the longer spellings as aliases. Prefer
`d` over `data`, `m` over `math`, `mMin0` over `mathMin0`, and likewise for every
wrapper around `evaluateGlobalFormula` / `evaluateMath`. The validator's parser
hardcodes the short forms when recognising the dispatch family.

## Delegation

Some operators are thin wrappers around `evaluateGlobalFormula` or
`evaluateMath`: they pass their first argument straight through, usually applying
a clamp or comparison to the result. Record this with a top-level `delegatesTo`
field:

* A case body calling `evaluateGlobalFormula(array[1], ...)` → `"delegatesTo": "d"`.
* A case body calling `evaluateMath(array[1], ...)` → `"delegatesTo": "m"`.

The dispatch roots `d` and `m` themselves do **not** get a `delegatesTo` field —
they are the targets, not delegators. Operators that delegate to neither omit the
field entirely.

# The parenthesized argument

Inside `evaluateGlobalFormula` and `evaluateMath`, the body checks whether the
argument contains `(` and parses what is in the brackets: an integer literal, the
identifier `x` (`d` only), or a sub-formula.

**This is an ordinary argument.** Record it in the use's `arguments` array like
any other; `isFunctionStyle` is what says it is written in parentheses rather
than after a colon. Do not invent a separate field for it.

It is **optional**: an operator that reads one still runs without it, and the
value it works from is then zero. Mark it `"optional": true` and say in its
description what the operator does when it is left out. One use case with an
optional argument, not two use cases — the presence of a bracketed value is the
ordinary optional-argument shape, not a different input shape.

## Never type it `formula`

The type `formula` has a specific meaning in this data: it marks the trailing
sub-formula that an operator consumes to the end of the operand, as in
`lessThan:50:c:HP`. The validator reads it that way — an operator with a
formula-typed argument is one that accepts a trailing body.

A parenthesized argument is not a trailing body, so typing it `formula` tells the
validator that `d:someFormula:3` is valid usage. It is not: the engine reads only
the first segment and silently ignores anything after it.

Type the parenthesized argument by the literal it takes — `integer` or `float` —
and note in its description that a sub-formula may be written there too.

# Examples

Each use carries an `example`: a representative operand a modder could write,
with plausible values invented for the arguments based on their types. This is
low-impact documentation, not structural data — it does not need to be a string
found anywhere in the game's own files, but it must parse as a valid operand for
that use case, with the right number of arguments in the right order.

Real usage is worth a look when you are unsure what a plausible value is:

```
grep -rhoE "(magnitude|formula|fReq|reqFormula)=[^;]*" ./Data/SystemData/ --include=*.txt | sort -u
```

# Outputs

## Operator data

Entries go into `./mod-validator/src/formula.jsonl`:

```
{
  "name": "lessThan",
  "isFunctionStyle": false,
  "uses": [
    {
      "description": "Returns 1 if a formula result is less than a threshold value, otherwise 0.",
      "returns": "boolean",
      "example": "lessThan:50:c:HP",
      "arguments": [
        {
          "name": "threshold",
          "type": "float",
          "description": "Value to compare against.",
          "optional": false
        },
        {
          "name": "formula",
          "type": "formula",
          "description": "Formula to evaluate. Consumes the rest of the operand.",
          "optional": false
        }
      ],
      "context": []
    }
  ],
  "aliases": []
}
{
  "name": "m:tileDistance",
  "isFunctionStyle": true,
  "uses": [
    {
      "description": "Returns how many tiles lie between caster and target, or a 1/0 answer when a threshold is written in brackets.",
      "returns": "float",
      "example": "m:tileDistance(4)",
      "arguments": [
        {
          "name": "threshold",
          "type": "integer",
          "description": "A distance to compare against; the operand is 1 when the target is at least this far away. Left out, the raw distance is returned.",
          "optional": true
        }
      ],
      "context": ["caster", "target"]
    }
  ],
  "aliases": ["m:distance", "m:tiledistance"]
}
{
  "name": "m:evasionFacing",
  "isFunctionStyle": true,
  "uses": [
    {
      "description": "Returns an evasion multiplier based on the facing angle between caster and target, from 0.1 to 1.0.",
      "returns": "float",
      "example": "m:evasionFacing",
      "arguments": [],
      "context": ["caster", "target"]
    }
  ],
  "aliases": ["m:evaFacing", "m:evafacing", "m:evasionfacing"]
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | always | Canonical operator name, `m:`-prefixed for `evaluateMath` operators. |
| `isFunctionStyle` | always | `true` when the operator takes no `:`-separated arguments. |
| `delegatesTo` | when delegating | `"d"` or `"m"`. Omit otherwise. |
| `uses` | always | At least one, ordered per `shared/use-cases.md`. |
| `uses[].description` | always | 1-3 sentences, in game terms. |
| `uses[].returns` | always | `"float"` or `"boolean"`. Use `"boolean"` only when the result is always 0 or 1. |
| `uses[].example` | always | A valid operand for this use case. |
| `uses[].arguments` | always | Array, possibly empty, in written order. |
| `uses[].arguments[].name` | always | Short lowerCamelCase name describing the value. |
| `uses[].arguments[].type` | always | One name from `shared/input-types.md`, or `mathOperator`. |
| `uses[].arguments[].description` | always | 1-2 sentences saying what the argument controls. |
| `uses[].arguments[].optional` | always | Boolean, per the guard classification in `shared/inputs.md`. |
| `uses[].context` | always | Array, possibly empty. Names from the Context values table. |
| `aliases` | always | Array, possibly empty, ordered lexicographically. |

## Evidence claims

The claim vocabulary for `{EVIDENCE_FILE}`:

| Claim | Supports | Required |
|---|---|---|
| `behaviour` | the use's `description` | one per use |
| `returns` | the use's `returns` value | one per use |
| `argument:<name>` | that argument's presence, its `optional` classification and its description | one per argument |
| `type:<name>` | that argument's `type` | one per argument |
| `context:<name>` | the use reading that context value | one per entry in `context` |
| `functionStyle` | the `isFunctionStyle` value | one per entry, recorded against use 0 |
| `delegatesTo` | the delegation target | one per entry carrying `delegatesTo`, recorded against use 0 |
| `alias:<name>` | treating `<name>` as an alias; cite the fall-through case label | one per alias, recorded against use 0 |

`example` needs no evidence record; it is invented documentation, not a claim
about the source.
