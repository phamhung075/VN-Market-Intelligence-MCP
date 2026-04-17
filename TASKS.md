# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 119 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1352 | test(ohlcv-startup-probe): TDD test 1352-ohlcv-startup-probe.test.ts — written FIRST | Review | Dev |
| 1353 | feat(ohlcv-startup-probe): ohlcvStartupProbe.ts + jobs.ts wire-up | Review | Dev |

> Tech design: `docs/TECH_119.md` (APPROVED_BY_ARCHITECT)

---

## Sprint 118 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1350 | test(ohlcv-backfill): TDD test 1350-ohlcv-backfill-endpoint.test.ts — written FIRST | Backlog | Dev |
| 1351 | feat(ohlcv-backfill): POST /api/push-ohlcv-history endpoint + vps-scripts/fetch-ohlcv-backfill.sh | Backlog | Dev |

> Tech design: `docs/TECH_118.md` (pending Architect)

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

