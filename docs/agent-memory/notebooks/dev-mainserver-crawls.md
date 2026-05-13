# dev-mainserver-crawls — Notebook

**Last updated:** 2026-05-13T07:34Z | **Sprint:** external-macro-wiring

---

## This session

Wired 6 lightweight external macro scrapers into `apps/macro-indicators/` (TypeScript/Bun DDD microservice). All fit in existing 512MB container budget — no RAM flag needed. Total overhead: ~50MB for all 6. New endpoint: `POST /macro/external` (alias `GET /macro/external`).

Implementation: domain ports extended in `repositories.ts`, 6 infra adapters, 1 application use-case (`FetchExternalMacroUseCase`), handlers and index wired. 54 tests pass, 8 integration tests skipped (live). QA signal dropped at `docs/signals/qa-2026-05-13T07-34-03Z.json`.

---

## Active Scrapers

| Source | Microservice | Technique | RAM cost | Status | Last verified |
|--------|-------------|-----------|---------|--------|--------------|
| yahoo-finance-fx-indices | apps/macro-indicators/ | plain fetch (v8 API) | ~5MB | deployed | pre-existing |
| world-bank-macro | apps/macro-indicators/ | header-rotation | ~5MB | wired 2026-05-13 | unit tests pass |
| yahoo-finance-fx-indices | apps/macro-indicators/ | header-rotation | ~5MB | wired 2026-05-13 | unit tests pass |
| cnbc-world-markets | apps/macro-indicators/ | header-rotation | ~5MB | wired 2026-05-13 | unit tests pass |
| trading-economics-vn | apps/macro-indicators/ | header-rotation | ~5MB | wired 2026-05-13 | unit tests pass |
| fred-macro | apps/macro-indicators/ | open-api-key | ~5MB | wired-inactive (key missing) | key-absent guard verified |
| investing-economic-calendar | apps/macro-indicators/ | cloudflare-managed-bypass | ~25MB | wired 2026-05-13 | unit tests pass |

---

## Container Memory Tracker

| Container | Headless scrapers | Total RAM committed | Budget limit | Flags to ops |
|-----------|------------------|-------------------|-------------|-------------|
| macro-indicators | none | ~50MB (6 new lightweight + TS base) | 512MB | none — budget OK |
| macro-indicators (blocked) | ADB KIDB Playwright (~400MB) + IMF Botasaurus (~450MB) | would exceed 512MB | 512MB | FLAG REMAINS: need 1.5GB+ before headless sources activate |
| news-fetch (TBD) | bloomberg (Playwright ~450MB) + reuters (Playwright ~450MB) | ~900MB if concurrent | NOT YET CREATED | FLAG REMAINS: news-fetch container must be provisioned at >=2GB |

---

## Technique Registry

| Technique | Doc | First used for | RAM est. | Notes |
|-----------|-----|---------------|---------|-------|
| header-rotation | `docs/mainserver-crawl-techniques/header-rotation.md` | trading-economics-vn, world-bank-macro | ~5MB | Effective for all 4 header-rotation sources |
| open-api-key | `docs/mainserver-crawl-techniques/open-api-key.md` | fred-macro | ~5MB | FRED_API_KEY pending from ops |
| cloudflare-managed-bypass | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` | investing-economic-calendar | ~25MB | curl_cffi preferred; Python helper subprocess |
| playwright-stealth | `docs/mainserver-crawl-techniques/playwright-stealth.md` | bloomberg-markets, reuters-asia-news | ~350-500MB | BLOCKED — container RAM |
| botasaurus-human-sim | `docs/mainserver-crawl-techniques/botasaurus-human-sim.md` | imf-datamapper | ~400-500MB | BLOCKED — container RAM |
| spa-xhr-intercept | `docs/mainserver-crawl-techniques/spa-xhr-intercept.md` | adb-kidb | ~400MB (Phase 1) / ~15MB (Phase 2) | BLOCKED — container RAM |

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

---

## Carry-over

- **FRED_API_KEY needed (ops):** fred-macro adapter wired and conditional. Activates automatically when key added to .env. Free key: https://fred.stlouisfed.org/docs/api/api_key.html. Adapter checks `isAvailable()` → returns null-filled results when key absent.
- **investing.com country_id=35 (Vietnam) unconfirmed:** First live run should omit country filter to capture all events, then filter by country name `"Vietnam"`. Document confirmed ID in recon.md.
- **Python deps needed in macro-indicators container:** `pip install curl_cffi beautifulsoup4 lxml` must be in Dockerfile for investing-economic-calendar adapter to function. Flag for ops.
- **RAM budget flag to ops (CRITICAL — remains from bootstrap):** macro-indicators container (512MB limit) cannot host headless scrapers. ADB KIDB Playwright (~400MB) and IMF Botasaurus (~450MB) both exceed budget. Ops must raise macro-indicators to >=1.5GB and provision news-fetch at >=2GB before headless scrapers are activated.
- **news-fetch microservice TBD:** Reuters + Bloomberg scrapers need a news-fetch service to be created. Blocked until ops provisions container and dev creates the app skeleton.
- **Reuters RSS first:** Before investing in Playwright stealth for Reuters, probe `https://feeds.reuters.com/reuters/businessNews` — if it covers Asia markets, skip DataDome bypass entirely (~350MB RAM saving).
- **ADB KIDB Phase 1 discovery:** Playwright session needed to intercept XHR and find actual API endpoints. Run once, then document discovered URL in recon.md.
- **QA signal:** `docs/signals/qa-2026-05-13T07-34-03Z.json` — 6 scrapers, 1 new endpoint, full checklist.
