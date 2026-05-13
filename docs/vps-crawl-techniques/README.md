# VPS Crawl Techniques Catalog

**Owner:** `dev-vps-crawls` agent
**Purpose:** One-technique-per-file reference library for HTTP anti-bot bypass approaches used on the Vinahost VPS.

---

## Convention

One file per technique. Technique name = kebab-case description of the bypass approach.

```
docs/vps-crawl-techniques/
  README.md                     ← this file (catalog index)
  cloudflare-js-bypass.md       ← curl_cffi browser impersonation
  cloudflare-managed-bypass.md  ← cloudscraper + cf_clearance
  tls-fingerprint-spoof.md      ← JA3/JA4 fingerprinting
  header-rotation.md            ← UA pool + header variation
  cookie-warmup.md              ← session/login persistence
  js-mini-challenge.md          ← execjs/node for non-CF JS
  captcha-workaround.md         ← 2captcha API or skip strategy
```

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
| Known Limits | Yes | When the technique fails |
| References | Yes | URLs used for research |

---

## Constraints (ALL techniques)

NEVER use:
- `playwright`, `puppeteer`, `selenium`, `pyppeteer`, `chromium`, `geckodriver`
- Reason: VPS RAM limit (~1GB). Browser engines cause OOM kills.

Preferred library stack (lightest first):
1. `requests` — for no-anti-bot or simple header fix
2. `httpx` — async, better TLS, for speed-sensitive sources
3. `cloudscraper` — Cloudflare JS auto-bypass (medium RAM)
4. `curl_cffi` — TLS fingerprint spoof (JA3/JA4 impersonation)
5. `execjs` / `node -e` — mini JS challenge solver (no browser, just JS engine)

---

## Technique Index

| Technique | File | Anti-bot target | Key library | Status |
|-----------|------|----------------|------------|--------|
| Plain requests open API | `plain-requests-open-api.md` | none | requests / curl | active — vps-prices, cafef-index, sbv-rates |
| UA rotation RSS | `ua-rotation-rss.md` | none / light UA check | requests + UA pool | active — vn-news-rss |
| HNX AJAX POST | `hnx-ajax-post.md` | none (SSL + HTML parse) | urllib / ssl | active — hsx-bctc (HNX/UPCOM tickers) |
| SSC Playwright download | `ssc-playwright-download.md` | Oracle ADF SPA | playwright/chromium | failing — TasksMax=32 VPS limit |
| Cloudflare JS bypass | `cloudflare-js-bypass.md` | CF JS challenge | curl_cffi | (not yet documented) |
| Cloudflare Managed bypass | `cloudflare-managed-bypass.md` | CF managed challenge | cloudscraper | (not yet documented) |
| TLS fingerprint spoof | `tls-fingerprint-spoof.md` | JA3/JA4 fingerprint check | curl_cffi | (not yet documented) |
| Header rotation | `header-rotation.md` | UA/header heuristics | requests | (not yet documented) |
| Cookie warmup | `cookie-warmup.md` | Session / login wall | requests.Session | (not yet documented) |
| JS mini challenge | `js-mini-challenge.md` | Non-CF JS cookie | execjs / node | (not yet documented) |
| Captcha workaround | `captcha-workaround.md` | CAPTCHA gates | 2captcha API | (not yet documented) |

> Update status column when a technique doc is written. Set to `active — <source-name>` on first use.

---

## Candidate Techniques — 2026 Research

Research conducted 2026-05-13. Covers state-of-the-art lightweight (no-browser) bypass approaches relevant to VN market data sources.

### 1. curl_cffi — TLS/JA3/JA4 Browser Impersonation

