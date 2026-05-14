# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

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
