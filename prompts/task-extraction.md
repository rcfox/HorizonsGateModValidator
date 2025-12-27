In ./Tactics/Task.cs, in the executeTask function, there is a switch statement over the TaskType enum. Each enum name is the name of a task.

For each of these tasks, I want to capture:

* The name of the task.
* What the task does.
  * Not just "executes the foo task", but actually try to describe in game terms what it does.
  * If there are multiple things it might do, make sure to list all of them. Aim for 2-4 sentences per distinct functionality, in distinct paragraphs.
* What each input does.
  * Be descriptive with 2-4 sentences for each input.
  * Some inputs might have multiple uses depending on other inputs, be sure to capture them all.
* Which inputs are required.
* Which inputs are optional.
* Any aliases found.

Valid inputs are indexes into the following arrays: `strings`, `floats`, `bools` and `tileCoords`. Do not invent other input types. Do not collapse multiple indexes into one conceptual input. If a variable aliases an index access of one of these arrays, it does not count as a separate input.

If a task includes a dynamic number of accesses over an input array, treat this as a single input indexed the lower bound with a +. For example: `strings[2+]`. This indicates a variable number of arguments can be accepted. See the addJournalGoal as an example of this.

To determine if an input is required, check for unconditional array index access or array element pre-initialization. An array access is UNCONDITIONAL if the array element is accessed directly without first verifying the array's size/count. A check like `if (strings[0] > 0)` does NOT make the input optional - it still crashes if `strings[0]` doesn't exist. Only checks on the array's Count/Length before accessing make an input optional.

"Array element pre-initialization" refers to when elements of the input arrays (strings, floats, bools, tileCoords) are guaranteed to exist before the switch statement. If a derived variable has a fallback value but the array access is  still guarded, the input is OPTIONAL.

If there are cases of mutually exclusive use of inputs, treat these as different use cases. For example: setGlobalVar has two use cases: one has a required `string[1]` and the other has a required `floats[0]`. In the first case, `floats[0]` should not be listed as an input. In the second case, the `strings[1]` should not be listed as an input. In both cases, `strings[0]` is required.

Create separate uses when inputs are mutually exclusive OR when the behavior differs significantly. Branching on input presence alone doesn't necessarily mean separate uses.

If a later-indexed input for a type is required, the earlier inputs of the same type are also required. For example: if `strings[1]` is required, then `strings[0]` is also required.

Each description should be self-contained. Don't describe a task in terms of another task, unless they are meant to be used together, in which case, you should note that requirement.

Prefer richer, more accurate descriptions over brevity.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code.

Do not create a new entry for each alias. If two names execute the same code path with no conditional behaviour on the `type` variable, treat them as aliases. Similar or overlapping behavior is not sufficient. Keep the longest name as the canonical name, and add the others to the entry's "aliases" array. If there are no aliases, set `"aliases": []` for that entry.

Aliases are case statements that fall through to share code with no intervening logic.

Some of the tasks' case statements are clustered together, sharing common code with small branches off depending on the `type` variable. Make sure to consider each one individually. Assume these are not aliases until you verify by checking the code nested under the case statement.

When different code paths with similar inputs call different functions or methods:

 * Briefly investigate the called functions to understand behavioral differences (e.g., read function signatures, comments, or nearby code
 * If the behavioral difference is clear or evident from names (e.g., "castAction" suggests actor-initiated vs "executeAction" suggests direct execution), reflect this in the use case descriptions
 * If the difference requires deep investigation (>2-3 function calls deep), record the uncertainty in ./uncertainty.md with details about which functions differ and what the suspected difference might be
 * Make descriptions distinct enough that modders can understand when each code path applies, even if the exact implementation difference is unclear

Tasks must be recorded in the same order which they appear in the switch statement. Inputs must be ordered in the following order: `strings`, `floats`, `bools` then `tileCoords`. Uses must be ordered by number of required inputs, falling back to input order as a tie-breaker.

If more information is needed about how code is executed, look under one of the Tactics subdirectories of this directory. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly in ./uncertainty.md instead of continuing to search.

Record any errors to ./errors.md and continue with the rest of the tasks.

Output should be JSON with this structure:

```
{
  "tasks": [
    {
      "name": "exampleTask",
      "uses": [
        {
          "description": "...",
          "required": [
            {
              "name": "strings[0]",
              "description": "The of the global variable."
            },
            {
              "name": "strings[1]",
              "description": "The value to set to the variable."
            }
          ],
          "optional": []
        },
        {
          "description": "...",
          "required": [
            {
              "name": "strings[0]",
              "description": "The of the global variable."
            },
            {
              "name": "floats[0]",
              "description": "The value to set to the variable."
            }
          ],
          "optional": []
        },
        {
          "description": "...",
          "required": [
            {
              "name": "strings[0]",
              "description": "The of the global variable."
            }
          ],
          "optional": [
            {
              "name": "bools[0]",
              "description": "If true, sets an empty value. Otherwise, this task is skipped."
            }
          ]
        }
      ],
      "aliases": [
        "example"
      ]
    }
  ]
}
```


This is a documentation extraction task, not a formal static analysis. Apply the rules consistently, but do not attempt to prove completeness or soundness. Do not attempt to estimate total effort or validate global correctness. Begin extraction immediately and proceed task-by-task.

Begin processing tasks immediately, in switch order.
After completing each task, append its entry to ./mod-validator/src/tasks.json.
The file may be incomplete or temporarily invalid while processing; this is expected.
Do not wait to finish all tasks before writing output.

If processing is interrupted, on the next run read ./mod-validator/src/tasks.json, identify the last task recorded, and resume with the next task in switch order. Do not reprocess completed tasks.

If the last task entry appears incomplete or malformed, redo that task.

Do not summarize, explain, or restate the extracted information in the message buffer.

Save the resulting JSON to ./mod-validator/src/tasks.json. Do not emit parsed data to the message buffer. Only confirm completion, even if errors or uncertainty were recorded.
