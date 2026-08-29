# Input types

Every input carries a `type`, describing what kind of value the modder must
supply. The type is determined by **how the code consumes the value**, not by
what the argument is called or what the surrounding prose suggests. Cite the line
that actually determines it: the parse, the formula construction, or the lookup
the value is fed into.

Use exactly one of the names below. Do not invent new ones — the checker rejects
unknown type names.

## Primitives

* `string` — free-form text, used as-is.
* `float` — parsed as a decimal number.
* `integer` — parsed as a whole number.
* `boolean` — read as a true/false flag.
* `formula` — the text is evaluated as a formula expression.

## Named game resources

These are names of things the game loads by name, which are not mod object
definitions:

* `texture` — the name of an image in the game's texture set.
* `font` — the name of one of the game's fonts.
* `color` — a colour name resolved through the game's colour lookup.
* `sound` — the name of a sound effect.
* `song` — the name of a music track.
* `globalVar` — the **name** of a global variable, not its value. Use this
  whenever the code passes the argument to a global-variable getter or setter:
  the {ENTITY} reads or writes the variable's contents rather than treating the
  argument as literal text.

## References to mod-defined objects

When the value is looked up in a table of mod-definable objects, use the
canonical class name exactly as it appears in `./mod-validator/src/mod-schema.json`
— for example `Action`, `ActorClass`, `ActorType`, `ActorValue`, `Faction`,
`ItemType`, `Palette`, `SupportAbility`, `TerrainType`, `Zone`, `DialogNode`,
`Location`, `Trigger`, `FXData`, `Animation`.

Use the canonical name, never an alias. `mod-schema.json` is generated output and
is not a behavioural source, but it is the authoritative list of canonical type
names — that is the one thing it is for here.

`Actor` means the ID of an actor present in the world at runtime, not an
`ActorType` definition. The distinction matters to modders, so pick based on
which lookup the code actually performs.

## Enum values

Written namespaced exactly as they appear in the `enums` section of
`mod-schema.json` — for example `Element`, `ItemType.ItemCategory`,
`Action.specialProperty`, `Task.TaskType`.

## Job-specific types

{EXTRA_TYPES}

## Keeping this list honest

The primitives and named resources above are documentation vocabulary: they are
names we chose for modders, not names the game declares, so they do not change
when the game updates. The object-reference and enum names do come from the
game, via `mod-schema.json`, so they follow a version update on their own.

`check-evidence.cjs` enforces the same vocabulary and holds its own copy of the
fixed half. If you add a name here, add it there too.

## When nothing fits

If a value's consumption matches none of the above, record the closest primitive
and note the situation in the review log rather than inventing a type name. A
wrong-but-known type name is a silent error; an unknown one is a checker failure.

Being typed `string` is not an excuse to skip evidence: cite the line where the
value is used as literal text, the same as any other type.
