# dev-mainserver-crawls — Notebook

**Last updated:** 2026-05-17T19:10Z | **Sprint:** news-bugs (c81)

> Archive: docs/archive/notebooks/dev-mainserver-crawls-2026-05-21.md (pre-trim history)

---

## This session (cycle 9 — c81 2026-05-17T19:10Z)

Task: Fix Bloomberg `articles: []` — stale `[data-component="headline"]` selector.

**Root cause confirmed:**
- Bloomberg's PerimeterX blocks Playwright DOM extraction: `[data-component="headline"]` returns 0 elements every time.
- `__NEXT_DATA__` fallback also yields nothing (PerimeterX challenge prevents full page load).
- Direct `WebFetch` to bloomberg.com returns HTTP 403.
- This is a fundamental anti-bot block — no DOM selector fix is viable.

**Fix applied (2026-05-17):**
- Same pattern as Reuters (c80): replace Playwright primary with Google News RSS.
- RSS URL: `https://news.google.com/rss/search?q=bloomberg+markets+finance&ceid=US:en&hl=en-US&gl=US`
- Verified live: RSS returns ~100 articles from bloomberg.com, no anti-bot blocking.
- `BloombergStealth` demoted to FALLBACK (invoked if RSS returns error or 0 items).

**Implemented:**
- `apps/news-fetch/src/infrastructure/scrapers/bloomberg-rss.ts` — new `BloombergRssScraper` class implementing `BloombergNewsPort` via Google News RSS. Same XML parse pattern as reuters-rss.ts. source=BLOOMBERG, method=rss, confidence=HIGH. ~175L.
- `apps/news-fetch/src/interface/handlers.ts` — Bloomberg route updated from single-path to RSS primary + stealth fallback (same pattern as Reuters). `createRouter` now takes 4 ports (rss, fallback, bloombergRss, bloombergStealth).
- `apps/news-fetch/src/index.ts` — composition root updated: imports `BloombergRssScraper`, wires 4-arg `createRouter`.
- `apps/news-fetch/src/domain/repositories.ts` — `BloombergNewsPort` comment updated to document RSS primary + stealth fallback.
- `docs/mainserver-crawl-techniques/playwright-stealth.md` — updated with Bloomberg selector stale finding, Google News RSS URLs for both Reuters and Bloomberg, known limits updated.
- `apps/news-fetch/__tests__/bloomberg-rss.test.ts` — 29 new tests: happy path, maxItems, missing link, bad date, HTTP errors (5 status codes), network throws, empty feed, RSS URL regression guards (not bloomberg.com, uses news.google.com, contains bloomberg), normalizeRfcDate.
- `apps/news-fetch/__tests__/1899a-routes-bloomberg.test.ts` — updated: 4-arg createRouter, new RSS success + fallback tests (RSS error → stealth invoked, RSS empty → stealth invoked, stealth-also-fails path).
- `apps/news-fetch/__tests__/1899a-routes-health-reuters.test.ts` — updated: 4-arg createRouter throughout.
- Full test suite: 209 pass, 0 fail (was 180 — +29 new tests). tsc: 0 errors.
- Docker rebuilt and redeployed: `docker compose build news-fetch && docker compose up -d news-fetch`.
- Live verified: `GET /bloomberg/headlines?maxItems=5` → `{source:"bloomberg", method:"rss", error:null, articles:[5 articles]}`.

**RAM note:** BloombergStealth (~400-500MB) now only invoked as fallback, not on every request. Normal operation runs at ~30-50MB (RSS). RAM pressure on news-fetch container significantly reduced.

---

## This session (cycle 8 — c80 2026-05-17T16:55Z)

Task: Fix Bug 1 (Reuters 0 headlines silent) + Bug 2 (Bloomberg 502).

**Root causes confirmed:**

