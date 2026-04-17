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

## Sprint 129 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1372 | fix(france-test-fixtures): update stale makeDb() in 5 test files — add market_prices_history + watchlist tables | Done | QA |
| 1373 | fix(cron-registry-count): update schedulerFileCount assertion in 1190-pipeline-watchdog.test.ts from 32 → 34 | Done | QA |

> Goal: Fix 17 pre-existing test failures — stale franceSummaryJob test fixtures that still use market_prices to seed movers (impl now reads market_prices_history + watchlist JOIN); plus fix stale schedulerFileCount assertion (32 → 34).
> Affected files: src/__tests__/1290-france-summary-job.test.ts, 1316-france-summary-rewrite.test.ts, 1344-france-summary-stale-alerts.test.ts, 1348-france-summary-cron-window.test.ts, 1364-france-ta-detail.test.ts, 1190-pipeline-watchdog.test.ts

---

## Task Details (active tasks only)

### Task 1372 — fix(france-test-fixtures): update stale makeDb() in 5 test files

**Branch**: `task/1372-1373-france-test-fixtures`
**Layer**: test
**Depends on**: none

**Context**: Sprint 128 changed `fetchTopMovers` to read from `market_prices_history` + `watchlist` JOIN. Five older test files still create only a `market_prices` table and seed via `INSERT INTO market_prices` — the new impl can't find those rows, returns no movers, and `sent: false`, failing AC checks.

**Files to modify** (add `market_prices_history` + `watchlist` tables to `makeDb()`, update seed helpers):
- `src/__tests__/1290-france-summary-job.test.ts`
- `src/__tests__/1316-france-summary-rewrite.test.ts`
- `src/__tests__/1344-france-summary-stale-alerts.test.ts`
- `src/__tests__/1348-france-summary-cron-window.test.ts`
- `src/__tests__/1364-france-ta-detail.test.ts`

**Pattern** (apply to each `makeDb()` function — add after existing table creates):
```sql
CREATE TABLE IF NOT EXISTS market_prices_history (
  code       TEXT NOT NULL,
  price      REAL NOT NULL,
  volume     REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  exchange   TEXT DEFAULT 'HOSE',
  PRIMARY KEY (code, fetched_at)
);
CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
  ON market_prices_history(code, fetched_at DESC);
CREATE TABLE IF NOT EXISTS watchlist (
  code   TEXT PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT 'unknown'
);
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code TEXT NOT NULL, date TEXT NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
  close REAL NOT NULL, volume REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL, PRIMARY KEY (code, date)
);
```

**Seed helper pattern** — replace `INSERT INTO market_prices` seeds with a helper that inserts two rows into `market_prices_history` (yesterday + today) and one row into `watchlist`:
```sql
-- yesterday row
INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
  VALUES (?, priceYesterday, 1000000, '2026-04-16T08:00:00');
-- today row
INSERT OR REPLACE INTO market_prices_history (code, price, volume, fetched_at)
  VALUES (?, priceToday, 1000000, '2026-04-17T08:00:00');
-- watchlist
INSERT OR REPLACE INTO watchlist (code) VALUES (?);
```

**Acceptance Criteria**
- All 17 previously-failing tests pass (0 new failures)
- `bun tsc --noEmit` 0 errors
- Full suite net improvement: 17 fewer failures vs current baseline

---

### Task 1373 — fix(cron-registry-count): schedulerFileCount 32 → 34 in 1190-pipeline-watchdog.test.ts

**Branch**: same as 1372 (`task/1372-1373-france-test-fixtures`)
**Layer**: test
**Depends on**: none

**Files to modify**
- `src/__tests__/1190-pipeline-watchdog.test.ts` — find assertion `schedulerFileCount === 32`, update to `=== 34`

**Acceptance Criteria**
- `cron-registry.json integrity > schedulerFileCount === 34` passes
- `bun tsc --noEmit` 0 errors

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
