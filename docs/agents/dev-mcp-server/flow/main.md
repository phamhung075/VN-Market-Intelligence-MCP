<!-- size-justification: 170L — zone-specialist flow overlay; G12 DoD Gate (two-gate evidence table, streak rule, tool-suite probe commands), RUN-SOLO/explicit-add/INV-GATEWAY-1 commit discipline, ESLint fence phase note, scheduler/dashboard circular-dep protocol pointers, and implementation record template are all zone-specific mandatory content with no factoring seam; +2L for DJ-GATE-1 pointer (2026-06-07) -->
# dev-mcp-server — Main Flow

**Zone:** `apps/mcp-server/`
**Specialist for:** MCP tools, schedulers/crons, market data orchestration (gateway service)
**Language:** TypeScript / Bun

**Tools:** `docs/agents/tools/package/developer.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Architect] Brownfield Findings`

## Output
Code + tests committed | `[Developer] Implementation Record` in handoff | QA notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Shared Flow

The base implementation steps (Step 0a project-root, Step 0b notebook, pre-code checklist, TDD cycle, DDD layer rules) are defined in the shared flow:

→ Run shared flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions when reading the shared flow:
- `<service>` = `mcp-server`
- `<agent-id>` = `dev-mcp-server`
- zone restriction enforced: only `apps/mcp-server/` files
- test command: `cd apps/mcp-server && bun test`
- type check: `cd apps/mcp-server && bun tsc --noEmit`

For spike tasks (`mode: "spike"`), use `docs/agents/developer/flow/feature-spike.md` instead.

Service docs: `docs/architecture/microservice/mcp-server/`. Owns `market.db`.

Charter (service-specific deltas): `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md`

---

## ⚠️ RUN-SOLO Discipline (mandatory — read before every commit)

This zone is HIGHEST-RISK / RUN-SOLO. Before staging any files:

1. **Confirm no other scale terminal is active** — SOLO constraint is non-negotiable (charter §Scheduling).
2. **Explicit-file staging ONLY.** `git add <exact-path>` per file. NEVER `git add -A`, `git add .`, `git add -am`, or any wildcard flag. This zone has a history of 26-file over-staging incidents.
3. **Pre-commit diff review.** Run `git diff --cached --name-only` and verify ONLY the intended files appear before committing.
4. **Commit directly** — INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole responsibility; this specialist commits directly (explicit paths). No commit-mutex skill call from here. Stage (explicit paths only) → verify (`git diff --cached --name-only`) → commit.
5. **No --force, --no-verify, --no-gpg-sign.** All work on `main`. No branches.

---

## G12 DoD Gate (two-gate — mandatory — blocking from Day 0)

**Do not mark any task DONE / do not write the RETURN block until BOTH gates pass:**

| Gate | Command | Must show |
|------|---------|-----------|
| Bun test suite | `cd apps/mcp-server && bun test` | 0 failures — all existing tests PASS |
| Tool-suite integrity | See probe commands below | Tool count matches pre-task baseline; server starts; no import error |

**Tool-suite integrity probe (run after every barrel wave / any domain change):**

```bash
# Gate 2a: TypeScript check
cd apps/mcp-server && bun tsc --noEmit

# Gate 2b: Server startup (no import errors)
cd apps/mcp-server && bun run src/index.ts &
sleep 5
curl -s http://localhost:3000/health
kill %1

# Gate 2c: Tool count probe — count must match pre-task baseline (no tool silenced)
# Canonical: counts server.tool() + server.registerTool() unique names, .ts files only (no .bak)
bun scripts/gen-project-stats.ts --dry-run | grep '"toolCount"'

# Gate 2d: Scheduler count probe — total cron.schedule across ALL scheduler/*.ts files
# (startScheduler.ts + summaryJobs.ts; Gate-2d baseline = 76 as of FIX-PROJECT-STATS-GENERATED)
grep -rc "cron\.schedule" apps/mcp-server/src/scheduler/ | awk -F: '{sum+=$2} END {print sum}'
```

Both gates must exit 0 before the task is DONE.

If `bun test` exits non-zero: the task is NOT done. Fix the failing test before re-running.

If Gate 2 (tool-suite) fails: the task is NOT done even if `bun test` is green. A barrel edit that silences a tool or breaks server startup is a regression — rollback to the pre-wave tag and rethink.

**Evidence requirement:** paste the `bun test` summary line AND the Gate 2 probe outputs (tsc exit, server health response, tool count, scheduler count) into the task handoff doc before writing the RETURN block. No evidence = task is NOT accepted.

**Dashboard circular-dep check (after any barrel wave):**
```bash
curl -s http://localhost:3000/api/bctc-inspect | head -5
curl -s http://localhost:3000/dashboards/news-fetch/ | head -5
```
If either returns 500 or empty, the barrel change broke a dashboard route import. Rollback to pre-wave tag.

---

## G12 Streak Rule (3-task streak — blocking)

The three G12 streak tasks for Phase 1 are **P1-B**, **P1-C**, and **P1-D** (see `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` §G12 Streak Tasks).

Each must carry both gate evidence pasted into its handoff before it is marked DONE. The streak is broken if ANY task in the sequence ships without evidence. If the streak is broken: reopen the task, re-run both gates, re-paste evidence before re-marking DONE.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G12; `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-phase-1-task-plan.md` §G12 Streak Tasks

---

## ESLint / Architecture Fence (G4 — Phase 2 concern)

**Phase 1 does NOT require ESLint fence enforcement.** G4 is STILL-UNMET after Phase 1.

**Phase 2 target:** `eslint-plugin-boundaries` (TypeScript/Bun equivalent — NOT `depguard` which is Go-only) that blocks cross-layer imports. Config lives at `apps/mcp-server/eslint.config.mjs`. Verify existing config before creating a new one.

**Do not implement the ESLint fence during Phase 1 tasks** — any fence config change in Phase 1 is out of scope and will be rejected by QA.

Reference: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G4; `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md`

---

**Documentation review** (after code passes, before QA):
→ Run flow: `docs/agents/developer/flow/doc-review.md` with `SERVICE=mcp-server`

**Append to handoff** (before QA):
```markdown
## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** [path:lines — description]
- **Tests written:** [path — assertion count, GREEN]
- **Git commits:** [hash message]
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** N pass / 0 fail
- **Tool count:** [N tools — matches pre-task baseline]
- **Scheduler count:** [N cron.schedule entries — matches pre-task baseline (baseline 76 as of FIX-PROJECT-STATS-GENERATED)]
- **Docs updated:** [docs/architecture/microservice/mcp-server/... — what changed] | NONE
- **Graphify:** updated | skipped (no docs impacted)
```

**Notebook write** (before QA) → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `dev-mcp-server`)

**Zone health observation (mandatory — 1 line):**
```
Zone health: <e.g. "bun test 0 fail, 162 tools intact, scheduler 76 cron.schedule (gen-project-stats verified)"> | HEALTHY
```

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
# Explicit-file staging ONLY — never -A or wildcard
git add docs/agent-memory/notebooks/dev-mcp-server.md
git commit -m "chore(memory/dev-mcp-server): notebook YYYY-MM-DD"
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

**DJ-GATE-1** (mandatory before REVIEW flip): run skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: <TASK_ID>] — gate rule: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**Update `docs/data/orch/orch-state.json` `.task_board`**: task status IN_PROGRESS → REVIEW (atomic write per §2.3) → return:
```
## RETURN
DONE: Implementation complete — SERVICE=mcp-server, CHANGED=[...], NEW_PASS=N, tsc clean, tools=N, sched=N
NEXT: qa | run full QA pipeline
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```
