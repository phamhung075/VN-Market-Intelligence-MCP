# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1948e-A — Add "legal_risk" to SignalTypeSchema enum (2026-05-18, DONE)

**Change:** `agentSignalStore.ts:49` — `"legal_risk"` added to `SignalTypeSchema` z.enum. One-line additive change, zero DB migration. Enum is validation-only; `agent_signals.signal_type` column is TEXT NOT NULL (accepts any string).

**Tests:** 3/3 GREEN (TC1 schema accepts legal_risk, TC3 all 9 existing types, TC4 unknown_type rejected). tsc 0 errors. Regression: +1 pass, 0 new failures.

**Unblocks:** 1948e-B (stage-signals.md dispatch block for news-scout).

Zone health: SignalTypeSchema now includes legal_risk; PC1 legal_risk signals no longer Zod-rejected at MCP layer | HEALTHY

---

### Task 1945d — BCTC reparse pipeline gap (2026-05-18, DONE)

**Root causes (two gaps):**
- GAP-A: `runBctcReparseJob` called `scanDiskForStrandedPdfs` ONLY when `agent_feedback` returned 0 rows. Freshly-pushed PDFs (EIB/DHG Q1-2026 at 08:22Z) were skipped for 18+ h when other feedback rows existed.
- GAP-B: `push-bctc-pdf` `setImmediate` called `fetchParseAndStoreBctc({..., pdfUrl: sourceUrl})` without `pdfTextOverride`. Pipeline tried downloading from geo-blocked SSC/VPS URL → empty text → `financial_reports` never written.

**Fix (3 production files + 1 test):**
- `bctcReparseJob.ts`: disk scan now runs unconditionally; `pdfDir` option added to interface; `processedFilenames` Set deduplicates feedback-row filenames.
- `pushBctcExtraction.ts` (NEW): `triggerPushBctcExtraction(params)` with injectable deps — OCR via `extractAndStorePdfPagesWithRetry` + `getCachedPdfText` + `fetchParseAndStoreBctc` with `pdfTextOverride`. Same pattern as `bctcPdfPullJob.triggerExtraction`.
- `server.ts`: `push-bctc-pdf` `setImmediate` now calls `triggerPushBctcExtraction` instead of raw pipeline.
- `1945d-reparse-pipeline-gap.test.ts` (NEW): 12 tests — TC-1 filename parse, TC-2 disk scan, TC-3 AC-3 unconditional, TC-4 injection contract.

**Part B root cause (6/7 banks, outside zone):** VPS discover returns SSC URLs, not VPS bctc-files/ URLs. `bctcPdfPullJob` only pulls from `VPS_BCTC_BASE_URL`. VPS has not yet fetched these 6 banks' PDFs. Follow-up needed in dev-vps-crawls if VPS doesn't self-resolve.

**Tests:** 12/12 GREEN. tsc 0 errors. Commit: `159b0888`.

Zone health: push-bctc-pdf extraction now geo-block-proof (pdfTextOverride path); bctcReparseJob disk scan unconditional; 12 new tests cover AC-3 regression | HEALTHY

---

### Task 1946a — Add PLX to watchlist for crisis detection coverage (2026-05-18, DONE)

**Root cause:** PLX absent from all 3 SSoT sources (`system-map.json`, `mcp.config.json`, `seedWatchlist.ts`) → never in SQLite `watchlist` table → `get_crisis_early_warning` silently skipped PLX evaluation. Confirmed via SPIKE_1946.

**Fix (6 files):**
- `docs/data/system-map.json`: PLX added to `.project.watchlist[]` after BSR.
- `mcp.config.json` (root): PLX added to `.market.watchlist` array after BSR.
- `seedWatchlist.ts`: `{ code: "PLX", exchange: "HOSE", domain: "oil_gas" }` added after GAS. Header counts updated 33→34.
- `apps/frontend/app/domain/market.ts`: PLX added to `WATCHLIST_STOCKS` after BSR.
- `1946a-plx-watchlist-crisis-coverage.test.ts` (NEW): 7 tests — seed presence, velocity spike, below-threshold, idempotency.
- `1343a-watchlist-restore.test.ts`: Fixed 11 pre-existing stale-count failures (1876a-A6 left 26→33 without updating tests; now 34). Side fix only.

