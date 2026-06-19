---
name: fix-or-enhance-pipeline-with-e2e-validation
description: Workflow command scaffold for fix-or-enhance-pipeline-with-e2e-validation in aicompanyos.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /fix-or-enhance-pipeline-with-e2e-validation

Use this workflow when working on **fix-or-enhance-pipeline-with-e2e-validation** in `aicompanyos`.

## Goal

Fixes or enhances a pipeline (e.g., E2E content production, memory integration), updating exports, tests, and validation scripts.

## Common Files

- `packages/loop-engine/src/index.ts`
- `packages/cli/__tests__/e2e-content-production.ts`
- `packages/loop-engine/dist/index.*`
- `learning-records/*.md`
- `lessons/*.html`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update src/index.ts to export new or missing classes/functions
- Update or add E2E test scripts (e.g., e2e-content-production.ts)
- Validate changes by running E2E tests and recording results
- Document the change in lessons/ and learning-records/

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.