# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Sprint 151 — ACTIVE (2026-04-18)

**Goal:** Add "BCTC sắp đến" (upcoming filing deadlines) section to morning briefing — show watchlist stocks with Q1 2026 deadlines within 14 days that have not yet filed. User is in BCTC season right now (Q1 deadline = Apr 30 standard, May 14 banking). Without this, morning briefing is silent on imminent filings even when 12/30 watchlist stocks are days away from statutory deadline.

**Scope:**
- IN: `assembleBriefing.ts` — add `upcomingDeadlines: BctcDeadlineRow[]` field to `DailyBriefing`; populate via `getCurrentDeadline()` + `classifyFilingStatus()` for each watchlist stock; include only `SAP_DEN` and `QUA_HAN` status rows
- IN: `morningBriefingJob.ts` — add formatter section "BCTC sắp đến:" listing code + deadline + days remaining; omit section when empty
- IN: TDD test `src/__tests__/1422-morning-briefing-bctc-deadlines.test.ts` — RED first: (a) SAP_DEN stocks appear in `upcomingDeadlines`, (b) QUA_HAN stocks appear, (c) DA_NOP stocks excluded, (d) formatted message contains deadline section, (e) section omitted when all filed
- OUT: `earningsCalendarTools.ts` changes, alert pipeline, VPS proxies, schema changes

**Success metric:** Morning briefing message contains "BCTC sắp đến" section with correct stock codes when any watchlist stock has unfiled deadline within 14 days. TDD test GREEN. `bun tsc --noEmit` clean.

---

## Sprint 150 — COMPLETE (2026-04-18)

**Goal:** Fix ohlcvDailyAggregatorJob health gap + alertDigestTools diacritics.
**Scope:**
- IN: `jobs.ts` — wrap ohlcvDailyAggregator cron with `recordJobRun(db, 'ohlcv-daily-aggregator', ...)`
- IN: `alertDigestTools.ts` — fix 3 unaccented strings: "[Telegram: da gui thanh cong]" → "[Telegram: đã gửi thành công]", "(Telegram chua duoc cau hinh)" → "(Telegram chưa được cấu hình)"
- IN: TDD test `src/__tests__/1421-ohlcv-health-and-digest-diacritics.test.ts` — 6 assertions, RED → GREEN
- OUT: Schema changes, VPS proxies, alert routing, new features

**Status:** COMPLETE. Task 1421 merged. 6/6 TDD assertions GREEN. `bun tsc --noEmit` clean.

---

## Sprint 144 — COMPLETE (2026-04-18)

**Goal:** Fix unaccented Vietnamese text in MCP tool responses — `kinhDichTools.ts`, `technicalIndicatorTools.ts`, and `supplyChainTools.ts`. Sprints 135-143 fixed alert/digest/conviction pipelines but left these three tool files with broken diacritics visible to the user on every MCP tool call.

**Scope:**
- IN: `kinhDichTools.ts:1032-1040` — fix "THUAN LOI cho giao dich — xu huong tich cuc", "BAT LOI cho giao dich — can than trong", "TRUNG TINH — can xem them tin hieu khac", "Nhan dinh giao dich" → proper accented Vietnamese
- IN: `technicalIndicatorTools.ts:150,155,156,164` — fix "can 50 nen", "sap xep hon hop", "Xu huong", "can toi thieu 15 nen" → proper accented Vietnamese
- IN: `supplyChainTools.ts:106,115,117,119` — fix "Tin hieu co phieu: Khong co...", "TONG KET: Co tin hieu QUAN TRONG...", "Phat hien tin hieu nhe", "Chuoi cung ung on dinh..." → proper accented Vietnamese
- IN: TDD test `src/__tests__/1408-tool-diacritics.test.ts` — RED first, assert fixed strings appear in output
- OUT: kinhDichReading.ts lookup keys ("BAT LOI" score key stays), alert pipeline, VPS proxies, schema changes

**Success metric:** All three files output properly accented Vietnamese. TDD test GREEN. `bun tsc --noEmit` clean. 5055+ pass, 0 fail.

