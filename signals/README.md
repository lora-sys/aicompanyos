# signals/ — evidence

One file per **signal**: a piece of feedback, an idea, or an observation worth remembering.
Signals are **deduped and frequency-counted** — when the same thing shows up again, you don't
make a new file, you add a Timeline entry to the existing one and bump `frequency`.

This README is the schema. See `ARCHITECTURE.md` for the model.

## Frontmatter

```yaml
---
kind: signal
category: feedback | idea | friction | observation   # what sort of signal
frequency: 1                # how many times seen; increment on recurrence
sources: []                 # where it came from (links, ticket ids, urls)
domain: []                  # which loop(s) this feeds — a list of domain names
status: open | triaged | actioned | closed
---
```

## Body

A short statement of the signal (what, and why it matters), then an optional append-only
`## Timeline` accumulating each sighting:

```
## Timeline
YYYY-MM-DD | <source> — <what happened>
```

`frequency` = number of Timeline entries. Link related artifacts with `[[slug]]`.

## Naming

`<short-kebab-slug>.md`, or a stable id like `SIG-<n>.md` if you prefer running numbers.