# dev-vps-crawls — Notebook

**Last updated:** 2026-07-31T08:51Z | **Sprint:** BCTC-EXTRACT-QUALITY

> Archive: docs/archive/notebooks/dev-vps-crawls-2026-05-21.md (pre-trim history)

---

## Active Scrapers

| Source | Script | Technique | Status | Last verified |
|--------|--------|-----------|--------|--------------|
| vietstock-board-details | /root/vietstock-board-details.py | aspnet-csrf-double-submit | OPERATIONAL — FPT/VCB/VNM chairmen confirmed. FPT 1988, VCB 2021, VNM 2022. N/A→null verified. Endpoint: VPS:8765/proxy/board-details | 2026-06-04 |
| vietstock-agm-plan | /root/vietstock-agm-plan.py | aspnet-csrf-double-submit | OPERATIONAL — FPT 10 plan + 63 actual rows. VIC/ACB/NVL confirmed. Endpoint: VPS:8765/proxy/agm-plan | 2026-06-04 |
| vps-prices | /root/fetch-prices.sh | plain-requests-open-api | healthy end-to-end (112 items 200 OK) | 2026-05-13 |
| cafef-index | /root/fetch-prices.sh (Step 3) | plain-requests-open-api | healthy | 2026-05-13 |
| sbv-rates | /root/fetch-sbv.sh | plain-requests-open-api | healthy end-to-end | 2026-05-13 |
| vn-news-rss | /root/fetch-vn-news.sh | ua-rotation-rss | FIXED 2026-06-01 — is_blocked() false-positive on "robot" → cafef/vnexpress/tuoitre/nhandan restored. cafef-market: 20 items, cafef-biz: 20 items (was 0 since 2026-04-22). | 2026-06-01 |
| article-body | /root/article-body-fetcher.py | plain-requests-open-api | NEW 2026-06-01 — cafef.vn + vneconomy.vn article body fetch. Endpoint: VPS:8765/proxy/article-body?url=. cafef 5000ch 200 OK, vneco 5000ch 200 OK. | 2026-06-01 |
| vn-foreign-flow | /root/fetch-foreign-flow.sh | plain-requests-open-api | FIXED 2026-05-30 — field drift: fBuyVol→fBVol, fSellVol→fSVolume. FPT fBVol=110629 fSVolume=148534 confirmed. 103 items pushed 200 OK. | 2026-05-30 |
| hsx-bctc (HNX/UPCOM) | /root/discover-bctc-urls-browser.py | hnx-ajax-post | OPERATIONAL — Q1/2026 BCTC flowing. SHB e2e PASS. Filename-based cover-letter reject added 2026-07-31 (code-only, deploy pending). | 2026-05-13T09:30Z |
| hsx-bctc (HOSE/SSC) | /root/discover-bctc-urls-browser.py | ssc-curl-adf (FIX-VPS-SSC-CURL-SCRAPER) | OPERATIONAL — GAS Q1/2026 confirmed 17.6 MB PDF, 15 rows parsed, no Playwright. | 2026-06-06 |

---

## Technique Registry

