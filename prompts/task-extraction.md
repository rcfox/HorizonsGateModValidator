# Job Description

In ./Tactics/Task.cs, in the executeTask function, there is a switch statement over the TaskType enum. Each enum name is the name of a task.

For each of these tasks, I want to capture:

* The name of the task.
* The official description.
* For each of the task's use cases:
  * What the task use case does.
    * Not just "executes the foo task", but actually try to describe in game terms what it does.
    * If there are multiple things it might do, make sure to capture them as distinct use cases.
    * Aim for 2-4 sentences per distinct use case, in distinct paragraphs.
  * What each input does.
    * Be descriptive with 2-4 sentences for each input.
    * Some inputs might have multiple use cases depending on other inputs, be sure to capture them all.
  * Which inputs are required.
  * Which inputs are optional.
* Any aliases found.

Valid inputs are indexes into the following arrays: `strings`, `floats`, `bools` and `tileCoords`. Do not invent other input types. Do not invent input indexes not actually accessed in the code. Do not collapse multiple indexes into one conceptual input. If a variable aliases an index access of one of these arrays, it does not count as a separate input.

If a task includes a dynamic number of accesses over an input array, treat this as a single input indexed by the lower bound, with a plus sign (+) appended. For example: `strings[2+]`. This indicates a variable number of arguments can be accepted. See `addJournalGoal` as an example of this.

To determine if an input is required, check for unconditional array index access. An array access is UNCONDITIONAL if the array element is accessed directly without first verifying the array's size/count. A check like `if (floats[0] > 0)` does NOT make the input optional - it still crashes if `floats[0]` doesn't exist. Only checks on the array's Count/Length before accessing make an input optional.

If an input is not accessed in a given use case, do not list it under that use case at all — neither as required nor as optional. The `optional` array is only for inputs whose access is conditionally guarded; inputs that are absent from the branch entirely are simply omitted from that use case.

Exception: the implicit-required rule below (later-indexed input requires earlier ones) takes precedence over this omission rule. If `strings[1]` is accessed but `strings[0]` is not, `strings[0]` is still required (the array must have size ≥ 2 for `strings[1]` to be readable). In that case, describe `strings[0]` using its description from another use case where it is accessed; if no such use case exists, describe it as "Unused in this branch but must be provided as a placeholder."

If there are cases of mutually exclusive use of inputs, treat these as different use cases. For example: setGlobalVar has two use cases: one has a required `strings[1]` and the other has a required `floats[0]`. In the first case, `floats[0]` should not be listed as an input. In the second case, the `strings[1]` should not be listed as an input. In both cases, `strings[0]` is required.

Create separate use cases when inputs are mutually exclusive OR when the behavior differs in any observable way. When uncertain whether two behaviors are distinct, assume they are distinct and create separate use cases.

When different code paths with similar inputs call different functions or methods:

 * Briefly investigate the called functions to understand behavioral differences (e.g., read function signatures, comments, or nearby code)
 * If the behavioral difference is clear or evident from names (e.g., "castAction" suggests actor-initiated vs "executeAction" suggests direct execution), reflect this in the use case descriptions
 * Make descriptions distinct enough that modders can understand when each code path applies, even if the exact implementation difference is unclear

When in doubt, prefer splitting behavior into separate uses rather than combining them. It is acceptable to create redundant or overlapping use cases; it is not acceptable to merge distinct behaviors into one.

If a later-indexed input for a type is required, the earlier inputs of the same type are also required. For example: if `strings[1]` is required, then `strings[0]` is also required.

Each description should be self-contained. Don't describe a task in terms of another task, unless they are meant to be used together, in which case, you should note that requirement.

Prefer richer, more accurate descriptions over brevity.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code.

Official descriptions can be found in Data.cs by looking for `taskDescriptions.Add(Task.TaskType.{taskName}, "...")`. Copy them verbatim to the `officialDescription` field for the task.

Alternatively, an official description may be found in a `consoleCommandDescriptions.Add(Task.TaskType.{taskName}, "...")` line. Copy this as the `officialDescription` and set `"consoleCommand": true`.

Sequencing: extract every `uses[].description` and input description from the code **before** reading the official description for the task. Once the official text has been read, do not edit or re-word any `uses[].description` based on it. The official descriptions use a different vocabulary (`sValue`, `fValue`, `b1`) and will contaminate your input naming if mirrored.

Alias handling: for an entry whose canonical name has a `taskDescriptions.Add` entry, use that text. If the canonical has no entry, fall back to the first alias (in `aliases` array order) that does, and record the fallback in `errors.md`. Ignore the entries of other aliases.

Missing entries: if no `taskDescriptions.Add` or `consoleCommandDescriptions.Add` exists for the canonical or any alias, set `"officialDescription": null` and record this in `errors.md`.

