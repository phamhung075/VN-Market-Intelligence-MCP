# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 122 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done | QA |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Done | Dev |

> Req spec: `docs/REQ_122.md` | Tech design: `docs/TECH_122.md` | PO sign-off: 2026-04-17

---

## Sprint 123 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Done | QA |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Done | Dev |

> Req spec: `docs/REQ_123.md` | Tech design: `docs/TECH_123.md` | PO sign-off: 2026-04-17

---

## Sprint 124 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1362 | test(vps-deploy-backfill): TDD — deploy script wires ohlcv-backfill-poll.sh | Done | QA |
| 1363 | feat(vps-deploy-backfill): deploy-vinahost.sh — add backfill poller as 6th service | Done | Dev |

> Goal: Wire ohlcv-backfill-poll.sh into deploy-vinahost.sh so the VPS poller is installed automatically — without this, the Sprint 123 queue mechanism is dead (VPS never polls it)
> Tech design: `docs/TECH_124.md` | PO sign-off: 2026-04-17

---

## Sprint 125 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1364 | test(france-ta-detail): TDD — franceSummaryJob TA section shows ticker signals not just count | Done | QA |
| 1365 | feat(france-ta-detail): franceSummaryJob — replace taCount with top 3 non-neutral TA signals | Done | QA |

> Goal: Enrich France morning briefing TA section with actionable ticker-level RSI/MA20 signals so the user sees which watchlist stocks are overbought/oversold each morning, not just a count.
> Req spec: `docs/REQ_125.md` | Tech design: `docs/TECH_125.md` | PO sign-off: 2026-04-17

---

## Sprint 126 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1366 | test(pipeline-health-tool): TDD — get_pipeline_health MCP tool returns OHLCV + backfill + TA status | Done | QA |
| 1367 | feat(pipeline-health-tool): implement get_pipeline_health MCP tool | Done | QA |

> Goal: Add `get_pipeline_health` MCP tool so the user/dev team can instantly inspect the full OHLCV → TA pipeline state (row counts per ticker, backfill queue status, last aggregator run, TA signal count) without digging into logs or waiting for the next evening report.
> Req spec: `docs/REQ_126.md` | Tech design: `docs/TECH_126.md` | PO sign-off: 2026-04-17

---

## Sprint 127 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1368 | test(ohlcv-aggregator-notify): TDD — ohlcvDailyAggregatorJob sends WORK-channel summary after aggregation | Done | QA |
| 1369 | feat(ohlcv-aggregator-notify): ohlcvDailyAggregatorJob — post WORK-channel health summary post-aggregation | Done | QA |

> Goal: Make the OHLCV → TA pipeline visible after each run. After `ohlcvDailyAggregatorJob` completes, send a WORK-channel Telegram summarizing: rows aggregated per ticker, how many tickers are TA-ready (>=8 rows), and whether taSummary would be non-empty at next evening report. Silent pipeline failures are invisible to the dev team today.
> Sprint 127 | PO initiated: 2026-04-17

---

## Sprint 127 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1370 | test(france-watchlist-movers): TDD — fetchTopMovers filters by watchlist | Review | QA |
| 1371 | feat(france-watchlist-movers): fetchTopMovers JOIN watchlist, source market_prices_history | Todo | Dev |

> Goal: France morning briefing movers section currently shows any ticker with the highest % move globally. Filter to watchlist-only so the user only sees moves for stocks they track.
> Branch(1370): `task/1370-france-watchlist-movers-tdd`

---

## Task Details (active tasks only)

### Task 1368 — test(ohlcv-aggregator-notify): TDD RED tests

**Branch**: `task/1368-ohlcv-aggregator-notify-tdd`
**Layer**: test
**Depends on**: none

**Context**: `ohlcvDailyAggregatorJob` (Sprint 122) runs at `0 16 * * 1-5` UTC and aggregates intraday ticks into `daily_ohlcv`. When it finishes, no notification is sent — the dev team has no way to know how many rows were aggregated or whether TA signals will appear in the evening report. The `get_pipeline_health` MCP tool (Sprint 126) can answer this question but requires manual invocation.

**Files to read first**
- `src/scheduler/ohlcvDailyAggregatorJob.ts` (current structure, injectable params)
- `src/__tests__/1358-ohlcv-daily-aggregator.test.ts` (existing pattern for this job)
- `src/infrastructure/notifiers/telegram.ts` (sendTelegramWork pattern)

**Files to create**
- CREATE: `src/__tests__/1368-ohlcv-aggregator-notify.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`

**Acceptance Criteria** (all RED before 1369, all GREEN after)
- AC-1: After aggregation with 10 rows for "VIC" and 5 rows for "HPG", sendWorkFn called once with message containing "VIC" and "HPG"
- AC-2: Message includes count of TA-ready tickers (>= 8 rows) — "2/2 sẵn sàng TA" or equivalent
- AC-3: When sendWorkFn throws, job does NOT propagate error (notification is best-effort)
- AC-4: When zero rows aggregated (empty DB), sendWorkFn called with message indicating 0 rows / 0 tickers TA-ready
- `bun tsc --noEmit` 0 errors