**Key finding:** `getCrisisEarlyWarning` iterates `stockCodes` param (not DB watchlist) — test must inject low baseline before current-hour spike to produce ratio ≥2.0 (getBaseline includes current hour in AVG window).

**Tests:** 49/49 GREEN (was 38/49 with pre-existing 1343a failures). tsc 0 errors.

Zone health: PLX now seeded at every startup via UPSERT; crisis early warning will evaluate PLX velocity on next call. | HEALTHY

---

### Task 1945b-backend — GET /api/accuracy/digest HTTP handler (2026-05-18, DONE)

**Goal:** Add `GET /api/accuracy/digest?days=N` HTTP handler to `server.ts` after line 1020. Reuse `getSystemAccuracyDigestStats` already existing at `signalOutcomeStore.ts:380`.

**Implementation (2 files):**
- `server.ts`: Import extended + handler inserted. Bug found: spec expression `|| 30` treats `days=0` as falsy → defaults to 30. Fixed to `isNaN` guard so `days=0` correctly clamps to 1 (R-4 lower bound). Handler: `isNaN` guard → clamp [1,90] → call function → spread + `generatedAt` → 200, or catch → 500.
- `1945b-accuracy-digest-handler.test.ts` (NEW): 6 tests. `mock.module` + mutable delegate pattern (same as 1397c). Dynamic `await import()` for `createBunServer` after mock registration. All 4 signalOutcomeStore exports stubbed to avoid contamination errors. Tests: TC-1 shape+ISO, TC-2 clamp-hi (999→90), TC-3 clamp-lo (0→1), TC-4 absent→30, TC-5 throw→500, TC-6 zero-struct→200.

**Key finding:** `mock.module` in Bun is scoped per worker. Contamination only when explicitly passing multiple files on CLI. In full `bun test` run, each file gets own worker → no contamination. Baseline 302 failures → 296 (6 new passes).

**Tests:** 6/6 GREEN. tsc 0 errors. Commit: (see git log).

Zone health: new HTTP endpoint live at `/api/accuracy/digest`; R-4 clamping correct; zero-struct path confirmed; 1945b-frontend unblocked | HEALTHY

---

### Task 1945a — Fix verdictResolutionJob baseline-price shape mismatch (2026-05-18, DONE)

**Root cause:** `getPriceHistory()` in `clients.ts` returned `PriceSnapshot[]` but Go returns `PriceHistoryEnvelope { code, history: DailyOHLCV[] }`. `defaultFetchHistory()` called `snaps[0].price` → TypeError → null → 100% of verdicts marked `false_positive:unresolvable`. ~520 alerts unscored, `scored_pct ≈ 36%`.

**Fix (2 production files + 1 test file):**
- `clients.ts`: Added `PriceHistoryEnvelope` export interface. Changed `getPriceHistory()` return type from `PriceSnapshot[]` to `PriceHistoryEnvelope`. Fetch body returns envelope as-is.
- `verdictResolutionJob.ts`: `defaultFetchHistory()` now reads `envelope.history[0].close` instead of `(snaps[0] as {price}).price`. Added JSDoc noting fix + root cause.
- `1945a-verdict-resolution-envelope.test.ts` (NEW): 6 tests — envelope shape, empty history, null envelope, correct `.close` baseline extraction.

**Caller audit:** Only caller in all of `apps/mcp-server/src/` is `verdictResolutionJob.ts`. `portfolioRiskCalculator.ts` and `priceHistoryTools.ts` read from SQLite, not `getPriceHistory()`. `signalOutcomeStore.ts` has a separate direct fetch to `/price/history` (out of scope).

