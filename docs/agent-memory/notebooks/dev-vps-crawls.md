# dev-vps-crawls — Notebook

**Last updated:** 2026-05-18T06:00Z | **Sprint:** 1944a-vps

---

## Identity

Agent: VPS Crawler Developer
Role: Lightweight HTTP scraper implementation on Vinahost VPS
Zone: dev-zone (VPS scraper code)

---

## Active Scrapers

| Source | Script | Technique | Status | Last verified |
|--------|--------|-----------|--------|--------------|
| vps-prices | /root/fetch-prices.sh | plain-requests-open-api | healthy end-to-end (112 items 200 OK) | 2026-05-13 |
| cafef-index | /root/fetch-prices.sh (Step 3) | plain-requests-open-api | healthy | 2026-05-13 |
| sbv-rates | /root/fetch-sbv.sh | plain-requests-open-api | healthy end-to-end | 2026-05-13 |
| vn-news-rss | /root/fetch-vn-news.sh | ua-rotation-rss | healthy end-to-end (245 items 200 OK) | 2026-05-13 |
| vn-foreign-flow | /root/fetch-foreign-flow.sh | plain-requests-open-api | healthy (101 items upserted) | 2026-05-13 |
| hsx-bctc (HNX/UPCOM) | /root/discover-bctc-urls-browser.py | hnx-ajax-post | OPERATIONAL — Q1/2026 BCTC flowing. SHB e2e PASS. | 2026-05-13T09:30Z |
| hsx-bctc (HOSE/SSC) | /root/discover-bctc-urls-browser.py | ssc-playwright-download | FAILING: TasksMax=32 kills Chromium | 2026-05-13 |

---

## Technique Registry

| Technique | Doc | First used for | RAM/req | Notes |
|-----------|-----|---------------|---------|-------|
| plain-requests-open-api | docs/vps-crawl-techniques/plain-requests-open-api.md | vps-prices, cafef-index, sbv-rates | 3–8 MB | Lightest path. 3 sources. No bypass needed. |
| ua-rotation-rss | docs/vps-crawl-techniques/ua-rotation-rss.md | vn-news-rss | 3–8 MB | 5-UA pool, 3 retries, human delay. 14 RSS sources. |
| hnx-ajax-post | docs/vps-crawl-techniques/hnx-ajax-post.md | hsx-bctc | 5–10 MB | SSL CERT_NONE + pAction=1 required. HNX/UPCOM tickers only. |
| ssc-playwright-download | docs/vps-crawl-techniques/ssc-playwright-download.md | hsx-bctc (HOSE) | 300–500 MB | Playwright, currently failing TasksMax. Document-only for now. |
| tls-fingerprint-spoof | docs/vps-crawl-techniques/tls-fingerprint-spoof.md | (future CF-protected sources) | 5–15 MB | curl_cffi JA4+ impersonation. 2026 standard for TLS bypass. |
| cloudflare-js-bypass | docs/vps-crawl-techniques/cloudflare-js-bypass.md | (upgrade path cafef.vn) | 5–15 MB | curl_cffi. Upgrade path if CF IUAM activates. |
| cloudflare-managed-bypass | docs/vps-crawl-techniques/cloudflare-managed-bypass.md | (future) | 5–80 MB | cloudscraper largely ineffective v3+. cf_clearance replay preferred. |
| header-rotation | docs/vps-crawl-techniques/header-rotation.md | (upgrade path rss/news) | 3–8 MB | Full header rotation doc. Same pattern as ua-rotation-rss. |
| cookie-warmup | docs/vps-crawl-techniques/cookie-warmup.md | (pre-condition hsx.vn XHR) | 2–5 MB | Session warmup + cookie persistence to disk. |
| js-mini-challenge | docs/vps-crawl-techniques/js-mini-challenge.md | (no current source) | 20–35 MB peak | node -e / execjs. No VN source requires this currently. |
| captcha-workaround | docs/vps-crawl-techniques/captcha-workaround.md | (no current source) | 5–10 MB | 2captcha or XHR skip. No VN source requires this currently. |

---

## Implementation History

| Date | Source | Technique | Outcome |
|------|--------|-----------|---------|
| 2026-05-18T06:00Z | vps-proxy-server.js | envelope-shape-fix | 1944a-vps DONE — `/proxy/bctc-discover/:ticker` now returns `{results:[{url,source,confidence}],error:null}` envelope. Deployed SCP + systemctl restart. Health 200 OK. 401 without key. Shape confirmed via curl (results=[] acceptable — script runs ~120s). |
| 2026-05-13 | all 5 sources | reverse-documentation | Bootstrap catalog complete. 4 technique docs written. |
| 2026-05-13 | hsx-bctc | live probe + triage | HNX endpoint confirmed working for HNX tickers; HOSE path blocked; triage doc at docs/vps-sources/hsx-bctc/triage.md |
| 2026-05-13 | hsx-bctc (TASK-BCTC-2) | live verification | NVB Q1/2026: PASS — 1 PDF URL returned (confidence 0.9). VEA Q1/2026: empty (UPCOM, not yet filed or SSC needed). HNX endpoint fully operational. |
| 2026-05-13 | technique catalog | bootstrap + research | 7 new technique docs written (tls-fingerprint-spoof, cloudflare-js-bypass, cloudflare-managed-bypass, header-rotation, cookie-warmup, js-mini-challenge, captcha-workaround). README updated with RAM rankings. |
| 2026-05-13 | TASK-PUSH-FINAL | MCP_BASE fix + redeploy | Changed MCP_BASE from bare zenmidi.com to zenmidi.com/vn-market. Fixed fetch-bctc.sh template (hardcoded URLs → __MCP_BASE__ tokens). Deployed all 8 scripts. Prices: 112 items pushed 200 OK. News: 245 items pushed 200 OK. All 4 fetch services active. |
| 2026-05-13T09:30Z | hsx-bctc | hnx-ajax-post contract fix | Signal dev-vps-crawls-2026-05-13T09-17-00Z drained. 5 patches applied to discover-bctc-urls-browser.py: Referer /vi-vn/ prefix, pNhomTin empty, homepage fallback guard, ticker slug startswith fix. All 4 integration tests PASS. SHB Q1/2026 e2e PASS — PDF URL confirmed. QA signaled. |

