# Inputs

An input is a value the modder supplies. This fragment covers naming inputs and
deciding which are required.

## Naming and identifying inputs

Name inputs from the **modder's perspective**, using the form {INPUT_LABEL},
where the position is the one the modder writes — not the position after any
runtime rearrangement. Some {ENTITY_PLURAL} remap their inputs before use (for
example inserting an empty value to shift later ones along, or splitting a single
`"a,b"` value into two slots). Document the input at the position the modder
fills, and note the remapping in that input's description where it affects how
the value must be supplied.

Only {INPUT_CONTAINER} holds inputs. Do not invent other input sources and do not
invent positions that are not actually accessed in the code.

Do not collapse several positions into one conceptual input, and do not split one
position into several. If a local variable aliases a position, it is not a
separate input — record the position.

{CONTEXT_INPUT_RULE}

## Variable-length runs

If a {ENTITY} reads a dynamic number of values from one container (a loop over
the remaining elements, rather than fixed positions), record it as a single input
named by the lower bound of the run with a plus sign appended — {VARIADIC_LABEL}.
This tells the modder that any number of values may follow.

Fixed inputs that come before the variable-length run are listed separately. A
{ENTITY} whose first position is a distinct value and whose second and later
positions are then joined has two inputs: the fixed one, and the variadic one
starting at the second position.

## Required vs optional

Evaluate required-vs-optional **per use case**, treating the use case's own
selecting or gating condition as already satisfied. Then classify each access by
how it is guarded:

* **Unconditional access** — the value is read directly without first verifying
  the container's size → **required**. A check on the *value* does not make an
  input optional: `if (value == "")` or `if (value > 0)` still crashes when the
  element does not exist. Only a check on the container's `Length`/`Count`
  counts as a guard.
* **Default-and-continue guard** — a size check that supplies a fallback and
  keeps executing → **optional**. The modder may leave it out and still get
  sensible behaviour, so the description must say what the fallback is.
* **Gate-the-use-case guard** — a size check that, on failure, aborts the whole
  behaviour with an early exit, or that selects which of several mutually
  exclusive branches runs → the gated input is **required for the use case it
  gates**, not optional. The behaviour simply does not happen without it.

The distinction is whether the size check provides a usable default (optional) or
decides whether a behaviour happens at all (required for that behaviour's use
case).

Record the outcome as {OPTIONALITY_ENCODING}.

## Inputs a use case does not touch

If an input is not accessed at all in a given use case, do not list it under that
use case — neither as required nor as optional. Optionality is only for inputs
whose access is conditionally guarded; an input that is absent from the branch
entirely is simply omitted from that use case.

**Exception: the implicit-required rule.** If a later position in a container is
required, every earlier position in that same container is also required, because
the container must be long enough for the later one to be readable. If the
earlier position is not otherwise accessed in that use case, describe it using
its description from a use case where it is accessed; if there is no such use
case, describe it as "Unused in this branch but must be provided as a
placeholder."

The implicit-required rule takes precedence over the omission rule above.
