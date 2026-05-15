# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

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
