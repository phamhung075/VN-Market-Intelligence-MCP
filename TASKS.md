# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 138 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1389 | test(weekly-portfolio-filler): TDD test 1389-weekly-portfolio-filler.test.ts — written FIRST | Done | Dev |
| 1390 | fix(weekly-portfolio-filler): silent skip when no positions + proper Vietnamese diacritics in formatWeeklyReport | Review | Dev |

> Sprint goal: `SPRINT_GOAL.md` | Success: no filler msg when positions=0; proper diacritics throughout; 5026+ pass, 0 fail

---

## Sprint 137 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1387 | test(morning-briefing-filler): TDD test 1387-morning-briefing-filler.test.ts — written FIRST | Done | Dev |
| 1388 | fix(morning-briefing-filler): omit filler sections in formatBriefingMessage when data absent | Done | Dev |

> Sprint goal: `SPRINT_GOAL.md` | COMPLETE 2026-04-17

---

## Sprint 136 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1385 | test(evening-news-filler): TDD test 1385-evening-summary-news-filler.test.ts — written FIRST | Done | Dev |
| 1386 | fix(evening-news-filler): omit "Không có tin tức hôm nay" when newsCount=0 in eveningSummaryJob | Done | Dev |

> Sprint goal: `SPRINT_GOAL.md` | COMPLETE 2026-04-17

---

## Sprint 135 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1383 | test(france-msg-quality): TDD test 1383-france-summary-message-quality.test.ts — written FIRST | Done | Dev |
| 1384 | fix(france-msg-quality): omit empty sections + fix Vietnamese diacritics in formatFranceSummaryVI | Done | Dev |

> Sprint goal: `SPRINT_GOAL.md` | COMPLETE 2026-04-17

---

## Sprint 134 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1382 | test(ocr-e2e-skip): mark 296-ocr-pipeline-e2e geo-blocked tests as skip — 0 fail baseline | Done | Dev |

> Sprint goal: `SPRINT_GOAL.md` | COMPLETE 2026-04-17

---

## Sprint 133 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1380 | test(isolation): write 1380-test-isolation-preload.test.ts — TDD RED proves isolation gap | Done | Dev |
| 1381 | fix(isolation): create setup.ts preload + bunfig.toml + migrate 12 call-site test files | Done | Dev |

> Tech design: `docs/TECH_133.md` | Req: `docs/REQ_133.md` | Report: `reports/TASK_REPORT_1380.md` | COMPLETE 2026-04-17

---

## Sprint 116 — Complete

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1346 | test(ta-adaptive): TDD test 1346-ta-adaptive-period.test.ts — written FIRST | Done | Dev |
| 1347 | fix(ta-adaptive): lower defaultComputeTa candle guard to 8, adaptive RSI/MA periods | Done | Dev |

> Tech design: `docs/TECH_116.md` (APPROVED_BY_ARCHITECT) | COMPLETE 2026-04-16

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

### 1389 — TDD test: 1389-weekly-portfolio-filler.test.ts (RED first)

branch: task/1389-weekly-portfolio-filler-tdd
layer: scheduler
depends_on: none

acceptance_criteria:
- Given formatWeeklyReport unchanged (still emits "(Chua co vi the nao trong danh muc)" when rows=0, unaccented labels)
- When T1–T4 written per TECH_138 test table
- T1: rows=[] → formatWeeklyReport output does NOT contain "(Chua co vi the nao"
- T2: rows=[] → runWeeklyPortfolioReport with no positions = NO Telegram send (silent skip)
- T3: rows present → output contains proper diacritics "Giá đầu tuần" not "Gia dau tuan"
- T4: rows present → output contains "Tổng P&L tuần" not "Tong P&L tuan"
- Then bun test src/__tests__/1389-weekly-portfolio-filler.test.ts = T1+T2+T3+T4 FAIL (RED)
- Then bun tsc --noEmit = 0 errors

---

### 1390 — fix: silent skip when no positions + proper diacritics in formatWeeklyReport

branch: task/1390-weekly-portfolio-filler-fix
layer: scheduler
depends_on: [1389 merged]

acceptance_criteria:
- Given 1389 T1–T4 RED
- When formatWeeklyReport patched: replace "(Chua co vi the nao trong danh muc)" with silent skip in runWeeklyPortfolioReport; upgrade all Vietnamese labels to proper diacritics
- Then bun test src/__tests__/1389-weekly-portfolio-filler.test.ts = all PASS (GREEN)
- Then bun test full suite = 5026+ pass, 0 fail, 21+ skip
- Then bun tsc --noEmit = 0 errors
- Then grep "Chua co\|gia dau\|Tong P&L" src/scheduler/weeklyPortfolioReportJob.ts = 0 matches

