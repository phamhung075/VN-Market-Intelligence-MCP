# TASK 1920c — Commodity Tracker + Shipping Index Refresh Scheduler Job

**Sprint:** 1920 | **Tier:** 2 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** S
**DDD Layer:** application + infrastructure | **Owner:** dev-mcp-server
**Status:** Ready for Dev

---

## Context

Two existing infrastructure adapters write to macro data tables but have no scheduler callers:

- `commodityTracker.ts` (`infrastructure/db/commodityTracker.ts`) — writes to `commodity_prices` (snapshot, PRIMARY KEY on `source`) and `commodity_prices_history` (append-only). Contains fetch + write logic directly.
- `shippingIndex.ts` (`infrastructure/fetchers/shippingIndex.ts`) — fetches BDI/FBX from Yahoo Finance and writes to `tracked_indicators` table.

These tables feed the regime/phase-clock used by `financial-analyst`. Stale commodity data produces silent regime mis-classification — no error is surfaced to the user.

This task creates `commodityTrackerRefreshJob.ts` under `apps/mcp-server/src/scheduler/macro/` and wires one new cron in `cronConfig.ts` and `startScheduler.ts`. The job is a thin scheduler caller — the write logic already exists in the two adapter files above.

Note: `macroIndicatorRefresh` already runs at `0 6 * * *`. The new `commodityTrackerRefresh` uses the same cron expression. These are kept as SEPARATE job registrations for independent `cron_job_runs` observability — do NOT merge into `macroIndicatorRefreshJob.ts`.

---

## Requirements

### FR-1 — Daily commodity prices refresh
**DDD layer:** application

Register a daily cron (`commodityTrackerRefresh`, 06:00 UTC every day) that calls `commodityTracker.ts`'s fetch-and-write function. This refreshes the `commodity_prices` snapshot row and appends a new row to `commodity_prices_history`.

NY-close pricing is settled by 22:00 NY (01:00 UTC+1). 06:00 UTC is well after settlement — data is fresh.

### FR-2 — Daily shipping index refresh
**DDD layer:** application

In the same job file, call `shippingIndex.ts`'s fetch-and-write function as a second call block after FR-1. Writes to `tracked_indicators` (same table as macroIndicatorRefresh — no schema conflict).

Both calls fire within the same daily 06:00 UTC cron invocation.

### FR-3 — Fail-loud on WORK channel
**DDD layer:** infrastructure

If either `commodityTracker` call or `shippingIndex` call throws, send `send_telegram(channel="work")` with job name + which call failed + error summary. Use WORK channel (data-pipeline failure), not BUG. Each call block has its own try/catch — failure of one does not prevent the other from running.

### FR-4 — recordJobRun observability
**DDD layer:** infrastructure

Wrap the overall job body in `recordJobRun(db, jobName, fn)`. `cron_job_runs` tracks status and combined rows_written for both commodity + shipping calls.

### FR-5 — cronConfig.ts addition
**DDD layer:** infrastructure

Append to the `CRONS` export:

```
commodityTrackerRefresh: Bun.env.CRON_COMMODITY_TRACKER ?? '0 6 * * *'
```

Override via `CRON_COMMODITY_TRACKER` env var. No side-effects at module load.

### FR-6 — startScheduler.ts wiring
**DDD layer:** infrastructure

Import and register the cron function from `commodityTrackerRefreshJob.ts` in `startScheduler.ts`. Zone: `macro/`.

### NFR-1 — Idempotency
- `commodity_prices`: PRIMARY KEY on `source`. Use `INSERT OR REPLACE` (architect-confirmed: no FK references to `commodity_prices.rowid`, safe to delete+reinsert).
- `commodity_prices_history`: append-only. Plain INSERT. Two rows on the same timestamp are tolerated — history is additive.
- `tracked_indicators` (shipping): existing idempotency pattern in `shippingIndex.ts` — follow as-is.