**Bug 1 — Reuters 0 headlines:**
- `feeds.reuters.com` DNS does not resolve (Reuters decommissioned RSS in 2020)
- Primary RSS path always fails with "Unable to connect"
- Stealth fallback runs every time but DataDome blocks → returns `datadome-block`
- No visible logging — failure was completely silent
- Fix: replaced `REUTERS_RSS_URL` with Google News RSS (`reuters+business+news` query). Verified live: 100 items returned, 15 parsed. Gateway path `GET /news/reuters/headlines` confirmed: `error: null, articles: 15`.

**Bug 2 — Bloomberg 502:**
- Bun's default `idleTimeout` = 10 seconds
- Playwright navigation to `bloomberg.com` uses `PAGE_TIMEOUT_MS = 30_000` ms
- Server closes TCP connection at 10s, Playwright hasn't returned yet → empty reply → gateway returns 502
- Fix: `idleTimeout: 0` in `apps/news-fetch/src/index.ts` default export. Confirmed: gateway now returns `{"source":"bloomberg","articles":[],"error":null}` (proper JSON, no 502).

**Note on Bloomberg articles: []:**
After the 502 fix, Bloomberg returns valid JSON with `error: null, articles: []`. This means Playwright navigates successfully but `[data-component="headline"]` selector finds no elements (Bloomberg markup may have changed or paywall blocks DOM). This is a separate scraper-tuning issue, NOT the reported 502 bug. The 502 is fixed.

**Implemented:**
- `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts` — `REUTERS_RSS_URL` changed from dead `feeds.reuters.com/reuters/businessNews` to `news.google.com/rss/search?q=reuters+business+news&ceid=US:en&hl=en-US&gl=US`
- `apps/news-fetch/src/interface/handlers.ts` — added 3 `console.warn` log points: (1) RSS primary error before fallback, (2) RSS 0 articles before fallback, (3) fallback also returned 0 articles
- `apps/news-fetch/src/index.ts` — added `idleTimeout: 0` to Bun server default export
- `apps/news-fetch/__tests__/fix-reuters-url-bloomberg-timeout.test.ts` — 8 regression tests: URL is not feeds.reuters.com, URL is Google News, URL contains reuters in query, 3 log-message guards, idleTimeout=0 guard, no positive idleTimeout
- Docker image rebuilt and redeployed: `docker compose build news-fetch && docker compose up -d news-fetch`
- Full test suite: 180 pass, 0 fail (was 172 — +8 new tests)
- Live verified: Reuters → 15 articles, error: null. Bloomberg → JSON 200, no 502.

---

## This session (cycle 7 — c79 2026-05-13T19:00Z)

Task: 1899a-routes — Hono router + 5 routes + Reuters fallback wiring.

**Implemented:**
- `apps/news-fetch/src/interface/handlers.ts` — createRouter(rssPort, fallbackPort, bloombergPort) DI factory. 5 routes: GET /health ({status,service,port}), POST+GET /news/reuters/headlines (RSS primary → Playwright fallback on error/empty), POST+GET /news/bloomberg/headlines (single path, no fallback). Shared fetchReuters/fetchBloomberg inner helpers for DRY GET+POST. Error handling: try/catch all routes → 500 {error, fetchedAt}. 142L.
- `apps/news-fetch/src/index.ts` — Rewired composition root: imports createRouter + ReutersRssScraper + ReutersStealthFallback + BloombergStealth, wires real ports. No more inline health route (owned by handlers.ts). 35L.
- `apps/news-fetch/__tests__/1899a-routes-health-reuters.test.ts` — 18 tests: GET /health shape, reuters success (fallback NOT invoked), reuters fallback error path, reuters fallback empty path, scraper-throws → 500. 199L.
- `apps/news-fetch/__tests__/1899a-routes-bloomberg.test.ts` — 17 tests: bloomberg success/defaults/error-as-is/throws→500, GET aliases for both sources (querystring maxItems + defaults). 197L.
- `apps/news-fetch/__tests__/1899a-core-smoke.test.ts` — Updated health assertion: `version` field removed (was skeleton), `port: 5008` added per AC.
- 35 new tests. 137/137 full suite pass (baseline was 112 — +25 net new; smoke test update accounts for diff). tsc: 0 errors.
- Branch: task/1899a-routes-handlers. Commit: 2c0b9f45.
- DDD: PASS — handlers.ts imports only application/ (use-cases) + domain/ (repositories, models). index.ts is composition root (allowed to import infrastructure).
- Split policy: both test files ≤200L (199L + 197L).

