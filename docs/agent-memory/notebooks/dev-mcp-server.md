# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1922d — reputationComputeJob daily writer (2026-05-16, DONE)

**Mission:** Wire `reputation_scores` first production caller. `saveReputation()` had zero callers before this task.

**Implementation:**
- New `scheduler/news/reputationComputeJob.ts` — scoring formula: base 50 - negative_mention_ratio * 30 + signal_hit_count * 2 (capped +20)
- Risk level: `classifyRiskLevel()` from domain (safe/watch/warning/danger)
- Trend: improving/stable/deteriorating vs prior week saved score
- signal hits counted via `payload LIKE '%${code}%'` on agent_signals
- Per-ticker failure isolation — non-fatal; job-level errors → WORK alert
- New `scheduler/news/index.ts` barrel

**Files created:**
- `apps/mcp-server/src/scheduler/news/reputationComputeJob.ts`
- `apps/mcp-server/src/scheduler/news/index.ts`
- `apps/mcp-server/src/__tests__/1922d-reputation-compute.test.ts` — 16 tests, all GREEN

**Files modified:**
- `apps/mcp-server/src/scheduler/cronConfig.ts` — `reputationCompute: '30 8 * * *'`
- `apps/mcp-server/src/scheduler/startScheduler.ts` — import + cron.schedule registration

- tsc 0 errors | 16/16 tests GREEN | Commit `c3f17a65`

---

### Task 1922h — imf_indicators 0-row fix (2026-05-16, DONE)

**Root causes (3):**
1. `BROWSER_UA` (Chrome UA) in IMF fetch headers → IMF WAF returns HTTP 403 from Docker container. Fix: removed User-Agent header entirely from IMF fetch call.
2. `GLOBAL_INFLATION` used code `"PCPI_ADVEC"` — not a valid IMF DataMapper code. Fix: → `"PCPIPCH"` (Inflation rate, average consumer prices, 228 countries, VNM covered).
3. `OIL_FORECAST` used code `"POILAPSP"` — not valid. Fix: → `"BCA_NGDPD"` (Current account balance % GDP, 228 countries).

**False-success reporting:** `runImfIndicatorPollerJob` never throws (internal try/catch). `wrapRun` records `status=success` even when 0 rows. Existing behavior, not changed — job returns `{ success: false, indicator_count: 0 }` in failure branch.

**Verification:** Manual trigger post container rebuild → 3 rows written: NGDP_RPCH=3.207, PCPIPCH=3.683, BCA_NGDPD=-0.859. imf_indicators COUNT(*) = 3.

**Files modified:**
- `apps/mcp-server/src/domain/models/imfIndicators.ts` — GLOBAL_INFLATION + OIL_FORECAST codes fixed
- `apps/mcp-server/src/application/services/imfDataFetcher.ts` — BROWSER_UA + breakers imports removed; fetch headers removed; indicator names updated
- `apps/mcp-server/src/__tests__/1922h-imf-indicator-fix.test.ts` — 11 tests (AC-1 to AC-7), all GREEN
- `apps/mcp-server/src/__tests__/1298b-imf-infra.test.ts` — live-call tests replaced with DI mocks

- tsc 0 errors | 114/114 IMF tests GREEN | Commit `15fdf5ed`

---

### Task 1922j — fred_series_daily startup backfill (2026-05-16, DONE)

**Mission:** `fred_series_daily` had 0 rows after Docker restart. `macroIndicatorRefreshJob` runs once daily at 06:00 GMT+7. After restart, no backfill triggered.

**Root cause:** Timing, not env wiring. FRED_API_KEY confirmed in container (`printenv FRED_API_KEY`). Table schema present. Job just hadn't run since restart.

**Fix:** Added void IIFE in `startScheduler()` after `validateMacroFreshnessOnStartup`. On startup, counts `fred_series_daily` rows; if 0, calls `fetchFredEffrIorb` + `fetchFredIsmSubcomponents` immediately. Non-fatal (errors logged, never throw).

- 4 tests GREEN (`1922j-fred-startup-backfill.test.ts`)
- tsc 0 errors
- Commits: `2c6e916f` (startScheduler.ts + test)

---

### Task 1922e — wire mention_velocity writer (2026-05-16, DONE)

**Mission:** `recordMention()` and `mentionVelocityStore` existed but had zero callers in production. `getCrisisEarlyWarning` reads `mention_velocity` but always saw empty data.

**Fix:** After the cascade loop in `pollNews.ts`, aggregate `allSignals` by `(code, floorToHour(detectedAt))` into hourly buckets, then call `recordMention()` once per bucket. `negativeCount` counts signals where severity is "high" or "critical". `sourceCount` counts distinct source-label prefixes.