---

## Open Tasks

| Signal file | Source | Anti-bot | Status |
|------------|--------|---------|--------|
| processed/dev-vps-crawls-2026-05-13T04-49-25Z.json | hsx-bctc | page_restructure | TRIAGED — 2 tasks to file |
| processed/dev-vps-crawls-2026-05-13T04-49-25Z.json | vps-prices push | n/a (MCP issue) | Deferred to dev-mcp-server |
| processed/dev-vps-crawls-2026-05-13T04-49-25Z.json | vn-news-rss push 404 | n/a (MCP issue) | Deferred to dev-mcp-server |

---

## Pending Tasks (to file)

- TASK-BCTC-1: ops — increase TasksMax=512 + MemoryMax=512M in vn-bctc-fetch.service
- TASK-BCTC-2: developer — reverse-engineer hsx.vn SPA XHR API for no-browser HOSE BCTC path

---

## Key Findings — 2026-05-13T09:30Z Contract Fix

### HNX Contract Changes Applied
- Referer MUST include `/vi-vn/` language prefix — server 302s without it (change detected 2026-05-13)
- `pNhomTin` MUST be empty string — `'FIN_REPORT'` wrapper no longer works (contract changed)
- Ticker slugs in SYMBOL hrefs are `ticker+listingcode` (e.g. `shb125017`) — must use `startswith()` not equality
- Homepage fallback guard added: `len(body) > 30_000 AND "Trang chủ" in body` → RuntimeError
- SHB Q1/2026: PASS — PDF URL `https://owa.hnx.vn/ftp///cims/2026/4_W5/...Q1_2026.pdf`
- ArticlesFileAttach CAN article 615286: 4 Q1/2026 PDFs confirmed

## Key Findings — 2026-05-13 Bootstrap

### HNX Endpoint Diagnosis
- `NextPageTinCPNY_CBTCPH` POST endpoint IS working when called correctly (pAction=1 + pNhomTin="'FIN_REPORT'")
- Returns homepage ONLY when called with minimal params (pageIndex/pageSize only) — this was the recon confusion
- HNX-listed tickers NVB, PVS, ACB show Q1/2026 BCTC data with correct params
- HOSE tickers (VNM, MWG) correctly return "Không tìm thấy" — they are on SSC portal, not HNX
- Server-side date filtering works: pFromDate=01/04/2026 pToDate=30/06/2026 correctly filters Q1/2026 filings

### SSC Playwright Failure
- TasksMax=32 kills Chromium (needs ~100 threads)
- This is a systemd config issue, not a code bug
- Short-term fix: TasksMax=512 (ops). Long-term: no-browser XHR path

### MCP Push Failures (NOT crawl problems)
- vps-prices: 38 consecutive "cannot reach MCP server" — upstream healthy, MCP side broken
- vn-news-rss: push 404 on /api/push-news — route changed on MCP server

### VPS Architecture
- 5 services all shell-based (bash + curl + python3 inline)
- vps-proxy-server.js (Node.js) serves port 8765 — /bctc-files/ static, /proxy/ssc-iboard (dead domain)
- systemd units all have TasksMax=32, MemoryMax=128-256M
- Shared: vps-lib.sh for logging, log rotation at 10MB

### 2026 Anti-Bot Research Findings
- curl_cffi >= 0.7 is the 2026 standard for TLS bypass — JA4+ fingerprint emits exact Chrome profile
- cloudscraper is largely ineffective against CF v3+/Turnstile as of 2026 (still works for v1/v2 only)
- httpx alone does NOT improve TLS fingerprint over requests
- VPS RAM budget: curl_cffi uses 5–15 MB/req vs 300–500 MB for Chromium (30–100x lighter)
- No current VN source requires TLS bypass — all 5 sources are open APIs or RSS feeds

---

## Lessons Learned

- HNX endpoint requires pAction=1 — without it, server silently falls back to homepage render
- pNhomTin value must wrap content in single quotes: "'FIN_REPORT'" not "FIN_REPORT"
- HNX pagination is newest-first on page 1; server-side date filter works reliably
- HOSE tickers are NOT on HNX endpoint — routing logic in scraper must check exchange before probing
- VPS TasksMax=32 is a hard ceiling for any multi-threaded process (Chromium, Java, etc.)
- VPS RAM ~1GB: Playwright/Chromium is risky even with TasksMax raised
- cloudscraper (2026): document it but warn it is obsolete for CF v3+
- curl_cffi is the right upgrade path for any future TLS-checked VN source
- HNX Referer /vi-vn/ prefix: server added language redirect 2026-05-13, all Referer headers must use new path
- HNX pNhomTin: FIN_REPORT wrapper removed from contract — empty string works correctly
- HNX ticker slugs: response uses ticker+listingcode slug (e.g. shb125017) — always startswith(), never equality
- Homepage fallback is a silent failure mode — always guard with (size>30KB AND Trang chu) before parsing
