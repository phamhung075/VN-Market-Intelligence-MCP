# Handoff: FIX-PROJECT-STATS-GENERATED

**Task:** Make `docs/data/project-stats.json` generated from source of truth — eliminate hand-typed drift  
**Agent:** dev-mcp-server  
**Status:** REVIEW  
**Date:** 2026-06-07

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/, scripts/, docs/data/project-stats.json, docs/agents/dev-mcp-server/flow/main.md, docs/agents/system-auditor/flow/main.md
- **Files modified:**
  - `scripts/gen-project-stats.ts` — new generator script (~130L)
  - `docs/data/project-stats.json` — regenerated with correct counts + `_generated_by` marker
  - `docs/agents/dev-mcp-server/flow/main.md` — Gate-2c/2d probes updated, baselines corrected
  - `docs/agents/system-auditor/flow/main.md` — Stats drift check #6 updated to invoke generator
  - `docs/data/orch/orch-state.json` — task FIX-PROJECT-STATS-GENERATED added with status REVIEW
- **Tests written:** none (generator is a utility script, not an MCP tool; no TDD cycle required per task spec)
- **Git commits:** see commit below
- **Type check:** N/A (generator uses Bun runtime, no tsc)
- **bun test:** N/A (no new test code added)
- **Tool count:** 162 (verified via generator + live /health endpoint)
- **Scheduler count:** 76 cron.schedule entries (verified by generator)
- **Docs updated:** flow/main.md Gate-2c/2d + system-auditor stats-drift section
- **Graphify:** skipped (no knowledge graph docs impacted)

---

## Discrepancy Reconciliation Table

| Source | toolCount | cronJobCount | Explanation |
|--------|-----------|--------------|-------------|
| Hand-typed `project-stats.json` (before) | 160 | 69 | Stale — last manually updated Sprint 1954 (2026-05-19). Missed ~2 tools and ~7 crons added since. |
| Source grep `server.tool\|addTool` (naive) | 164 | 71 | OVER-COUNT: included 3 hits from `briefings/telegramReportTools.ts.bak` (dead `.bak` file) AND missed `server.registerTool()` calls in `sequential-market-analysis.ts`. Net result wrong in both directions. |
| Source grep (correct: `.ts` only, both methods) | 162 | 76 | AUTHORITATIVE. See detail below. |
| Live `/health` endpoint | 162 | not reported | Health only reports `toolCount` via probe-server technique. Confirms source count = 162. `/health` never reported `cronJobCount`; the "77 cron jobs" in task spec was based on stale or alternate data. |

### Tool count reconciliation (162)

- `server.tool("name", ...)` calls in `apps/mcp-server/src/interface/mcp/tools/**/*.ts`: **161 unique names**
- `server.registerTool("name", ...)` calls (used by `sequential-market-analysis.ts`): **1 additional tool** (`sequential_market_analysis`)
- Total unique tool names: **162** — matches live `/health` probe exactly.
- Why "source says 164" was wrong: `grep -rc "server.tool\|addTool"` included `.bak` files (+3) and missed `registerTool` calls (-1), giving a net +2 overcounting. The naive grep was wrong.

### Cron job count reconciliation (76)

- `cron.schedule(...)` in `startScheduler.ts`: **71 calls**
- `cron.schedule(...)` in `summaryJobs.ts` (called via `registerSummaryJobs` from startScheduler): **5 calls**
- Total runtime cron jobs: **76**
- Why hand-typed "69" was wrong: stale value from May 2026 — 7 new cron jobs added since.
- Why task spec said "77": the live `/health` endpoint does NOT report `cronJobCount`. The "77" figure was based on stale or alternate data; the actual live count at time of task was not measurable via `/health`. Source scan (76) is the authoritative number.

---

## Chosen SSOT and Justification

**Source of registration scan** — not live `/health` probe.

Justification:
1. `/health` only reports `toolCount`, not `cronJobCount` — it cannot be the sole SSOT.
2. Source scan is deterministic and available without a running container (CI-safe).
3. The probe-server technique in `server.ts` derives `toolCount` from the same source files we scan — they are guaranteed to agree.
4. Source scan catches issues (duplicate names, `.bak` pollution) that would break the server at startup, making it a better quality gate.

---

## Generator Usage

```bash
# Standard: write docs/data/project-stats.json atomically
bun scripts/gen-project-stats.ts

# Dry-run: print what would be written without modifying the file
bun scripts/gen-project-stats.ts --dry-run
```

Wire into normal flow: run this command after any tool addition or cron job change, then commit `docs/data/project-stats.json`. The file carries `_generated_by` and `_maintained_by` markers that instruct agents/humans not to hand-edit `toolCount`/`cronJobCount`.

The system-auditor flow step §6 ("Stats drift") now calls the generator instead of instructing manual edits.

---

## Before / After Numbers

| Field | Before | After |
|-------|--------|-------|
| `toolCount` | 160 | 162 |
| `cronJobCount` | 69 | 76 |
| `infrastructureStatus.toolCount` | 154 | 162 |
| `_generated_by` | (absent) | `"bun scripts/gen-project-stats.ts"` |
| `_maintained_by` | `"PM / system-auditor"` | `"generator (do not hand-edit toolCount or cronJobCount)"` |

---

## Container Rebuild Required?

**No.** The generator reads source files and writes `docs/data/project-stats.json`. No compiled code was changed. The running mcp-server container is unaffected. No rebuild needed.

---

## QA Acceptance Criteria

1. `bun scripts/gen-project-stats.ts` exits 0 and writes `toolCount=162`, `cronJobCount=76`.
2. `bun scripts/gen-project-stats.ts --dry-run` exits 0 and prints matching JSON.
3. `docs/data/project-stats.json` has `_generated_by` field set.
4. `docs/data/project-stats.json` `toolCount` agrees with `curl -s http://localhost:3000/health | python3 -c "import sys,json; print(json.load(sys.stdin)['toolCount'])"`.
5. `docs/data/orch/orch-state.json` has task `FIX-PROJECT-STATS-GENERATED` with status `REVIEW`.
6. No hand-editable counts remain in project-stats.json without a generator-backed source.
