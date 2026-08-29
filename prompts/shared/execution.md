# Execution methodology

This is a long-running, unattended extraction process. Do not request user input,
confirmations or additional permissions. Proceed autonomously using the provided
tools and instructions. Do not stop to report progress.

## Order of work

Process {ENTITY_PLURAL} **one-by-one**, in {ENUMERATION_ORDER}. Finish one
completely — including its evidence records — before starting the next.

Do not read ahead to plan the whole run, and do not batch several
{ENTITY_PLURAL} into one pass of analysis. Each entry is written from a fresh
reading of its own source.

## Writing output

After processing each {ENTITY}, append its entry to {DATA_FILE} and its evidence
records to {EVIDENCE_FILE}. Write both before moving to the next {ENTITY}.

Do not wait to finish all {ENTITY_PLURAL} before writing output.

Both files are JSONL: one JSON object per line, no trailing commas, no wrapping
array. The schema examples in the calling prompt are shown across multiple lines
for readability — **write each object on a single line**.

Never overwrite or recreate either file. Do not use the `Write` tool on them,
since it overwrites. Append by writing the new lines to a temp file and
concatenating:

```
cat /tmp/entry.jsonl >> {DATA_FILE}
```

Do not write progress markers, sentinels, comments, or "TODO continue from X"
lines into either file. They contain only valid JSON objects, one per line.

## Resuming

It is expected that the run will be interrupted, because it does not fit within
the token budget of one context window. Do not adjust your behaviour according to
the remaining token budget: do not rush, do not thin out descriptions as the
budget shrinks, and do not stop early to leave room for a summary.

On a later run, read {DATA_FILE}, identify the last entry recorded, and resume
from {RESUME_RULE}. Do not reprocess completed {ENTITY_PLURAL}.

If the last entry appears incomplete or malformed, delete that line from
{DATA_FILE}, delete that entry's records from {EVIDENCE_FILE}, and reprocess it.

## Corrections to earlier entries

If you realise that an already-written entry other than the last needs correcting
— for example because a rule was clarified partway through the run — do not
rewrite it, in bulk or with a script. Record the affected names and the needed
correction in the review log and leave the entries in place for handling after
the run.

## No automation of the data

Do not invent scripts to automate the population of any data. Every entry is
written from a reading of the source. A script may only be used for mechanical
support that does not decide content: greps, line lookups, appending a file you
have already written, and the completeness checks below.

## Finishing

While processing, do not pause to estimate total effort or to validate global
correctness.

A single completeness-and-validity check after every {ENTITY} has been processed
is encouraged:

* {COMPLETENESS_CHECK}
* Every line of both output files parses as JSON.
* `npm run check:evidence` passes.

Fix what that check turns up, then stop.

## Output discipline

Do not summarize, explain, or restate the extracted information in the message
buffer. Do not emit parsed data to the message buffer.

Never claim completion unless every {ENTITY} has been processed. If processing
stops early, stop silently: no partial completion summary, no "stopped at X"
note, no wrap-up message.
