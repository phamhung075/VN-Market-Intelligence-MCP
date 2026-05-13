# dev-mainserver-crawls — Notebook

**Last updated:** 2026-05-13T14:09Z | **Sprint:** investing-calendar-flaresolverr-adapter

---

## This session (cycle 4)

FlareSolverr adapter for investing-economic-calendar. Ops provisioned FlareSolverr v3.4.6 at http://flaresolverr:8191 (compose DNS). Smoke confirmed: 1.53MB HTML, 5s cold solve, cf_clearance obtained.

**Root cause (recap):** CF Turnstile v2 JS challenge — curl_cffi chrome124/136 both return HTTP 403 on warmup. No JS execution = no cf_clearance = blocked.

**Implemented:**
- `flaresolverr_helper.py` — typed FlareSolverr client: JSON-RPC POST, envelope parse, FlareSolverrError, cf_clearance in-process cache (TTL 25min), fast-path (curl_cffi + cached cookie) + FlareSolverr fallback on 403/miss
- `investing_calendar_fetch.py` — rewired: FlareSolverr warmup (step 1) → curl_cffi POST to calendar API with captured cookies (step 2) → BS4 parse (step 3)
- `investing-economic-calendar.ts` — doc update only; timeout 30s unchanged; interface unchanged
- `docs/mainserver-crawl-techniques/flaresolverr-bypass.md` — new technique doc with RAM breakdown
- 10 new unit tests in `flaresolverr-helper.test.ts` (happy path, status=error, 403 fallback, timeout, domain shape)
- 103 pass, 0 fail (full suite)
- Branch: task/investing-calendar-flaresolverr-adapter — pushed

**RAM:** helper process ~10MB; FlareSolverr container ~96MB (ops-managed, shared); macro-indicators container RAM unchanged (~70MB total).

**Signals:**
- docs/signals/dev-mainserver-crawls-2026-05-13T14-09-54Z.json → qa

---

## This session (cycle 3)

QA reported 4 scrapers returning no data from container egress. Mission: upgrade to curl_cffi.

**Root causes diagnosed (not what QA expected):**
- yahoo-finance: NOT a bot-block. Bun fetch works. Issue: 12 sequential fetches × 1-2s jitter = 12-24s > 8s timeout budget.
- trading-economics: NOT a bot-block (Bun fetch returns HTML). Two bugs: (1) sequential 7-fetch timeout, (2) @graph JSON-LD structure missed by TS regex — always returned null.
- cnbc: NOT a bot-block. Two bugs: (1) sequential 6-fetch timeout, (2) stale symbols — SP500/DJ30/NASDAQ return code=1 no data; dotted symbols .SPX/.DJI/.IXIC return code=0 with price.
- investing-calendar: CF Turnstile v2 JS challenge escalation. All curl_cffi variants blocked. Needs FlareSolverr.

**Implemented:**
- yahoo_finance_fetch.py: curl_cffi chrome136, ThreadPoolExecutor parallel, ~15MB, 11/11 symbols ok
- trading_economics_fetch.py: curl_cffi chrome136, parallel, @graph JSON-LD unwrapping, 7/7 indicators ok
- cnbc_markets_fetch.py: curl_cffi chrome136, parallel, dotted symbols, 6/6 ok with price+change
- investing_calendar_fetch.py: docstring updated with CF Turnstile v2 diagnosis, graceful error
- domain/defaults.ts: DEFAULT_CNBC_SYMBOLS updated to dotted symbols (.SPX/.DJI/...)
- 3 TS adapters rewritten to spawn Python subprocess (interface unchanged)
- Unit tests: 87 pass, 0 fail (spawn mocked, no real network calls)

**Signals:**
- docs/signals/dev-mainserver-crawls-investing-blocked-2026-05-13T12-15-00Z.json → ops
- docs/signals/dev-mainserver-crawls-2026-05-13T12-20-00Z.json → qa

---

## This session (cycle 2)

