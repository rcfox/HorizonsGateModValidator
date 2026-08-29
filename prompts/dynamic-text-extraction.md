# Job Description

In `./Tactics.UI/UIDynamicText.cs`, in the `assignText` function, there is a
switch statement over `array3[0]`. Each case label is the name of a text
formatting tag.

For each of these tags, capture:

* The name of the tag.
* For each of the tag's use cases: what it does, what each input does, the type
  of each input, and which inputs are required or optional.
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
| `{ENTITY}` / `{ENTITY_PLURAL}` | tag / tags |
| `{DATA_FILE}` | `./mod-validator/src/dynamic-text.jsonl` |
| `{EVIDENCE_FILE}` | `./mod-validator/out/dynamic-text.evidence.jsonl` |
| `{INPUT_LABEL}` | `Argument N` — see Tag syntax below |
| `{INPUT_CONTAINER}` | the `=`-separated values written after the tag name |
| `{VARIADIC_LABEL}` | `Argument 2+` |
| `{OPTIONALITY_ENCODING}` | membership in the use's `required` or `optional` array |
| `{CONTEXT_INPUT_RULE}` | Not applicable to this job. |
| `{INPUT_ORDER}` | ascending argument number |
| `{ALIAS_SELECTOR}` | the tag name — `array3[0]` in `assignText`, `array[1]` in `executeCommand` |
| `{ALIAS_EXCEPTIONS}` | None. |
| `{EXTRA_TYPES}` | None beyond the shared vocabulary. |
| `{ENTITY_KEY_NOTE}` | For a subcommand of `command`, use `"command/<subcommandName>"`. |
| `{USE_FIELD_REQUIRED}` | always |
| `{ENUMERATION_ORDER}` | the order the case labels appear in the `assignText` switch, then the out-of-switch tags, then the `executeCommand` subcommands |
| `{RESUME_RULE}` | the switch statement: locate **every** case label (canonical name plus all aliases listed in the entry) belonging to the last recorded tag, and start with the next case label following the last of those occurrences in source order |
| `{COMPLETENESS_CHECK}` | Every case label in `assignText` and in `executeCommand` is covered by an entry, and every out-of-switch tag found by the cross-check below is recorded. |
| `{DEFERRED_EXAMPLE}` | See Deferred behaviour below. |

# Tag syntax and input naming

A tag is written in mod text as `<name=value1=value2=...>`. The text between the
angle brackets is split on `=` (`Game1.regexEquals`) into the array the switch
reads. This means **a single argument value can never contain an `=`
character**; note this in an input's description where it materially constrains
what a modder can supply.

`Argument N` is the Nth `=`-separated value written after the tag name. The
mapping to source indexes differs between the two switches, so be careful:

* In `assignText`, the switch is over `array3[0]` (the tag name itself), so
  **`Argument N` is `array3[N]`**.
* In `executeCommand`, the switch is over `array[1]` (the subcommand name, since
  `array[0]` is the `command` tag name), so **`Argument N` is `array[N + 1]`**.

`array3[0]` / `array[0]` / `array[1]` are the tag and subcommand names. They are
never inputs — never list them.

# Argument preprocessing

Before the switch runs, every element of the split array is rewritten in place:

* `@G<varName>` is replaced with the value of that global variable.
* `@F<expr>` / `@R<expr>` are evaluated as formulas and replaced with the
  resulting number.

This applies to every tag, so do not repeat the mechanism in every entry. Mention
it only in the input descriptions of tags whose behaviour actually depends on it.
Record the general mechanism once in the review log so it can be surfaced in the
reference UI separately.

Note that this substitution happens before any typing decision, so a
`float`-typed argument can still be written as `@F`-prefixed formula text by the
modder. Type the argument by what the tag does with the *substituted* value.

# The empty tag name

There is a `case "":` label, reached when a tag has no name. Record it as a
normal entry with `"name": ""` — do not invent a name for it. Also note it in the
review log, since the reference UI will need to present it specially.

# Tags handled outside the switch

The switch has no `default:` case, so a chunk whose name matches no label falls
through with its text unchanged and is drawn to the screen verbatim. At least one
tag is implemented by deliberately exploiting that: it is *not* a case label, and
is instead intercepted later by a string test on the already-queued text.

**`gDyn` is one such tag and must be recorded.** It is caught by a
`StartsWith("gDyn=")` test in `Draw`, in the reveal loop, and in the
width-advance code at the tail of `assignText`. Extract it under the same rules as
every other tag and append its entry after the final switch entry, since it has
no switch position to order it by. Note the ordering decision in the review log.

