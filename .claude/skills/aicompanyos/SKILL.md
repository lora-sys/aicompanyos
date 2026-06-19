```markdown
# aicompanyos Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you how to contribute effectively to the `aicompanyos` TypeScript codebase. You'll learn the project's coding conventions, how to structure new modules and features, how to fix or enhance pipelines with end-to-end validation, and how to refactor for terminology or API improvements. The guide also covers testing patterns and provides command shortcuts for common workflows.

## Coding Conventions

- **Language:** TypeScript (no framework detected)
- **File Naming:** Use `camelCase` for file and directory names.
  - Example: `completionGuard.ts`, `teamManager.ts`
- **Import Style:** Use relative imports.
  ```typescript
  import { TeamManager } from './teamManager';
  ```
- **Export Style:** Use named exports.
  ```typescript
  // teamManager.ts
  export function createTeam() { ... }
  export class TeamManager { ... }
  ```
- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/) with prefixes like `feat`, `fix`, `refactor`.
  - Example: `feat: add dynamic team architecture to loop-engine`

## Workflows

### Add or Enhance Module with Tests and Docs
**Trigger:** When introducing a new core module or feature (e.g., dynamic team, memory moat) with validation and documentation.  
**Command:** `/new-module`

1. **Create or update module files**  
   - Add new `.ts` files in the relevant module directory, e.g., `src/team/` or `src/completion-guard/`.
   - Example:
     ```typescript
     // src/team/dynamicTeam.ts
     export function createDynamicTeam(...) { ... }
     ```
2. **Add or update corresponding test files**  
   - Place tests in `__tests__/` directories, following the pattern `*.test.ts`.
     ```typescript
     // src/team/__tests__/dynamicTeam.test.ts
     import { createDynamicTeam } from '../dynamicTeam';
     import { describe, it, expect } from 'vitest';

     describe('createDynamicTeam', () => {
       it('should create a team with correct members', () => {
         // test logic
       });
     });
     ```
3. **Update or add documentation**  
   - Edit or create files like `README.md`, `MODULE_GUIDE.md`, `AGENTS.md`, `UBIQUITOUS_LANGUAGE.md`.
   - Add or update learning materials in `lessons/` and `learning-records/`.
4. **Update package and build outputs**  
   - Update `package.json` if needed.
   - Ensure build outputs in `dist/` are up to date.
5. **Synchronize types and interfaces**  
   - Update shared types/interfaces across modules if required.

---

### Fix or Enhance Pipeline with E2E Validation
**Trigger:** When fixing a missing export, integrating a new class, or validating pipeline changes end-to-end.  
**Command:** `/fix-pipeline`

1. **Update exports**  
   - Edit `src/index.ts` to export new or missing classes/functions.
     ```typescript
     // src/index.ts
     export * from './team/dynamicTeam';
     ```
2. **Update or add E2E test scripts**  
   - Add scripts like `e2e-content-production.ts` in `__tests__/`.
3. **Validate changes**  
   - Run E2E tests and record results.
     ```bash
     npx vitest run packages/cli/__tests__/e2e-content-production.ts
     ```
   - Document findings in `learning-records/` or `lessons/`.
4. **Update documentation**  
   - Summarize changes in the relevant markdown files.

---

### Refactor and Sync Terminology or API
**Trigger:** When standardizing terminology or refactoring APIs across modules, CLI, and documentation.  
**Command:** `/refactor-api`

1. **Rename variables, types, or config fields**  
   - Update across multiple modules, e.g., `totalRounds` → `totalIterations`.
     ```typescript
     // Before
     export interface TeamConfig { totalRounds: number; }
     // After
     export interface TeamConfig { totalIterations: number; }
     ```
2. **Update CLI scripts and entry points**  
   - Edit files like `bin/aicos`, `src/app.ts`, and `src/index.ts`.
3. **Update logic in implementation and test files**  
   - Ensure all references and tests use the new terminology/API.
4. **Update documentation**  
   - Reflect changes in `README.md`, `AGENTS.md`, `MODULE_GUIDE.md`.
5. **Update package and build outputs**  
   - Update `package.json` and ensure `dist/` is rebuilt if needed.

## Testing Patterns

- **Framework:** [vitest](https://vitest.dev/)
- **Test File Pattern:** `*.test.ts` inside `__tests__/` directories.
- **Test Example:**
  ```typescript
  // src/team/__tests__/dynamicTeam.test.ts
  import { createDynamicTeam } from '../dynamicTeam';
  import { describe, it, expect } from 'vitest';

  describe('createDynamicTeam', () => {
    it('should create a team with correct members', () => {
      // test logic here
    });
  });
  ```
- **Run Tests:**
  ```bash
  npx vitest run
  ```

## Commands

| Command        | Purpose                                                                 |
|----------------|------------------------------------------------------------------------|
| /new-module    | Add or enhance a module with implementation, tests, and documentation   |
| /fix-pipeline  | Fix or enhance a pipeline with E2E validation and documentation         |
| /refactor-api  | Refactor terminology or API and synchronize code, CLI, and documentation|
```
