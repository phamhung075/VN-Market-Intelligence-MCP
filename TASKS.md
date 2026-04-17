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

## Sprint 127 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1368 | test(ohlcv-aggregator-notify): TDD — ohlcvDailyAggregatorJob sends WORK-channel summary after aggregation | Done | QA |
| 1369 | feat(ohlcv-aggregator-notify): ohlcvDailyAggregatorJob — post WORK-channel health summary post-aggregation | Done | QA |

> Goal: Make the OHLCV → TA pipeline visible after each run. After `ohlcvDailyAggregatorJob` completes, send a WORK-channel Telegram summarizing: rows aggregated per ticker, how many tickers are TA-ready (>=8 rows), and whether taSummary would be non-empty at next evening report. Silent pipeline failures are invisible to the dev team today.
> Req spec: `docs/REQ_127.md` | Tech design: `docs/TECH_127.md` | PO sign-off: 2026-04-17

---

## Sprint 128 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1370 | test(france-watchlist-movers): TDD — fetchTopMovers filters by watchlist | Done | QA |
| 1371 | feat(france-watchlist-movers): fetchTopMovers JOIN watchlist, source market_prices_history | Done | Dev |

> Goal: France morning briefing movers section currently shows any ticker with the highest % move globally. Filter to watchlist-only so the user only sees moves for stocks they track.
> Branch(1370): merged to main 2026-04-17 | Branch(1371): merged to main 2026-04-17 | PO sign-off: 2026-04-17

---

## Sprint 129 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1372 | fix(france-test-fixtures): update stale makeDb() in 5 test files — add market_prices_history + watchlist tables | Done | QA |
| 1373 | fix(cron-registry-count): update schedulerFileCount assertion in 1190-pipeline-watchdog.test.ts from 32 → 34 | Done | QA |

> Goal: Fix 17 pre-existing test failures — stale franceSummaryJob test fixtures. Tasks merged 2026-04-17. Full suite: 4998 pass, 1 fail (intentional OCR), 20 skip.
> PO sign-off: 2026-04-17

---

## Sprint 130 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1374 | test(ohlcv-aggregator-cron): TDD — CRON_OHLCV_DAILY_AGGREGATOR default is 0 15 * * 1-5 (before evening summary at 15:30) | Review | QA |
| 1375 | fix(ohlcv-aggregator-cron): shift ohlcvDailyAggregator from 16:00 UTC to 15:00 UTC — before evening summary | Review | Dev |

> Goal: Fix `taSummary: []` in every evening report — the aggregator runs at 16:00 UTC but evening summary fires at 15:30 UTC, so TA signals are never ready. Move aggregator to 15:00 UTC (22:00 VN) giving 30 min margin.
> Branch: `task/1374-1375-ohlcv-cron-timing`

---

## Sprint 131 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1376 | fix(evening-summary-db): add optional db param to runEveningSummary for test isolation | Review | Dev |
| 1377 | fix(evening-summary-test): inject in-memory DB into 1192 test to prevent production-DB bleed | Review | Dev |

> Goal: Fix production-DB bleed in 1192-evening-summary-empty-fallback.test.ts — dedup guard was reading the production singleton DB, causing the test to skip when a real evening summary had already run today.
> Branch: `task/1376-1377-evening-summary-db-isolation`

---

## Task Details (active tasks only)

### Task 1374 — test(ohlcv-aggregator-cron): TDD — aggregator cron default before 15:30

**Branch**: `task/1374-1375-ohlcv-cron-timing`
**Layer**: test
**Depends on**: none

**Context**: `ohlcvDailyAggregatorJob` runs at `0 16 * * 1-5` (16:00 UTC) but `eveningSummaryJob` fires at `30 22 * * 1-5` (22:30 UTC? No — check jobs.ts: eveningSummary default `30 22` is 22:30 VN = 15:30 UTC). The aggregator fires 30 min AFTER the summary, so `taSummary` is always empty in the evening JSON. Fix: move aggregator default to `0 15 * * 1-5` (15:00 UTC = 22:00 VN), 30 min before the summary.

**File to create**: `src/__tests__/1374-ohlcv-aggregator-cron.test.ts`

**Acceptance Criteria**
- Test asserts: `CRONS.ohlcvDailyAggregator` default value equals `"0 15 * * 1-5"`
- Test asserts: `CRONS.eveningSummary` default value equals `"30 22 * * 1-5"` (unchanged, for documentation)
- `bun tsc --noEmit` 0 errors
- Test is RED before fix (current default is `0 16`)

---

### Task 1375 — fix(ohlcv-aggregator-cron): shift default from 16:00 to 15:00 UTC

**Branch**: same as 1374 (`task/1374-1375-ohlcv-cron-timing`)
**Layer**: scheduler
**Depends on**: 1374

**Files to modify**
- `src/scheduler/jobs.ts` — change `ohlcvDailyAggregator` default from `'0 16 * * 1-5'` to `'0 15 * * 1-5'`

**Acceptance Criteria**
- `CRONS.ohlcvDailyAggregator` default = `'0 15 * * 1-5'`
- Test 1374 is GREEN
- `bun tsc --noEmit` 0 errors
- No other cron defaults changed
- Full suite regression: 0 new failures

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 127 | feat(ohlcv-aggregator-notify): WORK-channel post-aggregation health summary (1368, 1369) | COMPLETE 2026-04-17 |
| 126 | feat(pipeline-health-tool): get_pipeline_health MCP tool — OHLCV row counts + TA readiness (1366, 1367) | COMPLETE 2026-04-17 |
| 125 | feat(france-ta-detail): France briefing TA section — ticker-level RSI/MA20 (1364, 1365) | COMPLETE 2026-04-17 |
| 124 | feat(vps-deploy-backfill): wire ohlcv-backfill-poll.sh as 6th VPS service (1362, 1363) | COMPLETE 2026-04-17 |
| 123 | feat(ohlcv-backfill-queue): auto-trigger backfill via VPS pull pattern (1360, 1361) | COMPLETE 2026-04-17 |
| 122 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob post-close cron (1358, 1359) | COMPLETE 2026-04-17 |
| 121 | feat(ta-diag): taDiag observability block in evening summary (1356, 1357) | COMPLETE 2026-04-17 |
| 120 | fix(prediction-diag): predictionDiag + medium-severity fallback (1354, 1355) | COMPLETE 2026-04-17 |
