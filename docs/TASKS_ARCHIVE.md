# TASKS Archive — VN Market Intelligence MCP

Index of completed sprints. Full details in `docs/archive/` files — load only when needed.

Active board → `TASKS.md`

---

## Archive Files (lazy-load)

| File | Sprints | Period | Summary |
|------|---------|--------|---------|
| [sprints-1269-1277.md](archive/sprints-1269-1277.md) | 1269–1277 | 2026-04-22 | Signal pipeline bug fixes: macro direction labels (1269), foreign flow UNIQUE constraint (1275), cooldown bypass (1276), Ops agent formalization (1277). 6171 tests, 0 failures. |
| [sprints-133-162.md](archive/sprints-133-162.md) | 133–162 | 2026-04-17 → 04-18 | test-isolation Bun preload (1380+1381), ocr-e2e skip geo-blocked (1382), france-msg-quality filler+diacritics (1383+1384), evening-news-filler (1385+1386), morning-briefing-filler (1387+1388), weekly-portfolio-filler+diacritics (1389+1390), stale-lock regression (1391), calibration-diacritics (1392+1393), alert-digest-diacritics (1394+1395), db-isolation Bun.env fix + phantom purge (1400+1401), volume-spike-multiplier ATC guard + per-ticker avgVolume (1402+1403), alert-diacritics convictionScorer labels (1404+1405), hut-sector reclassify real_estate→construction + DB migration (1406+1407), tool-diacritics kinhDich+ta+supplyChain helpers (1408+1409), tool-diacritics-sweep 24 files (1410+1411), diacritics-wave3 scheduler+domain+application layers (1412+1413), diacritics-wave4 5 interface/mcp/tools files 13 strings (1414+1415), diacritics-wave5 12 interface tools + 1 domain service 118 strings (1416+1417), diacritics-wave6 6 files (1418+1419), wrap-missing-jobs-recordJobRun cron health coverage (1420), morning-briefing upcomingDeadlines BCTC section (1422+1423), evening-summary sector aggregation from watchlist movers (1424+1425), evening-summary VN-Index close price (1426+1427), evening-ta-filter RSI-only predicate fix (1428+1429), startup-catchup morning-briefing + evening-summary on restart (1430+1431), foreign-flow-sentinel filter 9999999 (1432+1433), morning-briefing commodity values fix (1434+1435), morning-briefing VN-Index point change (1436+1437), morning-briefing portfolio P&L section (1438+1439), portfolio-pnl Vietnamese diacritics fix (1440), evening-summary portfolio P&L at market close (1441+1442), france-summary portfolio P&L block (1444+1445) |
| [sprints-120-132.md](archive/sprints-120-132.md) | 120–132 | 2026-04-17 | prediction-diag medium-severity (1354+1355), ta-diag evening summary (1356+1357), ohlcv-aggregator (1358+1359), ohlcv-backfill-queue (1360+1361), vps-deploy-backfill (1362+1363), france-ta-detail (1364+1365), pipeline-health-tool (1366+1367), ohlcv-aggregator-notify (1368+1369), france-watchlist-movers (1370+1371), france-test-fixtures (1372+1373), ohlcv-aggregator-cron (1374+1375), evening-summary-db (1376+1377), vps-auto-deploy (1378+1379) |
| [sprints-109-119.md](archive/sprints-109-119.md) | 109–119 | 2026-04-16 → 04-17 | france-summary-cron widen window (1348+1349), ta-adaptive lower guard + adaptive RSI/MA (1346+1347), france-summary stale alert 24h filter + dedup (1344+1345), ta-fallback daily_ohlcv < 15 rows (1342+1343), test-crash LanceDB fix (1341), alert-delivery medium severity (1339+1340), test hygiene (1337+1338), news-pipeline rag_analyses fix (1335+1336), chore tasks archive (1334), ohlcv-backfill endpoint + VPS script (1350+1351), ohlcv-startup-probe (1352+1353) |
| [sprints-064-080.md](archive/sprints-064-080.md) | 064–108 | 2026-04-12 → 04-17 | Knowledge sync, prediction resolution, Bun.env purge, briefing enrichment, market message review, calibration labels, per-ticker intelligence, BCTC pipeline fix, evening pipeline fix, RSS Atom support, pipeline health tool, pipeline watchdog, TE RSS fallback chain, evening summary empty-content fallback, domain bug batch (cascade/NER/relevance), push-news all 9 VPS sources, direction-aware macro deviation labels, test isolation (137 Step E 30s timeout fix), fix defaultComputeTa reads daily_ohlcv, pollNews SOURCE_DISPLAY_NAMES map (eliminates 2 test-1227 failures), test hygiene (297 DB_PATH isolation + 296 OCR 30s timeout cap), alert delivery medium severity fix, ta-fallback defaultComputeTa fallback to market_prices_history when daily_ohlcv < 15 rows, france-summary stale alert 24h filter + same-day dedup guard (1344+1345) |
| [sprints-059-063.md](archive/sprints-059-063.md) | 059–063 | 2026-04-12 → 04-13 | Prediction engine B+C+D, foreign flow VPS, cron observability, insider detection |
| [sprints-054-058.md](archive/sprints-054-058.md) | 054–058 | 2026-04-08 → 04-12 | Position ledger, /ask queue, alert narrowing, Kinh Dich default, observability, BCTC fallback, evidence store, OCR fix |
| [sprints-048-053.md](archive/sprints-048-053.md) | 048–053 | 2026-04-06 → 04-07 | OCR pipeline, Kinh Dich differentiation, 3-channel Telegram migration |
| [sprints-025-034.md](archive/sprints-025-034.md) | 025–034 | 2026-04-01 → 04-02 | Sector rotation, correlation, performance attribution, rebalancing, rate limiter, Telegram commands |
| [sprints-004-006.md](archive/sprints-004-006.md) | 004–006 | Foundation | RSS, watchlist, signals, alerts, HOSE/HNX fetchers, pattern matcher, scheduler |
| [standalone-tasks.md](archive/standalone-tasks.md) | — | 2026-04-08 → 04-12 | Bug fixes, janitor cleanups, VPS proxy, cascade rules, DDL dedup |
| inline | 1777–1802 | 2026-04-30 | VPS SSH restart pipeline (1779a/b/c), classifyFilingStatus off-by-one (1781), BCTC enricher Q1-2026 seed (1782), morning bulletin foreign-flow masking (1783), sector alerts dedup (1784), France summary change_pct (1785), earnings conflict detection (1786), GVR sector fix (1787), HCM ticker false positive (1788), getDeadlineForQuarter DST bug (1789), alertDigestJob dedup guard (1790), assembleAlertDigest intra-digest dedup (1791), BCTC conviction signal debounce (1792), pollNews all-sources-dark cooldown (1793), EOD Vol+RSI (1794), JANITOR-011/012, VPS pipeline restored (1777a), Docker rebuild (1795), 1796a–g janitor sweep, 1797 NewsAPI guard, 1798 TE Chromium scraper, te-chromium-fix, te-chromium-news, 1799–1803 stats+docs sync. |