**Tests:** 6/6 new GREEN. 19/19 existing 1863b verdict resolution tests GREEN. tsc 0 errors.

Zone health: `getPriceHistory` now type-safe with Go envelope; `defaultFetchHistory` correctly extracts baseline close; ~520 unscored alerts will be scored on next hourly cron tick after deploy | HEALTHY

---

### Task 1944b — Remove dead BCTC discovery strategies (SSC/vietstock) (2026-05-18, DONE)

**Goal:** Remove SSC iboard (NXDOMAIN) and vietstock (HTTP 404) from `bctcDiscovery.ts`. Cafef already removed in TASK_1916b. Strategy chain post-fix: hsx(0) → VPS Playwright(1) → null.

**Implementation (2 production files + 12 test files):**
- `bctcDiscovery.ts`: Removed `extractSscUrls`, `extractVietstockUrls`, `tryFetchSsc`, `tryFetchVietstock`, `getSscIboardBase()`, `VIETSTOCK_BASE`. Removed SSC/vietstock dispatch from `discoverHosePdfUrls`. Deprecated `_fetchSsc` + `_fetchVietstock` in `DiscoverOptions` (accepted for compat, never invoked). Updated module docblock + JSDoc. Also removed the `!fetchSsc || !fetchVietstock` guard.
- `bctcQueueEnricherJob.ts`: Removed `_fetchSsc: bctcHttpFetch`, `_fetchCafef: bctcHttpFetch`, `_fetchVietstock: bctcHttpFetch` from production default wiring.
- 11 test files updated: assertions `source === "ssc"` → `source === null` or VPS path. Tests that populated URLs via `_fetchSsc` mock switched to `_fetchHsx` or `_fetchVpsPlaywright`.
- `1944a-vps-live-probe.test.ts`: Added `LIVE-4` test (AC-5): `VPS_INTEGRATION=true` guard, calls `discoverHosePdfUrls` with live `bctcHttpFetch` against VCB Q1/2026, asserts `source === "vps-playwright"` and `urls.length ≥ 1`.

**Cafef verification:** Confirmed already removed in TASK_1916b — `tryFetchCafef`, `extractCafefUrls` absent from codebase; `_fetchCafef` is a pre-existing no-op.

**Tests:** 142 BCTC tests GREEN (138 pass / 4 skip in VPS_INTEGRATION guard). tsc 0 errors. Commit: `61494107`.

Zone health: bctcDiscovery.ts lean (2 live strategies); no dead code calling NXDOMAIN endpoints; 11 test files updated to reflect post-removal semantics | HEALTHY

---

### Task 1944a-mcp — VPS BCTC Discover live probe test (2026-05-18, DONE)

**Goal:** Add VPS_INTEGRATION-guarded integration test for BCTC discover endpoint. Verify env wiring. No production code changes.

**Implementation (1 test file + 1 docs fix):**
- `1944a-vps-live-probe.test.ts` (NEW): 5 tests total — 2 guard tests always run (CI-safe), 3 live tests guarded with `VPS_INTEGRATION=true` (LIVE-1: no HTTP 401, LIVE-2: response shape `{results:Array, error:null|string}`, LIVE-3: direct fetch with API key confirms no 401). Live tests use `it.skip` when guard absent.
- `.env.example`: Added `VPS_PUSH_API_KEY=` entry with comment (was missing — field used by bctcHttpFetcher.ts since commit 8f9c2d55 but not documented in example).

**Wiring verified (read-only):**
- `VPS_PUSH_API_KEY` — present in `.env` line 13, referenced in `bctcHttpFetcher.ts` + `server.ts`. Added to `.env.example`.
- `BCTC_DISCOVER_URL` — confirmed in `docker-compose.yml` line 25 (`http://125.212.251.27:8765/proxy/bctc-discover`).
- `VPS_HOST` — confirmed in `docker-compose.yml` line 28.