---

## Sprint 143 — COMPLETE (2026-04-18)

**Goal:** Reclassify HUT real_estate → construction in sectorPeers + DB migration.
**Status:** COMPLETE. Tasks 1406-1407 merged. 5055 pass, 0 fail.

---

## Sprint 129 — COMPLETE (2026-04-17)

**Goal:** Fix 17 pre-existing test failures from stale franceSummaryJob fixtures + schedulerFileCount drift.
**Status:** COMPLETE. Tasks 1372+1373 merged. Full suite: 4998 pass, 1 fail (intentional OCR), 20 skip.

---

## Sprint 130 — COMPLETE (2026-04-17)

**Goal:** Fix `taSummary: []` in every evening report by shifting `ohlcvDailyAggregatorJob` cron from 16:00 UTC to 15:00 UTC (30 min before evening summary at 15:30 UTC).
**Status:** COMPLETE. Tasks 1374+1375 merged. `CRONS.ohlcvDailyAggregator` default = `'0 15 * * 1-5'`. 2026-04-17 report confirmed: taSummary has 31 tickers.

---

## Sprint 139 — COMPLETE (2026-04-17)

**Goal:** Fix unaccented Vietnamese text in `calibrationReportJob` MARKET channel output.
**Status:** COMPLETE. Tasks 1392+1393 merged. 5035 pass, 0 fail, 21 skip.

---

## Sprint 142 — COMPLETE (2026-04-18)

**Goal:** Fix two HIGH alert-quality bugs: (1) volume spike multiplier shows identical 5.9× across all tickers; (2) conviction scorer outputs unaccented Vietnamese labels.
**Status:** COMPLETE. Tasks 1402-1405 merged. 5055 pass, 0 fail.

---

## Sprint 141 — COMPLETE

**Goal:** Fix test DB isolation — `setup.ts` sets `process.env["DB_PATH"]` but `schema.ts` reads `Bun.env["DB_PATH"]` (different namespaces in Bun). Every full test run leaks fixture rows into production `data/market.db`. Phantom rows (epoch 1970, 400+) pollute BUG channel and PO audit loop.

**Scope:**
- IN: `src/__tests__/setup.ts:12` — change `process.env["DB_PATH"]` to `Bun.env["DB_PATH"]`
- IN: Purge existing phantom rows (`DELETE FROM telegram_reports WHERE created_at < 1000000` via migration or one-time script)
- IN: TDD test `src/__tests__/1396-db-isolation.test.ts` — assert `Bun.env["DB_PATH"]` is `":memory:"` during test run, assert production DB path never opened
- OUT: Changes to `schema.ts`, alert pipeline, VPS proxies, any other scheduler

**Success metric:** No phantom rows accumulate in `data/market.db` after `bun test`. `bun tsc --noEmit` clean. TDD test passes. BUG channel no longer shows 1970-epoch reports.

---

## Sprint 140 — COMPLETE (2026-04-17)

**Goal:** Fix unaccented Vietnamese text in `assembleAlertDigest` MARKET weekday digest.
**Status:** COMPLETE. Tasks 1394+1395 merged. 5061 pass, 0 fail, 21 skip.

---

## Sprint 138 — COMPLETE (2026-04-17)

**Goal:** Fix `weeklyPortfolioReportJob` — silent skip when no positions + proper Vietnamese diacritics throughout.
**Status:** COMPLETE. Tasks 1389+1390 merged + 1391 regression fix. 5030 pass, 0 fail, 21 skip.

---

## Sprint 131 — COMPLETE (2026-04-17)

**Goal:** Fix pre-existing test failure in `1192-evening-summary-empty-fallback.test.ts` line 91 (`calls.length` expected 1, got 0). Root cause: `runEveningSummary` calls `alreadySentToday(getDb())` using the production DB singleton, which ignores `DB_PATH=":memory:"` test isolation. When the production `market_messages` table already has an `evening-summary` row for today (the real summary fired at 15:30 UTC), the dedup guard silently skips the second test. Fix: accept an optional `db` parameter in `runEveningSummary` for the dedup check, defaulting to `getDb()` in production.

