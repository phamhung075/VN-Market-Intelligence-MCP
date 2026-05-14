## Task Report 1916b
date: 2026-05-14
outcome: REMOVED (AC-1b)

### Investigation Results

All 3 replacement candidates confirmed dead from France (2026-05-14):

| Candidate | Endpoint | Result |
|-----------|----------|--------|
| (a) cafef HTML static route | cafef.vn/tai-lieu-tai-chinh/\<ticker\>/bctc | HTTP 302 → captcha/rate-limit (c.cafef.vn/sorry) |
| (b) VNDirect document API | api.vndirect.com.vn / api2.vndirect.com.vn | NXDOMAIN (DNS does not resolve from France) |
| (c) SSC via VPS | congbothongtin.ssc.gov.vn scraping via VPS | Already covered by Strategy 0 (1916a) |

Original endpoint: s.cafef.vn/Candles/FinanceInfo.ashx → HTTP 301 → cafef.vn/du-lieu/candles/financeinfo.ashx → HTTP 302 → /404.aspx. Query params lost at first redirect.

Decision: remove Strategy 2 entirely. Strategy 0 (VPS Playwright, 1916a) is the robust primary source.

### Changes Made

- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — Strategy 2 removed; `extractCafefUrls`, `tryFetchCafef`, `CAFEF_API_BASE`, `CAFEF_BASE`, `PDF_HREF_RE` deleted; `_fetchCafef` kept as deprecated no-op in DiscoverOptions for backward compat; docblock updated; vietstock promoted to strategy 2
- `apps/mcp-server/src/__tests__/1916b-cafef-strategy-replacement.test.ts` — new, 12 tests (AC-1a/b verification for DPM/VCB/HPG, cafef never-called spy, all-fail contract, regression chain)
- `apps/mcp-server/src/__tests__/1343b-hose-pdf-discovery-red.test.ts` — Test 2 updated (cafef removal)
- `apps/mcp-server/src/__tests__/FIX-bctc-url-enrichment.test.ts` — cafef success tests updated to verify no-op behavior
- `apps/mcp-server/src/__tests__/FIX-bctc-ssc-vps-proxy.test.ts` — "falls back to cafef" test updated to assert 0 URLs

### Test Results

targeted: 23 pass / 0 fail (1916b + 1343b + FIX-bctc-url-enrichment)
bctc regression subset: 76 pass / 0 fail (9 test files)
tsc: 0 errors

### Regression Check (AC-2)

bctcQueueEnricherJob strategy chain: Strategy 0 (VPS) → Strategy 1 (SSC) → Strategy 2 (vietstock). Cafef was Strategy 2 but returned 0 URLs in all observed runs (dead endpoint). Removing it does not change the 0-URL rate — strategy 0 is the active source post-1916a. No regression possible from removing a perpetually-empty strategy.

### AC Status

- [x] AC-1b: Strategy 2 cleanly deleted with inline comment referencing TASK_1916b + SPIKE_1916
- [x] AC-2: 0-URL rate unchanged (cafef was already 0 URLs in all runs)
- [x] AC-3: All test paths valid; stale cafef-success tests updated; new 1916b test file with 12 passing tests

### Commit

`311c8b95` — fix(bctc): remove dead cafef.vn Strategy 2 from BCTC discovery
Branch: task/1916b-fix-cafef-strategy-replacement
