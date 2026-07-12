---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 5
task_id: TASK_2004
branch: task/2004-daily-ff-class-b-probes
size: S
zone: apps/mcp-server/
depends_on: ["TASK_2000"]
blocks: []
---

## TLDR
Migrate 4 Class-B "freshness/health probes" to query `daily_foreign_flow` directly instead of `daily_ohlcv`. These sites only need `MAX(updated_at)` checks for health monitoring — they now get a clean, undiluted signal that isn't conflated with OHLCV pipeline health. Genuine improvement, not just a rename.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-5 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] Migrate 4 files to query `daily_foreign_flow` directly (NOT through the view — direct table access for cleaner freshness signal):
  - [ ] `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:L111` — `MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`
  - [ ] `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts:L71` — same query shape, tool-surface twin
  - [ ] `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts:L137` — `MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`
  - [ ] `apps/mcp-server/src/domain/services/vpsHealthPoller.ts:L187` — update `latestTimestampSql` SQL string to query new table
- [ ] All 4 probes now read clean foreign-flow pipeline signal, not conflated with OHLCV pipeline state
- [ ] Verify type checks pass (`pnpm check`)
- [ ] No functional change to monitoring logic — only SQL change, same return shapes
- [ ] Add comment to each file explaining that `daily_foreign_flow` is now the authoritative freshness source (decoupled from OHLCV pipeline health)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Read-site inventory (Class B section), § Change 3 (why NOT through view)
- All 4 files listed above (grep for `MAX(updated_at)` + `foreign_buy_vol`)

### Files to modify
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`
- `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts`
- `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts`
- `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` (SQL string update)

### Files to create
- None (only modifications)

### Dependencies
- **Depends on:** TASK_2000 (new table must exist)
- **Blocks:** none
- **Parallel-safe with:** TASK_2001, TASK_2002, TASK_2003 — table exists and is backfilled before any write happens

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 3 (why NOT view), § Risk Flags R-9

### Notes
- **Zone:** `apps/mcp-server/` only
- **Size:** S — only 4 small query changes, no test updates needed (probes stay working as-is, just reading cleaner data)
- **R-9 mitigation:** if this task is deferred, probes keep working (reading legacy `daily_ohlcv.foreign_buy_vol IS NOT NULL`), but the decoupling improvement is deferred. Not a correctness issue, only a latent-false-negative improvement.
- **Key improvement:** today, `MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` conflates "is the foreign-flow VPS pipeline healthy" with "has the OHLCV pipeline also written a row" — a stalled OHLCV writer with healthy foreign-flow currently reads as STALE. Post-migration, the new table is direct, undiluted signal.
- No changes to test files — probes keep same return shapes
- Each change is a simple `FROM daily_ohlcv` → `FROM daily_foreign_flow` + `WHERE foreign_buy_vol IS NOT NULL` (same clause, just different table)

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified (production, 4 — per AC):**
  - `src/scheduler/system/freshnessSlaMonitorJob.ts:79-90,112` — `querySignalAges()` foreign_flow subquery `FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` → `FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`; comment block updated to explain decoupling rationale.
  - `src/interface/mcp/tools/system/slaStatusTools.ts:45-56,70-71` — same query-shape change (tool-surface twin of the above); comment updated.
  - `src/scheduler/vpsProxyWatchdogJob.ts:125-146` — `readLatestForeignFlowTimestamp()` SQL `FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` → `FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`; JSDoc updated.
  - `src/domain/services/vpsHealthPoller.ts:122-143,187-208` — `DEFAULT_FRESHNESS_CONFIGS` `vn-foreign-flow` entry's `latestTimestampSql` updated to target `daily_foreign_flow`; module + entry comments updated.
  - grep-verified: zero remaining `daily_ohlcv WHERE foreign_buy_vol` production references outside tests/writer/DDL — all 4 AC sites migrated, no other Class-B sites found.
- **Necessary test fallout (3 pre-existing files — handoff's "no test updates needed" assumption proved false empirically, same class as TASK_2003):**
  - `src/__tests__/FIX-VPS-HEALTH-FRESHN.test.ts` — 2 seed-based `vn-foreign-flow` tests re-seeded `daily_foreign_flow` instead of `daily_ohlcv`; added 2 new decoupling-proof tests.
  - `src/__tests__/FIX-HEALTH-MONITOR.test.ts` — 2 static-source contract-lock assertions (`.toContain("daily_ohlcv")`/`daily_foreign_flow`) + 3 seed-based behavior tests + 1 inline-SQL-fragment test updated; added 1 decoupling-proof test.
  - `src/__tests__/FIX-PDF-VOLUME-SBV-TABLE.test.ts` — 1 contract-lock assertion + 2 inline-SQL-fragment tests updated to target `daily_foreign_flow`.
- **Tests written:** `src/__tests__/TASK-2004-daily-ff-class-b-probes.test.ts` — 9 tests, 13 expect() calls, GREEN. Proves the decoupling contract for all 4 probes: fresh `daily_foreign_flow` reads fresh even when `daily_ohlcv` has no row at all; stale/empty `daily_foreign_flow` reads stale/unreachable/not-seeded even when `daily_ohlcv` has a fresh row.
- **Git commits:** (pending — see RETURN block for SHA)
- **Type check:** clean (`bun tsc --noEmit`, 0 errors)
- **bun test:**
  - New suite: 9 pass / 0 fail
  - 3-file regression-fallout set (`FIX-VPS-HEALTH-FRESHN`, `FIX-HEALTH-MONITOR`, `FIX-PDF-VOLUME-SBV-TABLE`): 46 pass / 0 fail
  - Foreign-flow file-glob sweep (all `*.test.ts` referencing `foreign_buy_vol`/`foreign_flow`/`daily_foreign_flow`, 59 files): 729 pass / 0 fail
  - Bounded single full-suite run: stalled ~20.3k lines before reaching these alphabetically-late files (documented tail-crash zone, pre-existing/unrelated — e.g. `102-job-news-poll.test.ts` timeout); targeted sweeps above are the authoritative evidence per verification-discipline instructions
- **Tool count:** 183 — matches pre-task baseline (no tool added/removed, only internal SQL of an existing tool changed)
- **Scheduler count:** N/A this diff — repo has migrated to a `CRONS` map (`cronConfig.ts`) rather than scattered literal `cron.schedule()` calls; the Gate-2d literal-grep probe (baseline 76) is stale relative to that refactor — pre-existing doc/reality drift, unrelated to this task (no scheduler registration touched)
- **Server boot:** `bun run src/index.ts` → `curl :3000/health` → `{"status":"ok","toolCount":183,...}` — clean, no import errors
- **Docs updated:** `docs/architecture/microservice/mcp-server/infrastructure.md` (daily_ohlcv_with_flow comment block — marked SUBTASK-DAILY-FF-5 SHIPPED, closes the last ARCH-DAILY-FOREIGN-FLOW-TABLE read-site subtask); `docs/architecture/microservice/mcp-server/testing.md` (new test-file row)
- **Graphify:** skipped — no new architectural concept, pure read-site migration of an already-documented table (daily_foreign_flow, documented by TASK_2000)
- **Simplicity gate:** PASS — Q1 scope clean (no feature/flag beyond the AC's table-swap), Q2 no single-use abstractions, Q3 senior-test clean (each change is a 1-line FROM-clause swap + comment), Q4 ratio <50% overhead (all lines are either the required SQL change or necessary test-fallout fixes)