Wired 2 international institutional macro scrapers into `apps/macro-indicators/` (post-RAM resize to 1.5GB).

**adb-kidb:**
- Phase 1 discovery: Playwright + JS bundle static analysis revealed SDMX v4 API at `kidb.adb.org/api/v4/sdmx/data/ADB,{DATAFLOW}/A.{INDICATOR}.VIE`
- No headless needed in Phase 2 — direct fetch, ~15MB
- Discovery script: `apps/macro-indicators/scripts/discover-adb-xhr.py`
- XHR contract: `docs/mainserver-sources/adb-kidb/xhr-contract.md`
- Key finding: ADB KIDB uses `VIE` not `VNM` for Vietnam

**imf-weo:**
- Switched from `www.imf.org` DataMapper (Akamai-blocked on main server) to `api.imf.org` SDMX 3.0
- No auth, no bot protection, 5MB, returns historical (1980) + WEO forecasts (through 2031)
- Old recon superseded: `docs/mainserver-sources/imf-datamapper/recon.md`
- New recon: `docs/mainserver-sources/imf-weo-api/recon.md`

New use-case: `FetchInternationalMacroUseCase` (split from FetchExternalMacroUseCase per 120-line policy).
New routes: POST /macro/external/adb, POST /macro/external/imf, POST /macro/external/international
67 unit tests pass. Live integration confirmed (both sources return real VN data).

---

## Active Scrapers

| Source | Microservice | Technique | RAM cost | Status | Last verified |
|--------|-------------|-----------|---------|--------|--------------|
| yahoo-finance-fx-indices | apps/macro-indicators/ | curl_cffi-chrome136-subprocess | ~15MB | upgraded | 2026-05-13 live 11/11 ok |
| world-bank-macro | apps/macro-indicators/ | header-rotation | ~5MB | wired | unit tests pass |
| cnbc-world-markets | apps/macro-indicators/ | curl_cffi-chrome136-subprocess + symbol fix | ~15MB | upgraded | 2026-05-13 live 6/6 ok |
| trading-economics-vn | apps/macro-indicators/ | curl_cffi-chrome136-subprocess + @graph fix | ~15MB | upgraded | 2026-05-13 live 7/7 ok |
| fred-macro | apps/macro-indicators/ | open-api-key | ~5MB | wired-inactive (key missing) | key-absent guard verified |
| investing-economic-calendar | apps/macro-indicators/ | flaresolverr-bypass | ~10MB (+96MB container) | wired | 2026-05-13 103 tests green |
| adb-kidb | apps/macro-indicators/ | spa-xhr-intercept Phase 2 | ~15MB | wired | live confirmed 2026-05-13 |
| imf-weo | apps/macro-indicators/ | open-api-key | ~5MB | wired | live confirmed 2026-05-13 |

---

## Container Memory Tracker

| Container | Headless scrapers | Total RAM committed | Budget limit | Flags to ops |
|-----------|------------------|-------------------|-------------|-------------|
| macro-indicators | none | ~70MB (8 scrapers + TS base) | 1536MB (post-resize) | none — budget OK |
| flaresolverr | Chromium (internal) | ~96MB observed | 512MB limit | none — 18.81% of budget |
| news-fetch (TBD) | bloomberg (Playwright ~450MB) + reuters (Playwright ~450MB) | ~900MB if concurrent | NOT YET CREATED | FLAG REMAINS: news-fetch container must be provisioned at >=2GB |

---

## Technique Registry

