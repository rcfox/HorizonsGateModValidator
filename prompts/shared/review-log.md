# Review log

Record any errors, uncertainties, suspected bugs, or non-obvious judgement calls
to `./mod-validator/out/errors.md` and continue with the rest of the
{ENTITY_PLURAL}.

This file is a loose review log, not a strictly structured document — grouping
related notes together is fine, and some noise is acceptable. Its purpose is to
surface anything that would otherwise push you toward a hedged or vague
description in the main output. When you catch yourself about to write "may" or
"appears to", that is the signal: commit to the most likely reading in the
description, and put the doubt here.

A reasonable structure is one section per {ENTITY}:

```
## <name>
- <one-line description of the issue or uncertainty>
- <additional notes if needed>
```

Unlike a description, a review-log note is written for someone who *does* have
the source. Name files, lines, classes and methods freely here.

Append new sections to the bottom of the file; never overwrite existing entries.
The file is shared by every extraction job, so do not reorganise or prune what
another job wrote.

`errors.md` is raw intake. Its notes are triaged into `./mod-validator/out/review/`
by category afterwards, as a separate manual step — never as part of a run. The
file opens with an index of what has already been triaged and ends with a
`# New notes below this line` marker; append below that and ignore the rest.

Things that always belong here:

* An {ENTITY} whose behaviour you could not determine conclusively.
* A judgement call that a reasonable reader might have made differently —
  especially a split-or-merge decision on use cases, or an alias call.
* A suspected bug in the game code.
* An input whose consumption matches no available type name.
* Anything the reference UI will need to present specially.
