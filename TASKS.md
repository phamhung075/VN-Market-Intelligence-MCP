# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Completed Sprints (summary — details in `docs/TASKS_ARCHIVE.md`)

- **1296–1302:** IMF classifier, fail-loud injection, token reduction, TelegramMessageFactory, textUtils DDD fix, newsNormalizer fix
- **1303:** 9-bug backlog drain (price/sentiment/cascade/watchdog/VPS/BCTC)
- **1307a–1311a:** Macro alert cooldown, sentiment patterns, cascade rules, schema migration, foreign-flow UNIQUE fix
- **1312–1313:** BCTC skip logic inversion, channel-routing regression guard
- **1315:** Cost-push cascade rules + ClimateImpactMapper
- **1317:** Task308 test regex + project-stats sync
- **1318–1321:** Watchdog foreign_flow staleness, VPS OOM guard
- **1326b:** MARKET channel spam guard
- **DDD Phase 0–3c:** Monorepo scaffold, PDF/RAG Python services, 4 TS microservices, parallel TA+BB scan — all merged
- **1327–1329:** Phase 0 merge + test infra, Cowork overhaul, WAL hardening + IMF 7th conviction dim — Done (6927 pass / 7 fail)
- **fix-1293c / fix-1328e / fix-bctc-ocr / fix-watchdog-recovery / fix/signal-payload-fields:** Signal, bug routing, OCR, null-flow, conviction fields — all merged
- **feat/value-investor-analysis-system (1336):** 30 analysis ledger files, Report Analyzer agent (new), 4 agent mods (News Scout/Market Watcher/Alert Commander/Unified Agent), quarterly conviction synthesis, value_investor mode — MERGED 2026-04-26 (6520 pass / 213 fail baseline maintained)
- **1330a–1330b:** Fix 7 failing test regressions from Sprint 1329 (1289c fallback field, 1476 WAL threshold/msg, 240 AC-4 cooldown reset, 1551 isolation) — DONE 2026-04-25 (26/26 target tests pass)
- **1338:** Retrospective documentation for sprints 1330–1337 (SPRINT_GOAL.md, project-stats.json validation tests, sprint history consolidation) — DONE 2026-04-26
- **1339a:** RED phase — 10 failing tests for PriceConfirmation catalyst correlation fields — APPROVED + merged 2026-04-26 (merge commit: 6f617113)
- **1339b:** GREEN phase — implement PriceConfirmation catalyst correlation fields (signalTypes + signalBuilders) — APPROVED + merged 2026-04-26 (merge commit: 7b9de84c)
- **1342b:** GREEN phase — implement DB integrity check job (runIntegrityCheck + integrityCheckJob.ts + CRONS.integrityCheck) — APPROVED + merged 2026-04-26 (merge commit: e93149fc)
- **1343a–1343e:** BCTC PDF pipeline recovery — watchlist restore (30 tickers), HOSE PDF discovery (multi-source SSC/cafef/vietstock), VPS skip endpoint (no infinite retry), fetch-bctc.sh update, integration test (6/6 pass) — APPROVED + merged 2026-04-27
- **1344a–1344c:** Sprint 1344 — Fix 9 pre-existing test failures (6536→7371 pass, 213→0 fail) — ALL MERGED 2026-04-27
- **1345a–1345e:** Sprint 1345 — News + Analysis Pipeline Hardening + Data Quality — Reuters/TE VPS systemd + newsapi fallback, BCTC financial validation (VNM/VEA), Polymarket 24h staleness guard, VN-Index cascade MARKET broadcast, integration pipeline + TSC fix (B1-B4) — APPROVED + merged 2026-04-27 (7355 pass / 73 pre-existing fail / 0 regression)
- **1347a–1347b:** Sprint 1347 — Test DB isolation (1347a: clean 2537 leaked rows) + stock-classification.json coverage expansion (1347b: 5→30 tickers, all tradeExposure populated, 8/8 tests pass) — APPROVED + merged 2026-04-27 (7423 pass / 73 pre-existing fail / 0 regression) — closes report 1319
- **1348a–1348e:** Sprint 1348 — Cascade brokerage/banking competitive signals (1348a: BA spec + design + implementation + test + QA) — Scope refactored: 1348a single integrated task (BK-1 brokerage sentiment routing + FR-3 competitive threat signals with affected_actions wiring) — APPROVED + merged 2026-04-27 (7371 pass / 0 fail baseline restored)
- **1346a–1346d:** Sprint 1346 — Alert Quality & Reliability Hardening (1346a: remove test stub, 1346b: fix UNIQUE constraint, 1346c-a/c-b: alert quality fixes, 1346d: PDF circuit breaker race fix) — ALL APPROVED + merged 2026-04-27 (7371 pass / 0 fail maintained)
- **1349a:** Remove dead scheduler config block from mcp.config.json — APPROVED + merged 2026-04-27
- **1349b:** Circuit breaker state logging + metrics (circuitBreakerLogger.ts) — 11/11 tests pass, QA TS fix applied (noUncheckedIndexedAccess non-null assertions) — APPROVED + merged 2026-04-27
- **1349d:** BCTC validation edge cases — 7 new tests (VAL-07–VAL-10), hard ratio>5.0 threshold, QA TS fix applied — APPROVED + merged 2026-04-27
- **1349e:** Job cycle timings + ops metrics (jobMetrics.ts) — 10/10 tests pass, 100% coverage, wired into taAlertScanJob/bbAlertScanJob/macroIndicatorRefreshJob — APPROVED + merged 2026-04-27
- **1350a:** Fix 73 failing tests (mock.module schema leak + missing watchdog reader injections + stale sprint assertions) — 5 test files only, 26/26 targeted tests pass, 7568 pass / 0 fail full suite — APPROVED + merged 2026-04-27
- **1351b–1351c:** Sprint 1351 — Scheduler test coverage phase 1: vpsProxyWatchdogJob gap tests (1351b: 8 tests) + weatherCheckJob gap tests (1351c: 8 tests) — 16 new tests total, 7598 pass / 0 new fail full suite — ALL APPROVED + merged 2026-04-27
- **1352–1358b:** Scheduler gap-fill wave 2 (1353a–1356b: 6 jobs DI + 48 gap tests), fix/317+1288 (TS errors + 3 test failures), 1357 (1294b RED fix), 1358a+1358b (bctcOverdueCheck + bctcQueueEnricher 16 gap tests) — ALL MERGED 2026-04-28 (7756 pass / 0 fail / 0 TS errors)
- **stale-tickers:** Remove 5 invalid watchlist tickers (VDC/BDI/DLC/JSH/SIS) + validateSeedTickers() startup warn + live DB purge (5 rows deleted) — MERGED 2026-04-28 (7880 pass / 5 pre-existing fail / 0 regression)
- **1382b–1382d–1382c (1382):** Signal outcome tracking end-to-end — taAlertNotifierJob writes 'fired', signalOutcomeJob resolves to confirmed/false_positive daily at 08:30 UTC, cron wired in jobs.ts — MERGED 2026-04-28 (7915 tests / 5 pre-existing fail / 0 regression)
- **1386:** Fix — hard throw guard in FIX-1265 + 1168 test files that seed market_messages with hardcoded ids 10–14; guard fires if DB_PATH is not :memory: at test time — MERGED 2026-04-28 (7915 pass / 0 regression)
- **1388:** Fix foreignFlow circuit breaker auto-reset — halfOpenMaxAttempts:1 closes CB on first successful probe after DB fix, preventing stuck-OPEN requiring manual reset — MERGED 2026-04-28 (7920 tests / 7893 pass / 6 pre-existing fail / 0 regression)
- **1392:** Fix foreignFlow CB stuck OPEN — remove execute() wrapper from GET fetcher path; CB now guards push-handler DB writes only; 4 new regression tests + 1 updated — MERGED 2026-04-28 (7932 tests / 7904 pass / 7 pre-existing fail / 0 regression)

