# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 114 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1342 | test(ta-fallback): TDD test 1342-ta-fallback-intraday.test.ts — written FIRST | Review | Dev |
| 1343 | fix(ta-fallback): defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows | Review | Dev |

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

### 1342 — test(ta-fallback): TDD test 1342-ta-fallback-intraday.test.ts

- Spec: `docs/REQ_114.md` FR-3
- File: `src/__tests__/1342-ta-fallback-intraday.test.ts`
- Must be written and committed BEFORE task 1343.
- TC-1: daily_ohlcv >= 15 rows → primary path, non-null signal
- TC-2: daily_ohlcv < 15 rows + market_prices_history >= 15 distinct dates → fallback path, non-null signal
- TC-3: both sources empty → null
- TC-4: daily_ohlcv 0 rows + market_prices_history 14 distinct dates → null
- All 4 TCs must FAIL before fix, PASS after fix.

### 1343 — fix(ta-fallback): defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows

- Spec: `docs/REQ_114.md` FR-1, FR-2
- File: `src/application/usecases/assembleBriefing.ts` — `defaultComputeTa()` only
- When daily_ohlcv count < 15: run fallback GROUP BY DATE(fetched_at) MAX(price) query on market_prices_history
- Reuse existing CandleRow type for fallback rows (alias day + close_price in SQL)
- Return null when both sources < 15 rows; return TaSignal otherwise
- bun tsc --noEmit must be clean; no new types introduced; signature unchanged

