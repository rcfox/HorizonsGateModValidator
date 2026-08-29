# Investigation

## Where to read

The decompiled C# lives in `./Tactics/` (most of the game), `./Tactics.UI/`
(interface and text rendering) and `./Tactics.Dialog/` (dialog handling). When
you need to know what a called method does, grep for the class or method name
across all three rather than guessing from its name.

When a case body delegates to a helper on `ZoneManager`, `Actor`, `Game1`,
`GameState`, `InputManager`, `Tasker`, `SoundManager`, `UIManager`, `Data` or
`Globals`, read the helper before describing the behaviour. Names mislead often
enough that a one-line read is worth it, and the helper is frequently the line
that determines an input's type.

## What not to trust as a source

The files under `./mod-validator/src/` — `tasks.json`, `formula.json`,
`dynamic-text.json`, `globalvars.json`, `globalTriggers.json`, `mod-schema.json`
— are **generated output from earlier runs of these prompts**. They are not
sources. Do not read them to answer a behavioural question, do not copy
descriptions out of them, and do not treat their omissions as evidence of
absence. The one legitimate use is `mod-schema.json` as the list of canonical
type names (see `input-types.md`).

An earlier extraction's output being wrong is exactly what a re-run against
updated decompiled code is for.

## Shipped game data

`./Data/SystemData/` and `./Data/ZoneData/` contain the game's own content files
and are a legitimate secondary source: they show how a feature is actually used
in practice, and they surface names the code alone would not reveal. Restrict
greps to `--include=*.txt`; `Data/SystemData/Data.zip` is binary and produces
thousands of junk matches otherwise.

Shipped data confirms usage; it never overrides the code on the question of what
something does.

## When to stop

If a behaviour cannot be determined conclusively from the code you have
inspected, record the uncertainty explicitly in the review log and in the entry's
own notes where the schema has a place for it, then move on. Do not keep
searching, and do not paper over the gap with a vague description.

This is a documentation extraction task, not a formal static analysis. Apply the
rules consistently, but do not attempt to prove completeness or soundness.
