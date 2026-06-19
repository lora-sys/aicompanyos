---
name: refactor-and-sync-terminology-or-api
description: Workflow command scaffold for refactor-and-sync-terminology-or-api in aicompanyos.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /refactor-and-sync-terminology-or-api

Use this workflow when working on **refactor-and-sync-terminology-or-api** in `aicompanyos`.

## Goal

Refactors codebase for terminology consistency or API improvements, synchronizing affected files, CLI, and documentation.

## Common Files

- `packages/loop-engine/src/**/*.ts`
- `packages/cli/src/app.ts`
- `packages/cli/src/index.ts`
- `bin/aicos`
- `bin/aicos.sh`
- `README.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Rename variables, types, or config fields across multiple modules (e.g., totalRounds → totalIterations)
- Update CLI scripts and entry points (e.g., bin/aicos, src/app.ts)
- Update or fix related logic in implementation and test files
- Update documentation to reflect new terminology or API
- Update package.json and dist outputs as needed

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.