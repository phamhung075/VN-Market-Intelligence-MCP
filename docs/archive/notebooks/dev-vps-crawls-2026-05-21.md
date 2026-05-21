# dev-vps-crawls — Archive (pre-trim)
Archived from 157-line notebook 2026-05-21.

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
