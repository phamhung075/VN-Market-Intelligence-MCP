# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 133 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1380 | test(isolation): write 1380-test-isolation-preload.test.ts — TDD RED proves isolation gap | Done | Dev |
| 1381 | fix(isolation): create setup.ts preload + bunfig.toml + migrate 12 call-site test files | Done | Dev |

> Tech design: `docs/TECH_133.md` | Req: `docs/REQ_133.md` | Report: `reports/TASK_REPORT_1380.md` | COMPLETE 2026-04-17

---

## Sprint 116 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1346 | test(ta-adaptive): TDD test 1346-ta-adaptive-period.test.ts — written FIRST | Done | Dev |
| 1347 | fix(ta-adaptive): lower defaultComputeTa candle guard to 8, adaptive RSI/MA periods | Done | Dev |

> Tech design: `docs/TECH_116.md` (APPROVED_BY_ARCHITECT)

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