---

## Archive — Added 2026-04-29 (Sprint 1409)

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
- **1352–1408:** Scheduler gap-fill wave 2 (1353a–1358b: 6 jobs + 48 gap tests), stale-tickers purge, signal outcome tracking end-to-end (1382b/c/d), foreignFlow CB auto-reset + stuck-OPEN fix (1388/1392), OHLCV volume bug (1390), alert-digest double-send dedup (1377), bbAlertScan stale-candle guard (1391), eveningSummaryJob dedup guard (1401), formatAlertDigest price-drop qualifier (1405), bctcQueueEnricher placeholder URL catch (1405b), DB row cleanup (1401-db/1402/1403/1406), startup-catchup evening guard (1408) — ALL MERGED 2026-04-28 (7926 pass / 17 pre-existing fail / 0 regression)
- **1406a–1406f:** server.ts decomposition — pushPricesHandler.ts + server-startup.ts + pushForeignFlowHandler.ts + webhookHandler.ts extracted; jobs.ts (967 lines) → cronConfig.ts + startupHelpers.ts + startScheduler.ts; server.ts ≤1600 lines achieved. QA sign-off: 8043 tests pass, 0 TS errors — MERGED 2026-04-29
- **1395a:** alertBatchGrouper wired to pushPricesHandler — batch sends replace per-alert loop — MERGED 2026-04-29
- **1413b:** foreignFlow CB self-heal fix — early-return guard removed, CircuitOpenError→503+Retry-After, 15 regression tests — MERGED 2026-04-29
- **1396:** GAS digest (+HH:MM) ICT intraday progression label replaces (+thêm) — 11 tests, 8093 total — MERGED 2026-04-29
- **JANITOR-004/005/007/008:** DRY cleanups — COMPANY_SHORT_NAME→getCompanyName (STOCK_CATALOG SSOT), IMF_HISTORICAL_BASELINE=3.0 extracted to imfIndicators.ts, Vietnamese severity label map→severityLabels.ts, LOG_ROTATE_BYTES constant in vps-lib.sh — MERGED 2026-04-29
- **1409a–1409f:** AUDIT sprint — SPRINT_GOAL.md trimmed ≤30 lines, TASKS.md Done archived, agent-spawn-template.md created, ULTRA/FULL/LITE merged into token-economy SKILL.md, ghost test-module-memory.md deleted, project-stats.json updated — MERGED 2026-04-29
- **hotfix-vcb-parser + hotfix-vcb-parser-fixer:** VCB bank BCTC parser — unit header + year filter, extractNumber fallback year filter, detectUnitMultiplier scan window expanded, B-3a/B-3b real OCR fixtures, banking-label fallback — MERGED 2026-04-29
- **1415b:** VCB BCTC bank page-pair parser — contains-based separator + page-pair merge. 16 hotfix tests + 8053 total pass. total_liabilities Q1=1,904,318,782 Q4=2,214,393,069 confirmed — MERGED 2026-04-29
- **1416a:** VCB total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1) confirmed. Banking-label fallback emits key "270". 20 hotfix tests pass. validation_status=passed — MERGED 2026-04-29
- **1416b:** FPT 2025-Q4 total_assets=88,089,621 triệu confirmed. trimToBalanceSheetWindow helper + findValueByCode — MERGED 2026-04-29
- **1416c:** HPG added to WATCHLIST_SEED (26 tickers), disk-scan resolves HPG filenames. 5/5 targeted tests pass. HPG confirmed in live DB — MERGED 2026-04-29
- **1418:** 4 TSC errors fixed in 1383 + 1397c test files. 0 TSC errors. 10 + 5 targeted tests pass — MERGED 2026-04-29
- **1419:** 25 pre-existing test failures resolved → 0. 38 documented skips. 8076 pass, 0 fail — MERGED 2026-04-29
- **1420:** Sprint housekeeping — close 1416, open 1420, sync project-stats.json — MERGED 2026-04-29
- **1421:** QQ1 double-prefix fixed at 2 guard sites (sort_key + period_type) in bctcReparseJob.ts. 20 targeted tests pass. 8090 total pass — MERGED 2026-04-29
- **1422:** BA brownfield check — VCB Mẫu B02a/TCTD-HN total_assets already resolved by 1415b+1416a. DB confirmed total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1), validation_status=passed, 0% mismatch. No implementation needed — CLOSED 2026-04-29

