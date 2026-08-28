# Job Description

In ./Tactics.UI/UIDynamicText.cs, in the `assignText` function, there is a switch statement over `array3[0]`. Each case label is the name of a text formatting tag.

For each of these tags, I want to capture:

* The name of the tag.
* For each of the tag's use cases:
  * What the tag use case does.
    * Not just "executes the foo task", but actually try to describe in game terms what it does.
    * If there are multiple things it might do, make sure to capture them as distinct use cases.
    * Aim for 2-4 sentences per distinct use case, in distinct paragraphs.
  * What each input does.
    * Be descriptive (aim for 1-2 sentences) — explain what the input controls, not just a restatement of the argument position. Don't pad trivial inputs.
    * Some inputs might have multiple use cases depending on other inputs, be sure to capture them all.
  * The type of each input (see Argument types below).
  * Which inputs are required.
  * Which inputs are optional.
* Any aliases found.

## Tag syntax and input naming

A tag is written in mod text as `<name=value1=value2=...>`. The text between the angle brackets is split on `=` (`Game1.regexEquals`) into the array the switch reads. This means **a single argument value can never contain an `=` character**; note this in an input's description where it materially constrains what a modder can supply.

Name inputs from the **modder's perspective**, as `Argument N`, where `Argument N` is the Nth `=`-separated value written after the tag name. The mapping to source indexes differs between the two switches, so be careful:

* In `assignText`, the switch is over `array3[0]` (the tag name itself), so **`Argument N` is `array3[N]`**.
* In `executeCommand`, the switch is over `array[1]` (the subcommand name, since `array[0]` is the `command` tag name), so **`Argument N` is `array[N + 1]`**.

`array3[0]` / `array[0]` / `array[1]` are the tag and subcommand names. They are never inputs — never list them.

Do not invent input positions that are not actually accessed in the code. Do not collapse multiple positions into one conceptual input. If a local variable aliases an index access of the split array, it does not count as a separate input.

If a tag reads a dynamic number of arguments (a loop over the remaining elements rather than fixed indexes), treat this as a single input named by the lower bound with a plus sign appended, e.g. `Argument 2+`. Any fixed inputs before the variable-length run are listed separately.

## Argument types

Every input carries a `type`, describing what kind of value the modder must supply. The type is determined by **how the code consumes the value**, not by what the argument is called. Use exactly one of the following names — do not invent new ones.

Primitives:

* `string` — free-form text, used as-is.
* `float` — parsed as a decimal number.
* `integer` — parsed as a whole number.
* `formula` — the text is evaluated as a formula expression.

Named game resources, which are not mod object definitions:

* `texture` — the name of an image in the game's texture set.
* `font` — the name of one of the game's fonts.
* `color` — a colour name resolved through the game's colour lookup.
* `globalVar` — the **name** of a global variable, not its value. Use this whenever the code passes the argument to a global-variable getter; the tag reads the variable's contents rather than treating the argument as literal text.

References to a mod-defined object, given by its ID. Use the canonical type name exactly as it appears in ./mod-validator/src/mod-schema.json — for example `Action`, `ActorClass`, `ActorType`, `ActorValue`, `Faction`, `ItemType`, `Palette`, `SupportAbility`, `TerrainType`. Do not use a type alias; use the canonical name. `Actor` means the ID of an actor present in the world at runtime, not an `ActorType` definition — the distinction matters to modders, so pick based on which lookup the code performs.

Enum values, written namespaced exactly as they appear in the `enums` section of mod-schema.json — for example `ItemType.ItemCategory`.

If a value's consumption does not match any of the above, record it as `string` and note the situation in `errors.md` rather than inventing a type name.

Note that `@G` / `@F` / `@R` substitution (below) happens before any of this, so a `float`-typed argument can still be written as `@F`-prefixed formula text by the modder. Type the argument by what the tag does with the *substituted* value.

## Argument preprocessing

Before the switch runs, every element of the split array is rewritten in place:

* `@G<varName>` is replaced with the value of that global variable.
* `@F<expr>` / `@R<expr>` are evaluated as formulas and replaced with the resulting number.