**Pattern note:** Used createRouter() factory (same pattern as macro-indicators) instead of module-level app singleton — enables unit testing with injected mocks without touching global constructors or PlaywrightBrowserFactory.

**Smoke test update rationale:** 1899a-core-smoke imported `app` from index.ts; when index.ts was rewired to use createRouter with real scrapers, the old `version` field disappeared (health is now owned by handlers.ts per AC which specifies `port:5008`). Updated assertion is correct per spec.

---

## This session (cycle 6 — c78 2026-05-13T17:30Z)

Task: 1899a-reuters-fallback — ReutersStealthFallback scraper.

**Implemented:**
- `apps/news-fetch/src/infrastructure/scrapers/reuters-stealth.ts` — ReutersStealthFallback class implementing ReutersNewsPort. FALLBACK path only (invoked when reuters-rss returns error or 0 articles). DataDome detection: captcha-delivery.com in body + x-dd-b: 3 header. Human simulation (pre-nav pause 500–1500ms, scroll 33% + 50%). browser.close() in finally. 133L.
- `apps/news-fetch/__tests__/1899a-reuters-fallback-dom.test.ts` — 11 tests: DOM extraction, headline/url/publishedAt/confidence=LOW, maxItems, empty page. 197L.
- `apps/news-fetch/__tests__/1899a-reuters-fallback-detect.test.ts` — 11 tests: captcha-delivery.com body, x-dd-b:3 header, non-block header, timeout, network error. 158L.
- `apps/news-fetch/__tests__/1899a-reuters-fallback-lifecycle.test.ts` — 6 tests: browser.close() all paths. + 7 normalizeDate tests. 119L.
- 28/28 new tests pass. 112/112 full suite pass. tsc: 0 new errors (2 pre-existing in factory.ts + factory.test.ts, not mine).
- Branch: task/1899a-reuters-fallback. Commit: 50d587cd.
- DDD: PASS — imports only domain/* and ./playwright-browser-factory.
- RAM: ~400–500MB per scrape. Same constraint as Bloomberg. news-fetch must serialize Reuters+Bloomberg dispatches.

---

## Carry-over

- **FRED_API_KEY needed (ops):** fred-macro adapter wired and conditional. Activates automatically when key added to .env. Free key: https://fred.stlouisfed.org/docs/api/api_key.html
- **Container rebuild needed (macro-indicators):** FlareSolverr Python helpers require macro-indicators container rebuild to take effect. Rebuild = ops territory.
- **ADB KIDB slow API:** Response time ~15-20s per indicator. Batch of 4 indicators takes ~60-80s. Do NOT call fetchVnMacroBatch() in time-sensitive contexts. Consider caching or async background refresh.
- **news-fetch microservice pending ops:** Routes wired (c79). Still needs: 1899a-gateway (Tier 4) + ops docker-compose provisioning (>=2GB RAM). news-fetch container flag remains open.
- **CNBC timeout budget:** fetchBatch now uses Python subprocess with 30s timeout. The use-case wraps in 8s withTimeout — this will still timeout at 8s for the TS layer. Ops/dev need to increase the cnbc timeout budget in FetchExternalMacroUseCase to 35s after container rebuild.
- **FlareSolverr cf_clearance cache is in-process:** If macro-indicators runs multiple workers, each has its own cache. For multi-worker: externalise to Redis. Single-worker (current): no action needed.

Zone health: 1899a-routes WIRED — 137 tests pass, tsc 0 errors, DI factory enables full mock coverage; 5 routes complete; awaiting 1899a-gateway + ops container to go live | HEALTHY