---

## Sprint 105–108 — Done Task Details

### 1332 — test(source-health): TDD test pollnews-source-display-name

**Branch:** `task/1332-1333-source-display-name`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Done
**Role:** Dev

**Root cause to prove:** `pollNews` calls `globalSourceTracker.recordSuccess("reuters")` using the raw fetcher key. The test (and the health UI) checks `"Reuters RSS"` — a different bucket. The test on line 164-200 of `1227-source-health-empty-result.test.ts` manually seeds failures on `"Reuters RSS"`, then runs `pollNews` with Reuters returning items, then asserts `"Reuters RSS"` status is `"ok"`. But `pollNews` updates the `"reuters"` bucket, not `"Reuters RSS"` — so the assertion fails.

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — the health tracking loop and `recordSuccess`/`recordFailure` call sites
- `src/__tests__/1227-source-health-empty-result.test.ts` lines 124–200 — the two pollNews integration tests

**Files to create:**
- CREATE: `src/__tests__/1332-pollnews-source-display-name.test.ts`

**Test cases (3 required — must FAIL before task 1333 fix):**
1. TC-1: `pollNews` with `reuters: async () => [item]` → `globalSourceTracker.getHealth("Reuters RSS").status === "ok"` (fails: pollNews records under `"reuters"` not `"Reuters RSS"`)
2. TC-2: `pollNews` with `cafef: async () => []` → `globalSourceTracker.getHealth("CafeF RSS").consecutiveFailures > 0` (fails: recorded under `"cafef"`)
3. TC-3: After TC-1, `globalSourceTracker.getHealth("reuters")` is either absent or at default state (confirms old key is no longer used)

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` written before the fix
**When** `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs (before task 1333)
**Then** TC-1 and TC-2 FAIL (proving the bug). TC-3 passes.
After task 1333: all 3 pass.
`bun tsc --noEmit` 0 errors.

