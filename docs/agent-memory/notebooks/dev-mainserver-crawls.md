# dev-mainserver-crawls — Notebook

**Last updated:** 2026-05-13 | **Sprint:** bootstrap

---

## This session

Bootstrap cycle: read all 11 recon docs from ops-mainserver-fetch batch signal, researched 2026 state-of-the-art bypass techniques, wrote 5 technique docs (header-rotation, open-api-key, cloudflare-managed-bypass, playwright-stealth, botasaurus-human-sim, spa-xhr-intercept). Updated README technique index with RAM-ranked candidate table and source-to-technique assignment. Signal moved to processed. RAM budget flag triggered (see Carry-over).

---

## Active Scrapers

| Source | Microservice | Technique | RAM cost | Status | Last verified |
|--------|-------------|-----------|---------|--------|--------------|
| yahoo-finance-fx-indices | apps/macro-indicators/ (TS, existing) | plain fetch (v8 API) | ~5MB | deployed | pre-existing |

---

## Container Memory Tracker

| Container | Headless scrapers | Total RAM committed | Budget limit | Flags to ops |
|-----------|------------------|-------------------|-------------|-------------|
| macro-indicators | none yet | ~5MB (TS base) | 512MB | FLAG: ADB KIDB (Playwright ~400MB) + IMF Botasaurus (~450MB) cannot fit in 512MB — need 1.5GB+ |
| news-fetch (TBD) | bloomberg (Playwright ~450MB) + reuters (Playwright ~450MB) | ~900MB if concurrent | NOT YET CREATED | FLAG: news-fetch container must be provisioned at >=2GB before headless news scrapers deploy |

---

## Technique Registry

| Technique | Doc | First used for | RAM est. | Notes |
|-----------|-----|---------------|---------|-------|
| header-rotation | `docs/mainserver-crawl-techniques/header-rotation.md` | trading-economics-vn, world-bank-macro | ~5MB | 2026 state: effective for no-protection sites |
| open-api-key | `docs/mainserver-crawl-techniques/open-api-key.md` | fred-macro | ~5MB | FRED_API_KEY env var must be provisioned |
| cloudflare-managed-bypass | `docs/mainserver-crawl-techniques/cloudflare-managed-bypass.md` | investing-economic-calendar | ~25MB | curl_cffi preferred over cloudscraper in 2026 |
| playwright-stealth | `docs/mainserver-crawl-techniques/playwright-stealth.md` | bloomberg-markets, reuters-asia-news | ~350-500MB | RSS fallback first for Reuters |
| botasaurus-human-sim | `docs/mainserver-crawl-techniques/botasaurus-human-sim.md` | imf-datamapper | ~400-500MB | WEO API (api.imf.org) preferred over Botasaurus |
| spa-xhr-intercept | `docs/mainserver-crawl-techniques/spa-xhr-intercept.md` | adb-kidb | ~400MB (Phase 1) / ~15MB (Phase 2) | Phase 1 discovery run needed |

---

## Implementation History

| Date | Source | Microservice | Technique | RAM | Outcome |
|------|--------|-------------|-----------|-----|---------|
| 2026-05-13 | bootstrap (11 sources) | — | technique catalog only | — | docs written, scrapers not yet wired |

---

## Carry-over

- **RAM budget flag to ops (CRITICAL):** macro-indicators container (512MB limit) cannot host headless scrapers. ADB KIDB Playwright (~400MB) and IMF Botasaurus (~450MB) both exceed budget. ops must raise macro-indicators to >=1.5GB and provision news-fetch at >=2GB before headless scrapers are activated.
- **FRED_API_KEY needed:** fred-macro scraper code is ready but requires FRED_API_KEY env var in .env — ops must provision.
- **IMF WEO API validation needed:** recon noted `api.imf.org` as likely open — needs a live probe from ops-mainserver-fetch before implementing.
- **ADB KIDB Phase 1 discovery:** Playwright session needed to intercept XHR and find actual API endpoints. Run once, then document discovered URL in recon.md.
- **Vietnam country code on investing.com:** recon says likely 35, unconfirmed. Verify in first calendar scraper run.
- **news-fetch microservice TBD:** Reuters + Bloomberg scrapers need a news-fetch service to be created. Blocked until ops provisions container and dev creates the app skeleton.
- **Reuters RSS first:** Before investing in Playwright stealth for Reuters, probe `https://feeds.reuters.com/reuters/businessNews` — if it covers Asia markets, skip DataDome bypass entirely (~350MB RAM saving).
