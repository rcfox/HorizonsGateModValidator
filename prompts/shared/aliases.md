# Aliases

Do not create a new entry for each alias.

Two names are aliases when their case labels **fall through to share one body
with no intervening logic**, and that body contains no conditional behaviour on
{ALIAS_SELECTOR}. If there is even minor behavioural deviation based on
{ALIAS_SELECTOR}, they are not aliases. Similar or overlapping behaviour is not
sufficient.

Two case labels with their own separate bodies are **never** aliases, even if
their code is byte-for-byte identical. Record them as separate entries, and give
them matching descriptions if their behaviour is the same.

Many case labels are clustered together, sharing a common body that branches
internally on {ALIAS_SELECTOR}. **These are not aliases.** Consider each label
individually, and assume they are not aliases until you have read the whole body
nested under the cluster and confirmed that nothing in it inspects
{ALIAS_SELECTOR}.

## Choosing the canonical name

Keep the longest name as the canonical name and put the others in the entry's
`aliases` array. Ties are broken in order:

1. Prefer a name with no underscores.
2. Among those, prefer a name that uses camelCase.
3. If still tied, choose the lexicographically first.

Order the `aliases` array lexicographically. If there are no aliases, set
`"aliases": []` — the field is never omitted.

{ALIAS_EXCEPTIONS}

## Ordering an entry with aliases

An entry's position in the output is governed by the **first occurrence of any of
its case labels**, canonical or alias — not by the position of the canonical
name.