This applies to every tag, so do not repeat the mechanism in every entry. Mention it only in the input descriptions of tags whose behaviour actually depends on it. Record the general mechanism once in `errors.md` (see Outputs) so it can be surfaced in the reference UI separately.

## Determining required vs optional

Evaluate required-vs-optional **per use case** (treat the use case's own selecting/gating condition as already satisfied), then classify each access by how it is guarded:

* **Unconditional access** — the element is read directly without first verifying the array's size/length → **required**. A value check like `if (array3[1] == "")` or `array3[1] > 0` does NOT make the input optional: it still crashes if the element doesn't exist. Only a check on the array's `Length`/`Count` counts as a guard.
* **Default-and-continue guard** — a `Length` check that supplies a fallback and keeps executing → **optional**. Example: the `font` tag reads `(array3.Length <= 1 || !Game1.fonts.ContainsKey(array3[1])) ? font : array3[1]`, falling back to the current font, so `Argument 1` is optional.
* **Gate-the-use-case guard** — a `Length` check that, on failure, aborts the whole behaviour with an early `break`, or that selects which mutually-exclusive branch runs → the gated input is **required for the use case it gates**, NOT optional. Example: the `icon` cluster opens with `if (array3.Length < 2 || array3[1] == "" || ...) { break; }`, so `Argument 1` is required for the use case that proceeds.

The distinction is whether the length check provides a usable default (optional) or decides whether a behaviour happens at all (required for that behaviour's use case).

If an input is not accessed in a given use case, do not list it under that use case at all — neither as required nor as optional. The `optional` array is only for inputs whose access is conditionally guarded; inputs that are absent from the branch entirely are simply omitted from that use case.

Exception: the implicit-required rule below takes precedence over this omission rule. If a later-indexed input is required, the earlier inputs are also required, because the array must be long enough for the later one to be readable. For example, if `Argument 2` is required, then `Argument 1` is also required. If `Argument 1` is not otherwise accessed in that use case, describe it using its description from another use case where it is accessed; if no such use case exists, describe it as "Unused in this branch but must be provided as a placeholder."

## Splitting into use cases

If there are cases of mutually exclusive use of inputs, treat these as different use cases. Create separate use cases when inputs are mutually exclusive OR when the behavior differs in any observable way. When uncertain whether two behaviors are distinct, assume they are distinct and create separate use cases.

Base the split on the input *shape*, not on the runtime value of a single input:

* **Split** into separate use cases when the branches accept **different inputs** — mutually exclusive inputs, or different required/optional position sets.
* **Do not split** when the branches use the **same input set** and it is the **value** of one input that selects the behaviour; capture each behaviour inside that input's description instead.

A value-selected variant is still fully captured (in the input's description), so documenting it there is not the disallowed "merging distinct behaviors" — the "behaviour differs observably" and "prefer splitting" guidance is about distinct *input configurations*, not value-selected variants of one configuration. Useful test: if splitting would yield use cases with identical input lists where some inputs are merely "ignored" in one branch, keep a single use case and explain the variants in the relevant input's description.

The number of values supplied is part of the input shape, so **count-dependent** meanings call for separate use cases: when the count of supplied arguments changes what the positions represent, give each count configuration its own use case rather than overloading one position's description with several count-conditioned meanings.

When different code paths with similar inputs call different functions or methods:

 * Briefly investigate the called functions to understand behavioral differences (e.g., read function signatures, comments, or nearby code)
 * If the behavioral difference is clear or evident from names, reflect this in the use case descriptions
 * Make descriptions distinct enough that modders can understand when each code path applies, even if the exact implementation difference is unclear

When in doubt, prefer splitting behavior into separate uses rather than combining them. It is acceptable to create redundant or overlapping use cases; it is not acceptable to merge distinct behaviors into one.

## Aliases

Do not create a new entry for each alias. If two case labels execute the same code path with no conditional behaviour on `array3[0]`, treat them as aliases. If there is even minor behavioural deviation based on `array3[0]`, do not treat them as aliases. Similar or overlapping behavior is not sufficient.

Aliases are case labels that fall through to share a body with no intervening logic. Two case labels with their own separate bodies are never aliases, even if their code is byte-for-byte identical — record them as separate tags (give them matching descriptions if their behaviour is the same).

Many of the tags' case labels are clustered together, sharing a common body with small branches off depending on the value of `array3[0]`. **These are not aliases.** Make sure to consider each one individually, and assume they are not aliases until you verify by reading the whole body nested under the cluster. For example, `icon_action` and `icon_support` share a body with the other `icon*` labels but each branches on `array3[0]` to resolve its texture differently, so all of them are separate tags.

Keep the longest name as the canonical name, and add the others to the entry's `aliases` array. In the event of a tie in length, prefer a name with no underscores; among those, prefer a name that uses camelCase; if still tied, choose the lexicographically first. If there are no aliases, set `"aliases": []` for that entry. Order the `aliases` array lexicographically.

## The empty tag name

There is a `case "":` label, reached when a tag has no name. Record it as a normal entry with `"name": ""` — do not invent a name for it. Also note it in `errors.md`, since the reference UI will need to present it specially.

## Tags handled outside the switch

The switch has no `default:` case, so a chunk whose name matches no label falls through with its text unchanged and is drawn to the screen verbatim. At least one tag is implemented by deliberately exploiting that: it is *not* a case label, and is instead intercepted later by a string test on the already-queued text.

**`gDyn` is one such tag and must be recorded.** It is caught by a `StartsWith("gDyn=")` test in `Draw`, in the reveal loop, and in the width-advance code at the tail of `assignText`. Extract it under the same rules as every other tag and append its entry after the final switch entry, since it has no switch position to order it by. Note the ordering decision in `errors.md`.

Do not assume `gDyn` is the only one. Before declaring the extraction complete, confirm the set of out-of-switch tags two ways:

* Grep `./Tactics.UI/UIDynamicText.cs` for `StartsWith`, `EndsWith`, `Contains("`, and `IndexOf("` applied to text content rather than to `array3[0]`, and read `Draw`, the reveal/update path, and the post-switch tail. Each such test on drawn text is a candidate.
* Cross-check against the shipped data. Extract every distinct tag name actually used and diff it against the case labels plus whatever you have already recorded:

  ```
  grep -rhoE "<[^<>]*>" ./Data/SystemData/ ./Data/ZoneData/ --include=*.txt | sed 's/^<//; s/>$//; s/=.*//' | sort -u
  ```

  Restrict to `--include=*.txt`: `Data/SystemData/Data.zip` is binary and produces thousands of junk matches otherwise. A name in that list that is neither a case label nor an already-recorded entry is either an out-of-switch tag or a typo in the game's own data — determine which, and record it in `errors.md` either way.

Record in `errors.md` that an unmatched tag name is drawn literally rather than erroring or being dropped, since that is the failure mode a modder actually hits.

## Subcommands

The `command` tag (canonical name for the `cmd`/`command` labels) has several subcommands, listed in the `executeCommand` function of the same file. Extract these using these same rules and add them as a `commands` field on the `command` tag entry, after the `assignText` switch has been fully processed. Each subcommand uses the same object shape as a tag (`name`, `uses`, `aliases`), and uses the `executeCommand` argument numbering described above. Note that `executeCommand` returns early when the split array has length <= 1, so a bare `<command>` with no subcommand does nothing.

## Deferred behaviour

Some tags do not act when they are read. They append to a list that is drained later, so the tag's real observable behaviour — *when* the effect happens, and under what conditions — lives at the drain site, not in the case body. A description written only from the case body will be wrong about timing.

Whenever a tag body adds to a list rather than acting (for example pushing onto `commands`, `textures` or `texts`), **find every call site of the function that consumes that list** and describe each firing condition. Grep for the consuming function by name across the file rather than assuming the one call site you happened to read is the only one:

```
grep -n "executeCommand" ./Tactics.UI/UIDynamicText.cs
```

`command` is the worked example, and has three distinct firing paths that must all appear in its description:

* the deferred path, when the reveal reaches the tag's position;
* an immediate path for a command written at the very start of the text, when the element uses the typing reveal;
* an immediate path for **every** queued command, when the element does not use the typing reveal at all — in a tooltip or a static readout, position is irrelevant and everything fires at build time.

Plus the skip-ahead flush, when the player reveals a whole block at once.

Treat this as a checklist item, not a `command` special case: if a tag queues work, the entry is not finished until every drain site is accounted for.

## General

Each description should be self-contained. Don't describe a tag in terms of another tag, unless they are meant to be used together, in which case, you should note that requirement.

Prefer richer, more accurate descriptions over brevity.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code. Never name a C# class, field, method, or file in a description — write "the font must be one of the game's built-in fonts", not "must exist in `Game1.fonts`". Implementation details belong in the evidence sidecar, never in a description.

Tags must be recorded in the same order in which they appear in the switch statement. When an entry has aliases, its position is governed by the first occurrence of any of its case labels (canonical or alias), not by the position of the canonical name. Inputs must be ordered by ascending argument number. Uses must be ordered by descending number of required inputs; for equal counts, list first the use whose first differing required input comes earlier.

If a case body is empty, falls through to a no-op, or has no observable game effect, still record an entry for it: emit one use with empty `required` and `optional` arrays, and describe it as a no-op. Also record the situation in `errors.md` so it can be reviewed.

If more information is needed about how code is executed, grep across `./Tactics/`, `./Tactics.UI/` and `./Tactics.Dialog/` for the relevant class or method name. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly instead of continuing to search.

You can see many examples of the formatting tags in use with: `grep -RhoE "<[^<>]*>" ./Data/SystemData/ | sort -u`. There are thousands of matches, so filter to the tag you are working on.

This is a documentation extraction task, not a formal static analysis. Apply the rules consistently, but do not attempt to prove completeness or soundness.

# Outputs

## Review log

Record any errors, uncertainties, suspected bugs, or non-obvious judgement calls to ./mod-validator/out/errors.md and continue with the rest of the tags. This file is a loose review log, not a strictly structured document — grouping related notes together is fine, and some noise is acceptable. Its purpose is to surface anything that would otherwise push you toward a hedged or vague description in the main output. A reasonable structure is one section per tag:

```
## <tagName>
- <one-line description of the issue or uncertainty>
- <additional notes if needed>
```

Append new sections to the bottom of the file; never overwrite existing entries.

## Tag data

The tag extraction output must go into ./mod-validator/src/dynamic-text.jsonl as JSONL with this structure:

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

The `command` tag additionally carries a `commands` array of objects with the same shape.

**IMPORTANT**: This JSONL is presented across multiple lines for ease of viewing. Write the actual individual JSON objects on a single line each.

Never overwrite or recreate ./mod-validator/src/dynamic-text.jsonl. Append new entries by writing to a temp file and then concatenating the temp file to the end of the `dynamic-text.jsonl` file. Do not use `Write`, since it overwrites the file.

Do not write progress markers, sentinels, comments, or "TODO continue from X" entries into `dynamic-text.jsonl`. The file contains only valid tag JSON objects, one per line.

## Evidence sidecar

Every claim in the tag data must be backed by a citation into the source. Citations go into ./mod-validator/out/dynamic-text.evidence.jsonl, **never** into the descriptions themselves. The descriptions are written once, for modders; the evidence file is written once, for review. Neither is derived from the other.

Each line is one evidence record:

```
{
  "tag": "icon_action",
  "use": 0,
  "claim": "required:Argument 1",
  "file": "./Tactics.UI/UIDynamicText.cs",
  "line": 720,
  "snippet": "if (array3.Length < 2 || array3[1] == \"\"",
  "note": "gate-the-use-case guard: aborts the whole branch when the argument is absent"
}
{
  "tag": "icon_action",
  "use": 0,
  "claim": "type:Argument 1",
  "file": "./Tactics.UI/UIDynamicText.cs",
  "line": 727,
  "snippet": "text20 = Data.actions[array3[1]].icon;",
  "note": "looked up in the action table, so the argument is an Action ID"
}
```

Fields:

* `tag` — the canonical tag name the record supports. For a subcommand, use `"command/<subcommandName>"`.
* `use` — the zero-based index into that entry's `uses` array.
* `claim` — what this record supports. One of:
  * `"behaviour"` — supports the use's `description`.
  * `"required:<Argument N>"` / `"optional:<Argument N>"` — supports that input's required/optional classification and its description.
  * `"type:<Argument N>"` — supports that input's `type`. Cite the line that actually determines the type: the parse, the formula construction, or the lookup the value is fed into. This is deliberately a separate claim from the required/optional one, because the line that guards an argument is rarely the line that reveals what it means.
  * `"alias:<name>"` — supports treating `<name>` as an alias.
* `file`, `line` — the file and 1-based line number the claim is read from. Cross-file citations are expected and encouraged when a called helper is what actually determines the behaviour.
* `snippet` — a **verbatim substring of that exact line**, long enough to be recognisable. Do not paraphrase, reflow, or reconstruct it; copy it from the file. This is checked mechanically, so an approximate snippet is a failure.
* `note` — optional, one line. Use it to name the guard classification, or to explain why the cited line supports a non-obvious claim.

Coverage rules:

* Every use must have at least one `"behaviour"` record.
* Every entry in every `required` and `optional` array must have at least one matching record.
* Every entry in every `required` and `optional` array must additionally have a `"type:<Argument N>"` record. An argument typed `string` is not exempt: cite the line where the value is used as literal text.
* Every alias must have one `"alias:<name>"` record citing the fall-through case label.
* A single line may be cited by several records, and one claim may cite several lines. Prefer citing the line that actually decides the claim over the line that merely mentions the variable.

Append to this file with the same temp-file-and-concatenate approach used for the tag data. Never overwrite it.

# Execution Methodology

This is a long-running, unattended extraction process. Do not request user input, confirmations or additional permissions. Proceed autonomously using the provided tools and instructions. Do not stop to report progress.

In the order of appearance in the switch statement, process tags **one-by-one**.

After processing each tag, append its entry to ./mod-validator/src/dynamic-text.jsonl and its evidence records to ./mod-validator/out/dynamic-text.evidence.jsonl. Write both before moving to the next tag.

Do not wait to finish all tags before writing output.

It is expected that the process of extracting all tag data will be interrupted because it does not fit within the token budget of one window. Do not adjust your behaviour according to the remaining token budget.

If processing is interrupted, on the next run read ./mod-validator/src/dynamic-text.jsonl, identify the last tag recorded, and resume from the switch statement. To find the resume point, locate **every** case label (canonical name plus all aliases listed in the entry) belonging to the last recorded tag, and start with the next case label that follows the last of those occurrences in source order. Do not reprocess completed tags.

If the last tag entry appears incomplete or malformed, delete that line from ./mod-validator/src/dynamic-text.jsonl, delete that tag's records from ./mod-validator/out/dynamic-text.evidence.jsonl, and reprocess that tag.

If you realize that one or more already-written entries other than the last need correcting — for example because a rule was clarified partway through the run — do not rewrite them in bulk or with a script. Record the affected tag names and the needed correction in errors.md and leave the entries in place for manual handling after the run.

Do not invent scripts to automate the population of any data.

While processing, do not pause to estimate total effort or to validate global correctness. A single completeness-and-validity check after every tag has been processed is fine and encouraged — for example, confirming that every case label in both switches is covered, that every output line is valid JSON, and that every evidence `snippet` is genuinely a substring of its cited line.

Do not summarize, explain, or restate the extracted information in the message buffer.

Do not emit parsed data to the message buffer.

Never claim completion unless every case label in `assignText` and `executeCommand` has been processed. If processing stops early, stop silently. Do not write a partial completion summary, a "stopped at X" note, or any wrap-up message.
