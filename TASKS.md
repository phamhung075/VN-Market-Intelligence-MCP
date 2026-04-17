# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 122 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done | QA |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Todo | Dev |

> Req spec: `docs/REQ_122.md` — READY (BA complete)
> Tech design: `docs/TECH_122.md` — APPROVED_BY_ARCHITECT

---

## Task Details (active tasks only)

### Task 1358 — test(ohlcv-aggregator): TDD test (written FIRST, must be RED)

**Branch**: `task/1358-ohlcv-aggregator-tdd`
**Layer**: test
**Depends on**: none

**Files to read first**
- `src/scheduler/ohlcvStartupProbe.ts` (injection pattern)
- `src/__tests__/1356-ta-diag.test.ts` (in-memory DB pattern for scheduler tests)

**Files to create**
- CREATE: `src/__tests__/1358-ohlcv-daily-aggregator.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";` — DDL: `watchlist`, `market_prices_history`, `daily_ohlcv`
Pin `nowMsFn` → `2026-04-17T09:00:00.000Z`, `windowStart="2026-04-16T17:00:00.000Z"`

**Acceptance Criteria** (all RED before 1359, all GREEN after)
- AC-1: VCB+FPT 3 ticks each → 2 rows, correct O/H/L/C/V, date="2026-04-17", result={2,2,0}
- AC-2: 1 ticker, 0 ticks → 0 rows, no throw, result={1,0,1}
- AC-3: existing VCB row + 1 later tick, re-run → 1 row, close updated, no UNIQUE error
- AC-4: ticks in yesterday's window only → 0 rows today, result={1,0,1}
- `sendWorkFn` called once when rowsWritten > 0; `bun tsc --noEmit` 0 errors

---

### Task 1359 — feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts

**Branch**: `task/1359-ohlcv-aggregator-impl`
**Layer**: scheduler
**Depends on**: 1358 (TDD tests written, confirmed RED)

**Files to read first**
- `src/scheduler/ohlcvStartupProbe.ts` (injection pattern + dynamic import defaults)
- `src/scheduler/jobs.ts` (CRONS object + startScheduler cron.schedule pattern)
- `src/infrastructure/db/schema.ts` (daily_ohlcv + market_prices_history schemas)

**Files to create**
- CREATE: `src/scheduler/ohlcvDailyAggregatorJob.ts` — exports `OhlcvAggregatorDeps`, `OhlcvAggregatorResult`, `runOhlcvDailyAggregator`

**Files to modify**
- MODIFY: `src/scheduler/jobs.ts` — add `CRONS.ohlcvDailyAggregator` + `cron.schedule` registration
- MODIFY: `docs/data/cron-registry.json` — append entry, set `schedulerFileCount: 33`
- MODIFY: `docs/data/project-stats.json` — set `schedulerFileCount: 33`

**Acceptance Criteria**

**Given** 1358 tests are RED
**When** implementation is complete and `bun test src/__tests__/1358-ohlcv-daily-aggregator.test.ts` runs
**Then**
- All 4 AC tests pass / 0 fail
- VN midnight boundary: `windowStart = new Date(Date.parse(vnDateString+"T00:00:00+07:00")).toISOString()`, `windowEnd = new Date(nowMs).toISOString()`
- SQL uses 3 queries per ticker (MIN/MAX/COUNT, ASC LIMIT 1, DESC LIMIT 1) with `[code, windowStart, windowEnd]` bindings
- Upsert: `INSERT INTO daily_ohlcv ... ON CONFLICT(code, date) DO UPDATE SET ...` (no INSERT OR REPLACE)
- Cron: `CRONS.ohlcvDailyAggregator = Bun.env.CRON_OHLCV_DAILY_AGGREGATOR ?? '0 16 * * 1-5'`, `timezone: 'UTC'`
- `cron-registry.json` entry added (`"name":"ohlcvDailyAggregatorJob"`, `"schedule":"16:00 UTC M-F (23:00 VN)"`)
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures
