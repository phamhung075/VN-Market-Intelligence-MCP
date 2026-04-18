# Archive — Sprints 133–146

Period: 2026-04-17 → 2026-04-18
Archived from TASKS.md on Sprint 146 completion.

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
