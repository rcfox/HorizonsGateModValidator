# Job Description

In ./Tactics/Formula.cs, in the `calculate` function, there is a `switch (array[0])` statement. Each case represents a formula operator. Additionally, the `evaluateMath` function contains a second switch statement with operators that are invoked via the `m:` prefix (e.g., `m:evasionFacing`).

For each of these operators, I want to capture:

* The name of the operator.
* What the operator does.
  * Not just "evaluates the foo operator", but actually try to describe in game terms what it does.
  * If there are multiple things it might do, make sure to list all of them as separate use cases.
  * Aim for 1-3 sentences per distinct functionality.
* What each argument does.
  * Arguments are the colon-separated segments after the operator name (i.e., `array[1]`, `array[2]`, etc.).
  * Be descriptive with 1-2 sentences for each argument.
  * Some arguments might have multiple uses depending on other arguments; be sure to capture them all.
* The type of each argument. Valid types are: `float`, `formula`, `string`, `Element`, `ActorValue`, or other enum/type names found in the code.
* Whether the operator returns a float or a boolean (0/1).
* Which arguments are required and which are optional.
* A representative example of usage. Invent valid values for the arguments, based on the arguments' types. This is a low-impact piece of documentation, not structural data.
* Which context parameters the operator reads (e.g., `caster`, `target`, `rank`, `targetTC`). Only include these if the code actually uses them (null-checks, direct access). Record these in a `"context"` array. If no context is referenced, create an empty `"context"` array.
* Any aliases found.
* Whether the operator is "function-style" or not.

## Operator syntax

Formulas are strings like `c:HP+5*t:STR` where operands are split by arithmetic operators (`+`, `-`, `*`, `/`, `%`). Each operand is then split by `:` into an array. `array[0]` is the operator name, and subsequent elements are its arguments.

Some operators consume the entire remainder of the operand string as a sub-formula rather than using individual colon-separated arguments. For example, `lessThan:50:c:HP` has `array[0]="lessThan"`, `array[1]="50"`, but then the code constructs a sub-formula from the remaining text (`c:HP`). In these cases, the sub-formula argument should have type `"formula"`.

## Function-style vs operator-style

An operator is "function-style" (`"isFunctionStyle": true`) if it takes no colon-separated arguments — the entire operand is just the operator name (e.g., `m:evasionFacing`, `rank`, `x`). An operator is not function-style if it requires at least one colon-separated argument (e.g., `lessThan:50:c:HP`, `c:HP`, `geo:fire`).

Operators invoked via `evaluateMath` should be recorded with the `m:` prefix in their name (e.g., `m:evasionFacing`). The `m`, `M`, `Math`, `math` case labels are the dispatch mechanism and should not be recorded as separate operators. However, `mIs0` and `mMin0` (and their aliases) should be recorded as separate operators since they apply additional logic around the evaluateMath call.

## Aliases

Do not create a new entry for each alias. If two case labels fall through to share code with no conditional behavior on the operator name, treat them as aliases.

Keep the longest name as the canonical name, and add the others to the entry's `"aliases"` array. In the event of a tie, choose one that uses camelcasing, and failing that, just find the lexicographical first.

If there are no aliases, set `"aliases": []`.

Aliases are case statements that fall through to share code with no intervening logic.

Some of the operators' case statements are clustered together, sharing common code with small branches depending on `array[0]`. Make sure to consider each one individually. Assume these are not aliases until you verify by checking the code nested under the case statement.

## Multiple uses

If an operator has multiple distinct behaviors depending on its arguments or context, create separate use entries. When different code paths produce meaningfully different results, split them into separate uses.

When in doubt, prefer splitting behavior into separate uses rather than combining them. It is acceptable to create redundant or overlapping uses; it is not acceptable to merge distinct behaviors into one.

## Required vs optional arguments

An argument is required if it is accessed unconditionally (e.g., `array[1]` without a prior length check on `array`). An argument is optional if the code checks `array.Length` before accessing it.

If a later-indexed argument is required, earlier arguments of the same array are also required.


## Descriptions
Each description should be self-contained. Don't describe an operator in terms of another operator, unless they are meant to be used together.

Prefer richer, more accurate descriptions over brevity.

Descriptions should describe behaviour, not implementation. The audience is game modders who do not have access to the source code.

If more information is needed about how code is executed, look under one of the Tactics subdirectories of this directory. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly instead of continuing to search.

Operators must be recorded in the same order in which they appear in the switch statement(s). Process `calculate`'s switch first, then `evaluateMath`'s switch.

# Outputs

Record any errors or uncertainties to ./mod-validator/out/errors.md and continue with the rest of the operators.

The extraction output must go into ./mod-validator/src/formula.jsonl as JSONL with this structure:

```
{
  "name": "lessThan",
  "isFunctionStyle": false,
  "uses": [
    {
      "description": "Returns 1 if a formula result is less than a threshold value, otherwise 0",
      "returns": "boolean",
      "example": "lessThan:50:c:HP",
      "arguments": [
        {
          "name": "threshold",
          "type": "float",
          "description": "Value to compare against",
          "optional": false
        },
        {
          "name": "formula",
          "type": "formula",
          "description": "Formula to evaluate",
          "optional": false
        }
      ],
      "context": []
    }
  ],
  "aliases": []
}
{
  "name": "m:evasionFacing",
  "isFunctionStyle": true,
  "uses": [
    {
      "description": "Returns evasion multiplier based on the facing angle between caster and target (0.1 to 1.0)",
      "returns": "float",
      "example": "m:evasionFacing",
      "arguments": [],
      "context": ["caster", "target"]
    }
  ],
  "aliases": ["m:evaFacing", "m:evafacing", "m:evasionfacing"]
}
```
**IMPORTANT**: This JSONL is presented across multiple lines for ease of viewing. Write the actual individual JSON objects on a single line each.

Never overwrite or recreate ./mod-validator/src/formula.jsonl. Always read it before writing. Only append or modify existing content.

# Execution Methodology

This is a long-running, unattended extraction process. Do not request user input, confirmations or additional permissions. Proceed autonomously using the provided tools and instructions. Do not stop to report progress.

In the order of appearance in the switch cases, process operators **one-by-one**.

After processing each operator, append its output to ./mod-validator/src/formula.jsonl.

Do not wait to finish all operators before writing output.

It is expected that the process of extracting all operator data will be interrupted because it does not fit within the token budget of one window. Do not adjust your behaviour according to the remaining token budget.

If processing is interrupted, on the next run read ./mod-validator/src/formula.jsonl, identify the last operator recorded, and resume with the next operator from the switch statement. Do not reprocess completed operators.

If the last entry is malformed, delete it and reprocess that operator.

Do not invent scripts to automate the population of any data.

Do not attempt to estimate total effort or validate global correctness.

Do not summarize, explain, or restate the extracted information in the message buffer.

Do not emit parsed data to the message buffer.

Never claim completion unless all switch cases have been processed. If processing stops early, stop without a completion statement.
