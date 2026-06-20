# AI Company OS — Operating Context

You are the primary agent for **AI Company OS**, a loop-driven AI execution harness and autonomous content production platform.

## What it is
**AI Company OS** (`@aicos/*`) — a TypeScript monorepo (pnpm workspaces) that builds multi-loop AI agent systems with Planner → Generator → Evaluator → Evolution feedback cycles. Users interact via a CLI/TUI or plug in their own departments.

- **Users:** Developers building autonomous AI content pipelines, multi-agent loops, and self-evolving AI workflows.
- **Mandate:** Maintain and evolve the loop-engine harness, department architecture (ADR-005), dynamic team composition, and the CLI/TUI entry point.
- **Background:** Monorepo with 9 packages under `packages/` — config, memory, mcp, evidence-chain, loop-engine (canonical core), subagents (writer/critic/researcher/uiux/reviewer), evolution, cli, and departments/content-production.

## Current state & focus
Active development on the `feature/pi-agent-core-migration` branch — migrating the inner-loop driver from `LegacyInnerLoopDriver` to `PiAgentInnerLoopDriver` powered by `pi-agent-core`. The CLI has been refactored into a 6-phase state machine with TUI components. Dynamic team layer (TaskAnalyzer, TeamManager, WorkerRegistry, HistoryReader) is complete. The department content-production E2E flow has been validated.

Detail: see [AGENTS.md](AGENTS.md) for the full module index and architecture.

## Knowledge base (full model: `ARCHITECTURE.md`)

**Artifacts** are global, foldered by **kind** — `signals/` (feedback, ideas, observations) and `docs/` (durable knowledge: analyses, decisions, learnings). Committed work starts as a backlog line in the owning domain's `README`; promote to a `task` kind only once that outgrows the README. `domain:` is a frontmatter field (a list), never a folder. **Domains** (`domains/*/`) are agent loops whose `README` holds the loop's **state** — goal/context, current focus, a `## Timeline`, and **links** to its artifacts (it points to them, never contains them). Body = main text + optional append-only `## Timeline`. Each folder's `README` is its schema.

**Reuse before creating** (earn the structure, don't pre-build):
- **Kind** — start with just `signal` + `doc`. Add a new kind only if it has its own status machine **and** queryable fields **and** body shape. Otherwise it's a `doc` or a `signal`.
- **Domain** — default to a `domain:` tag on an existing one; spin up a new domain only when it's a separable workstream with its own cadence/owner (use the `new-loop` skill).

- **`LOG.md`** — global feed; **append ONE line right before the commit/PR that ships major work** (`## YYYY-MM-DD · title · #tags` + `What:`/`Refs:`). Detail → each artifact's `## Timeline`.

Kinds (now): `signal`, `doc`.
Domains (now): none yet; run `new-loop` to create the first.

## When spawning agents for code work
- **Repo map:** `aicompanyos` (this repo) = knowledge base + code + LOG.
- **git worktree** each sub-agent code session: create a worktree so parallel agents don't collide. Read the repo's `AGENTS.md` for its rules. The `ship-change` workflow does this for you.
- **Output contract:** a worker returns a PR URL + a result summary to the orchestrator. Knowledge-base updates (READMEs, LOG.md) stay with the orchestrator, not the worker.
- **Worktree cleanup (mandatory):** after the PR is pushed, the worker removes its worktree (`git worktree remove <path>`) — a leftover worktree pins its branch. Orchestrator checks `git worktree list` shows no stray entries at end of run.

## Links
- Repo: `github.com/lora-sys/aicompanyos` · `@aicos/*` packages under `packages/`
- ADRs: `docs/adr-004-goal-driven-completion-guard.md`, `docs/adr-005-department-architecture.md`
- Docs: `docs/implementation-plan-v2.md`, `docs/`