Do not assume `gDyn` is the only one. Before declaring the extraction complete,
confirm the set of out-of-switch tags two ways:

* Grep `./Tactics.UI/UIDynamicText.cs` for `StartsWith`, `EndsWith`,
  `Contains("`, and `IndexOf("` applied to text content rather than to
  `array3[0]`, and read `Draw`, the reveal/update path, and the post-switch tail.
  Each such test on drawn text is a candidate.
* Cross-check against the shipped data. Extract every distinct tag name actually
  used and diff it against the case labels plus whatever you have already
  recorded:

  ```
  grep -rhoE "<[^<>]*>" ./Data/SystemData/ ./Data/ZoneData/ --include=*.txt | sed 's/^<//; s/>$//; s/=.*//' | sort -u
  ```

  A name in that list that is neither a case label nor an already-recorded entry
  is either an out-of-switch tag or a typo in the game's own data — determine
  which, and record it in the review log either way.

Record in the review log that an unmatched tag name is drawn literally rather
than erroring or being dropped, since that is the failure mode a modder actually
hits.

# Subcommands

The `command` tag (canonical name for the `cmd` / `command` labels) has several
subcommands, listed in the `executeCommand` function of the same file. Extract
these under these same rules and add them as a `commands` field on the `command`
tag entry, after the `assignText` switch has been fully processed. Each
subcommand uses the same object shape as a tag (`name`, `uses`, `aliases`), and
uses the `executeCommand` argument numbering described above.

`executeCommand` returns early when the split array has length <= 1, so a bare
`<command>` with no subcommand does nothing.

# Deferred behaviour

`command` is the worked example for `shared/deferred-behaviour.md`, and has three
distinct firing paths that must all appear in its description:

* the deferred path, when the reveal reaches the tag's position;
* an immediate path for a command written at the very start of the text, when the
  element uses the typing reveal;
* an immediate path for **every** queued command, when the element does not use
  the typing reveal at all — in a tooltip or a static readout, position is
  irrelevant and everything fires at build time.

Plus the skip-ahead flush, when the player reveals a whole block at once.

Tags that queue a texture or a piece of text rather than drawing it are subject
to the same rule.

# Usage examples

You can see many examples of the formatting tags in use with:

```
grep -rhoE "<[^<>]*>" ./Data/SystemData/ --include=*.txt | sort -u
```

There are thousands of matches, so filter to the tag you are working on.

# Outputs

## Tag data

Entries go into `./mod-validator/src/dynamic-text.jsonl`:

```
{
  "name": "imgIf",
  "uses": [
    {
      "description": "...",
      "required": [
        {
          "name": "Argument 1",
          "type": "texture",
          "description": "The name of the image to draw."
        },
        {
          "name": "Argument 2",
          "type": "formula",
          "description": "A formula that must evaluate above zero for the image to be drawn."
        }
      ],
      "optional": []
    }
  ],
  "aliases": []
}
```

The `command` tag additionally carries a `commands` array of objects with the
same shape.

| Field | Required | Notes |
|---|---|---|
| `name` | always | Canonical tag name. May be `""` for the empty-name label. |
| `uses` | always | At least one, ordered per `shared/use-cases.md`. |
| `uses[].description` | always | 2-4 sentences, in game terms. |
| `uses[].required` | always | Array, possibly empty. Ordered by ascending argument number. |
| `uses[].optional` | always | Array, possibly empty. Ordered by ascending argument number. |
| `uses[].*[].name` | always | `Argument N`, or `Argument N+` for a variadic run. |
| `uses[].*[].type` | always | One name from `shared/input-types.md`. |
| `uses[].*[].description` | always | 1-2 sentences saying what the input controls. |
| `aliases` | always | Array, possibly empty, ordered lexicographically. |
| `commands` | `command` only | Subcommand entries, same shape. |

## Evidence claims

The claim vocabulary for `{EVIDENCE_FILE}`:

| Claim | Supports | Required |
|---|---|---|
| `behaviour` | the use's `description` | one per use |
| `required:<Argument N>` | that input's presence, required classification and description | one per required input |
| `optional:<Argument N>` | that input's presence, optional classification and description | one per optional input |
| `type:<Argument N>` | that input's `type` | one per input, required or optional |
| `alias:<name>` | treating `<name>` as an alias; cite the fall-through case label | one per alias, recorded against use 0 |
