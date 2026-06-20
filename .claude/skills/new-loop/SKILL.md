---
name: new-loop
description: Spin up a new loop (domain) in this knowledge base — gather its charter, scaffold domains/<loop>/README.md, ensure the signals/ + docs/ substrate exists, then do ONE real test run of the loop and record it in the loop README's Timeline and in LOG.md. Use when the user says "set up a new loop", "create a domain", "start a new beat/workstream", or names a recurring job they want the agent to own.
---

# new-loop — spin up a new loop

A **loop** (a `domain`) is a recurring thread of work the agent owns: a charter, a cadence, and
the artifacts it produces. This skill creates one, proves it works with a single real run, and
leaves behind a `domains/<loop>/README.md` that is the loop's live state.

Read `ARCHITECTURE.md` first if you haven't — it's the model this skill instantiates.

## When to use
The user wants to stand up a new workstream/beat/job (e.g. "a weekly SEO loop", "a support
triage loop", "a competitor-watch loop"). Don't use this for a one-off task — that's just a
backlog line in an existing domain, or a `doc`/`signal`.

## Inputs to gather (ask only what's missing)
Pull these from the user's request; ask a short clarifying round only for what you can't infer:

1. **name** — kebab-case, the loop's home folder (`domains/<name>/`). Keep it short.
2. **goal** — one line: the outcome this loop drives.
3. **cadence** — `manual` / `daily` / `weekly` / a cron expr. Default `manual`.
4. **what it does** — what the loop consumes (signals? data? an inbox? a URL?) and produces
   (signals? docs? a report? code changes via `ship-change`?).
5. **tools/data** — any sources or credentials it needs (note them; point at a setup skill or
   `.env` rather than inlining secrets).

If the request is already specific, infer all five and just confirm in your summary — don't
interrogate.

## Procedure

### 1. Ensure the substrate exists
From the repo root, make sure these exist (create the folder + copy the schema `README` from
this kit if missing — don't recreate one that's already there):
- `signals/README.md`, `docs/README.md` — the two starter kinds.
- `domains/README.md` — the domain schema.
- `LOG.md` — the global feed (with its header/grammar).

Do **not** pre-create a `tasks/` folder or any other kind. Earn those later per `ARCHITECTURE.md`.

### 2. Scaffold the loop README
Create `domains/<name>/README.md` from the template in `domains/README.md`, filled with the
gathered inputs. Required sections: frontmatter (`kind: domain`, `domain`, `status: active`,
`goal`, `cadence`), a 2-4 line description, `## Current focus`, `## Backlog` (the loop's to-dos
inline — these stay in the README until they earn a `task` kind), and an empty `## Timeline`.
Add `## Evidence & analysis` and `## Metrics` placeholders if relevant.

Check for collisions: if `domains/<name>/` already exists, stop and ask whether to update it
instead of overwriting.

### 3. Do ONE real test run
This is the point of the skill: prove the loop actually runs, not just that the folder exists.

**Actually run the loop once, at small scale** — do whatever the loop is meant to do (triage a
few real tickets, pull one real SERP, fetch the inbox, draft one comment, run one analysis
query, scope one code change, …). Use the loop's real tools/data where you can; if a credential
is missing, do the furthest-reachable dry run and note the gap.

**Producing an artifact is optional.** A legitimate run may surface nothing worth filing — that's
a real result, not a failure. Only create a `signal`/`doc` if the run genuinely produced one.

Whatever happens, the run has two **required** outputs:
- Append one dated line to the loop README's `## Timeline`:
  `YYYY-MM-DD | test run — <what you did and what you found / "nothing actionable yet">`.
- Append one entry to `LOG.md` using its grammar:
  ```
  ## YYYY-MM-DD · <loop-name> loop created + first run · #ops
  What: <one line — what the loop is and what the first run did/found>.
  Refs: domains/<name>/README.md (new)[, any artifact created].
  ```

### 4. Report back
Summarize to the user: the loop's charter (the five inputs), what the test run did and found,
any artifacts created (or "none — nothing actionable this run"), any missing tools/credentials
to wire up, and how to run it again (the cadence + the entry point). Keep it tight.

## Notes
- **Don't gold-plate the scaffold.** A loop README is live state, not a spec — start lean and
  let it accrete via its Timeline.
- **One loop = one separable workstream.** If what the user described is really part of an
  existing loop, say so and add it there (a backlog line + a `domain:` tag) instead of creating
  a near-duplicate domain.
- For loops that ship code, the loop's "run" can drive the `ship-change` workflow
  (`.claude/workflows/ship-change.js`) — point the README's Backlog at it.