---

### 1333 — fix(source-health): SOURCE_DISPLAY_NAMES map in pollNews

**Branch:** `task/1332-1333-source-display-name` (same as 1332)
**Layer:** application/usecases
**Depends on:** 1332 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — health tracking loop
- `src/__tests__/1332-pollnews-source-display-name.test.ts` — confirm TC-1 and TC-2 are red

**Files to modify:**
- MODIFY: `src/application/usecases/pollNews.ts`
  - Add constant before the health tracking loop:
    ```ts
    const SOURCE_DISPLAY_NAMES: Record<string, string> = {
      reuters: "Reuters RSS",
      cafef: "CafeF RSS",
      vnexpress: "VnExpress RSS",
      vneconomy: "VnEconomy RSS",
      tradingeconomics: "Trading Economics RSS",
    };
    ```
  - Replace `globalSourceTracker.recordSuccess(name)` with `globalSourceTracker.recordSuccess(SOURCE_DISPLAY_NAMES[name] ?? name)`
  - Replace both `globalSourceTracker.recordFailure(name, ...)` calls with `globalSourceTracker.recordFailure(SOURCE_DISPLAY_NAMES[name] ?? name, ...)`

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` with TC-1+TC-2 failing
**When** fix applied and `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs
**Then** all 3 pass.
`bun test src/__tests__/1227-source-health-empty-result.test.ts` — all 8 pass / 0 fail (the 2 pre-existing failures eliminated).
Full suite regression: 0 new failures vs Sprint 107 baseline.
`bun tsc --noEmit` 0 errors.

---

### 1331 — test(ta): TDD test 1330-ta-daily-ohlcv.test.ts

**Branch:** `task/1330-1331-ta-daily-ohlcv`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — current `defaultComputeTa()` signature and return type `TaSignal | null`
- `src/infrastructure/db/schema.ts` lines 134–148 — `daily_ohlcv` schema (code, date, open, high, low, close, volume)

**Files to create:**
- CREATE: `src/__tests__/1330-ta-daily-ohlcv.test.ts`

**Test cases (4 required — written before production change):**
1. TC-1: `daily_ohlcv` has 0 rows for ticker → `defaultComputeTa()` returns null
2. TC-2: `daily_ohlcv` has 14 rows (< 15) → returns null
3. TC-3: `daily_ohlcv` has 20 rows with known close prices → returns non-null `TaSignal` with `code`, `rsi14`, `rsiStatus`, `ma20`, `priceVsMa20`, `currentPrice` all defined
4. TC-4: `daily_ohlcv` has 20 rows where last close > MA20 → `priceVsMa20 === "above"`

**Acceptance Criteria:**

