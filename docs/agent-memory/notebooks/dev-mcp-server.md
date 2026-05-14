# dev-mcp-server — Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1916a-mcp-part — bctcHttpFetcher X-API-Key injection (2026-05-14, DONE)

**Mission:** SPIKE 1916 fix (mcp-server zone): inject `X-API-Key: ${Bun.env.VPS_PUSH_API_KEY}` header in `bctcHttpFetcher.ts` for all requests targeting the VPS host. Strategy 0 (/proxy/bctc-discover/:ticker) was returning HTTP 401 because no auth header was sent.

**Files modified:**
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — added `getVpsHost()` + `isVpsUrl()` helpers; conditional X-API-Key injection in request headers.
- `docker-compose.yml` — added `VPS_PUSH_API_KEY` comment/placeholder in mcp-server env section.
- `docs/TASKS.md` — 1916a-fix row updated to [REVIEW].

**Files created:**
- `apps/mcp-server/src/__tests__/1916a-bctc-http-fetcher-api-key.test.ts` — 6 tests: AC-1 (VPS IP detected), AC-2 (VPS_HOST env), AC-3 (non-VPS no header), AC-4 (absent key = no header), AC-5 (401 still throws), AC-6 (User-Agent + Accept preserved).

**Results:** 6/6 GREEN. tsc 0 errors. 9286 pass / 39 fail (all pre-existing). Commit `8f9c2d55` on branch `task/1916a-vps-discover-route`.

**Implementation patterns:**
- `isVpsUrl()` uses `new URL(url).hostname` for robust host matching (not string.includes which could false-positive on path segments).
- VPS_HOST env var read at call time (not module load) — consistent with `getBctcDiscoverUrl()` pattern in domain layer.
- `typeof Bun !== "undefined"` guard on all Bun.env reads — defensive for test environments.
- X-API-Key only injected when `VPS_PUSH_API_KEY` is non-empty (graceful degradation — no empty-string header pollution).
- tsc issue: `globalThis.fetch` has `preconnect` property in TypeScript type. Resolved in test via `Object.assign(fn, { preconnect: () => {} })` cast pattern.

**VPS sibling status:** VPS route `GET /proxy/bctc-discover/:ticker` deployed and live (dev-vps-crawls agent). VCB returns `[]` (Python script SSC-NS selector doesn't find HOSE tickers — script-level limitation, route is correct). Both parts on branch `task/1916a-vps-discover-route`.

**Next:** QA to gate both parts. After merge + restart, trigger `bctcQueueEnricherJob` manually to verify ≥10/14 tickers get `source_url` populated.

---

### SPIKE 1916 — bctcQueueEnricher 0 URLs (2026-05-14, DONE)

**Root cause CONFIRMED:** ALL 4 strategies dead simultaneously.
- Strategy 0 (VPS Playwright /proxy/bctc-discover): route never deployed on VPS. Also bctcHttpFetcher.ts sends no X-API-Key header → 401.
- Strategy 1 (SSC iboard): iboard-query.ssc.vn NXDOMAIN → VPS returns 502.
- Strategy 2 (cafef FinanceInfo.ashx): 301 redirect loses params → cafef.vn HTML page with 0 PDFs.
- Strategy 3 (vietstock): HTTP 404 → bctcHttpFetcher throws → [].

**Why "9 tickers work":** Those 9 tickers already have source_url from VPS-push (fetch-bctc.sh), not from the enricher. Enricher skips rows with non-null source_url.

**No Cheerio involved:** bctcDiscovery.ts uses JSON parsing + regex only. No Cheerio import.

**Fix required:** (A) Add /proxy/bctc-discover/:ticker route to vps-proxy-server.js + inject X-API-Key in bctcHttpFetcher.ts. (B) Replace cafef strategy with live endpoint.

**Findings doc:** docs/spikes/SPIKE_1916-bctc-queue-enricher-scraper-broken.md

---

### Task 1915-fix-part1 — scanDiskForStrandedPdfs empty-watchlist fallback (2026-05-14, DONE)

**Mission:** Fix `scanDiskForStrandedPdfs` returning 0 when watchlist is empty. Fix `startScheduler.ts` startup catch-up code smell (runBctcReparseJob direct call).

**Changes made:**
1. NEW `tickerFromFilename(filename)` exported helper in `bctcReparseJob.ts`:
   - Strategy 1: `^BCTC\s+([A-Z]{2,5})\b` prefix pattern — handles VEA, VNM standard filenames
   - Strategy 2: first standalone 2-5 uppercase word (excludes NOISE set: BCTC/VN/HOP/NHAT etc.)
   - Returns null when no ticker extractable
2. `scanDiskForStrandedPdfs()`: `watchlistEmpty = codes.length === 0` branch — empty path uses `tickerFromFilename()`, populated path unchanged
3. `startScheduler.ts` L238 catch-up: `runBctcReparseWithDb(db)` replaces `runBctcReparseJob()` — eliminates fire-and-forget recordJobRun no-op
4. `1416c-hpg-bctc-disk-scan.test.ts`: updated 1 test + added 1 test (5 total)

**Tests:** 8 new DSE-01..08 in `1915-scan-disk-empty-watchlist.test.ts`. 14/14 targeted GREEN. tsc 0.
**Commit:** `740615c2` on branch `task/1915-fix-part1-scan-disk-empty-watchlist`

**AC gate (runtime):** Container redeploy needed — ops action. After deploy, VEA+VNM Q4-2025 PDFs processed on next 09:30 GMT+7 cron or manual trigger. AC: financial_reports > 0, pdf_extracted_text > 0, bctcReparseJob log within last hour.

---

### SPIKE 1915 — bctc-pipeline-silence (2026-05-14, DONE)

**Confirmed root cause: Candidate 3 — Empty queue / upstream broken (two sub-causes)**

1. bctcQueueEnricher fails to find SSC source URLs for 14/30 tickers. ALL 4 strategies dead (confirmed in SPIKE 1916). bctcPdfPullJob gets 0 eligible rows → 0 PDFs downloaded → 0 feedback rows → bctcReparseJob no-ops.

2. 2 PDFs on disk (VEA + VNM Q4-2025) not extracted. `scanDiskForStrandedPdfs` queries watchlist — if empty at cron time, codes=[], every PDF skipped. Fixed in 1915-fix-part1.

**Eliminated:** Candidate 1 (unregistered) — boot log shows 60 cron keys. Candidate 2 (silent failure) — all error paths produce logger.warn/error.

**DB state:** financial_reports = 0 rows, pdf_extracted_text = 0 rows.
**Code smell:** startScheduler.ts L238 direct runBctcReparseJob() call — fixed in 1915-fix-part1.

---

### Task 1909b — get_bctc_ocf MCP tool (#132) (2026-05-14, DONE)

8/8 tests GREEN. tsc 0 errors. Commit `0c0e85f8` on branch `task/1909b-get-bctc-ocf-tool`.

---

### Task 1881a-impl-mcp — source_tier retrofit 16 tool handlers (2026-05-14, DONE)

20/20 contract tests pass. tsc 0 errors. 9234/9268 suite pass. Commit `6dd412bd`.

---

### Task 1899a-cron — newsHeadlinesRefresh scheduler wiring (2026-05-13, DONE)

TSC 0 errors. 9210 pass. Commit `40514118`.
