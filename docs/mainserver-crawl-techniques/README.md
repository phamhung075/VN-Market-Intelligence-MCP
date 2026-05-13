# Main Server Crawl Techniques Catalog

**Owner:** `dev-mainserver-crawls` agent
**Purpose:** One-technique-per-file reference library for HTTP anti-bot bypass approaches used for international data sources on the main server. Unlike the VPS pair, headless browser techniques (Playwright, Puppeteer, Chromium stealth) are permitted here.

---

## Convention

One file per technique. Technique name = kebab-case description of the bypass approach.

```
docs/mainserver-crawl-techniques/
  README.md                         ← this file (catalog index)
  cloudflare-js-bypass.md           ← curl_cffi browser impersonation
  cloudflare-managed-bypass.md      ← cloudscraper + cf_clearance
  tls-fingerprint-spoof.md          ← JA3/JA4 fingerprinting
  header-rotation.md                ← UA pool + header variation
  cookie-warmup.md                  ← session/login persistence
  js-mini-challenge.md              ← execjs/node for non-CF JS
  captcha-workaround.md             ← 2captcha API or skip strategy
  playwright-stealth.md             ← full browser with stealth plugins (DataDome / PerimeterX)
  botasaurus-human-sim.md           ← Botasaurus human simulation (Akamai Bot)
  hrequests-browser.md              ← hrequests browser (PerimeterX / JS-rendered)
  datadome-bypass.md                ← DataDome-specific approach
  perimeterx-bypass.md              ← PerimeterX-specific approach
  akamai-bot-bypass.md              ← Akamai Bot Manager approach
```

---

## Technique Doc Structure

Each technique file MUST contain:

| Section | Required | Notes |
|---------|----------|-------|
| Problem | Yes | What anti-bot mechanism this defeats |
| Anti-bot type | Yes | Enum from ops-mainserver-fetch classification |
| Date documented | Yes | When first researched and applied |
| RAM cost | Yes | Measured MB per instance — MANDATORY for all techniques |
| Solution Approach | Yes | 1-paragraph strategy description |
| Libraries Required | Yes | pip/npm package + pinned version |
| Code Snippet | Yes | Minimal working example |
| RAM Profiling | Yes | How to measure during scraper run |
| Known Limits | Yes | When the technique fails |
| References | Yes | URLs used for research |

---

## Headless vs Lightweight Decision

Main server permits headless browsers. Use the escalation order — prefer lighter when sufficient:

| RAM budget | Technique tier | When to use |
|-----------|---------------|------------|
| ~5-25MB | Lightweight (requests/httpx/curl_cffi/cloudscraper) | No anti-bot, CF JS, CF Managed, IP block |
| ~25-50MB | Semi-headless (hrequests, execjs) | JS-rendered pages, JS mini challenges |
| ~250-500MB | Full headless (Playwright/Puppeteer + stealth) | DataDome, PerimeterX, Akamai Bot, advanced fingerprint |

**RAM tracking rule:** Document actual measured RSS in technique doc. See container budget rule in `docs/agents/dev-mainserver-crawls/knowledge.md § Container RAM Budget Rule`.

---

## Library Stack (lightest first)

1. `requests` — for no-anti-bot or simple header fix (~5MB)
2. `httpx` — async, better TLS (~10MB)
3. `cloudscraper` — Cloudflare JS auto-bypass (~25MB)
4. `curl_cffi` — TLS fingerprint spoof (JA3/JA4 impersonation) (~15MB)
5. `execjs` / `node -e` — mini JS challenge solver (~20MB)
6. `hrequests` — browser-grade TLS + JS render (~300MB)
7. `playwright` + `playwright-stealth` — full Chromium with stealth (~350MB)
8. `Botasaurus` — human simulation framework (~400MB)

---

## Technique Index — Ranked by RAM Cost (lightest first)

