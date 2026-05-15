# TASK 1920a — vnstock Fundamentals + Trading Stats Scheduler Job

**Sprint:** 1920 | **Tier:** 1 | **Type:** FEATURE | **Zone:** apps/mcp-server/ | **Size:** M
**DDD Layer:** application + infrastructure | **Owner:** dev-mcp-server
**Status:** In Progress (PM assigned)

---

## [PM] Planning Context

**Developer assigned:** dev-mcp-server
**ZONE:** apps/mcp-server/
**Sequencing:** Parallel with 1920b/c (2 at a time, WIP=2). 1920d (broker sanctions) sequenced last due to CRITICAL schema migration pre-condition.
**Duration estimate:** ~2h
**Handoff:** This file is the SSOT. Accept when: file paths created, cronConfig keys added, startScheduler wiring complete, acceptance criteria tests pass.

---

## Context

`vnstockStore.ts` contains writers for 7 tables (`vnstock_financials`, `vnstock_balance_sheet`, `vnstock_cash_flow`, `vnstock_events`, `vnstock_officers`, `vnstock_shareholders`, `vnstock_trading_stats`). All 7 tables have UNIQUE constraints and upsert logic. However, zero scheduler jobs invoke these writers — data is populated only on-demand via MCP tool calls (`syncVnstockData.ts`).

`syncVnstockData.ts` (application use-case) already contains the full fetch-and-store pipeline with staleness thresholds (6h for financials, 24h for officers/shareholders, 7d for events) and enforces a 2500ms inter-call delay (~24 req/min against a 60 req/min ceiling). A full 30-ticker sweep takes 7–10 minutes wall-clock.

This task creates `vnstockFundamentalsJob.ts` under `apps/mcp-server/src/scheduler/financial-reports/` and wires two new cron registrations into `cronConfig.ts` and `startScheduler.ts`.

---

## Requirements

### FR-1 — Weekly batch refresh of 6 fundamental tables
**DDD layer:** application

Register a weekly cron (`vnstockFundamentalsRefresh`, Mon 01:00 UTC) that iterates the 30-ticker watchlist and calls `syncVnstockData(db, ticker)` for each ticker. Covers: `vnstock_financials`, `vnstock_balance_sheet`, `vnstock_cash_flow`, `vnstock_events`, `vnstock_officers`, `vnstock_shareholders`.

Watchlist source: use the same watchlist accessor already used by existing scheduler jobs (do not hardcode tickers in the job body).

### FR-2 — Daily trading stats refresh
**DDD layer:** application

Register a separate daily cron (`vnstockTradingStatsRefresh`, weekdays 08:30 UTC) in the same job file that iterates the watchlist and syncs `vnstock_trading_stats` per ticker. This cron fires ~30 min after HOSE close (15:00 VN = 08:00 UTC), so 08:30 UTC is post-settlement.

### FR-3 — Per-ticker error isolation
**DDD layer:** application

Wrap each `syncVnstockData()` call in a try/catch. A 429 rate-limit or network error on one ticker must NOT abort the remaining tickers. Accumulate `{ failed: string[], succeeded: number }` across the loop. Log failed tickers into `cron_job_runs.error_msg` as a comma-separated list.

### FR-4 — isRunning concurrency guard
**DDD layer:** application

The job function must maintain an `isRunning` boolean flag (module-level or injected via deps). If a sweep is already in progress when the cron fires again (possible if watchlist expands), log a WORK warning and skip the duplicate invocation. Pattern: same as `sscCheckerJob.ts`.

### FR-5 — Fail-loud on WORK channel
**DDD layer:** infrastructure

If the total `failed` count exceeds zero at sweep completion, call `send_telegram(channel="work")` with job name + failed ticker list + error summary. This is a data-pipeline failure — use WORK channel, NOT BUG.

### FR-6 — recordJobRun observability
**DDD layer:** infrastructure

Wrap the job body in `recordJobRun(db, jobName, fn)` following the pattern in `sscCheckerJob.ts` and `macroIndicatorRefreshJob.ts`. `cron_job_runs` table tracks status, rows_written, error_msg per run.

### FR-7 — cronConfig.ts additions
**DDD layer:** infrastructure

Append two new keys to the `CRONS` export in `cronConfig.ts`:

```
vnstockFundamentalsRefresh: Bun.env.CRON_VNSTOCK_FUNDAMENTALS  ?? '0 1 * * 1'
vnstockTradingStatsRefresh: Bun.env.CRON_VNSTOCK_TRADING_STATS ?? '30 8 * * 1-5'
```

Both follow the existing `Bun.env.CRON_*` override pattern. No side-effects at module load time.

### FR-8 — startScheduler.ts wiring
**DDD layer:** infrastructure

