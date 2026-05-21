# dev-vps-crawls — Notebook

**Last updated:** 2026-05-19T07:15Z | **Sprint:** 1953a

> Archive: docs/archive/notebooks/dev-vps-crawls-2026-05-21.md (pre-trim history)

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
| hsx-bctc (HOSE/SSC) | /root/discover-bctc-urls-browser.py | ssc-playwright-download | OPERATIONAL — Q1/2026 BCTC flowing. ACB Q1 PASS (1953a pattern fix). | 2026-05-19 |

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
| 2026-05-19T07:15Z | discover-bctc-urls-browser.py | pattern-fix + repo-sync | 1953a DONE — zero-padded quý 01..04 patterns added to matches_quarter_and_year(). fetch-bctc.sh jq guard added. ACB Q1/2026 SUCCESS HTTP 200. Script committed to repo as vps-scripts/discover-bctc-urls-browser.py. deploy-vinahost.sh extended. Commit d946699b. |
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

## Key Findings — 2026-05-19T07:15Z Sprint 1953a Pattern Fix

### SSC Zero-Padded Quarter Format
- SSC NewsSearch returns titles in format "quý 01 năm 2026" (zero-padded month, e.g. 01, 02, 03, 04)
- Old matches_quarter_and_year() only had "quý 1" — no leading zero — so ALL Q1/2026 matches failed
- Fix: added q0 = q.zfill(2) and full set of zero-padded patterns alongside existing ones
- Tested: ACB Q1/2026 — row 0 "Báo cáo tài chính Hợp nhất quý 01 năm 2026" now matches
- PDF confirmed: 8,061,984 bytes, pushed HTTP 200

### fetch-bctc.sh jq Parse Error (Fix B)
- Cause: if QUEUE API returns malformed JSON, `echo "$QUEUE" | jq -c '.queue[]'` exits with parse error
- set -euo pipefail causes script to exit silently — no log line written
- Fix: validate JSON with `jq -e '.queue'` before the while loop
- Now logs "FAIL: queue response is not valid JSON" if API returns bad response

### Repo Sync (1953d collapsed into 1953a)
- discover-bctc-urls-browser.py was VPS-only before this sprint
- Now in vps-scripts/discover-bctc-urls-browser.py — tracked in repo
- deploy-vinahost.sh section 2 now scp's it to /root/ on next deploy

---

## Key Findings — 2026-05-13T09:30Z Contract Fix

### HNX Contract Changes Applied
- Referer MUST include `/vi-vn/` language prefix — server 302s without it (change detected 2026-05-13)
- `pNhomTin` MUST be empty string — `'FIN_REPORT'` wrapper no longer works (contract changed)
- Ticker slugs in SYMBOL hrefs are `ticker+listingcode` (e.g. `shb125017`) — must use `startswith()` not equality
- Homepage fallback guard added: `len(body) > 30_000 AND "Trang chủ" in body` → RuntimeError
- SHB Q1/2026: PASS — PDF URL `https://owa.hnx.vn/ftp///cims/2026/4_W5/...Q1_2026.pdf`
- ArticlesFileAttach CAN article 615286: 4 Q1/2026 PDFs confirmed
