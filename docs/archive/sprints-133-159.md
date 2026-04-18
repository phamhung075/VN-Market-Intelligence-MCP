# Archive — Sprints 133–159

Period: 2026-04-17 → 2026-04-18
Archived from TASKS.md on Sprint 159 completion.

---

## Sprint 133 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1380 | test(test-isolation): TDD — Bun preload hook for :memory: DB | Done |
| 1381 | feat(test-isolation): migrate DDL helpers + Bun preload setup | Done |

Goal: Eliminate production-DB bleed in test suite via Bun preload hook.
Branch: task/1380-1381-test-isolation | PO sign-off: 2026-04-17

---

## Sprint 134 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1382 | fix(ocr-e2e): skip geo-blocked OCR e2e test in CI | Done |

Goal: Skip OCR e2e test that requires VPS/Vietnam network access.
Branch: task/1382-ocr-e2e-skip | PO sign-off: 2026-04-17

---

## Sprint 135 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1383 | test(france-msg-quality): TDD — filler + diacritics RED | Done |
| 1384 | fix(france-msg-quality): section-omit filler + diacritics GREEN | Done |

Goal: France morning summary — omit filler sections + proper Vietnamese diacritics.
Branch: task/1383-1384-france-msg-quality | PO sign-off: 2026-04-17

---

## Sprint 136 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1385 | test(evening-news-filler): TDD — evening summary filler removal RED | Done |
| 1386 | fix(evening-news-filler): omit filler line when newsCount=0 | Done |

Goal: Evening summary — omit "Không có tin tức" filler line when newsCount=0.
Branch: task/1385-evening-news-filler | PO sign-off: 2026-04-17

---

## Sprint 137 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1387 | test(morning-briefing-filler): TDD — filler removal RED | Done |
| 1388 | fix(morning-briefing-filler): omit filler sections in morning briefing | Done |

Goal: Morning briefing — omit filler sections when data is empty.
Branch: task/1387-morning-briefing-filler | PO sign-off: 2026-04-17

---

## Sprint 138 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1389 | test(weekly-portfolio-filler): TDD — weekly portfolio filler + diacritics RED | Done |
| 1390 | fix(weekly-portfolio-filler): silent skip + diacritics in weeklyPortfolioReportJob | Done |

Goal: Weekly portfolio report — silent skip filler + proper Vietnamese diacritics.
Branch: task/1389-1390-weekly-portfolio-filler | PO sign-off: 2026-04-17

---

## Sprint 139 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1391 | fix(stale-lock-regression): fix stale-lock regression introduced in Sprint 138 | Done |

Goal: Fix stale-lock regression introduced by weekly portfolio silent-skip changes.
PO sign-off: 2026-04-17

---

## Sprint 140 — COMPLETE (2026-04-17)

| ID | Title | Status |
|----|-------|--------|
| 1392 | test(calibration-diacritics): TDD — calibration report diacritics RED | Done |
| 1393 | fix(calibration-diacritics): proper Vietnamese diacritics in calibrationReportJob | Done |
| 1394 | test(alert-digest-diacritics): TDD — alert-digest-diacritics RED | Done |
| 1395 | fix(alert-digest-diacritics): proper Vietnamese diacritics in assembleAlertDigest | Done |

Goal: Proper Vietnamese diacritics in calibration report + alert digest.
Branch: task/1392-calibration-report-diacritics-tdd, task/1395-alert-digest-diacritics-fix
Full suite: 5061 pass, 0 fail, 21 skip | PO sign-off: 2026-04-17

---

## Sprint 141 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1400 | test(db-isolation): TDD 1400-db-isolation.test.ts — assert Bun.env isolation | Done |
| 1401 | fix(db-isolation): setup.ts Bun.env + purge phantom rows + dev-standards template | Done |

Goal: Fix Bun.env namespace mismatch in setup.ts — tests were writing to process.env but getDb() reads Bun.env, causing all test runs to open production data/market.db and leak phantom rows (400+) into telegram_reports.
Branch: task/1400-db-isolation | Merge commit: 98ec2a0
Fix: `process.env["DB_PATH"]` → `Bun.env["DB_PATH"]` in setup.ts:12 + dev-standards.md:47 + one-shot purge script.
PO sign-off: 2026-04-18

---

## Sprint 142 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1402 | test(volume-spike-multiplier): RED test — assert two tickers with different avg volumes produce different multipliers | Done |
| 1403 | fix(volume-spike-multiplier): extend ATC guard + per-ticker avgVolume logging + correct baseline query | Done |
| 1404 | test(alert-diacritics): RED test — assert convictionScorer labels contain correct Vietnamese diacritics | Done |
| 1405 | fix(alert-diacritics): replace unaccented labels in convictionScorer.ts + technicalIndicatorTools.ts | Done |

Goal: Fix volume-spike-multiplier uniform 5.9x bug (ATC guard extension + per-ticker avgVolume isolation) + proper Vietnamese diacritics in convictionScorer and technicalIndicatorTools.
Spec: docs/REQ_1402.md | Tech: docs/TECH_1402.md
PO sign-off: 2026-04-18

---

## Sprint 143 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1406 | test(hut-sector): RED test — assert HUT not in real_estate, is in construction | Done |
| 1407 | fix(hut-sector): move HUT to construction in SECTOR_PEERS + DB migration | Done |

Goal: HUT reclassified from real_estate to construction sector — removes false cascade alerts. DB migration idempotent UPDATE in schema.ts.
Spec: docs/REQ_1406.md | Tech: docs/TECH_1406.md
PO sign-off: 2026-04-18

---

## Sprint 144 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1408 | test(tool-diacritics): RED test — kinhDichTools + technicalIndicatorTools + supplyChainTools diacritics | Done |
| 1409 | fix(tool-diacritics): extract helpers + replace unaccented strings in three files | Done |

Goal: Proper Vietnamese diacritics in kinhDichTools, technicalIndicatorTools, supplyChainTools — extracted helper fns + replaced all unaccented strings.
Spec: docs/REQ_1408.md | Tech: docs/TECH_1408.md
PO sign-off: 2026-04-18

---

## Sprint 145 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1410 | test(tool-diacritics-sweep): RED test — assert accented output from 24 tool files | Done |
| 1411 | fix(tool-diacritics-sweep): replace all unaccented Vietnamese strings in 24 files | Done |

Goal: Vietnamese diacritics sweep across all 24 remaining tool files — TDD RED test first, then full string replacement.
Spec: docs/REQ_1410.md | Tech: docs/TECH_1410.md
PO sign-off: 2026-04-18

---

## Sprint 146 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1412 | test(diacritics-wave3): RED test — scheduler + domain + application layer diacritics | Done |
| 1413 | fix(diacritics-wave3): replace all unaccented Vietnamese in 8 files | Done |

Goal: Vietnamese diacritics wave-3 sweep — scheduler + domain + application layers (predictionMarketJob, calibrationReportJob, getCrisisEarlyWarning, sentimentTrend, kinhDich formatters, decisionNoteSynthesizer + 20 interface tool files).
Spec: docs/REQ_1412.md | Tech: docs/TECH_1412.md
PO sign-off: 2026-04-18

---

## Sprint 147 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1414 | test(diacritics-wave4): RED test — 5 interface/mcp/tools files diacritics | Done |
| 1415 | fix(diacritics-wave4): replace all unaccented Vietnamese in 5 files | Done |

Goal: Vietnamese diacritics wave-4 sweep — 5 interface/mcp/tools files (13 strings).
Spec: docs/REQ_1414.md | Tech: docs/TECH_1414.md
PO sign-off: 2026-04-18


---

## Sprint 148 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1416 | test(diacritics-wave5): RED test — 12 interface tools + 1 domain service | Done |
| 1417 | fix(diacritics-wave5): replace 118 unaccented strings + update 5 legacy test files | Done |

Goal: Vietnamese diacritics wave-5 sweep — 12 interface/mcp/tools files + 1 domain/services file (118 strings).
Spec: docs/REQ_1416.md | Tech: docs/TECH_1416.md
PO sign-off: 2026-04-18


---

## Sprint 149 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1418 | test(diacritics-wave6): RED test — 6 files diacritics | Done |
| 1419 | fix(diacritics-wave6): restore diacritics in wave 6 files | Done |

Goal: Vietnamese diacritics wave-6 sweep — 6 files.
Spec: docs/TECH_1418.md
PO sign-off: 2026-04-18

---

## Sprint 150 — COMPLETE (2026-04-18)

| ID | Title | Status |
|----|-------|--------|
| 1420 | wrap-missing-jobs-recordJobRun | Done |

Goal: Cron health coverage — wrap all missing scheduler jobs with recordJobRun.
Branch: task/1420-cron-health-coverage
Handoff: docs/handoffs/TASK_1420.md

---

## Sprint 151 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1422 | test(morning-briefing): TDD — upcomingDeadlines RED assertions | Done | Dev |
| 1423 | feat(morning-briefing): add upcomingDeadlines BCTC section GREEN | Done | Dev |
| ARCH | review REQ_1422.md + write TECH_1422.md | Done | Architect |

Goal: Add upcomingDeadlines BCTC section to morning briefing.
Branch: task/1422-1423-morning-briefing-upcoming-deadlines
Handoffs: docs/handoffs/TASK_1422.md, docs/handoffs/TASK_1423.md
PO sign-off: 2026-04-18

---

## Sprint 152 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1424 | test(evening-summary): TDD RED — sector aggregation assertions | Done | Dev |
| 1425 | feat(evening-summary): sector aggregation from watchlist movers GREEN | Done | Dev |
| ARCH | review REQ_1424.md + write TECH_1424.md | Done | Architect |

Goal: feat(evening-summary): sector aggregation from watchlist movers.
Branch: task/1424-1425-evening-summary-sector-aggregation
Handoffs: docs/handoffs/TASK_1424.md, docs/handoffs/TASK_1425.md
PO sign-off: 2026-04-18

---

## Sprint 153 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1426 | test(evening-summary): TDD RED — vnIndex assertions | Done | Dev |
| 1427 | feat(evening-summary): add vnIndex to EveningSummary + formatter GREEN | Done | Dev |
| ARCH | review REQ_1426.md + write TECH_1426.md | Done | Architect |

Goal: feat(evening-summary): VN-Index close price added to evening summary.
Branch: task/1426-evening-vnindex
Handoffs: docs/handoffs/TASK_1426.md, docs/handoffs/TASK_1427.md
PO sign-off: 2026-04-18

---

## Sprint 154 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1428 | test(evening-ta-filter): TDD RED — RSI-only TA filter assertions | Done | Dev |
| 1429 | fix(evening-ta-filter): change both predicates to rsiStatus-only GREEN | Done | Dev |

Goal: fix(evening-ta-filter): restrict evening TA section to RSI overbought/oversold signals only.
Branch: task/1428-evening-ta-rsi-filter
Report: reports/TASK_REPORT_1428.md
PO sign-off: 2026-04-18

---

## Sprint 155 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1430 | test(startup-catchup): TDD RED — shouldRunCatchup + probe assertions | Done | Dev |
| 1431 | feat(startup-catchup): implement shouldRunCatchup + probe setTimeout in jobs.ts GREEN | Done | Dev |
| ARCH | review REQ_1430.md + write TECH_1430.md | Done | Architect |

Goal: feat(startup-catchup): run morning-briefing + evening-summary on restart if missed today.
Branch: task/1430-startup-catchup
PO sign-off: 2026-04-18

---

## Sprint 156 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1432 | test(foreign-flow-sentinel): TDD RED — sentinel filter assertions | Done | Dev |
| 1433 | fix(foreign-flow-sentinel): filter 9999999 from queryForeignFlowSummary GREEN | Done | Dev |

Goal: fix(foreign-flow-sentinel): filter 9999999 sentinel value from foreign flow summary queries.
Report: reports/TASK_REPORT_1432.md
Branch: task/1432-foreign-flow-sentinel
PO sign-off: 2026-04-18

---

## Sprint 157 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1434 | test(morning-briefing): TDD RED — commodity values assertions | Done | Dev |
| 1435 | fix(morning-briefing): replace count-only line with per-commodity lines GREEN | Done | Dev |

Goal: fix(morning-briefing): show commodity values instead of count-only in morning briefing output.
Handoff: docs/handoffs/TASK_1434.md
Report: reports/TASK_REPORT_1434.md
Branch: task/1434-morning-briefing-commodity-values
PO sign-off: 2026-04-18

---

## Sprint 158 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1436 | test(morning-briefing): TDD RED — vnIndex point change assertions | Done | Dev |
| 1437 | feat(morning-briefing): add change field to VnIndexSnapshot + formatter GREEN | Done | Dev |

Goal: feat(morning-briefing): add point change to VN-Index display in morning briefing.
Report: reports/TASK_REPORT_1436.md
PO sign-off: 2026-04-18

---

## Sprint 159 — COMPLETE (2026-04-18)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1438 | test(morning-briefing): TDD RED — portfolio P&L section assertions | Done | Dev |
| 1439 | feat(morning-briefing): call formatPnlSection in formatBriefingMessage GREEN | Done | Dev |

Goal: feat(morning-briefing): render portfolio P&L section in morning briefing output.
Report: reports/TASK_REPORT_1438.md
Merged: 206cdc0
PO sign-off: 2026-04-18