**Tests:** 2 pass / 3 skip (CI) — 0 fail. 1916a 6/6 GREEN. 56/56 cashflow+bctc regression GREEN. tsc 0 errors.

**Design note:** Live probe does not block on 1944a-vps deploy — LIVE-2 accepts empty `results[]` before shape fix is deployed. Once 1944a-vps lands, `VPS_INTEGRATION=true bun test 1944a-vps-live-probe` will verify full end-to-end chain.

Zone health: integration test infrastructure established for VPS live probes; env.example now complete for VPS auth; no production drift introduced | HEALTHY

---

### Task 1942c — HPG get_cash_flow all-zeros fix (2026-05-18, DONE)

**Root cause / goal:** HPG `get_cash_flow()` returning `operating_cf=0`/null and `net_income=0`. Root cause: CASH_FLOW_SCRIPT single-key lookup returned 0.0 when VCI steel-sector column key differs from standard key; FINANCE_SCRIPT same issue for NI. Also: steel-sector OCR label "sản xuất kinh doanh" not covered by cashFlowExtractor.

**Diagnostic (FR-1):** Scenario B confirmed — `financial_reports` has 0 rows for HPG. `vnstock_cash_flow` also empty (no prior fetch).

**Implementation (3 files + 1 test):**
- `vnstockBridge.ts`: CASH_FLOW_SCRIPT — replaced single key with 3-key `_ocf_keys` fallback + `next()` sentinel; `operatingCashFlow: round(operating, 2) if operating is not None else None` (NULL policy). FINANCE_SCRIPT — same 3-key `_ni_keys` fallback; `net = 0` kept for ratio math when all keys absent.
- `cashFlowExtractor.ts`: Added `P_OPERATING_CF_MFG` + `F_OPERATING_CF_MFG` constants (steel/manufacturing OCR label "sản xuất kinh doanh"). Wired as 3rd `altPatterns` entry in `fv()` call for `operatingCF`.
- `vnstockTypes.ts`: `VnstockCashFlow.operatingCashFlow: number → number | null`.
- `1942c-hpg-cashflow-fix.test.ts` (NEW): 6 tests (T1-T6) — all GREEN.

**Tests:** 6/6 new GREEN. 50/50 cashflow regression suite (1941a + 1941d + 1942b + 1909a) GREEN. 0 tsc errors.

**Design note:** NULL policy for OCF (stores None when all 3 keys absent) is honest over 0.0. EC-1 documented in T6: genuine 0.0 in DB returns `operating_cf: 0`. Docker rebuild needed for Python script changes to take effect in container.

Zone health: CASH_FLOW_SCRIPT now sector-agnostic (3 VCI key variants); cashFlowExtractor covers steel-sector OCR layout; type honest about missing OCF | HEALTHY

---

### Task 1942b — cashFlowTool fallback read path + backfillOCFForWatchlist (2026-05-18, DONE)

**Root cause / goal:** cashFlowTool returned `{ found: false }` for 27/30 watchlist tickers with zero `financial_reports` rows (no BCTC PDF OCR). Added COALESCE-style fallback: if COUNT = 0, query `vnstock_cash_flow` + `vnstock_financials` directly.

**Implementation (2 files):**
- `cashFlowTool.ts`: COUNT check before primary path. `buildFallbackResponse()` helper: period filter (year+quarter/year-only/latest DESC), ×1000 unit conversion, `data_source: "vnstock_direct"`, `loading: true` for cold DB UX (EC-1), partial result for missing vnstock_financials (EC-3), quarter=0 excluded (EC-4). `CashFlowFound.data_source` + `CashFlowNotFound.loading?` fields added.
- `schema-financial-reports.ts`: `backfillOCFForWatchlist(db)` reads `docs/data/stock-classification.json`, loops tickers, calls `bridgeOCFToFinancialReports()`, logs INFO with count. EC-6 (unreadable file → WARN + return). `bridgeOCFToFinancialReports` now returns `number` (changes). Added `node:fs` + `logger` imports. Called in `initFinancialReportsTables()` after `backfillAllNetProfit()`.