| Technique | File | Anti-bot target | Key library | RAM est. | Status |
|-----------|------|----------------|------------|---------|--------|
| Header rotation | `header-rotation.md` | UA/header heuristics / no protection | requests | ~5MB | active — trading-economics-vn, world-bank-macro, yahoo-finance-fx-indices, cnbc-world-markets, marketwatch-indices |
| Open API key | `open-api-key.md` | API key gate only (no bot challenge) | requests | ~5MB | active — fred-macro |
| Cookie warmup | `cookie-warmup.md` | Session / login wall | requests.Session | ~10MB | (not yet documented) |
| Cloudflare JS bypass | `cloudflare-js-bypass.md` | CF JS challenge (active) | curl_cffi | ~15MB | (not yet documented) |
| TLS fingerprint spoof | `tls-fingerprint-spoof.md` | JA3/JA4 fingerprint check | curl_cffi | ~15MB | (not yet documented) |
| JS mini challenge | `js-mini-challenge.md` | Non-CF JS cookie | execjs / node | ~20MB | (not yet documented) |
| Cloudflare Managed bypass | `cloudflare-managed-bypass.md` | CF managed challenge (__cf_bm) | curl_cffi | ~25MB | active — investing-economic-calendar |
| Captcha workaround | `captcha-workaround.md` | CAPTCHA gates | 2captcha API | ~25MB | (not yet documented) |
| hrequests browser | `hrequests-browser.md` | PerimeterX / JS-rendered | hrequests | ~300MB | (not yet documented) |
| Playwright stealth | `playwright-stealth.md` | DataDome / PerimeterX / complex CF | playwright + playwright-stealth | ~350-500MB | active — bloomberg-markets, reuters-asia-news (RSS fallback preferred for Reuters) |
| SPA XHR intercept | `spa-xhr-intercept.md` | SPA with unknown internal API | playwright (Phase 1 only) | ~400MB discovery / ~15MB ongoing | active — adb-kidb |
| Botasaurus human sim | `botasaurus-human-sim.md` | Akamai Bot / advanced fingerprint | Botasaurus | ~400-500MB | active — imf-datamapper (WEO API preferred; Botasaurus fallback only) |

> Status: `active — <source>` = technique doc written and matched to source. `(not yet documented)` = placeholder from catalog. Update when doc written.

---

## Candidate Technique Assignment — Bootstrap Batch (2026-05-13)

11 sources from ops-mainserver-fetch batch signal assigned to techniques:

| Source | Anti-bot type | Assigned technique | Headless | Microservice |
|--------|-------------|-------------------|---------|-------------|
| world-bank-macro | none | header-rotation | no | apps/macro-indicators/ |
| yahoo-finance-fx-indices | none | header-rotation (already deployed in TS) | no | apps/macro-indicators/ (existing) |
| trading-economics-vn | none | header-rotation | no | apps/macro-indicators/ |
| cnbc-world-markets | none | header-rotation | no | apps/stock-price/ |
| marketwatch-indices | none | header-rotation | no | apps/stock-price/ (low priority) |
| fred-macro | login_required (API key) | open-api-key | no | apps/macro-indicators/ |
| investing-economic-calendar | cloudflare_managed | cloudflare-managed-bypass | no | apps/macro-indicators/ |
| reuters-asia-news | datadome | playwright-stealth (RSS fallback first) | yes (if RSS fails) | apps/news-fetch/ (TBD) |
| bloomberg-markets | perimeterx | playwright-stealth | yes | apps/news-fetch/ (TBD) |
| adb-kidb | none (SPA API discovery) | spa-xhr-intercept | yes (Phase 1 only) | apps/macro-indicators/ |
| imf-datamapper | akamai_bot | botasaurus-human-sim (WEO API preferred) | yes (fallback only) | apps/macro-indicators/ |

---

## Workflow

```
dev-mainserver-crawls reads recon anti_bot_type
  → checks headless_likely_needed flag from ops-mainserver-fetch signal
  → looks up technique in this catalog
  → reads technique doc (if exists)
  → OR researches + writes new technique doc (WebSearch → WebFetch → document → include RAM cost)
  → implements scraper using technique
  → wires into appropriate microservice (apps/<service>/)
  → checks container RAM budget
  → signals qa
```
