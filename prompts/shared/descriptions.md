# Descriptions

These rules apply to every prose field in the output: use descriptions, input
descriptions, summaries, and any other free-text field the calling prompt
defines.

Each description must be self-contained. Don't describe one {ENTITY} in terms of
another, unless they are meant to be used together, in which case note that
requirement and name the other {ENTITY} explicitly.

Prefer richer, more accurate descriptions over brevity. A description that hedges
is worse than a description that commits and records its uncertainty in the
review log.

Describe behaviour, not implementation. **The audience is game modders who do not
have access to the source code.** Never name a C# class, field, method, variable
or file in a description. Write "the font must be one of the game's built-in
fonts", not "the font must exist in `Game1.fonts`"; write "fires when the player
enters a port" not "fires from `ZoneManager.loadNewZone`". This applies to every
prose field, including short summaries.

Implementation details are not lost by this rule — they belong in the evidence
sidecar (`evidence.md`) and the review log (`review-log.md`), which is where a
reviewer looks for them. The description and the evidence are written for
different readers; neither is derived from the other.

The one exception is a field the calling prompt explicitly defines as a
structured code-location field rather than prose. Such a field is not a
description and is not bound by this rule; the calling prompt says so where it
applies.

Do not restate the {ENTITY}'s name as its description ("executes the foo task").
Say what it does in the game: what the player or the world observably ends up
doing differently.