**Scope:**
- IN: `src/scheduler/eveningSummaryJob.ts` — add optional `db?: Database` to `runEveningSummary` signature; use it in `alreadySentToday` call
- IN: `src/__tests__/1192-evening-summary-empty-fallback.test.ts` — pass an in-memory DB (with `market_messages` table) as `db` param so the dedup check resolves against isolated state
- OUT: Changes to assembleEveningSummary, other scheduler jobs, alert pipeline, VPS proxies

**Success metric:** `bun test src/__tests__/1192-evening-summary-empty-fallback.test.ts` — both tests pass. `bun tsc --noEmit` clean. Full suite regression: net 0 new failures (2 pre-existing → 1 pre-existing OCR only).

**Status:** ACTIVE — tasks 1376+1377

---

## Sprint 111 — COMPLETE (2026-04-16)

**Goal:** Fix 2 pre-existing test suite failures — (1) test 297 UNIQUE constraint violation caused by missing DB_PATH isolation at line 1, and (2) test 296 OCR e2e timeout that blocks full suite completion.

**Status:** COMPLETE 2026-04-16. Tasks 1337+1338 merged. Full suite: 4910 pass, 20 skip, 1 fail (intentional OCR timeout at 30s).

---

## Sprint 110 — COMPLETE (2026-04-16)

**Goal:** Fix `topStories: []` in every evening report. Production evening reports show `topStories: []` and `newsCount: 0` even when the VPS is pushing news every 15 minutes. The user never sees the top news-driven analyses at market close. Root cause is in the push-news → `pollNews` → `rag_analyses` pipeline — either the INSERT is not firing, the `created_at` timestamp mismatches the midnight-VN boundary query, or title-dedup is over-filtering all items.

**Status:** COMPLETE 2026-04-16. Tasks 1335+1336 merged. VN_SOURCE_IDS extended to 10 entries, createdAt guard added to tryInsertEntry. 4/4 TDD cases pass.

---

## Sprint 109 — COMPLETE (2026-04-16)

**Goal:** Housekeeping sprint — archive stale task detail blocks + fix sprint status entries. Task 1334 acceptance criteria met: stale blocks already removed from TASKS.md, Sprint 108 header shows COMPLETE, archive contains all Sprint 105-108 detail blocks.

**Status:** COMPLETE 2026-04-16. Task 1334 Done.

---

## Sprint 108 — COMPLETE (2026-04-17)

**Goal:** Fix 2 pre-existing test failures in `1227-source-health-empty-result.test.ts`. Root cause: `pollNews` records health under fetcher key `"reuters"` but the test asserts on `"Reuters RSS"` — two different buckets in the singleton `globalSourceTracker`. Fix: add a source key → display name map in `pollNews` so health is recorded under the human-readable name.

**Status:** COMPLETE 2026-04-17. Tasks 1332+1333 merged.

---

## Sprint 107 — COMPLETE (2026-04-17)

**Goal:** Fix `taSummary: []` in every evening report. TA signals (RSI, MA20) have been computed since sprint 094 but the evening summary always returns empty because `defaultComputeTa` reads from `market_prices_history` (intraday ticks — only 1 day of data) instead of `daily_ohlcv` (proper daily OHLCV — 10+ days growing). Switch the data source to `daily_ohlcv.close` so TA signals surface as soon as 15 trading days of OHLCV exist.

**Scope:**
- IN: `src/application/usecases/assembleBriefing.ts` — rewrite `defaultComputeTa()` to query `daily_ohlcv` (`SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT 60`) instead of averaging `market_prices_history` ticks by UTC day
- IN: TDD test `src/__tests__/1330-ta-daily-ohlcv.test.ts` — verify `defaultComputeTa` returns non-null signal when `daily_ohlcv` has 15+ rows, returns null when < 15 rows, and that RSI/MA20 compute correctly from close prices
- OUT: Changes to alert pipeline, VPS proxies, BCTC tools, other scheduler jobs