| Technique | Doc | First used for | RAM/req | Notes |
|-----------|-----|---------------|---------|-------|
| aspnet-csrf-double-submit | docs/vps-crawl-techniques/aspnet-csrf-double-submit.md | vietstock-agm-plan | 3–8 MB | Stdlib urllib only. Session warmup + CSRF token parse (unquoted minified HTML). Gzip safety-net. |
| plain-requests-open-api | docs/vps-crawl-techniques/plain-requests-open-api.md | vps-prices, cafef-index, sbv-rates | 3–8 MB | Lightest path. 3 sources. No bypass needed. |
| ua-rotation-rss | docs/vps-crawl-techniques/ua-rotation-rss.md | vn-news-rss | 3–8 MB | 5-UA pool, 3 retries, human delay. 14 RSS sources. |
| hnx-ajax-post | docs/vps-crawl-techniques/hnx-ajax-post.md | hsx-bctc | 5–10 MB | SSL CERT_NONE + pAction=1 required. HNX/UPCOM tickers only. |
| ssc-curl-adf | docs/vps-crawl-techniques/ssc-playwright-download.md (superseded) | hsx-bctc (HOSE) | 5–15 MB | urllib + CookieJar. 3-step Oracle ADF: loopback GET → ADF page → PPR search → full-form download. No chromium. |
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
| 2026-07-31T08:51Z | hsx-bctc (HNX/UPCOM) | filename-based-cover-letter-filter | FU-CTG-DISCOVERY-FILENAME-FILTER — added `is_cover_letter_filename()` + wired into `_fetch_pdf_url()`: rejects ArticlesFileAttach hrefs whose filename contains cv_cbtt/cong_van_cbtt even when the article TITLE passed (title-only filter, FIX-CTG-2, could not catch this). 15 new tests, 57/57 suite PASS. Code-only, deploy pending (user-gated). |
| 2026-06-06T17:30Z | hsx-bctc (HOSE/SSC) | ssc-curl-adf | FIX-VPS-SSC-CURL-SCRAPER DONE — replaced _ssc_newsearch_playwright() (chromium/async) with sync discover_from_ssc_curl(). 3-step Oracle ADF HTTP recipe. GAS Q1/2026: 17.6 MB PDF, 15 rows parsed. No playwright/asyncio. Root-fixes pthread_create EAGAIN crash. |
| 2026-06-04T17:45Z | vietstock-board-details | aspnet-csrf-double-submit | FIX-I-A DONE — 4 new files committed (5bca5280). vn-board-details.service active. /proxy/board-details live HTTP 200. FPT=1988, VCB=2021, VNM=2022. N/A→null confirmed. Blocks FIX-I-B. |
| 2026-06-01T09:10Z | vn-news-rss + article-body | is_blocked-fix + plain-requests-open-api | VPS-NEWS-CAFEF-VNECO DONE — P1: fixed is_blocked() false-positive. cafef 0→20 items. P2: article-body-fetcher.py + /proxy/article-body. cafef 5000ch OK. |
| 2026-05-30T11:50Z | vn-foreign-flow | field-drift-fix | FF-DIAG DONE — root cause: API uses fBVol/fSVolume, script defaulted to fBuyVol/fSellVol (nonexistent → jq→0). All pushes had foreignBuyVol=0/foreignSellVol=0, get_foreign_flow returned "never collected" fleet-wide. Fix: correct defaults in fetch-foreign-flow.sh + run-foreign-flow-debug.sh. Also fixed LOG_ROTATE_BYTES fallback bug (unary operator stderr noise). Live proof: FPT fBVol=110629 fSVolume=148534, HPG fBVol=204669 fSVolume=279789, 103 items HTTP 200. Service restarted armed for Mon 02:00 UTC. Commit 0cbce0b4. |
| 2026-05-19T07:15Z | discover-bctc-urls-browser.py | pattern-fix + repo-sync | 1953a DONE — zero-padded quý 01..04 patterns added to matches_quarter_and_year(). fetch-bctc.sh jq guard added. ACB Q1/2026 SUCCESS HTTP 200. Script committed to repo as vps-scripts/discover-bctc-urls-browser.py. deploy-vinahost.sh extended. Commit d946699b. |
| 2026-05-18T06:00Z | vps-proxy-server.js | envelope-shape-fix | 1944a-vps DONE — `/proxy/bctc-discover/:ticker` now returns `{results:[{url,source,confidence}],error:null}` envelope. Deployed SCP + systemctl restart. Health 200 OK. 401 without key. Shape confirmed via curl (results=[] acceptable — script runs ~120s). |
| 2026-05-19T07:15Z | discover-bctc-urls-browser.py | pattern-fix | 1953a — zero-padded quý 01..04. ACB Q1/2026 OK. Commit d946699b. |
| 2026-05-13 | all 5 sources | bootstrap | Catalog + 4 technique docs. HNX endpoint confirmed. |

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

## Cycle Record — 2026-07-31T08:51Z FU-CTG-DISCOVERY-FILENAME-FILTER REVIEW (code-only, deploy pending)

Task: FU-CTG-DISCOVERY-FILENAME-FILTER (FIX, P3/S, sprint BCTC-EXTRACT-QUALITY). Router manually routed (zone "vps-scripts + apps/mcp-server" not in system-map.json; commit-history-confirmed ownership).

Root cause: HNX article 613699 has a NON-cover-letter title ("Bao cao tai chinh quy 1/2026") — FIX-CTG-2's `is_cover_letter_title()` correctly lets it through — but its ArticlesFileAttach-resolved PDF is CV_CBTT_BCTC_Quy_I.2026_VI.pdf, the cover letter itself. Title-based discrimination cannot see the resolved attachment's filename.

Fix: vps-scripts/discover-bctc-urls-browser.py — added `is_cover_letter_filename(url)` (checks final path segment, case-insensitive, after query-strip + URL-decode, for `cv_cbtt`/`cong_van_cbtt`) and wired it into `_fetch_pdf_url()`'s href loop: a matching attachment is skipped (same disposition as the title filter) and scanning continues over remaining hrefs from that ArticlesFileAttach response for a real statement PDF.

Tests: new vps-scripts/test_discover_bctc_filename_classifier.py — 15 cases (real CTG filename repro, case variants, query-string/URL-encoding robustness, multi-attachment skip-then-select-real-statement, sole-cover-letter-attachment→None, no-marker unchanged, empty-hrefs→None). Full local suite 57/57 PASS (35 pre-existing title-classifier + 7 SSC-fastfail + 15 new). py_compile clean.

Scope: fix fully contained inside `_fetch_pdf_url()` in vps-scripts/discover-bctc-urls-browser.py. No apps/mcp-server fetch-pipeline change needed for THIS defect — confirmed per router's ask before returning (the backlog row's broader "apps/mcp-server" zone note covers sibling FUs FU-BACKFILL-REAL-FILENAMES / FU-BACKFILL-MULTIPLE-COVER-LETTERS, not this one).

Deploy: NOT performed — code-only fix in repo; VPS swap/deploy is user-gated per standing policy (same disposition as B-05-FU-SSC-503-RETRY above).

DJ-GATE: docs/agent-memory/decisions/sprint-BCTC-EXTRACT-QUALITY-dev-vps-crawls.md