**Given** a fresh `daily_ohlcv` table with synthetic close prices
**When** `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs (before task 1330 fix is applied)
**Then**
- TC-1, TC-2: pass (null return for insufficient data — already correct)
- TC-3, TC-4: FAIL (production code reads `market_prices_history`, not `daily_ohlcv` — proves the bug)
- After task 1330 is applied: all 4 pass
- `bun tsc --noEmit` 0 errors

---

### 1330 — fix(ta): rewrite defaultComputeTa to use daily_ohlcv

**Branch:** `task/1330-1331-ta-daily-ohlcv` (same as 1331)
**Layer:** application/usecases
**Depends on:** 1331 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — full `defaultComputeTa()` function
- `src/__tests__/1330-ta-daily-ohlcv.test.ts` — confirm tests exist and TC-3/TC-4 are red

**Files to modify:**
- MODIFY: `src/application/usecases/assembleBriefing.ts`
  - In `defaultComputeTa()`: replace the `market_prices_history` query with:
    ```sql
    SELECT date, close AS close_price
    FROM daily_ohlcv
    WHERE code = ?
    ORDER BY date ASC
    LIMIT 60
    ```
  - Remove the `GROUP BY date(fetched_at)` grouping and the `AVG(price)` aggregation — `daily_ohlcv` already has one row per day with the official close price
  - Keep the `if (rows.length < 15) return null` guard unchanged
  - Keep all downstream RSI/MA20 computation unchanged — only the data source changes

**Acceptance Criteria:**

**Given** `src/__tests__/1330-ta-daily-ohlcv.test.ts` exists with TC-3/TC-4 failing
**When** fix is applied and `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs
**Then**
- All 4 tests pass / 0 fail
- TC-3: `defaultComputeTa()` returns non-null signal from `daily_ohlcv` data
- TC-4: `priceVsMa20 === "above"` when last close exceeds MA20
- No regression in other TA tests (`bun test` full suite 0 new failures)
- `bun tsc --noEmit` 0 errors

---

### 1329 — fix(test-timeout): 278-cycle-peer-sync DB isolation

**Branch:** `task/1329-test278-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Done
**Role:** Dev

**Root cause:** `src/__tests__/278-cycle-peer-sync.test.ts` does NOT set `process.env["DB_PATH"] = ":memory:"` at file top. The comment on line 15 incorrectly claims this is impossible; task 1328 (test 137 fix) proved the pattern works — set `:memory:` at line 1 AND inject `getRecentAlertHistoryFn: async () => []` into `buildBaseDeps()`. Without this, the cycle's cooldown `getDb()` calls hit the production SQLite file, causing all 10 tests to timeout at 5s (50s wasted per full suite run).

**Files to read first:**
- `src/__tests__/278-cycle-peer-sync.test.ts` — full file, understand `buildBaseDeps()` and all 10 test call-sites
- `src/__tests__/137-fix-alert-pipeline.test.ts` lines 1–5 — confirm the working pattern for `:memory:` + `getRecentAlertHistoryFn` injection

**Files to modify:**
- MODIFY: `src/__tests__/278-cycle-peer-sync.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192 and test 137)
  - ADD `getRecentAlertHistoryFn: async () => []` to the `buildBaseDeps()` return object — this automatically covers all 10 tests
  - REMOVE or UPDATE the incorrect comment on line 15 ("We cannot use DB_PATH=:memory: because...") — this comment is wrong; the real reason for past timeout was missing `getRecentAlertHistoryFn`

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/278-cycle-peer-sync.test.ts` runs
**Then**
- All 10 tests pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs Sprint 105 baseline (4885 pass, 14 fail pre-existing)

---

### 1327 — test(macro-alert): TDD test 1326-macro-deviation-direction.test.ts

**Branch:** `task/1326-1327-macro-alert-direction`
**Layer:** test
**Depends on:** none (TDD-first — write failing tests before fix)
**Status:** Done
**Role:** Dev

**Files to create:**
- CREATE: `src/__tests__/1326-macro-deviation-direction.test.ts`

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — understand `classifyDeviation()` signature and `MacroStats` type
- `docs/TECH_104.md` — 6 test case input values and assert strings

**Test cases (6 required — all must FAIL before task 1326 is applied):**
1. TC-1 (AC-1): `current=26364, mean=26333, stdDev=12, n=30` → zScore≈+2.6 → summary contains "cao bất thường", not "thấp bất thường"
2. TC-2 (AC-2): `current=26302, mean=26333, stdDev=12, n=30` → zScore≈-2.6 → summary contains "thấp bất thường", not "cao bất thường"
3. TC-3 (AC-3): `current=26375, mean=26333, stdDev=12, n=30` → zScore≈+3.5 → summary contains "cực cao"
4. TC-4 (AC-4): `current=26291, mean=26333, stdDev=12, n=30` → zScore≈-3.5 → summary contains "cực thấp"
5. TC-5 (AC-5): `current=26340, mean=26333, stdDev=12, n=30` → zScore≈+0.6 → summary contains "bình thường"
6. TC-6 (regression): `current=26302, mean=26333.2, stdDev=12, n=30` → summary contains "thấp bất thường", not "cao bất thường"

**Acceptance Criteria:**

**Given** a fresh checkout on `task/1326-1327-macro-alert-direction` before 1326 is applied
**When** `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests call `classifyDeviation()` directly — no DB, no HTTP, no Telegram
- TC-2, TC-4, TC-6 fail (proving the bug exists — before-only labels)
- TC-1, TC-3, TC-5 pass (above-mean path already correct)
- After task 1326 is applied: all 6 pass / 0 fail
- `bun tsc --noEmit` 0 errors