**Success metric:** With 15+ rows in `daily_ohlcv` for a ticker, `defaultComputeTa()` returns a non-null `TaSignal`. Evening report `taSummary` field is non-empty for watchlist tickers that have 15+ days of OHLCV. `bun tsc --noEmit` clean. TDD tests pass.

**Status:** COMPLETE 2026-04-17. Tasks 1330+1331 merged.

---

## Sprint 106 — COMPLETE (2026-04-17)

**Goal:** Fix 10 persistent test timeouts in `278-cycle-peer-sync.test.ts`. All 10 tests call `runIntelligenceCycle` without `DB_PATH=":memory:"` and without injecting `getRecentAlertHistoryFn`, causing the cycle's internal cooldown `getDb()` calls to hit the production SQLite file. Result: all 10 tests hit the 5s limit — 50 seconds wasted per full suite run.

**Scope:**
- IN: `src/__tests__/278-cycle-peer-sync.test.ts` — add `process.env["DB_PATH"] = ":memory:"` at line 1 (before all imports)
- IN: Add `getRecentAlertHistoryFn: async () => []` to `buildBaseDeps()` so all 10 `runIntelligenceCycle` call-sites are covered automatically
- IN: Verify all 10 tests pass and total file runtime is under 10s
- OUT: Changes to production code, other test files, intelligence cycle logic

**Success metric:** `bun test ./src/__tests__/278-cycle-peer-sync.test.ts` — all 10 tests pass in under 10s total. `bun tsc --noEmit` clean. Full suite regression: 0 new failures vs Sprint 105 baseline (4885 pass).

**Status:** COMPLETE 2026-04-17. Task 1329 merged.

---

## Sprint 105 — COMPLETE (2026-04-17)

**Goal:** Fix 4 persistent test timeouts in `137-fix-alert-pipeline.test.ts` (Step E suite). These tests call `runIntelligenceCycle` without setting `DB_PATH=":memory:"` at file top, causing the cycle's internal `getDb()` calls to hit the production SQLite file. Result: 4 tests hit the 30s limit every full suite run, masking real regressions.

**Scope:**
- IN: `src/__tests__/137-fix-alert-pipeline.test.ts` — add `process.env["DB_PATH"] = ":memory:"` at line 1 (before all imports) so all dynamic `import("../infrastructure/db/schema.js")` calls inside `runIntelligenceCycle` resolve to the in-memory DB
- IN: Inject `getRecentAlertHistoryFn: async () => []` in all 4 Step E test fixtures to prevent the fallthrough to `getCooldownDb()` real DB path
- IN: Verify all 4 Step E tests complete well under 5s after fix
- OUT: Changes to production code, other test files, intelligence cycle logic

**Success metric:** `bun test ./src/__tests__/137-fix-alert-pipeline.test.ts` — all tests pass in under 10s total. `bun tsc --noEmit` clean. Full suite regression: 0 new failures.

**Status:** COMPLETE 2026-04-17. Task 1328 merged.

---

## Sprint 104 — COMPLETE (2026-04-16)

**Goal:** Fix misleading macro alert label — "cao bất thường" (abnormally high) is shown even when the value is BELOW the moving average (negative z-score). This is a user-facing messaging bug: the user reads "high" but the market condition is actually "low".

**Scope:**
- IN: `macroThresholds.ts` — make `LEVEL_VI` direction-aware: "cao bất thường" for above-mean deviations, "thấp bất thường" for below-mean deviations
- IN: Update `classifyDeviation()` summary to use directional label
- IN: TDD test covering: above-mean `high` → "cao bất thường", below-mean `high` → "thấp bất thường", above-mean `extreme` → "cực cao", below-mean `extreme` → "cực thấp"
- OUT: Alert pipeline changes, VPS proxies, BCTC tools

**Success metric:** Alert message for USD/VND below mean shows "thấp bất thường" not "cao bất thường". `bun tsc --noEmit` clean. TDD tests pass.

**Status:** COMPLETE 2026-04-16. Tasks 1326+1327 merged.

---

## Sprint 103 — COMPLETE (2026-04-16)