---

## Todo

| Task ID | Title | Priority | Type | Owner |
|---------|-------|----------|------|-------|
| JANITOR-004 | DRY: COMPANY_SHORT_NAME in watchlist.ts duplicates STOCK_CATALOG display names | LOW | refactor | developer |
| JANITOR-005 | DRY: historicalBaseline 3.0 magic number duplicated in 3 IMF files | LOW | refactor | developer |
| JANITOR-006 | DRY: VN_OFFSET_MS (7*3600_000) inlined in 6+ files — should import from timeConstants.ts | MEDIUM | refactor | developer |
| JANITOR-007 | DRY: Vietnamese severity label maps duplicated in 4+ tool files | LOW | refactor | developer |

---

## In Progress

(empty)

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|

## Done

| Task ID | Title | Merged | Reports |
|---------|-------|--------|---------|
| 1356a | patternWatchJob 8 gap tests (PWJ-1–PWJ-8) | main 2026-04-28 | reports/TASK_REPORT_1356a.md |
| 1356b | trackSessionToolUsageJob gap tests (8 cases, constructor DI) | main 2026-04-28 | reports/TASK_REPORT_1356b.md |
| 1358a | bctcOverdueCheckJob 8 gap tests (OVD-1–OVD-8) | main 2026-04-28 | — |
| 1358b | bctcQueueEnricherJob 8 gap tests (ENR-1–ENR-8) | main 2026-04-28 | — |
| 1359a | vpsServiceHealthJob + walCheckpointAlert gap tests (16 tests) | main 2026-04-28 | reports/TASK_REPORT_1359a.md |
| 1359b | macroOutlierGuard + signalClassWeighter + forecastConfidenceScore + periodDeltaComputer unit tests (32 tests) | main 2026-04-28 | reports/TASK_REPORT_1359b.md |
| 1360a | marketContextBuilder unit tests (16 tests, in-memory SQLite, pure domain service) | main 2026-04-28 | reports/TASK_REPORT_1360a.md |
| 1360b | priceNewsValidator unit tests (24 tests, 100% coverage, pure domain function) | main 2026-04-28 | reports/TASK_REPORT_1360b.md |
| 1360 | Morning briefing bug fixes — formatStoryTitle + delta arrows (↑/↓) for global markets + commodities | main 2026-04-28 | reports/TASK_REPORT_1360.md |
| 1361 | 48h purge for telegram_reports (deleteOldReports + D-10 in dataAuditJob) — 29 new tests | main 2026-04-28 | reports/TASK_REPORT_1361.md |
| 1362 | FIX-1327 stale-ticker WORK alerts rate-limited to one aggregated daily message | main 2026-04-28 | reports/TASK_REPORT_1362.md |
| 1382b | Wire taAlertNotifierJob to write 'fired' outcome on agent_signals after dispatch | main 2026-04-28 | reports/TASK_REPORT_1382b.md |
| 1382d | Create signalOutcomeJob.ts — daily post-close resolver (runSignalOutcomeJob + AC-1–AC-8 tests) | main 2026-04-28 | reports/TASK_REPORT_1382d.md |
| 1382c | Register signalOutcomeJob cron in jobs.ts + AC-9 integration test | main 2026-04-28 | reports/TASK_REPORT_1382c.md |
| 1382 | PARENT: Signal outcome tracking wired end-to-end (fired→confirmed/false_positive) | main 2026-04-28 | reports/TASK_REPORT_1382c.md |
| 1388 | Fix foreignFlow CB auto-reset — halfOpenMaxAttempts:1 (single probe closes after DB fix) — 5 new tests | main 2026-04-28 | reports/TASK_REPORT_1388.md |
| 1390 | Fix OHLCV volume bug — MAX(volume) not COUNT(*) of ticks; 3 new regression tests + 2 updated assertions | main 2026-04-28 | reports/TASK_REPORT_1390.md |
| 1377 | Fix alert-digest double-send — replace in-memory _lastDigestSentDate with DB-backed alreadySentToday() against cron_job_runs; 2 new dedup tests | main 2026-04-28 | reports/TASK_REPORT_1377.md |

---