Import and register both cron functions from `vnstockFundamentalsJob.ts` in `startScheduler.ts`. Follow the pattern of existing financial-reports zone jobs.

### NFR-1 — Rate-limit compliance
Must NOT bypass the 2500ms inter-call delay in `syncVnstockData.ts`. The job calls the existing use-case as-is — no custom delay logic in the job body.

### NFR-2 — Idempotency
All 7 tables use `ON CONFLICT DO UPDATE` (upsert). Repeated job runs on the same day are safe — existing rows are updated, not duplicated.

### NFR-3 — VN locale / BCTC data edge cases
- Vietnamese quarterly filings (Báo cáo tài chính — BCTC) are in triệu đồng (million VND). The `vnstock_financials` columns already expect this unit — no conversion in the job layer.
- Quarterly report periods (Quý Q1/Q2/Q3/Q4) may arrive mid-quarter via `vnstock_events` before full BCTC filing. The weekly cadence catches same-week BCTC updates.
- `vnstock_trading_stats` date column is TEXT YYYY-MM-DD; upsert key is `(code, date)`.

---

## Acceptance Criteria

- AC-1 (cadence): `vnstockFundamentalsRefresh` fires at Mon 01:00 UTC; `vnstockTradingStatsRefresh` fires daily weekdays 08:30 UTC. Both verifiable in `cron_job_runs`.
- AC-2 (coverage): After first successful `vnstockFundamentalsRefresh` run, `SELECT COUNT(DISTINCT code) FROM vnstock_financials` returns >= 25 (of 30 watchlist tickers).
- AC-3 (isolation): Unit test — if `syncVnstockData` throws for ticker[0], the job continues and processes tickers[1..29]. Final `succeeded` count = 29.
- AC-4 (isRunning guard): Unit test — second invocation while first is running logs WORK warning and returns early without calling `syncVnstockData`.
- AC-5 (WORK alert): Integration test — when `failed.length > 0`, a `send_telegram(channel="work")` call is made containing the failed ticker names.
- AC-6 (recordJobRun): `cron_job_runs` row inserted per run with `status` and `rows_written` populated.
- AC-7 (idempotency): Two consecutive same-day runs of `vnstockTradingStatsRefresh` do not double-insert rows — upsert overwrites same `(code, date)` key.
- AC-8 (no rate-limit bypass): `syncVnstockData` is called sequentially (not concurrently) per ticker — no `Promise.all` over the ticker array.

---

## Edge Cases

- Missing ticker data: if vnstock API returns empty array for a ticker, `syncVnstockData` handles the empty result gracefully; job should not log this as a failure (zero rows written is acceptable for tickers with no quarterly data yet).
- Ticker delisted mid-sweep: `syncVnstockData` may return 0 rows. Treat as success (0 rows_written), not failure.
- VN public holidays: `vnstockTradingStatsRefresh` runs weekdays only (`1-5`). On exchange holidays the API may return empty or prior-day data — upsert handles this safely.
- Watchlist expansion: if watchlist grows beyond ~60 tickers, sweep time exceeds 15 min. The `isRunning` guard (FR-4) prevents double-fire. No action needed unless watchlist reaches this threshold.
- Network timeout mid-sweep: per-ticker try/catch absorbs the timeout; remaining tickers processed. Timeout tickers appear in `error_msg`.

---

## Files Changed (expected)

- `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — NEW file
- `apps/mcp-server/src/scheduler/cronConfig.ts` — append 2 new CRON keys
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + register both cron functions
- `apps/mcp-server/src/__tests__/1920a-vnstock-fundamentals-job.test.ts` — NEW test file

---

## Blockers

None. No PO questions required. Architect brief (ARCH-1920) is the authority — all decisions encoded above.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Unit (cron expression) | `CRONS.vnstockFundamentalsRefresh === '0 1 * * 1'`; `CRONS.vnstockTradingStatsRefresh === '30 8 * * 1-5'` |
| AC-2 | Integration | In-memory DB: `SELECT COUNT(DISTINCT code) FROM vnstock_financials` >= 25 after job run |
| AC-3 | Unit | Ticker[0] throws → remaining 29 tickers still processed; succeeded=29 |
| AC-4 | Unit | `isRunning=true` → early return, `syncVnstockData` spy not called |
| AC-5 | Unit | `failed.length > 0` → `sendWorkFn` spy called with failed tickers |
| AC-6 | Unit | `recordJobRunSpy` receives status + rows_written per run |
| AC-7 | Integration | Two runs → `SELECT COUNT(*) FROM vnstock_trading_stats WHERE code='VCB'` = 1 (upsert, not 2) |
| AC-8 | Unit | `syncVnstockData` mock called sequentially; no concurrent `Promise.all` over watchlist |