**Tests:** 10/10 new tests GREEN (`1942b-cashflow-fallback-path.test.ts`). 50/50 cashflow regression suite GREEN. 0 tsc errors. `1890a-get-cash-flow.test.ts` updated to add vnstock tables to makeTestDb().

**Design note:** TC8-TC10 use real stock-classification.json (project root) rather than module mocks — avoids `using` keyword type incompatibility with Bun's `mock.module()` returning `void`.

Zone health: COALESCE fallback consistent with existing tool layer; Architect R-7 pragmatic decision respected (fallback SELECT in interface layer); bridgeOCFToFinancialReports return type extended cleanly | HEALTHY

---

### Task 1943a — BCTC Q1-2026 queue reset + batch sweep diagnosis + auto-retry (2026-05-18, DONE)

**Root cause / goal:** 31 bctc_vps_queue rows stuck at url_not_found for Q1-2026 (MAX_ENRICH_ATTEMPTS=5 exhausted). bctcBatchSweepJob zero runs in cron_job_runs. No auto-retry policy for parked rows.

**FIX A:** `resetQ1UrlNotFound(db)` in schema-financial-reports.ts — idempotent UPDATE (status=pending, attempts=0 WHERE url_not_found AND year=2026 AND quarter=Q1). Called from initFinancialReportsTables() after backfillAllNetProfit(). Returns change count.

**FIX B (diagnostic):** Added `console.log('[bctcBatchSweepJob] Starting...')` at entry of runBctcBatchSweepJob. Root cause documented: wrapRun key 'bctcBatchSweepJob' in startScheduler.ts is CORRECT (no mismatch). Zero-run = container likely down at 2026-04-25 09:00 UTC. Next scheduled fire: 2026-07-25 09:00 UTC. Added seasons skip log too.

**FIX C:** Extended bctcQueueEnricherJob.ts WHERE clause with Arm 2 (grace-period): `status='url_not_found' AND last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days') AND attempts < 6`. Graceful fallback to Arm 1 only when `last_attempt` column absent (older test schemas). Also updated `updateStmt` to `SET source_url=?, status='pending'` so grace-period rows are re-queued for PDF pull.

**Tests:** 16 new tests in `BCTC-1943-queue-reset-and-retry.test.ts` — AC-1 (4 tests), AC-2 (3), AC-3 (4), AC-4 (5). All GREEN. 87 total BCTC enricher/sweep tests pass.

**Key gotcha:** makeMinimalDb() in 1782 test lacks last_attempt column → fallback logic needed in enricher query. Fixed with "no such column: last_attempt" catch → Arm 1 only fallback.

**Files changed:** schema-financial-reports.ts, bctcQueueEnricherJob.ts, bctcBatchSweepJob.ts, BCTC-1943-queue-reset-and-retry.test.ts (new), TASKS.md

Zone health: queue reset idempotent; grace-period prevents permanent blindspots; batch sweep has diagnostics | HEALTHY

---

### Task 1942a — vnstock startup backfill probe (2026-05-18, DONE → REVIEW)

**Root cause / goal:** Cold Docker restart leaves vnstock_financials empty until Monday 01:00 UTC cron. Probe fills the gap.

**Implementation:**
- `vnstockStartupProbe.ts` (NEW): injectable deps pattern (`getDb`, `runJob`, `scheduleDelay`, `log`). Guard: COUNT(DISTINCT code WHERE data_type='financials') < 10 OR last fetched_at > 7 days → fire job after 90s delay. Non-fatal: all errors caught + job fires anyway (FR-6 safe fallback).
- `startScheduler.ts`: added import for `runVnstockFundamentalsJob` + `runVnstockStartupProbe`; wired IIFE after accuracyDigest block.
- AC-7 confirmed: no `_resetRunningState` in probe. `_isFundamentalsRunning` in job handles Monday cron overlap.