**Status:** COMPLETE 2026-04-16. Tasks 1324+1325 merged. push-news handler now wires all 9 VPS sources dynamically. 10/10 tests pass.

---

## Sprint 100 — COMPLETE (2026-04-15)

**Goal:** Diagnose and fix `predictionSignals: []` in evening reports — the field has been empty across every daily report for weeks, meaning users never see prediction-based signals at close even when the prediction pipeline is running.

**Scope:**
- IN: Investigate why `assembleEveningSummary` returns `predictionSignals: []` — check DB query, prediction_signals table population, and evidence fragment flow
- IN: Fix root cause (query gap, missing table population, or schema mismatch)
- IN: TDD test covering `predictionSignals` populated correctly in evening summary
- OUT: Changes to alert pipeline, TA scan jobs, BCTC tools, VPS proxies

**Success metric:** Evening report `predictionSignals` field contains at least the currently active prediction claims when they exist. `bun tsc --noEmit` clean. Test passes.

**Status:** COMPLETE 2026-04-15. Tasks 1318+1319 merged. All 10 test cases pass.

---

## Sprint 101 — COMPLETE (2026-04-15)
**Status:** COMPLETE 2026-04-15. Tasks 1320+1321 merged. DDD boundary: 0 infra imports in domain/. All 4 tests pass.

---

## Sprint 102 — COMPLETE (2026-04-15)

**Goal:** Add a `newsCount` diagnostic field to the evening summary report — the `topStories: []` gap in production is invisible to the user and hard to debug. Surfacing how many raw news items were ingested since midnight gives immediate observability into whether the VPS news push is working and whether the intelligence cycle is writing analyses.

**Scope:**
- IN: Add `newsCount: number` field to `EveningSummary` type (count of `rag_analyses` rows since midnight Vietnam)
- IN: Populate `newsCount` in `assembleEveningSummary.ts` — single COUNT query alongside existing ragRows query
- IN: Include `newsCount` in the Telegram evening message: show "(N tin tức hôm nay)" beside the top stories section header; if `newsCount === 0` show "Không có tin tức hôm nay" instead of empty list
- IN: TDD test (4 cases): newsCount populated correctly, zero case shows fallback label, positive case shows count, `bun tsc --noEmit` clean
- OUT: Intelligence cycle changes, VPS proxy changes, alert pipeline

**Success metric:** Evening Telegram message shows news count. User can tell at a glance if the news pipeline is active. `bun tsc --noEmit` clean. 4+ TDD cases pass.

---

## Sprint 099 — COMPLETE

**Goal:** Rewrite `franceSummaryJob` — the France morning digest sent to MARKET channel was using a legacy format. New version sends top 3 movers, top 3 alerts, TA signal count in Vietnamese. Silent skip when all sources empty.

**Scope:**
- IN: Task 1316 — feat(france-summary): rewrite `franceSummaryJob.ts`
- IN: Task 1317 — TDD test `1316-france-summary-rewrite.test.ts`
- OUT: Alert Commander, evening summary, VPS proxies

**Success metric:** `franceSummaryJob` sends correctly formatted Vietnamese digest at 07:00 UTC M-F. Silent skip when no data. 12/12 TDD cases pass.

---

## Sprint 098 — COMPLETE

**Goal:** Deliver unnotified TA alerts (RSI overbought/oversold, BB breakout) from `alerts` table to Telegram MARKET channel intraday — previously TA alerts were never forwarded because `readUnnotifiedAlerts` only picks up `severity IN ('high','critical')`.

**Scope:**
- IN: Task 1314 — feat(ta-notifier): `taAlertNotifierJob.ts`
- IN: Task 1315 — TDD test `1314-ta-alert-notifier.test.ts`
- OUT: Alert Commander, scan jobs, schema changes

**Success metric:** TA alerts reach user within 15 minutes of trigger during market hours. 23/23 TDD cases pass.

---

## Sprint 097 — COMPLETE

**Goal:** Add TA close-of-day signals (RSI/MA20) to evening summary — user currently receives no TA context at market close.

