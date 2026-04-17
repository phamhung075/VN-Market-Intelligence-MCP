# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 118 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1350 | test(ohlcv-backfill): TDD test 1350-ohlcv-backfill-endpoint.test.ts — written FIRST | Done | Dev |
| 1351 | feat(ohlcv-backfill): POST /api/push-ohlcv-history endpoint + vps-scripts/fetch-ohlcv-backfill.sh | Todo | Dev |

> Tech design: `docs/TECH_118.md` (APPROVED_BY_ARCHITECT)

---

## Sprint 117 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1348 | test(france-summary-cron): TDD test 1348-france-summary-cron-window.test.ts — written FIRST | Done | Dev |
| 1349 | fix(france-summary-cron): widen cron window to every-30-min 06-08 UTC with dedup guard | Done | Dev |

> Tech design: `docs/TECH_117.md` (APPROVED_BY_ARCHITECT)

---

## Sprint 116 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1346 | test(ta-adaptive): write 1346-ta-adaptive-periods.test.ts against pre-fix code | Done | Dev |
| 1347 | fix(ta-adaptive): lower guard to 8, apply adaptive Math.min for RSI + MA periods | Done | Dev |

---

## Sprint 115 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1344 | test(france-summary): TDD test 1344-france-summary-stale-alerts.test.ts — written FIRST | Done | Dev |
| 1345 | fix(france-summary): add 24h time window to fetchTopAlerts + same-day dedup guard | Done | Dev |

> Tech design: `docs/TECH_115.md` (APPROVED_BY_ARCHITECT)

---

## Sprint 114 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1342 | test(ta-fallback): TDD test 1342-ta-fallback-intraday.test.ts — written FIRST | Done | Dev |
| 1343 | fix(ta-fallback): defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows | Done | Dev |

---

## Sprint 113 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1341 | fix(test-crash): inject ragRetriever stub in test 1332 to eliminate LanceDB exit-132 crash | Done | Dev |

---

## Sprint 112 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1339 | test(alert-delivery): TDD test 1339-alert-delivery-medium.test.ts — medium severity | Done | Dev |
| 1340 | fix(alert-delivery): add medium to readUnnotifiedAlerts severity IN list | Done | Dev |

---

## Sprint 111 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1337 | fix(test-isolation): 297-foreign-flow-fix DB_PATH at line 1 + afterAll closeDb | Done | Dev |
| 1338 | fix(test-timeout): 296-ocr-pipeline-e2e add explicit timeout on OCR it() | Done | Dev |

---

## Sprint 110 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1335 | fix(news-pipeline): diagnose and fix zero rag_analyses rows in production | Done |
| 1336 | test(news-pipeline): TDD test 1335-news-pipeline-rag-insert.test.ts | Done |

---

## Sprint 109 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1334 | chore(tasks): archive stale task detail blocks + fix sprint status entries | Done |

---

## Sprint 108 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1332 | test(source-health): TDD test 1332-pollnews-source-display-name.test.ts — written FIRST | Done |
| 1333 | fix(source-health): add SOURCE_DISPLAY_NAMES map to pollNews — record health under display name | Done |

---

## Task Details (active tasks only)

### Task 1350 — test(ohlcv-backfill): TDD test

**Branch**: `task/1350-ohlcv-backfill-tdd`
**Layer**: test
**Depends on**: none

**Files to create**
- CREATE: `src/__tests__/1350-ohlcv-backfill-endpoint.test.ts`

**Files to read first**
- `src/infrastructure/db/schema.ts` lines 152-165 (daily_ohlcv table schema)
- `src/__tests__/297-foreign-flow-fix.test.ts` (pattern reference for push-* endpoint tests)
- `src/interface/mcp/server.ts` lines 656-717 (push-foreign-flow handler, same auth pattern)

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

**Files to modify**
- MODIFY: `src/interface/mcp/server.ts` — add handler block immediately before `// ── 404 ───` comment (~line 1190)

**Files to create**
- CREATE: `vps-scripts/fetch-ohlcv-backfill.sh`

**Files to read first**
- `docs/TECH_118.md` (full handler logic, upsert SQL, VPS script spec)
- `src/interface/mcp/server.ts` lines 656-717 (push-foreign-flow — pattern to mirror exactly)
- `src/interface/mcp/server.ts` lines 459-476 (push-prices OHLCV block — existing upsert pattern)
- `vps-scripts/fetch-bctc.sh` (VPS script pattern — one-time, not systemd loop)

**Acceptance Criteria**

**Given** the handler is added to server.ts and vps-scripts/fetch-ohlcv-backfill.sh exists
**When** the 5 TDD tests from task 1350 are run
**Then**
- All 5 tests pass with 0 failures
- `bun tsc --noEmit` shows 0 errors
- `OhlcvBar` and `PushOhlcvHistoryPayload` interfaces declared (no `any`)
- Upsert uses ON CONFLICT(code, date) DO UPDATE with full overwrite (not MAX/MIN)
- Values stored as full VND (no × 1000 conversion — TCBS sends full VND)
- VPS script: iterates all watchlist tickers, calls TCBS chart API for 90 days, POSTs to /api/push-ohlcv-history, 0.2s sleep between tickers, exits 0 always

