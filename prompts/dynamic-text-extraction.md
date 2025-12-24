In ./Tactics.UI/UIDynamicText.cs, in the assignText function, there is a switch statement. Each case statement is the name of a text formatting tag.

For each of these tags, I want to capture:

* The name of the tag.
* What the tag does. If there are multiple things it might do, make sure to list all of them. Aim for 1-4 sentences unless it's more complicated.
* Which inputs are required.
* Which inputs are optional.
* What each input does. For example, item_global takes the name of a global variable. Be descriptive with 1-4 sentences for each input. Some inputs might have multiple uses depending on other inputs, be sure to capture them all.
* Any aliases found.

To determine if an input is required, check to see if an array access comes before checking the length of the array. If there is no length check to ensure the given index is in bounds, or one comes after, it is required. This is because the code will crash if it attempts to access an index that is out of bounds. A check like `array3[0] > 0` does NOT count.

Each description should be self-contained. Don't describe a tag in terms of another tag, unless they are meant to be used together, in which case, you should not that requirement.

Descriptions should describe behaviour, not implementation.

Do not create a new entry for each alias. If two names execute the same code path with no behavior differences under any inputs, treat them as aliases. Similar or overlapping behavior is not sufficient. Keep the longest name as the canonical name, and add the others to the entry's "aliases" array. If there are no aliases, set `"aliases": []` for that entry.

Many of the tags' case statements are clustered together, sharing common code with small branches off depending on the contents of array3[0]. Make sure to consider each one individually. Assume these are not aliases until you verify by checking the code nested under the case statement.

If more information is needed about how code is executed, look under one of the Tactics subdirectories of this directory. If information cannot be determined conclusively from the inspected code, record the uncertainty explicitly instead of continuing to search.

Additionally, the "command" tag has several subcommands that can be given as arguments. They are listed in the executeCommand function of the same file. These should be extracted using these same rules and added as a "commands" field to the "command" tag after assignText is finished being parsed.


Output should be JSON with this structure:

```
{
  "tags": [
    {
      "name": "action",
      "description": "Executes a game action at a specified location or on a specified actor. If only one string is provided, casts the action on the task's actor at their position. If two strings are provided, the second string specifies which actor should use the action. The action can be executed at a specific tile coordinate if provided, otherwise uses the actor's current position.",
      "required": [
        {
          "name": "array3[1]",
          "description": "The ID of the action to execute"
        }
      ],
      "optional": [
        {
          "name": "array3[2]",
          "description": "The ID of the actor who should perform the action. If empty or actor doesn't exist, uses the task's actorID or specified tile coordinate"
        },
        {
          "name": "array3[3]",
          "description": "The tile coordinate where the action should be executed. If not provided and no valid actor in strings[1], uses the task actor's position"
        }
      ],
      "aliases": ["act"]
    }
  ]
}
```

You can see many many examples of the use of the formatting tags with this command: `grep -RE "<.*?>" ..SystemData/` There's more than 3000 lines matching though, so filter accordingly.

Do not summarize, explain, or restate the extracted information in the message buffer.

Save the resulting JSON to ./mod-verification/src/dynamic-text.json. Do not emit parsed data to the message buffer. Only confirm completion or report errors.