**Implementation notes:**
- Dynamic import of `recordMention` keeps hot-path unchanged when no watchlist impacts occur
- Non-fatal try/catch — velocity tracking never aborts the poll cycle
- `floorToHour()`: `setUTCMinutes(0,0,0)` on ISO timestamp

- 6 tests GREEN (`1922e-mention-velocity-wiring.test.ts`)
- tsc 0 errors
- Note: files committed inside 1922a commit due to parallel agent working tree

---

### Task 1918c-hsx-bctc-env-gate — env gate for Strategy 0 (2026-05-15, DONE)

**Mission:** Add `HSX_BCTC_ENABLED` env var gate to `fetchHsxBctcUrls()`. When set to `"false"`, function returns `[]` immediately (no HTTP calls), falling through to VPS Strategy 1.

**Implementation:** One-liner guard at top of function body. TC-ENV added to BCTC-3b test file. `.env.example` updated. Spike Re-Assessment note added.

- tsc 0 errors
- 9/9 BCTC-3b tests GREEN
- Commit `652ff489`

---

### Task 1910b-effr-package-reg — EFFR package registration (2026-05-15, DONE)

**Mission:** Add `get_fed_liquidity_spread` to financial_analyst, news_scout, unified_coordinator arrays in agentBootstrap.ts + 3 package docs + SKILL_MANIFEST.md.

**Outcome:** All 5 files already correct — work completed by agent-md-editor at c96 2026-05-14 (commit `e7fd1718`). TASKS.md Todo row removed; Review row added. Handoff [Developer] section written. No code changes required.

- tsc 0 errors confirmed
- 9430 tests / 848 files — exit code 0 (both runs)

---

### TASK-BCTC-3c — hsx.vn Strategy 0 E2E integration (2026-05-15, DONE)

**Mission:** Integration/E2E verification — confirm Strategy 0 (hsx.vn) is wired and returns URLs through `discoverHosePdfUrls`. Write integration test.

**Live probe results:**
- VNM: 11 URLs (staticfile.hsx.vn), source="hsx". HTTP 200 + application/pdf confirmed.
- HPG: 12 URLs (staticfile.hsx.vn), source="hsx".
- VEA: 0 URLs — UPCOM ticker, genuinely absent from hsx.vn. Correct behavior.
- ACB: 12 URLs — HNX ticker BUT hsx.vn also indexes HNX/UPCOM-cross-listed tickers. Not purely HOSE-only.

**Key finding:** hsx.vn indexes more than HOSE. ACB (HNX) returns 12 URLs. VEA (UPCOM) returns 0. The empty-list path is correct — VEA requires VPS fallback.

**Files created:**
- `apps/mcp-server/src/__tests__/BCTC-3c-integration.test.ts` — 7 tests, 25 assertions

**Results:** 7/7 GREEN. tsc 0 errors. 46/46 BCTC subset GREEN. Commit `859f4a62`.

---

### Task 1910a — ISM Manufacturing PMI sub-component tool (2026-05-15, DONE)

