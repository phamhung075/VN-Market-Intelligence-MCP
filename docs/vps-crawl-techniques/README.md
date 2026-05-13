# VPS Crawl Techniques Catalog

**Owner:** `dev-vps-crawls` agent
**Purpose:** One-technique-per-file reference library for HTTP anti-bot bypass approaches used on the Vinahost VPS.
**Last updated:** 2026-05-13

---

## Convention

One file per technique. Technique name = kebab-case description of the bypass approach.

```
docs/vps-crawl-techniques/
  README.md                     <- this file (catalog index)
  plain-requests-open-api.md    <- stdlib requests, no bypass
  ua-rotation-rss.md            <- 5-UA pool, 3-attempt retry
  hnx-ajax-post.md              <- HNX SSL bypass + AJAX POST
  ssc-playwright-download.md    <- Oracle ADF (FAILING — TasksMax)
  tls-fingerprint-spoof.md      <- curl_cffi JA3/JA4 impersonation
  cloudflare-js-bypass.md       <- curl_cffi for CF JS challenge
  cloudflare-managed-bypass.md  <- cf_clearance replay / cloudscraper
  header-rotation.md            <- UA pool + session cookies
  cookie-warmup.md              <- session warmup + cookie persistence
  js-mini-challenge.md          <- node -e / execjs for JS cookie
  captcha-workaround.md         <- 2captcha API or XHR skip
```

---

## Constraints (ALL techniques)

NEVER install on VPS:
- `playwright`, `puppeteer`, `selenium`, `pyppeteer`, `chromium`, `geckodriver`
- Reason: VPS RAM limit (~1 GB). Browser engines cause OOM kills.
- Exception: `ssc-playwright-download.md` is documented for the pre-existing SSC script only — it is currently non-functional on this VPS.

Preferred library stack (lightest first):
1. `requests` / `curl` — for no-anti-bot or simple header fix
2. `httpx` — async, better TLS, speed-sensitive sources
3. `cloudscraper` — Cloudflare JS auto-bypass (medium RAM; largely ineffective v3+)
4. `curl_cffi` — TLS fingerprint spoof (JA3/JA4 impersonation; 5-15 MB per request)
5. `execjs` / `node -e` — mini JS challenge solver (no browser, just JS engine)

---

## Technique Index — Ranked by RAM Cost (lightest first)

| Rank | Technique | File | Anti-bot target | Key library | RAM/req | Status |
|------|-----------|------|----------------|------------|---------|--------|
| 1 | Plain requests open API | `plain-requests-open-api.md` | none | requests / curl | 3–8 MB | active — vps-prices, cafef-index, sbv-rates |
| 2 | UA rotation RSS | `ua-rotation-rss.md` | none / light UA | requests + UA pool | 3–8 MB | active — vn-news-rss |
| 3 | Header rotation | `header-rotation.md` | UA heuristics | requests | 3–8 MB | documented — upgrade path for rss/news |
| 4 | Cookie warmup | `cookie-warmup.md` | session / login wall | requests.Session | 2–5 MB + disk | documented — pre-condition for hsx.vn XHR |
| 5 | HNX AJAX POST | `hnx-ajax-post.md` | none (SSL + HTML) | urllib / ssl | 5–10 MB | active — hsx-bctc HNX/UPCOM tickers |
| 6 | TLS fingerprint spoof | `tls-fingerprint-spoof.md` | JA3/JA4 fingerprint | curl_cffi | 5–15 MB | documented — upgrade path if CF activates |
| 7 | Cloudflare JS bypass | `cloudflare-js-bypass.md` | CF JS challenge (v1/v2) | curl_cffi | 5–15 MB | documented — upgrade path cafef.vn RSS |
| 8 | JS mini challenge | `js-mini-challenge.md` | non-CF JS cookie | execjs / node | 20–35 MB peak | documented — no current source requires it |
| 9 | Cloudflare Managed bypass | `cloudflare-managed-bypass.md` | CF Turnstile / managed | cloudscraper / cookie replay | 5–80 MB | documented — no current source requires it |
| 10 | Captcha workaround | `captcha-workaround.md` | CAPTCHA gates | 2captcha API | 5–10 MB + latency | documented — no current source requires it |
| 11 | SSC Playwright download | `ssc-playwright-download.md` | Oracle ADF SPA | playwright/chromium | 300–500 MB | **FAILING** — TasksMax=32 VPS limit |

