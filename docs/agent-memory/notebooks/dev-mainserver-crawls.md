# dev-mainserver-crawls — Notebook

**Last updated:** 2026-05-13T10:25Z | **Sprint:** external-macro-wiring

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
| yahoo-finance-fx-indices | apps/macro-indicators/ | plain fetch (v8 API) | ~5MB | deployed | pre-existing |
| world-bank-macro | apps/macro-indicators/ | header-rotation | ~5MB | wired | unit tests pass |
| yahoo-finance-fx-indices | apps/macro-indicators/ | header-rotation | ~5MB | wired | unit tests pass |
| cnbc-world-markets | apps/macro-indicators/ | header-rotation | ~5MB | wired | unit tests pass |
| trading-economics-vn | apps/macro-indicators/ | header-rotation | ~5MB | wired | unit tests pass |
| fred-macro | apps/macro-indicators/ | open-api-key | ~5MB | wired-inactive (key missing) | key-absent guard verified |
| investing-economic-calendar | apps/macro-indicators/ | cloudflare-managed-bypass | ~25MB | wired | unit tests pass |
| adb-kidb | apps/macro-indicators/ | spa-xhr-intercept Phase 2 | ~15MB | wired | live confirmed 2026-05-13 |
| imf-weo | apps/macro-indicators/ | open-api-key | ~5MB | wired | live confirmed 2026-05-13 |

---

## Container Memory Tracker

| Container | Headless scrapers | Total RAM committed | Budget limit | Flags to ops |
|-----------|------------------|-------------------|-------------|-------------|
| macro-indicators | none | ~70MB (8 scrapers + TS base) | 1536MB (post-resize) | none — budget OK |
| news-fetch (TBD) | bloomberg (Playwright ~450MB) + reuters (Playwright ~450MB) | ~900MB if concurrent | NOT YET CREATED | FLAG REMAINS: news-fetch container must be provisioned at >=2GB |

---

## Technique Registry

| Technique | Doc | First used for | RAM est. | Notes |
|-----------|-----|---------------|---------|-------|
| header-rotation | `docs/mainserver-crawl-techniques/header-rotation.md` | trading-economics-vn, world-bank-macro | ~5MB | Effective for all 4 header-rotation sources |
| open-api-key | `docs/mainserver-crawl-techniques/open-api-key.md` | fred-macro, imf-weo | ~5MB | No key needed for IMF WEO; FRED key pending |
| cloudflare-managed-bypass | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` | investing-economic-calendar | ~25MB | curl_cffi preferred; Python helper subprocess |
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
| 2026-05-13 | investing-economic-calendar | apps/macro-indicators/ | cloudflare-managed-bypass | ~25MB | wired (Python subprocess), unit tests pass |
| 2026-05-13 | adb-kidb | apps/macro-indicators/ | spa-xhr-intercept Phase 2 | ~15MB | wired, Phase 1 discovery complete, live confirmed |
| 2026-05-13 | imf-weo | apps/macro-indicators/ | open-api-key | ~5MB | wired (api.imf.org SDMX 3.0), live confirmed |

---

## Carry-over

- **FRED_API_KEY needed (ops):** fred-macro adapter wired and conditional. Activates automatically when key added to .env. Free key: https://fred.stlouisfed.org/docs/api/api_key.html
- **investing.com country_id=35 (Vietnam) unconfirmed:** First live run should omit country filter to capture all events, then filter by country name `"Vietnam"`. Document confirmed ID in recon.md.
- **Python deps needed in macro-indicators container:** `pip install curl_cffi beautifulsoup4 lxml` must be in Dockerfile for investing-economic-calendar adapter to function. Flag for ops.
- **ADB KIDB slow API:** Response time ~15-20s per indicator. Batch of 4 indicators takes ~60-80s. Do NOT call fetchVnMacroBatch() in time-sensitive contexts. Consider caching or async background refresh.
- **news-fetch microservice TBD:** Reuters + Bloomberg scrapers need a news-fetch service. See `docs/architecture-briefs/2026-05-13-news-fetch-service.md`. bloomberg + reuters remain blocked.
- **TradingEconomics live test regression:** `tradingeconomics.com/vietnam/gdp` changed structure (no JSON-LD Dataset found). Pre-existing issue since previous cycle — not caused by this cycle. Needs re-investigation in next session.
- **QA signal:** `docs/signals/qa-2026-05-13T10-25-00Z.json` — 2 new scrapers (adb-kidb + imf-weo), 4 new routes, 67 unit tests pass.
