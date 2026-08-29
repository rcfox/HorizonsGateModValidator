# Evidence sidecar

Every claim in the output must be backed by a citation into the source.
Citations go into {EVIDENCE_FILE} and **never** into the descriptions themselves.
The descriptions are written once, for modders; the evidence is written once, for
review. Neither is derived from the other.

The sidecar is checked mechanically by `npm run check:evidence`, which verifies
that every cited line exists and contains its snippet verbatim, and that every
claim the schema requires has a supporting record.

## Record shape

Each line of {EVIDENCE_FILE} is one JSON object:

```
{
  "entity": "icon_action",
  "use": 0,
  "claim": "required:Argument 1",
  "file": "./Tactics.UI/UIDynamicText.cs",
  "line": 720,
  "snippet": "if (array3.Length < 2 || array3[1] == \"\"",
  "note": "gate-the-use-case guard: aborts the whole branch when the argument is absent"
}
```

| Field | Required | Meaning |
|---|---|---|
| `entity` | always | The canonical name of the entry the record supports, as written in that entry's `name`. {ENTITY_KEY_NOTE} |
| `use` | {USE_FIELD_REQUIRED} | Zero-based index into that entry's `uses` array. |
| `claim` | always | What this record supports. The vocabulary is listed in the calling prompt. |
| `file` | always | Path of the file the claim is read from, relative to the repository root, starting `./`. |
| `line` | always | 1-based line number within that file. |
| `snippet` | always | A **verbatim substring of that exact line**, long enough to be recognisable. |
| `note` | optional | One line. Name the guard classification, or explain why a non-obvious line supports the claim. |

## Snippet rules

The snippet must be copied from the file, not reconstructed from memory. Do not
paraphrase it, do not reflow it across lines, do not normalise whitespace, and do
not repair what looks like a decompilation artefact. It is compared as a plain
substring of the single cited line, so an approximate snippet is a failure, and a
snippet spanning two lines can never match.

Keep it short enough to sit on one line and long enough to identify the code —
the condition, the assignment, or the call, rather than a bare variable name.

## Choosing what to cite

Cross-file citations are expected and encouraged: when a called helper is what
actually determines the behaviour, cite the helper, not the call.

Prefer the line that **decides** the claim over the line that merely mentions the
value. The line that guards an input is rarely the line that reveals what the
input means, which is why an input's optionality and its type are separate
claims: cite the size check for one and the lookup or parse for the other.

A single line may be cited by several records, and one claim may cite several
lines. When a claim rests on two lines that are individually unconvincing, cite
both.

## Coverage

The calling prompt lists the claim vocabulary and which claims are mandatory.
Beyond that: every prose field the schema marks as always-required needs at
least one supporting record, and every input needs both an optionality record and
a `type` record.

Records that match no entry are treated as failures too — a claim naming an entry
or use that does not exist means either the entry was dropped or the record was
mistyped, and both need looking at.

## Writing the file

Append to {EVIDENCE_FILE} with the same temp-file-and-concatenate approach used
for the data file (see `execution.md`). Never overwrite it. Write an entry's
evidence records in the same step as the entry itself, before moving on.