---

### 1326 — fix(macro-alert): direction-aware level label in classifyDeviation

**Branch:** `task/1326-1327-macro-alert-direction` (same as 1327)
**Layer:** domain/services
**Depends on:** 1327 (tests written and confirmed failing)
**Status:** Done
**Role:** Dev

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — full file, find `LEVEL_VI` const and line 138
- `src/__tests__/1326-macro-deviation-direction.test.ts` — confirm tests exist and are red

**Files to modify:**
- MODIFY: `src/domain/services/macroThresholds.ts`
  - Add `LEVEL_VI_BELOW: Record<DeviationLevel, string>` with keys `{ normal: "bình thường", elevated: "thấp hơn TB", high: "thấp bất thường", extreme: "cực thấp" }`
  - Rename `LEVEL_VI.extreme` from `"cực đoan"` → `"cực cao"`
  - Replace line 138: `const levelVi = LEVEL_VI[level]` → `const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level]`

**Acceptance Criteria:**

**Given** `src/__tests__/1326-macro-deviation-direction.test.ts` exists with 6 failing tests
**When** the fix is applied to `macroThresholds.ts` and `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests pass / 0 fail
- AC-2: below-mean high → summary contains "thấp bất thường", not "cao bất thường"
- AC-4: below-mean extreme → summary contains "cực thấp"
- AC-3: above-mean extreme → summary contains "cực cao" (not "cực đoan")
- No other test files regress (`bun test` full suite passes)
- `bun tsc --noEmit` 0 errors

---

### 1328 — fix(test-timeout): 137 Step E tests — DB isolation + missing dep injection

**Branch:** `task/1328-test137-step-e-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Done
**Role:** Dev

**Root cause:** `src/__tests__/137-fix-alert-pipeline.test.ts` has no `process.env["DB_PATH"] = ":memory:"` at file top. The 4 Step E tests call `runIntelligenceCycle` which internally calls `getDb()` via dynamic imports at multiple points (macro alert step A2.5, step E cooldown, etc.). Without `:memory:` set before module load, these resolve to the real production SQLite file — triggering WAL replay, disk I/O, and potential lock contention. Result: 30s timeout per test × 4 = 120s wasted in every full suite run, masking real regressions.

**Files to read first:**
- `src/__tests__/137-fix-alert-pipeline.test.ts` — full file, identify all 4 Step E test cases
- `src/scheduler/intelligenceCycleJob.ts` lines 585–870 — understand all `getDb()` call sites inside the cycle so we know which deps to inject

**Files to modify:**
- MODIFY: `src/__tests__/137-fix-alert-pipeline.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192)
  - In all 4 Step E test fixtures (`runIntelligenceCycle` calls), ADD: `getRecentAlertHistoryFn: async () => []` to prevent fallthrough to `getCooldownDb()` real-DB path
  - Verify the 4 existing Step E tests still correctly test their AC (no semantic change — only DB isolation fix)

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/137-fix-alert-pipeline.test.ts` runs
**Then**
- All Step E tests (4 cases) pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs baseline (4890 pass baseline from Sprint 104)
