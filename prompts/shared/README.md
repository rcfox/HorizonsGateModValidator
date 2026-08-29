# Shared prompt fragments

Each extraction prompt in the parent directory is one job. The rules that are
common to several jobs live here so they can be fixed in one place.

An extraction prompt names the fragments it uses in its **Shared rules**
section, and defines the placeholders those fragments refer to in its
**Bindings** table. Read every fragment the prompt names before starting work;
the rules in them apply in full, exactly as if they were written inline.

Placeholders are written `{LIKE_THIS}`. A fragment never guesses their values —
substitute them from the calling prompt's Bindings table. If a fragment refers
to a placeholder the calling prompt does not bind, that rule does not apply to
that job; note the gap in the review log and continue.

| Fragment | Purpose | Used by |
|---|---|---|
| `descriptions.md` | How every prose field must be written. | all jobs |
| `use-cases.md` | Splitting behaviour into use cases, and ordering them. | jobs whose entries have a `uses` array |
| `inputs.md` | Naming inputs, and classifying them required vs optional. | jobs whose entries have inputs |
| `input-types.md` | The closed vocabulary for an input's `type`. | jobs whose inputs carry a `type` |
| `aliases.md` | When two names are one entry. | jobs whose entries have an `aliases` array |
| `evidence.md` | The citation sidecar every claim is backed by. | all jobs |
| `investigation.md` | Where to read, what not to trust, when to stop. | all jobs |
| `review-log.md` | The `errors.md` review log. | all jobs |
| `deferred-behaviour.md` | Effects that fire later than the code that queues them. | jobs whose entries can queue work |
| `execution.md` | Unattended run discipline: order, appending, resuming, finishing. | all jobs |