### NFR-2 — DDD code-smell note (non-blocking)
`commodityTracker.ts` calls `import { getDb } from "./schema.js"` directly — this couples the infrastructure adapter to the global DB singleton. The job may call it without injection (matching current pattern). This is noted as a future refactor target; it is NOT a blocker for 1920c. Developer should add a `TODO(1920c): inject db instead of direct getDb()` comment for future sprint.

### NFR-3 — Geo-access
Yahoo Finance (used by `shippingIndex.ts`) is reachable from France without VPS. `shippingIndex.ts` already has `BDI_VPS_PROXY_URL` env override if geo-block is observed post-deploy. No VPS configuration change required for this task.

---

## Acceptance Criteria

- AC-1 (cadence): `commodityTrackerRefresh` fires daily at 06:00 UTC. Verifiable in `cron_job_runs`.
- AC-2 (commodity coverage): After first successful run, `SELECT COUNT(DISTINCT source) FROM commodity_prices` >= 10 commodity codes refreshed.
- AC-3 (history append): After N daily runs, `SELECT COUNT(*) FROM commodity_prices_history` = N * (number of commodity sources). Each run appends new rows.
- AC-4 (shipping): After first successful run, `SELECT COUNT(*) FROM tracked_indicators WHERE source='shipping'` >= 1.
- AC-5 (error isolation): Unit test — if `commodityTracker` call throws, `shippingIndex` call still executes. `sendWorkFn` spy called once with commodity error.
- AC-6 (shipping error isolation): Unit test — if `shippingIndex` call throws, `sendWorkFn` spy called once with shipping error; commodity rows still written.
- AC-7 (idempotency): Two consecutive same-day runs: `SELECT COUNT(DISTINCT source) FROM commodity_prices` unchanged (INSERT OR REPLACE, not INSERT).
- AC-8 (recordJobRun): `cron_job_runs` row inserted per run.

---

## Edge Cases

- Yahoo Finance geo-block (low risk): `shippingIndex.ts` has `BDI_VPS_PROXY_URL` env override already. No job-level change needed — the adapter handles routing.
- `commodity_prices_history` timestamp collision: if the job runs twice within the same minute (e.g., Docker restart mid-second), two rows are inserted with near-identical timestamps. This is acceptable — history is append-only by design.
- Commodity source unavailable (one of N sources returns error): `commodityTracker.ts` writer should handle partial results gracefully. If it throws on any partial failure, the job's outer try/catch will send a WORK alert but still attempt the shipping call.
- `INSERT OR REPLACE` on `commodity_prices`: rowid resets. No FK references confirmed (ARCH-1920 R-4). No impact on downstream queries.

---

## Files Changed (expected)

- `apps/mcp-server/src/scheduler/macro/commodityTrackerRefreshJob.ts` — NEW file
- `apps/mcp-server/src/scheduler/cronConfig.ts` — append `commodityTrackerRefresh` key
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + register cron function
- `apps/mcp-server/src/__tests__/1920c-commodity-tracker-refresh-job.test.ts` — NEW test file

---

## Blockers

None. No PO questions required. Writers already exist. Geo-access confirmed for France (ARCH-1920 R-5).

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Unit (cron expression) | `CRONS.commodityTrackerRefresh === '0 6 * * *'` |
| AC-2 | Integration | `SELECT COUNT(DISTINCT source) FROM commodity_prices` >= 10 |
| AC-3 | Integration | `SELECT COUNT(*) FROM commodity_prices_history` = N × sources after N runs |
| AC-4 | Integration | `tracked_indicators` has shipping row after run |
| AC-5 | Unit | commodityTracker throws → shippingIndex still called; sendWorkFn called with commodity error |
| AC-6 | Unit | shippingIndex throws → sendWorkFn called with shipping error; commodity rows already written |
| AC-7 | Integration | Two runs → `SELECT COUNT(DISTINCT source) FROM commodity_prices` unchanged |
| AC-8 | Unit | `recordJobRunSpy` receives status + rows_written |
