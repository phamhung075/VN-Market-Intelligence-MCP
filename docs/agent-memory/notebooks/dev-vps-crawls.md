# dev-vps-crawls — Notebook

**Last updated:** 2026-05-13 | **Sprint:** bootstrap

---

## Identity

Agent: VPS Crawler Developer
Role: Lightweight HTTP scraper implementation on Vinahost VPS
Zone: dev-zone (VPS scraper code)

---

## Active Scrapers

| Source | Script | Technique | Status | Last verified |
|--------|--------|-----------|--------|--------------|
| vps-prices | /root/fetch-prices.sh | plain-requests-open-api | healthy upstream, MCP push failing | 2026-05-13 |
| cafef-index | /root/fetch-prices.sh (Step 3) | plain-requests-open-api | healthy | 2026-05-13 |
| sbv-rates | /root/fetch-sbv.sh | plain-requests-open-api | healthy end-to-end | 2026-05-13 |
| vn-news-rss | /root/fetch-vn-news.sh | ua-rotation-rss | healthy upstream, MCP push 404 | 2026-05-13 |
| vn-foreign-flow | /root/fetch-foreign-flow.sh | plain-requests-open-api | healthy (embedded in vps-prices data) | 2026-05-13 |
| hsx-bctc (HNX/UPCOM) | /root/discover-bctc-urls-browser.py | hnx-ajax-post | endpoint works for HNX tickers with pAction=1 | 2026-05-13 |
| hsx-bctc (HOSE/SSC) | /root/discover-bctc-urls-browser.py | ssc-playwright-download | FAILING: TasksMax=32 kills Chromium | 2026-05-13 |

---

## Technique Registry

| Technique | Doc | First used for | Notes |
|-----------|-----|---------------|-------|
| plain-requests-open-api | docs/vps-crawl-techniques/plain-requests-open-api.md | vps-prices, cafef-index, sbv-rates | Lightest path. 3 sources. No bypass needed. |
| ua-rotation-rss | docs/vps-crawl-techniques/ua-rotation-rss.md | vn-news-rss | 5-UA pool, 3 retries, human delay. 14 RSS sources. |
| hnx-ajax-post | docs/vps-crawl-techniques/hnx-ajax-post.md | hsx-bctc | SSL CERT_NONE + pAction=1 required. HNX/UPCOM tickers only. |
| ssc-playwright-download | docs/vps-crawl-techniques/ssc-playwright-download.md | hsx-bctc (HOSE) | Playwright, currently failing TasksMax. Document-only for now. |

---

## Implementation History

| Date | Source | Technique | Outcome |
|------|--------|-----------|---------|
| 2026-05-13 | all 5 sources | reverse-documentation | Bootstrap catalog complete. 4 technique docs written. |
| 2026-05-13 | hsx-bctc | live probe + triage | HNX endpoint confirmed working for HNX tickers; HOSE path blocked; triage doc at docs/vps-sources/hsx-bctc/triage.md |

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

---

## Lessons Learned

- HNX endpoint requires pAction=1 — without it, server silently falls back to homepage render
- pNhomTin value must wrap content in single quotes: "'FIN_REPORT'" not "FIN_REPORT"
- HNX pagination is newest-first on page 1; server-side date filter works reliably
- HOSE tickers are NOT on HNX endpoint — routing logic in scraper must check exchange before probing
- VPS TasksMax=32 is a hard ceiling for any multi-threaded process (Chromium, Java, etc.)
- VPS RAM ~1GB: Playwright/Chromium is risky even with TasksMax raised