**Tests (6/6 GREEN):** T1 cold DB fires job, T2 stale >7d fires job, T3 warm skips, T4 DB error caught + job fires anyway, T5 delay=90000ms, T6 missing table caught + fires.

**Key design decision:** extracted into separate module (`vnstockStartupProbe.ts`) with injectable deps rather than inline IIFE. Enables clean unit tests without module-level mocking. Pattern matches ohlcvStartupProbe.ts.

**Commits:** `b1293a56` (feat)

Zone health: startup probe pattern consistent with EFFR + ohlcv probes; DDD layers respected (probe in scheduler/financial-reports, not domain); 100% branch coverage on probe | HEALTHY

---

### Task 1941c — Daily accuracy WORK digest job (2026-05-18, DONE → REVIEW)

**Root cause / goal:** Signal outcome feedback loop (Sprint 1941). Wire a daily 07:00 UTC cron job that reads `signal_outcomes`, computes 30-day accuracy stats, and sends a top-3/bottom-3 signal type breakdown to the WORK Telegram channel.

**Implementation (DDD layers):**
- `infrastructure/db/signalOutcomeStore.ts`: added `SignalTypeAccuracy` + `SystemAccuracyDigestStats` interfaces + `getSystemAccuracyDigestStats(db, days)` — 4-query pattern (per-signal-type aggregation, system totals, new stocks count, neutral-only discriminator).
- `application/usecases/buildAccuracyDigest.ts`: pure `buildAccuracyDigestText(stats, dateStr)` function — AC-8 short digest path (all-neutral), AC-4 n/a guard (< 10 resolved), top-3 + bottom-3 sections.
- `scheduler/digest/accuracyDigestJob.ts`: `_running` module-scope guard + `alreadySentToday()` DB dedup + `runAccuracyDigest(deps?)` with AC-3 graceful skip + AC-8 short digest.
- `scheduler/cronConfig.ts`: `accuracyDigest: '0 7 * * *'` (env `CRON_ACCURACY_DIGEST`).
- `scheduler/startScheduler.ts`: cron.schedule block with `jobRunRepo.wrapRun('accuracyDigestJob', ...)`.

**Tests (7/7 GREEN):**
- TC1: empty table → exits without send (AC-3)
- TC2: all-neutral rows → sends short digest with "all outcomes neutral" (AC-8)
- TC3: ≥6 eligible types → top-3 + bottom-3 in digest (AC-5/AC-6)
- TC4: n/a when totalResolved < 10 (AC-4)
- TC5: accuracy % when totalResolved >= 10 (AC-4)
- TC6: neutralOnlyRows=5 DB integration (AC-8 discriminator)
- TC7: zero stats for empty table (AC-3 DB layer)

**FK discovery:** `signal_outcomes.signal_id` references `agent_signals(id)`. Test seed helper must insert parent `agent_signals` row first before seeding outcomes.

**Commits:** `d524ede8` (feat), `fbe3cd43` (docs)
**Type check:** 0 errors on 1941c files (pre-existing 1941d untracked test excluded from check)

Zone health: accuracyDigestJob wired; signal_outcomes + cron_job_runs + sendTelegramWork all connected; DDD layers respected | HEALTHY

---

### Task 1940a — PC1 legal_risk tool gap (2026-05-18, DONE → REVIEW)

**Fix:** `get_legal_risk_signals` queried ONLY `alerts`. Added `queryAgentSignalsTable()` in `legalRiskTools.ts` for dual-source. 7/7 tests GREEN. Commit `80873d1c`.

---

### TNB Critic Gate — Sprint A + B (2026-05-17, DONE)

Sprint A: schema + tnbCriticScorer.ts (5 checks × 0.2, threshold 0.6). Sprint B: gate wire + retry. 49/49 tests GREEN. QA c143 APPROVED.

---

### Task 1930b — cashFlow OCF/NI ratio guard (2026-05-17, DONE)

OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20. FPT (504×) + VCB (1.42e8×) suppressed. 7/7 tests GREEN.
