---
name: add-or-enhance-module-with-tests-and-docs
description: Workflow command scaffold for add-or-enhance-module-with-tests-and-docs in aicompanyos.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-enhance-module-with-tests-and-docs

Use this workflow when working on **add-or-enhance-module-with-tests-and-docs** in `aicompanyos`.

## Goal

Adds a new module or major feature (e.g., team architecture, memory moat) including implementation, unit tests, and documentation updates.

## Common Files

- `packages/loop-engine/src/team/*.ts`
- `packages/loop-engine/src/completion-guard/*.ts`
- `packages/loop-engine/src/team/__tests__/*.ts`
- `packages/loop-engine/__tests__/*.test.ts`
- `packages/departments/content-production/src/team/*.ts`
- `packages/departments/content-production/src/team/__tests__/*.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update multiple source files in a module directory (e.g., src/team/, src/completion-guard/)
- Add or update corresponding test files in __tests__/
- Update or add documentation files (README.md, MODULE_GUIDE.md, AGENTS.md, UBIQUITOUS_LANGUAGE.md, lessons/, learning-records/)
- Update package.json and build outputs (dist/)
- Synchronize types and interfaces if needed

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.