**Mission:** Add FRED ISM Manufacturing PMI sub-component fetcher + domain regime signal + MCP tool `get_ism_subcomponents` (#133).

**Results:** 35/35 new tests GREEN. tsc 0 errors. Full suite passes (verified via chunk runs — Bun OOM on full suite is pre-existing infra issue unrelated to this task).

**Files created:**
- `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts` — FRED REST fetcher NAPMNO/NAPMEMP/NAPMPI/NAPMBI with retry + INSERT OR IGNORE
- `apps/mcp-server/src/domain/services/macro/ismRegimeSignal.ts` — pure regime classifier: EXPANDING/CONTRACTING/MIXED
- `apps/mcp-server/src/interface/mcp/tools/macro/getIsmSubcomponentsTool.ts` — MCP tool #133

**Key patterns:**
- `parseFredIsmJson()` exported for testability — mirrors parseFredCsvAllRows in fredEffrIorb pattern
- `buildFredIsmUrl()` exported for testability
- FRED REST JSON endpoint (not CSV) — required because ISM series needs API key
- `sort_order=desc&limit=3` fetches latest 3 to handle FRED publication lag
- T5 in fetcher tests: Bun.env and process.env both patched for API key override

---

### TASK-BCTC-3b — hsx.vn mediafiles Strategy 0 (2026-05-15, DONE)

**Mission:** Add hsx.vn BCTC discovery as Strategy 0 in `bctcDiscovery.ts`. Two-call HTTP recipe: ticker→numericId via `/l/api/v1/1/securities/stock`, then BCTC PDFs via `/m/api/v1/1/mediafiles/5/{id}`. No VPS, no Playwright, no session.

**Implementation notes:**
- `fetchHsxBctcUrls` uses two separate `AbortController` instances (one per HTTP call). Each call has its own `clearTimeout` in `finally`.
- `exactOptionalPropertyTypes: true` in tsconfig prevents `_fetchHsx: undefined` in test objects. Used `_fetchHsx: async () => []` pattern instead in all 8 affected test files.
- Live hsx.vn works from France for real HOSE tickers (VNM, VCB, HPG, FPT, etc.) — existing enricher tests needed the no-op mock to avoid live interception.
- Strategy ordering: hsx(0) → VPS Playwright(1) → SSC(2) → vietstock(3).
- `...opts.discoverOptions` spread in enricher job stays last — test callers can still override any field including `_fetchHsx`.

**Files created:**
- `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts`
- `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts` (8 tests)

**Files modified:**
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — Strategy 0 + `_fetchHsx` + `"hsx"` union
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — wired `fetchHsxBctcUrls`
- 8 test files — added `_fetchHsx: async () => []` to discoverOptions

**Results:** 8/8 new tests GREEN. 9318 pass / 32 fail full suite (32 pre-existing). tsc 0 errors. Commit `9c4bc9d5`.

---

### Task 1914 — news-scout dedup API fix (2026-05-15, DONE)

**Mission:** Add `fromAgent` filter to `getSignals()` so news-scout can query its own prior posts for inter-cycle dedup.

**Root cause:** `getSignals()` filtered on `to_agent` only. News-scout posts to `"alert-commander"`, not itself, so its prior signals were invisible when calling `get_agent_signals(agent="news-scout")`.

**Implementation divergence:** Handoff spec said to add `from_agent` as an additional AND clause while keeping `to_agent` filter. This would have still blocked rows where `to_agent != "news-scout"`. Instead, when `fromAgent` is set, the WHERE clause switches exclusively to `s.from_agent = ?` (ignores `to_agent` axis entirely). The `agent` param is still accepted for API symmetry.

**Files modified:**
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — `GetSignalsOptions.fromAgent` added; WHERE clause switches mode; read-mark guard updated
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — `from_agent` Zod param added and forwarded
- `apps/mcp-server/src/__tests__/242-agent-signals.test.ts` — 3 new tests AC-6a/b/c
- `.claude/flows/news-scout/stage-signals.md` — dedup gate call updated with `from_agent` + `status="all"`

**Results:** 14/14 GREEN (242 suite). 9305 pass / 37 fail full suite (37 pre-existing). tsc 0 errors.

---

### Task 1916b-fix-cafef-strategy-replacement (2026-05-14, DONE)

**Mission:** Remove dead cafef.vn Strategy 2 from `bctcDiscovery.ts`. Investigate 3 replacement candidates; all dead from France. Clean removal with backward-compat `_fetchCafef` no-op.

**Investigation results (2026-05-14):**
- s.cafef.vn/Candles/FinanceInfo.ashx → 301 → 302 → /404.aspx. Dead.
- cafef.vn/tai-lieu-tai-chinh/<ticker>/bctc → 302 captcha. Dead.
- VNDirect API (api.vndirect.com.vn / api2.vndirect.com.vn) → NXDOMAIN from France. Dead.
- SSC via VPS → already Strategy 0 (1916a). Not needed.
- Decision: remove Strategy 2 entirely.

**Files modified:**
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — extractCafefUrls/tryFetchCafef/CAFEF_API_BASE/CAFEF_BASE/PDF_HREF_RE removed; strategy 2 block removed; vietstock promoted to strategy 2; _fetchCafef kept as deprecated no-op

**Files updated (tests):**
- `apps/mcp-server/src/__tests__/1343b-hose-pdf-discovery-red.test.ts` — Test 2 updated
- `apps/mcp-server/src/__tests__/FIX-bctc-url-enrichment.test.ts` — cafef success tests updated
- `apps/mcp-server/src/__tests__/FIX-bctc-ssc-vps-proxy.test.ts` — cafef fallback test updated

**Files created:**
- `apps/mcp-server/src/__tests__/1916b-cafef-strategy-replacement.test.ts` — 12 tests GREEN

**Results:** 23/23 targeted GREEN, 76/76 bctc-subset GREEN. tsc 0 errors. Commit `311c8b95`.

**Key patterns:**
- `_fetchCafef` kept in DiscoverOptions as `@deprecated` for backward-compat (no-op, never called)
- "cafef" kept in `source` union type for backward-compat with existing DB rows
- vietstock is now strategy 2 (was strategy 3)
- Branch: task/1916b-fix-cafef-strategy-replacement (active, not merged)

---

### Task 1916a-mcp-part -- bctcHttpFetcher X-API-Key injection (2026-05-14, DONE)

**Mission:** SPIKE 1916 fix (mcp-server zone): inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` header in `bctcHttpFetcher.ts` for all requests targeting the VPS host. Strategy 0 (/proxy/bctc-discover/:ticker) was returning HTTP 401 because no auth header was sent.

**Files modified:**
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` -- added `getVpsHost()` + `isVpsUrl()` helpers; conditional X-API-Key injection in request headers.
- `docker-compose.yml` -- added `VPS_PUSH_API_KEY` comment/placeholder in mcp-server env section.
- `docs/TASKS.md` -- 1916a-fix row updated to [REVIEW].

**Files created:**
- `apps/mcp-server/src/__tests__/1916a-bctc-http-fetcher-api-key.test.ts` -- 6 tests: AC-1 (VPS IP detected), AC-2 (VPS_HOST env), AC-3 (non-VPS no header), AC-4 (absent key = no header), AC-5 (401 still throws), AC-6 (User-Agent + Accept preserved).

**Results:** 6/6 GREEN. tsc 0 errors. 9286 pass / 39 fail (all pre-existing). Commit `8f9c2d55` on branch `task/1916a-vps-discover-route`.

**Implementation patterns:**
- `isVpsUrl()` uses `new URL(url).hostname` for robust host matching (not string.includes which could false-positive on path segments).
- VPS_HOST env var read at call time (not module load) -- consistent with `getBctcDiscoverUrl()` pattern in domain layer.
- `typeof Bun !== "undefined"` guard on all Bun.env reads -- defensive for test environments.
- X-API-Key only injected when `VPS_PUSH_API_KEY` is non-empty (graceful degradation -- no empty-string header pollution).
- tsc issue: `globalThis.fetch` has `preconnect` property in TypeScript type. Resolved in test via `Object.assign(fn, { preconnect: () => {} })` cast pattern.

**VPS sibling status:** VPS route `GET /proxy/bctc-discover/:ticker` deployed and live (dev-vps-crawls agent). VCB returns `[]` (Python script SSC-NS selector doesn't find HOSE tickers -- script-level limitation, route is correct). Both parts on branch `task/1916a-vps-discover-route`.

**Next:** QA to gate both parts. After merge + restart, trigger `bctcQueueEnricherJob` manually to verify >=10/14 tickers get `source_url` populated.

---

### SPIKE 1916 -- bctcQueueEnricher 0 URLs (2026-05-14, DONE)

**Root cause CONFIRMED:** ALL 4 strategies dead simultaneously.
- Strategy 0: no VPS route + no X-API-Key header → 401.
- Strategy 1: iboard-query.ssc.vn NXDOMAIN → VPS 502.
- Strategy 2: cafef FinanceInfo.ashx 301 redirect loses params → 0 PDFs.
- Strategy 3: vietstock HTTP 404 → throws → [].

**Findings doc:** docs/spikes/SPIKE_1916-bctc-queue-enricher-scraper-broken.md

---

### SPIKE 1915 -- bctc-pipeline-silence (2026-05-14, DONE)

**Confirmed root cause: Candidate 3 -- Empty queue / upstream broken.**
- bctcQueueEnricher returns 0 URLs → no PDFs → bctcReparseJob no-ops.
- 2 on-disk PDFs (VEA+VNM) not extracted because scanDiskForStrandedPdfs queries empty watchlist.

**No code changes made.** Report: `docs/spikes/SPIKE_1915-bctc-pipeline-silence.md`.

---

### Task 1909b -- get_bctc_ocf MCP tool (#132) (2026-05-14, DONE)

8/8 tests GREEN. tsc 0 errors. Commit `0c0e85f8` on branch `task/1909b-get-bctc-ocf-tool`.

---

### Task 1881a-impl-mcp -- source_tier retrofit 16 tool handlers (2026-05-14, DONE)

20/20 contract tests pass. tsc 0 errors. 9234/9268 suite pass. Commit `6dd412bd`.

---

### Task 1899a-cron -- newsHeadlinesRefresh scheduler wiring (2026-05-13, DONE)

TSC 0 errors. 9210 pass. Commit `40514118`.