Verbatim copy: "verbatim" means the resolved string value, not a byte-for-byte source copy. Decode C# escape sequences (`\"`, `\n`, `\\`, etc.) into their actual characters, then re-encode as a valid JSON string (escaping `"` and `\` per JSON rules). If the source uses string concatenation (`"..." + "..."`) across one or more lines, concatenate the parts into a single value before copying.

Do not create a new entry for each alias. If two names execute the same code path with no conditional behaviour on the `type` variable, treat them as aliases. Similar or overlapping behavior is not sufficient. Keep the longest name as the canonical name, and add the others to the entry's "aliases" array. In the event of a tie in length, prefer a name with no underscores; among those, prefer a name that uses camelCase; if still tied, choose the lexicographically first. If there are no aliases, set `"aliases": []` for that entry. Order the `aliases` array alphabetically.

Aliases are case statements that fall through to share code with no intervening logic.

Some of the tasks' case statements are clustered together, sharing common code with small branches off depending on the `type` variable. Make sure to consider each one individually. Assume these are not aliases until you verify by checking the code nested under the case statement.

Tasks must be recorded in the same order which they appear in the switch statement. When an entry has aliases, its position is governed by the first occurrence of any of its case statements (canonical or alias), not by the position of the canonical name. Inputs must be ordered in the following order: `strings`, `floats`, `bools` then `tileCoords`. Uses must be ordered by descending number of required inputs, falling back to input order as a tie-breaker.

If a case body is empty, falls through to a no-op, or has no observable game effect, still record an entry for it: emit one use with empty `required` and `optional` arrays, and describe it as a no-op (e.g., "Reserved task with no observable behaviour"). Also record the situation in `errors.md` so it can be reviewed.

If more information is needed about how code is executed, grep across `./Tactics/` and `./Tactics.Dialog/` for the relevant class or method name. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly instead of continuing to search.

This is a documentation extraction task, not a formal static analysis. Apply the rules consistently, but do not attempt to prove completeness or soundness.

# Outputs

Record any errors or uncertainty to ./mod-validator/out/errors.md and continue with the rest of the tasks. Use the following structure, one section per task:

```
## <taskName>
- <one-line description of the issue or uncertainty>
- <additional notes if needed>
```

Append new sections to the bottom of the file; never overwrite existing entries.

The task extraction output must go into ./mod-validator/src/tasks.jsonl as JSONL with this structure:

```
{
  "name": "exampleTask",
  "officialDescription": "Gives an item stored in the global variable to all actors identified.",
  "consoleCommand": false,
  "uses": [
    {
      "description": "...",
      "required": [
        {
          "name": "strings[0]",
          "description": "The name of the global variable."
        },
        {
          "name": "strings[1]",
          "description": "The ID of the actor to use."
        }
      ],
      "optional": []
    },
    {
      "description": "...",
      "required": [
        {
          "name": "strings[0]",
          "description": "The name of the global variable."
        },
        {
          "name": "floats[0]",
          "description": "The number of actors to choose."
        }
      ],
      "optional": []
    },
    {
      "description": "...",
      "required": [
        {
          "name": "strings[0]",
          "description": "The name of the global variable."
        }
      ],
      "optional": [
        {
          "name": "bools[0]",
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

**IMPORTANT**: This JSONL is presented across multiple lines for ease of viewing. Write the actual individual JSON objects on a single line each.

Never overwrite or recreate ./mod-validator/src/tasks.jsonl. Append new entries. Do not use `Write`, since it overwrites the file. Only `Read` the file when resuming (to locate the last entry) or when modifying an existing line.

Do not write progress markers, sentinels, comments, or "TODO continue from X" entries into `tasks.jsonl`. The file contains only valid task JSON objects, one per line.


# Execution Methodology

This is a long-running, unattended extraction process. Do not request user input, confirmations or additional permissions. Proceed autonomously using the provided tools and instructions. Do not stop to report progress.

In the order of appearance in the switch case, process tasks **one-by-one**.

After processing each task, append its output to ./mod-validator/src/tasks.jsonl.

Do not wait to finish all tasks before writing output.

It is expected that the process of extracting all task data will be interrupted because it does not fit within the token budget of one window. Do not adjust your behaviour according to the remaining token budget. 

If processing is interrupted, on the next run read ./mod-validator/src/tasks.jsonl, identify the last task recorded, and resume from the switch statement. To find the resume point, locate **every** case statement (canonical name plus all aliases listed in the entry) belonging to the last recorded task, and start with the next case statement that follows the last of those occurrences in source order. Do not reprocess completed tasks.

If the last task entry appears incomplete or malformed, delete that line from ./mod-validator/src/tasks.jsonl and reprocess that task.

Do not invent scripts to automate the population of any data.

Do not attempt to estimate total effort or validate global correctness.

Do not summarize, explain, or restate the extracted information in the message buffer.

Do not emit parsed data to the message buffer.

Never claim completion unless all enum cases have been processed. If processing stops early, stop silently. Do not write a partial completion summary, a "stopped at X" note, or any wrap-up message.