---

## Source → Technique Mapping

| Source | Anti-bot type | Technique | Status |
|--------|--------------|-----------|--------|
| vps-prices (`bgapidatafeed.vps.com.vn`) | none | plain-requests-open-api | healthy upstream; MCP push failing |
| cafef-index (`banggia.cafef.vn`) | none | plain-requests-open-api | healthy |
| sbv-rates (`portal.vietcombank.com.vn`) | none (Akamai CDN passive) | plain-requests-open-api | healthy end-to-end |
| vn-news-rss (14 RSS endpoints) | none / CF RP (passive) | ua-rotation-rss | healthy upstream; MCP push 404 |
| hsx-bctc HNX/UPCOM (`hnx.vn`) | page_restructure (endpoint changed) | hnx-ajax-post | endpoint broken — needs re-discovery |
| hsx-bctc HOSE (`hsx.vn` / SSC) | Oracle ADF SPA + resource_constraint | ssc-playwright-download | failing — TasksMax=32 kills Chromium |

---

## 2026 Anti-Bot Landscape — Research Summary

Research conducted 2026-05-13 via WebSearch + WebFetch on scrapfly, asadfix.github.io, brightdata, roundproxies.

### What works (lightweight — VPS safe)

- **curl_cffi** (>= 0.7) is the 2026 standard for TLS fingerprint bypass. JA4+ (successor to JA3) is computed at CDN edge before any HTTP exchange. curl_cffi emits an exact Chrome JA4+ profile. RAM: 5–15 MB/request. No browser process.
- **requests + UA rotation** remains effective for sites with only header-level heuristics (most VN financial RSS/API sources as of 2026).
- **requests.Session cookie warmup** handles F5 BigIP, ASP.NET SessionId, and other server-set cookies automatically.

### What does NOT work (in 2026)

- **cloudscraper**: Effective only against Cloudflare IUAM v1/v2. **Fails against Cloudflare v3, Managed Challenge, and Turnstile** (dominant in 2026). Documented in `cloudflare-managed-bypass.md`.
- **Playwright/Selenium/Puppeteer**: Each Chrome instance needs ~500 MB. FORBIDDEN on this VPS (~1 GB total RAM).
- **httpx** (plain): Same urllib3 TLS fingerprint as requests — detectably non-browser. No improvement over requests for anti-bot.

### Residential proxy note

Residential proxy rotation (BrightData, Oxylabs) can dramatically improve pass rates for Akamai Bot Manager and Cloudflare Bot Management Pro. Out of scope for direct VPS deployment but available as a future option if VPS IP gets blocklisted. Vinahost Vietnam IP (in-country) currently has good geo-trust for VN financial sites.

---

## Technique Doc Structure

Each technique file MUST contain:

| Section | Required | Notes |
|---------|----------|-------|
| Problem | Yes | What anti-bot mechanism this defeats |
| Anti-bot type | Yes | Enum from ops-vps-fetch classification |
| Date documented | Yes | When first researched and applied |
| Solution Approach | Yes | 1-paragraph strategy description |
| Libraries Required | Yes | pip package + pinned version |
| Code Snippet | Yes | Minimal working example (Python) |
| RAM Cost | Yes | Per-request MB estimate (mandatory — VPS RAM constraint) |
| Known Limits | Yes | When the technique fails |
| References | Yes | URLs used for research |

---

## Workflow

```
dev-vps-crawls reads recon anti_bot_type
  -> looks up technique in this catalog (RAM-ranked)
  -> reads technique doc (if exists)
  -> OR researches + writes new technique doc (WebSearch -> WebFetch -> document)
  -> implements scraper using technique
  -> wires into VPS:8765 endpoint
  -> signals qa
```
