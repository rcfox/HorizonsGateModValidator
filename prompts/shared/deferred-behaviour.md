# Deferred behaviour

Some {ENTITY_PLURAL} do not act when they are read. They append to a list, set a
timer, or hand work to a queue that is drained later, so the real observable
behaviour — *when* the effect happens, and under what conditions — lives at the
drain site, not in the case body. A description written only from the case body
will be wrong about timing, which is the thing a modder most needs to get right.

Whenever a body adds to a list or schedules work rather than acting immediately,
**find every call site of the code that consumes it** and describe each firing
condition. Grep for the consuming function by name across the source rather than
assuming the one call site you happened to read is the only one:

```
grep -rn "<consumingFunctionName>" ./Tactics/ ./Tactics.UI/ ./Tactics.Dialog/
```

Several drain sites with different conditions means several firing paths, and all
of them belong in the description. A queued effect that fires immediately in one
context and on a delay in another is exactly the kind of difference that turns
into a mod bug.

{DEFERRED_EXAMPLE}

Treat this as a checklist item, not a special case for one entry: if a {ENTITY}
queues work, its entry is not finished until every drain site is accounted for.