**Library:** `curl_cffi >= 0.6` (`pip install curl_cffi`)
**Use case:** Cloudflare JS challenge (`cloudflare_js`), JA3/JA4 fingerprint checks, Akamai TLS detection
**How it works:** Wraps `curl-impersonate` via cffi. Replaces the Python TLS stack with the exact TLS handshake, cipher suite ordering, ALPN sequence, and HTTP/2 frame order of a target browser (Chrome 110, 120, Firefox 120, Safari 17, etc.). Anti-bot systems that detect the Python/requests JA3 hash see a legitimate browser fingerprint instead.
**Code pattern:**
```python
from curl_cffi import requests as cffi_requests
resp = cffi_requests.get(url, impersonate="chrome120", headers=headers)
```
**Tradeoffs:**
- Effective against Cloudflare JS challenge (Bot Score < threshold) and basic Akamai TLS checks
- Does NOT solve Cloudflare Managed Challenge (requires JS execution and CAPTCHA solving)
- Does NOT spoof canvas fingerprint, WebGL, or JS-level signals — only TLS + HTTP/2 layer
- Approximately 2-4x RAM overhead vs. plain requests (still vastly lighter than Chromium)
- JA4 (next-gen fingerprint by FoxIO) is now checked by Cloudflare and Akamai at edge; curl_cffi ≥ 0.7 includes JA4-accurate profiles
**VN sources applicable:** Future Cloudflare-protected VN endpoints (if cafef.vn RSS ever activates managed challenge)
**Source:** [curl_cffi GitHub](https://github.com/lexiforest/curl_cffi) | [Anti-Bot Bypass Guide 2026](https://asadfix.github.io/scraping-guide/)

---

### 2. cloudscraper — Cloudflare Auto-Bypass (JS Engine)

**Library:** `cloudscraper >= 1.2.71` (`pip install cloudscraper`)
**Use case:** Cloudflare JS challenge (older v1/v2 variants)
**How it works:** Uses a JS engine (Node.js or execjs) to solve Cloudflare's IUAM (I'm Under Attack Mode) JavaScript challenge, extract the `cf_clearance` cookie, and replay it with a matching User-Agent and IP.
**Tradeoffs:**
- Works against older Cloudflare JS challenges (v1/v2). **Largely ineffective against modern Cloudflare (v3/Turnstile) as of 2026** — Cloudflare continuously hardens the JS challenge.
- `cf_clearance` cookie is IP-bound: must use the same IP (VPS IP) when replaying. VPS Vietnam IP is ideal since target sites expect VN traffic.
- Requires Node.js or execjs on VPS (Node is available; execjs is pure Python fallback)
- Lighter than Playwright; heavier than curl_cffi
**VN sources applicable:** If a VN financial site activates Cloudflare IUAM (rare; most use CF RP which passes RSS unchallenged)
**Source:** [cloudscraper GitHub](https://github.com/VeNoMouS/cloudscraper) | [ScrapeOps CF bypass guide 2026](https://scrapeops.io/web-scraping-playbook/how-to-bypass-cloudflare/)

---

### 3. Akamai — TLS Fingerprint + Header Hardening

**Library:** `curl_cffi` (primary), `httpx >= 0.27` with custom TLS (secondary)
**Use case:** Akamai Bot Manager (present on portal.vietcombank.com.vn, potentially other VN banking sites)
**How it works:** Akamai checks 5 layers: IP reputation, TLS fingerprint (JA3/JA4), JavaScript sensor data, behavioral analysis, session consistency. For VN sources at current scraping frequency (30-min for VCB), Akamai is non-blocking. If Akamai activates active bot management, mitigation requires: (1) curl_cffi to fix JA3/JA4 fingerprint, (2) consistent UA across the session, (3) avoiding mid-session UA/fingerprint change, (4) realistic inter-request timing.
**Tradeoffs:**
- Akamai with active sensor challenges (Device Registration) cannot be bypassed without a paid SDK (Hyper SDK) or cloud scraper proxy — no free lightweight solution
- Current VCB VPS scraping rate (1 req/30 min) is well below any Akamai rate trigger
- Free bypass path: curl_cffi for TLS + consistent headers + VPS Vietnam IP (trusted geo)
**VN sources applicable:** portal.vietcombank.com.vn (sbv-rates); any VN bank portal that uses Akamai
**Source:** [Bypassing Akamai for free — The Web Scraping Club](https://substack.thewebscraping.club/p/bypassing-akamai-for-free) | [Outsmarting Akamai with JA3Proxy](https://hackernoon.com/outsmarting-akamais-bot-detection-with-ja3proxy)

---

### 4. ASP.NET ViewState + IIS Session Cookie Warmup

**Library:** `requests.Session` (`pip install requests`)
**Use case:** ASP.NET WebForms endpoints requiring `__VIEWSTATE` and `__EVENTVALIDATION` round-trip (e.g. if hnx.vn ever adds CSRF tokens to its POST endpoints)
**How it works:** First, GET the page to extract `__VIEWSTATE` and `__EVENTVALIDATION` hidden fields. Include these in subsequent POST requests along with the `ASP.NET_SessionId` cookie set during the GET. The session persists across requests automatically via `requests.Session`.
**Tradeoffs:**
- Works for any ASP.NET WebForms endpoint that validates ViewState. Not needed for AJAX endpoints (like HNX's current AJAX POST which ignores ViewState).
- If HNX adds CSRF or session validation to its BCTC POST endpoint, this technique becomes necessary.
- The `viewstate` PyPI package (released 2025-05-01) decodes ViewState binary for inspection/debugging.
**VN sources applicable:** hnx.vn (if ViewState added), vneconomy.vn RSS (IIS/ASP.NET), any IIS-hosted portal
**Source:** [How I scraped a complex ASP.NET platform — Medium](https://medium.com/@matiasmaquieira96/how-i-scraped-a-complex-asp-net-platform-using-python-1b320c4743d7) | [viewstate PyPI](https://pypi.org/project/viewstate/)

---

### 5. F5 BigIP Session Cookie Handling (HSX StockDocuments)

**Library:** `requests.Session`
**Use case:** F5 BigIP load balancer fingerprinting cookies (`TS016df111`, `TS0d710d04`) set by hsx.vn SPA
**How it works:** F5 BigIP sets two `TS0*` cookies on first contact to fingerprint the client. Subsequent requests must include these cookies. With `requests.Session`, cookies are persisted automatically. The issue with HSX is NOT the F5 cookies (handled trivially) but the React SPA that loads data via client-side XHR — the initial HTML response is a shell with no article data.
**Tradeoffs:**
- F5 cookie persistence: free with `requests.Session`
- XHR data loading: requires either discovering the underlying XHR API endpoint (reverse-engineering) or browser automation
- See `hsx-bctc/triage.md` for the HSX SPA XHR endpoint discovery proposal
**VN sources applicable:** hsx.vn (if XHR endpoint is found), any F5 BigIP-fronted VN site
**Source:** [hsx-bctc recon doc](docs/vps-sources/hsx-bctc/recon.md)

---

## Workflow

```
dev-vps-crawls reads recon anti_bot_type
  → looks up technique in this catalog
  → reads technique doc (if exists)
  → OR researches + writes new technique doc (WebSearch → WebFetch → document)
  → implements scraper using technique
  → wires into VPS:8765 endpoint
  → signals qa
```