---

### Task 1369 — feat(ohlcv-aggregator-notify): post WORK-channel health summary

**Branch**: `task/1369-ohlcv-aggregator-notify-impl`
**Layer**: scheduler
**Depends on**: 1368 (TDD tests RED)

**Files to read first**
- `src/__tests__/1368-ohlcv-aggregator-notify.test.ts` (AC definitions)
- `src/scheduler/ohlcvDailyAggregatorJob.ts` (inject sendWorkFn parameter)

**Files to modify**
- MODIFY: `src/scheduler/ohlcvDailyAggregatorJob.ts` — add optional `sendWorkFn` injectable param; after aggregation loop, call with summary: rows per ticker, TA-ready count, timestamp

**Notification message format** (Vietnamese, WORK channel):
```
OHLCV tổng hợp {date}: {N} tickers, {M} sẵn sàng TA (>= 8 ngày)
Top: {ticker1}={rows1}d, {ticker2}={rows2}d, {ticker3}={rows3}d
```

**Acceptance Criteria**
- All 4 AC tests from 1368 pass
- `sendWorkFn` defaults to `sendTelegramWork` when not injected (prod path)
- Notification is best-effort: any error caught+logged, job continues
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures

---

### Task 1370 — test(france-watchlist-movers): TDD tests for watchlist-filtered movers

**Branch**: `task/1370-france-watchlist-movers-tdd`
**Layer**: test
**Depends on**: none
**Status**: Review

**Context**: `fetchTopMovers` in `franceSummaryJob.ts` currently queries `market_prices` globally — any ticker in the DB can appear as a top mover. The France briefing should only show movers for stocks the user watches. Task 1371 will change the query to JOIN watchlist and source from `market_prices_history`.

**Files created**
- `src/__tests__/1370-france-watchlist-movers.test.ts`

**Acceptance Criteria** (AC-1/AC-2 are RED; AC-3/AC-4 pass for implementation-independent reasons)
- AC-1: non-watchlist ticker has highest % move → excluded from movers; watchlist ticker appears
- AC-2: empty watchlist → movers array is empty (no crash)
- AC-3: watchlist ticker has no price row → handled gracefully, not included in movers
- AC-4: 5 watchlist tickers with moves → movers capped at top 3 by abs(change%)
- `bun tsc --noEmit` 0 errors

---

### Task 1371 — feat(france-watchlist-movers): fetchTopMovers JOIN watchlist

**Branch**: `task/1371-france-watchlist-movers-impl`
**Layer**: interface/scheduler
**Depends on**: 1370 (TDD tests RED)
**Status**: Todo

**Files to read first**
- `src/__tests__/1370-france-watchlist-movers.test.ts` (AC definitions)
- `src/scheduler/franceSummaryJob.ts` (fetchTopMovers to modify)
- `src/infrastructure/db/schema.ts` (market_prices_history schema)

**Files to modify**
- MODIFY: `src/scheduler/franceSummaryJob.ts` — change `fetchTopMovers` to JOIN watchlist and query `market_prices_history` (latest price per code) instead of `market_prices`

**New query shape**:
```sql
SELECT w.code, mph.price, mph.change_pct
FROM watchlist w
JOIN (
  SELECT code, price,
         ROUND((price - LAG(price) OVER (PARTITION BY code ORDER BY fetched_at)) /
               LAG(price) OVER (PARTITION BY code ORDER BY fetched_at) * 100, 2) AS change_pct
  FROM market_prices_history
) mph ON mph.code = w.code
WHERE mph.change_pct IS NOT NULL
ORDER BY ABS(mph.change_pct) DESC
LIMIT 3
```

**Acceptance Criteria**
- All 4 AC tests from 1370 pass (GREEN)
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 126 | feat(pipeline-health-tool): get_pipeline_health MCP tool — OHLCV row counts + TA readiness (1366, 1367) | COMPLETE 2026-04-17 |
| 125 | feat(france-ta-detail): France briefing TA section — ticker-level RSI/MA20 (1364, 1365) | COMPLETE 2026-04-17 |
| 124 | feat(vps-deploy-backfill): wire ohlcv-backfill-poll.sh as 6th VPS service (1362, 1363) | COMPLETE 2026-04-17 |
| 123 | feat(ohlcv-backfill-queue): auto-trigger backfill via VPS pull pattern (1360, 1361) | COMPLETE 2026-04-17 |
| 122 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob post-close cron (1358, 1359) | COMPLETE 2026-04-17 |
| 121 | feat(ta-diag): taDiag observability block in evening summary (1356, 1357) | COMPLETE 2026-04-17 |
| 120 | fix(prediction-diag): predictionDiag + medium-severity fallback (1354, 1355) | COMPLETE 2026-04-17 |