| Technique | Doc | First used for | RAM est. | Notes |
|-----------|-----|---------------|---------|-------|
| header-rotation | `docs/mainserver-crawl-techniques/header-rotation.md` | trading-economics-vn, world-bank-macro | ~5MB | Effective for all 4 header-rotation sources |
| open-api-key | `docs/mainserver-crawl-techniques/open-api-key.md` | fred-macro, imf-weo | ~5MB | No key needed for IMF WEO; FRED key pending |
| cloudflare-managed-bypass | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` | (superseded for investing.com) | ~25MB | curl_cffi; blocked by Turnstile v2 — escalated |
| flaresolverr-bypass | `docs/mainserver-crawl-techniques/flaresolverr-bypass.md` | investing-economic-calendar | ~10MB helper + 96MB container | FlareSolverr v3.4.6; cf_clearance cached TTL 25min |
| spa-xhr-intercept | `docs/mainserver-crawl-techniques/spa-xhr-intercept.md` | adb-kidb | ~400MB (Phase 1) / ~15MB (Phase 2) | Phase 1 complete; Phase 2 production adapter wired |
| playwright-stealth | `docs/mainserver-crawl-techniques/playwright-stealth.md` | bloomberg-markets, reuters-asia-news | ~350-500MB | BLOCKED — news-fetch service not yet created |
| botasaurus-human-sim | `docs/mainserver-crawl-techniques/botasaurus-human-sim.md` | (was imf-datamapper) | ~400-500MB | SUPERSEDED by imf-weo open-api approach |

---

## Implementation History

| Date | Source | Microservice | Technique | RAM | Outcome |
|------|--------|-------------|-----------|-----|---------|
| 2026-05-13 | bootstrap (11 sources) | — | technique catalog only | — | docs written, scrapers not yet wired |
| 2026-05-13 | world-bank-macro | apps/macro-indicators/ | header-rotation | ~5MB | wired, 40 unit tests pass |
| 2026-05-13 | yahoo-finance-fx-indices | apps/macro-indicators/ | header-rotation | ~5MB | wired, unit tests pass |
| 2026-05-13 | cnbc-world-markets | apps/macro-indicators/ | header-rotation | ~5MB | wired, unit tests pass |
| 2026-05-13 | trading-economics-vn | apps/macro-indicators/ | header-rotation | ~5MB | wired, unit tests pass |
| 2026-05-13 | fred-macro | apps/macro-indicators/ | open-api-key | ~5MB | wired-inactive, key-absent guard verified |
| 2026-05-13 | investing-economic-calendar | apps/macro-indicators/ | cloudflare-managed-bypass | ~25MB | wired (Python subprocess), unit tests pass — superseded |
| 2026-05-13 | investing-economic-calendar | apps/macro-indicators/ | flaresolverr-bypass | ~10MB (+96MB) | rewired; FlareSolverr adapter + cf_clearance cache; 103 tests green |
| 2026-05-13 | adb-kidb | apps/macro-indicators/ | spa-xhr-intercept Phase 2 | ~15MB | wired, Phase 1 discovery complete, live confirmed |
| 2026-05-13 | imf-weo | apps/macro-indicators/ | open-api-key | ~5MB | wired (api.imf.org SDMX 3.0), live confirmed |

---

## Carry-over

- **FRED_API_KEY needed (ops):** fred-macro adapter wired and conditional. Activates automatically when key added to .env. Free key: https://fred.stlouisfed.org/docs/api/api_key.html
- **Container rebuild needed (macro-indicators):** FlareSolverr Python helpers require macro-indicators container rebuild to take effect. Rebuild = ops territory.
- **ADB KIDB slow API:** Response time ~15-20s per indicator. Batch of 4 indicators takes ~60-80s. Do NOT call fetchVnMacroBatch() in time-sensitive contexts. Consider caching or async background refresh.
- **news-fetch microservice TBD:** Reuters + Bloomberg scrapers need a news-fetch service. See `docs/architecture-briefs/2026-05-13-news-fetch-service.md`. bloomberg + reuters remain blocked.
- **CNBC timeout budget:** fetchBatch now uses Python subprocess with 30s timeout. The use-case wraps in 8s withTimeout — this will still timeout at 8s for the TS layer. Ops/dev need to increase the cnbc timeout budget in FetchExternalMacroUseCase to 35s after container rebuild.
- **FlareSolverr cf_clearance cache is in-process:** If macro-indicators runs multiple workers, each has its own cache. For multi-worker: externalise to Redis. Single-worker (current): no action needed.