**Scope:**
- IN: Task 1312 — `taSummary: TaSignal[]` added to `EveningSummary` + Telegram formatter
- IN: Task 1313 — TDD test

**Success metric:** Evening Telegram message includes "TA tín hiệu đóng cửa" section when non-neutral signals exist.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 110 | fix(news-pipeline): push-news → rag_analyses insert gap — topStories always empty (1335, 1336) | ACTIVE |
| 109 | chore(tasks): archive stale task detail blocks + fix sprint status entries (1334) | COMPLETE 2026-04-16 |
| 108 | fix(source-health): pollNews SOURCE_DISPLAY_NAMES — eliminate 2 test-1227 failures (1332, 1333) | COMPLETE 2026-04-17 |
| 107 | fix(ta): defaultComputeTa reads daily_ohlcv — TA signals in evening summary (1330, 1331) | COMPLETE 2026-04-17 |
| 106 | fix(test-timeout): 278-cycle-peer-sync DB isolation — 10 tests pass (1329) | COMPLETE 2026-04-17 |
| 105 | fix(test-timeout): 137 Step E test isolation — 4 timeout tests fixed (1328) | COMPLETE 2026-04-17 |
| 104 | fix(macro-alert): direction-aware labels in classifyDeviation (1326, 1327) | COMPLETE 2026-04-16 |
| 103 | fix(push-news): extend SourceFetchers + wire 9 VPS sources (1324, 1325) | COMPLETE 2026-04-16 |
| 102 | feat(evening-summary): newsCount diagnostic field + Telegram formatter (1322, 1323) | COMPLETE 2026-04-15 |
| 101 | refactor(ddd): shared-types.ts — zero infra imports in domain/ (1320, 1321) | COMPLETE 2026-04-15 |
| 100 | fix(prediction): predictionSignals always empty in evening summary (1318, 1319) | COMPLETE 2026-04-15 |
| 099 | feat(france-summary): rewrite franceSummaryJob — Vietnamese digest | COMPLETE 2026-04-15 |
| 098 | feat(ta-notifier): deliver TA alerts to Telegram market channel | COMPLETE 2026-04-15 |
| 097 | feat(evening-summary): add taSummary to EveningSummary + Telegram | COMPLETE 2026-04-15 |
| 096 | fix(ta-alert): cooldown query wall-clock vs nowFn (1311) | COMPLETE 2026-04-15 |
| 095 | feat(ta-alert): bbAlertScanJob BB breakout (1309, 1310) | COMPLETE 2026-04-15 |
| 094 | feat(ta-alert): taAlertScanJob RSI overbought/oversold (1307, 1308) | COMPLETE 2026-04-15 |
| 093 | fix(test-drift): tool count + scheduler lock contract (1305, 1306) | COMPLETE 2026-04-15 |
| 092 | feat(briefing): TA signals in morning briefing (1304) | COMPLETE 2026-04-15 |
| 091 | fix(cascade) + BCTC backlog (1207, 1218, 1248) | COMPLETE 2026-04-15 |
| 090 | feat(ta): technical indicators domain service + MCP handler (1302, 1303) | COMPLETE 2026-04-15 |
| 089 | fix(sector-dedup) + fix(test-isolation) (1300, 1301) | COMPLETE 2026-04-15 |
| 088 | fix(test-drift): scheduler count, VPS string, Step E behavior (1297-1299) | COMPLETE 2026-04-15 |
| 087 | fix(ssc) + fix(prediction) schema (1295, 1296) | COMPLETE 2026-04-15 |
| 086 | fix(schema) + fix(kinh-dich) + fix(freshness) (1291-1293) | COMPLETE 2026-04-15 |
| 085 | fix(cascade) + feat(scheduler) franceSummaryJob (1289, 1290) | COMPLETE |
| 084 | fix(cascade/pollNews/schema) (1286-1288) | COMPLETE |
| 083 | Code janitor scan + schema.ts env-access fix | COMPLETE |
| 082 | Config drift fix — alert cooldown config-driven + sector dedup | COMPLETE 2026-04-15 |
| 081 | Domain bug batch — cascade/classification, NER fixes | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
