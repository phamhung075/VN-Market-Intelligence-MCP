# Archive — Sprints 109–119

> Archived from TASKS.md on 2026-04-17. Active board → `TASKS.md`.

---

## Sprint 119 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1352 | test(ohlcv-startup-probe): TDD test 1352-ohlcv-startup-probe.test.ts — written FIRST | Done | Dev |
| 1353 | feat(ohlcv-startup-probe): ohlcvStartupProbe.ts + jobs.ts wire-up | Done | QA |

Tech design: `docs/TECH_119.md`

---

## Sprint 118 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1350 | test(ohlcv-backfill): TDD test 1350-ohlcv-backfill-endpoint.test.ts — written FIRST | Done | Dev |
| 1351 | feat(ohlcv-backfill): POST /api/push-ohlcv-history endpoint + vps-scripts/fetch-ohlcv-backfill.sh | Done | Dev |

Tech design: `docs/TECH_118.md`

### Task 1350 — test(ohlcv-backfill): TDD test

**Branch**: `task/1350-ohlcv-backfill-tdd`
**Layer**: test
**Depends on**: none

**Files created**
- `src/__tests__/1350-ohlcv-backfill-endpoint.test.ts`

**Acceptance Criteria**

**Given** an in-memory SQLite DB with daily_ohlcv table, Bun server on port 0
**When** five test cases are executed against POST /api/push-ohlcv-history
**Then**
- Case 1: valid key + 3 bars → 200 `{ ok:true, inserted:3, code:"VNM" }`, DB has 3 rows
- Case 2: duplicate upsert same 3 bars → DB still has 3 rows (not 6), close reflects latest push
- Case 3: missing X-API-Key → 401 `{ error:"Unauthorized" }`
- Case 4: `bars: []` → 200 `{ ok:true, inserted:0 }`, DB has 0 rows
- Case 5: missing `code` / `bars` not array → 400 `{ error:"..." }`
- `bun test 1350` passes with 0 failures on unimplemented endpoint (tests written first, expected to fail until 1351)
- Line 1 of file: `process.env["DB_PATH"] = ":memory:";`

---

### Task 1351 — feat(ohlcv-backfill): handler + VPS script

**Branch**: `task/1351-ohlcv-backfill-impl`
**Layer**: interface + infrastructure (VPS)
**Depends on**: 1350 (TDD tests written)

**Files modified**
- `src/interface/mcp/server.ts` — POST /api/push-ohlcv-history handler added
- `vps-scripts/fetch-ohlcv-backfill.sh` — NEW

**Acceptance Criteria**

**Given** the handler is added to server.ts and vps-scripts/fetch-ohlcv-backfill.sh exists
**When** the 5 TDD tests from task 1350 are run
**Then**
- All 5 tests pass / 0 fail
- `bun tsc --noEmit` shows 0 errors
- `OhlcvBar` and `PushOhlcvHistoryPayload` interfaces declared (no `any`)
- Upsert uses ON CONFLICT(code, date) DO UPDATE with full overwrite
- Values stored as full VND (no × 1000 conversion)
- VPS script: iterates all watchlist tickers, calls TCBS chart API for 90 days, POSTs to /api/push-ohlcv-history, 0.2s sleep between tickers, exits 0 always

---

## Sprint 117 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1348 | test(france-summary-cron): TDD test 1348-france-summary-cron-window.test.ts — written FIRST | Done | Dev |
| 1349 | fix(france-summary-cron): widen cron window to every-30-min 06-08 UTC with dedup guard | Done | Dev |

Tech design: `docs/TECH_117.md`

---

## Sprint 116 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1346 | test(ta-adaptive): write 1346-ta-adaptive-periods.test.ts against pre-fix code | Done | Dev |
| 1347 | fix(ta-adaptive): lower guard to 8, apply adaptive Math.min for RSI + MA periods | Done | Dev |

---

## Sprint 115 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1344 | test(france-summary): TDD test 1344-france-summary-stale-alerts.test.ts — written FIRST | Done | Dev |
| 1345 | fix(france-summary): add 24h time window to fetchTopAlerts + same-day dedup guard | Done | Dev |

Tech design: `docs/TECH_115.md`

---

## Sprint 114 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1342 | test(ta-fallback): TDD test 1342-ta-fallback-intraday.test.ts — written FIRST | Done | Dev |
| 1343 | fix(ta-fallback): defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows | Done | Dev |

---

## Sprint 113 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1341 | fix(test-crash): inject ragRetriever stub in test 1332 to eliminate LanceDB exit-132 crash | Done | Dev |

---

## Sprint 112 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1339 | test(alert-delivery): TDD test 1339-alert-delivery-medium.test.ts — medium severity | Done | Dev |
| 1340 | fix(alert-delivery): add medium to readUnnotifiedAlerts severity IN list | Done | Dev |

---

## Sprint 111 — Done

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1337 | fix(test-isolation): 297-foreign-flow-fix DB_PATH at line 1 + afterAll closeDb | Done | Dev |
| 1338 | fix(test-timeout): 296-ocr-pipeline-e2e add explicit timeout on OCR it() | Done | Dev |

---

## Sprint 110 — Done

| ID | Title | Status |
|----|-------|--------|
| 1335 | fix(news-pipeline): diagnose and fix zero rag_analyses rows in production | Done |
| 1336 | test(news-pipeline): TDD test 1335-news-pipeline-rag-insert.test.ts | Done |

---

## Sprint 109 — Done

| ID | Title | Status |
|----|-------|--------|
| 1334 | chore(tasks): archive stale task detail blocks + fix sprint status entries | Done |
