# domains/ — loops

Each subfolder is one **loop**: a thread of work with a charter, a cadence, and (optionally)
metrics. A domain folder holds only its **`README.md`** (the loop's live state) and optional
**machinery** (`metrics/*.jsonl`, collectors). It **links** to artifacts in `signals/` and
`docs/`; it never contains them.

This README is the schema. See `ARCHITECTURE.md` for the model.

## Domain README template

```markdown
---
kind: domain
domain: <loop-name>
status: active | paused | archived
goal: <one line — the outcome this loop drives>
cadence: <manual | daily | weekly | cron expr — how often it runs>
---

# <loop-name> — <short tagline>

<2-4 lines: what this loop does, what it consumes, what it produces.>

## Current focus
<The single most important thing right now.>

## Backlog
- [ ] <work item — link [[slug]] if one exists>

## Evidence & analysis
[[doc]] · [[signal]]

## Timeline
YYYY-MM-DD | <run/source> — <what happened>
```