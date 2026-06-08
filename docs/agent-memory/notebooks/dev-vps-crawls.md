# dev-vps-crawls — Notebook

**Last updated:** 2026-06-08T13:52Z | **Sprint:** DEEPFETCH-RAG-REDESIGN DFR-P2-VPS

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
| vietstock-board-details | /root/vietstock-board-details.py | aspnet-csrf-double-submit | OPERATIONAL — FPT/VCB/VNM chairmen confirmed. FPT 1988, VCB 2021, VNM 2022. N/A→null verified. Endpoint: VPS:8765/proxy/board-details | 2026-06-04 |
| vietstock-agm-plan | /root/vietstock-agm-plan.py | aspnet-csrf-double-submit | OPERATIONAL — FPT 10 plan + 63 actual rows. VIC/ACB/NVL confirmed. Endpoint: VPS:8765/proxy/agm-plan | 2026-06-04 |
| vps-prices | /root/fetch-prices.sh | plain-requests-open-api | healthy end-to-end (112 items 200 OK) | 2026-05-13 |
| cafef-index | /root/fetch-prices.sh (Step 3) | plain-requests-open-api | healthy | 2026-05-13 |
| sbv-rates | /root/fetch-sbv.sh | plain-requests-open-api | healthy end-to-end | 2026-05-13 |
| vn-news-rss | /root/fetch-vn-news.sh | ua-rotation-rss | FIXED 2026-06-01 — is_blocked() false-positive on "robot" → cafef/vnexpress/tuoitre/nhandan restored. cafef-market: 20 items, cafef-biz: 20 items (was 0 since 2026-04-22). | 2026-06-01 |
| article-body | /root/article-body-fetcher.py | plain-requests-open-api | NEW 2026-06-01 — cafef.vn + vneconomy.vn article body fetch. Endpoint: VPS:8765/proxy/article-body?url=. cafef 5000ch 200 OK, vneco 5000ch 200 OK. | 2026-06-01 |
| vn-foreign-flow | /root/fetch-foreign-flow.sh | plain-requests-open-api | FIXED 2026-05-30 — field drift: fBuyVol→fBVol, fSellVol→fSVolume. FPT fBVol=110629 fSVolume=148534 confirmed. 103 items pushed 200 OK. | 2026-05-30 |
| hsx-bctc (HNX/UPCOM) | /root/discover-bctc-urls-browser.py | hnx-ajax-post | OPERATIONAL — Q1/2026 BCTC flowing. SHB e2e PASS. | 2026-05-13T09:30Z |
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

## Key Findings — 2026-06-01T13:45Z VPS-DEPLOY-PLACEHOLDER-GUARD

### GUARD-2: All 6 vps-scripts converted to ${VAR:-default} env-fallback form
- Root cause: 6 scripts had bare `API_URL="__MCP_BASE__/..."` — deploy bypass (scp without render) → literal placeholder reaches curl → http=000 → silent outage
- Fix: convert to `${ENV_VAR:-__MCP_BASE__/path}` mirroring fetch-foreign-flow.sh L32-34
- TE_API_KEY special case: empty-string fallback `${TRADING_ECONOMICS_API_KEY:-}` per Option A (no sed rule in deployer; existing L15-17 guard handles empty correctly)
- fetch-vn-news.sh extra fix: internal curl-response markers `__HTTP__` / `__heartbeat__` renamed to `_HTTP_` / `_heartbeat_` (single underscores) to avoid GUARD-1 regex false-block
- All 6 files: bash -n OK. Clean-render (sed substitution): no placeholder leaks confirmed locally.

### GUARD-1: Pre-scp assert + post-deploy SSH verify in deploy-vps-proxy.sh
- 5 pre-scp assert blocks added (one after each TMP render: TMP_FETCH, TMP_BCTC, TMP_NEWS, TMP_SBV, TMP_FF)
- Regex: `__[A-Za-z][A-Za-z0-9_]*__` (mixed-case, future-proof)
- Post-deploy VERIFYEOF heredoc: `grep -rl '...' /root/fetch-*.sh /root/*.py` glob — fires if any deployed artifact holds a placeholder
- Deliberate-violation local proof: inject `__GUARD_TEST_TOKEN__` into fixture, sed render, assert → exit 1 confirmed BEFORE any scp step

### GUARD-3: article-body-fetcher.py brought under canonical deployer
- Direct scp block (no sed — zero placeholders in file)
- SSH ARTEOF heredoc: chmod +x + idempotent pip3 install beautifulsoup4
- Closes cafef ad-hoc-scp bypass

Commit: 96446b5d. No Docker rebuild required.

---

---

## Cycle Record — 2026-06-04T12:30Z FIX-G-1 DONE

Task: RAPID-DATA-LAYER FIX-G-1 — build HTTP-only AGM plan fetcher.
Outcome: DONE. Commit 2d0c38b8.

New files committed:
- vps-scripts/vietstock-agm-plan.py (was already in repo; Python scraper)
- vps-scripts/fetch-agm-plan.sh (one-shot fetcher — calls Python, writes file drop + push)
- vps-scripts/fetch-agm-plan-loop.sh (daily loop driver, runs under systemd)
- vps-scripts/vn-agm-plan.service (systemd unit, enabled + active)

VPS state:
- /root/vietstock-agm-plan.py deployed, /root/fetch-agm-plan.sh + /root/fetch-agm-plan-loop.sh deployed
- vn-agm-plan.service: active (running) since 2026-06-04 19:21:21 +07
- /root/data/agm-plan-latest.json: 349173 bytes, fetched_at=2026-06-04T12:21:31Z
- VPS:8765/proxy/agm-plan?ticker=FPT: HTTP 200 OK, live

Live fetched values (batch run all 33 watchlist tickers — ok=33, fallback=0, error=0):
- FPT 2026: Revenue=58580 tỷ, PBT=11629 tỷ
- VIC 2026: Revenue=485000 tỷ, PAT=35000 tỷ
- VCB/BID/SHB (banks): 0 revenue plan rows (correct), PBT/PAT only
- ACB 2026 (separate run): PBT=22338 tỷ, PAT=17870 tỷ, 0 revenue plan (correct bank behavior)

Data contract for FIX-G-2:
- File drop: /root/data/agm-plan-latest.json (atomic mv; JSON shape in fetch-agm-plan.sh header)
- Push: POST /api/push-agm-plan (returns 404 until FIX-G-2 deploys — logged non-fatal)
- On-demand pull: VPS:8765/proxy/agm-plan?ticker=X (live in vps-proxy-server.js)
- value_ty = value_raw / 1e9 (tỷ đồng); filter PTName not PTID (PTID drifts: FPT uses ptid=5, ptid=8)

---

## Cycle Record — 2026-06-06T17:30Z FIX-VPS-SSC-CURL-SCRAPER DONE

Task: FIX-VPS-SSC-CURL-SCRAPER — replace `_ssc_newsearch_playwright()` with sync `discover_from_ssc_curl()`.
Outcome: DONE. Root-fixes pthread_create EAGAIN crash (rtr-bctc-playwright-thread-202606061545).

Changes committed to vps-scripts/discover-bctc-urls-browser.py:
- DELETED: async `_ssc_newsearch_playwright()`, `import asyncio`, playwright import block (~200L removed)
- ADDED: sync `discover_from_ssc_curl()` — stdlib urllib only, 3-step Oracle ADF handshake
- ADDED: `_ssc_make_opener()`, `_ssc_get()`, `_ssc_post()`, `_ssc_get_jsessionid()`, `_ssc_parse_rows()`
- REWIRED: `discover_from_hose_ssc()`, `discover_from_ssc()`, `discover_bctc_pdf()` step-3 (all 3 call sites)
- No new pip dependencies — stdlib only (urllib, http.cookiejar, ssl, re)

Key debug finding: PPR response cells use `<span>` inside `<td>`. Closing delimiter must be `</td>` (not first `<`).
Row index extraction via `id="pt9:t1:{N}:c5"` works. Exchange mapping HOSE=1 confirmed.

Live proof (VPS GAS Q1/2026):
- 15 result rows parsed (DOM idx 15-29), 2 candidates rank=0 (consolidated) + rank=1
- Best: idx=16 "Công bố thông tin BCTC hợp nhất Quý 1 năm 2026"
- Download: 17,616,647 bytes, %PDF magic confirmed
- Cached: /root/bctc-cache/GAS/20260424-GAS-CBTT-BCTC-Hop-nhat-Quy-1-2026.pdf
- VPS proxy: http://125.212.251.27:8765/bctc-files/GAS/20260424-GAS-CBTT-BCTC-Hop-nhat-Quy-1-2026.pdf

---

## Cycle Record — 2026-06-08T16:30Z DEEPFETCH-RAG-REDESIGN DFR-Q1/Q2 DONE

Tasks: DFR-Q1 (vnexpress.vn feasibility) + DFR-Q2 (service topology + RAM headroom)
Outcome: DONE. Recon doc: docs/architecture-briefs/2026-06-08-dfr-q1-q2-recon.md

Q1 verdict: VIABLE. vnexpress.net returns 200 from VPS with plain requests (bare python-requests UA works). No Cloudflare challenge, no captcha gate. Article body in static HTML via `article.fck_detail` selector. Peak RAM: 1.94 MB/call. Page size: 50–260 KB raw. No anti-bot work needed.
Q2 verdict: EXTEND. /proxy/article-body endpoint already live in vps-proxy-server.js (VPS:8765). 2-file patch: add extract_vnexpress() to article-body-fetcher.py + add "vnexpress.net" to ARTICLE_BODY_ALLOWED_DOMAINS in vps-proxy-server.js. VPS available RAM: 469 MB (961 MB total, 0 swap). 20 MB worst-case spike (10 concurrent calls × 1.94 MB) fits within vn-vps-proxy 64 MB cap.

---

## Cycle Record — 2026-06-08T13:52Z DEEPFETCH-RAG-REDESIGN DFR-P2-VPS DONE

Task: DFR-P2-VPS — extend article-body-fetcher.py with vnexpress.net extractor + update allowlists + restart service.
Outcome: DONE-CODE. All 4 ACs pass. DJ-GATE-1 STEP recorded below.

Files changed:
- vps-scripts/article-body-fetcher.py — added "vnexpress.net" to ALLOWED_DOMAINS; added extract_vnexpress() using article.fck_detail selector + og:title + pubdate meta fallback; added "vnexpress.net" to referer_map; wired into dispatch block
- vps-scripts/vps-proxy-server.js — added "vnexpress.net" to ARTICLE_BODY_ALLOWED_DOMAINS (line 161)

Deploy: both files scp'd to /root/ on VPS 125.212.251.27; vn-vps-proxy.service restarted 20:51:04 +07 → active running.

Key debug finding: vnexpress.net uses name="pubdate" NOT property="article:published_time" for the publish time meta tag. The recon doc used article:published_time but that attribute did not match in BeautifulSoup. Added fallback: soup.find("meta", attrs={"name": "pubdate"}) after the property check. Fix redeployed before final AC verification.

DJ-GATE-1 STEP (task_id: DFR-P2-VPS, sprint: DEEPFETCH-RAG-REDESIGN):
- what-considered: "only path: extend existing vps-proxy-server.js (DFR-Q2 verdict) — no new systemd service needed"
- why-change: "no change from blueprint Zone 2 plan"
- technique: "plain-requests-open-api (existing) — no new anti-bot work required (DFR-Q1 confirmed bare requests returns 200)"
- deploy-status: vn-vps-proxy.service restarted + active (running) 2026-06-08T13:51:04+07 / 20:51:04+07; serving vnexpress.net live

AC verification (all PASS):
- AC-P2V-1 PASS: curl VPS:8765/proxy/article-body?url=vnexpress.net VN-Index article → 200 status:ok body_text=3407ch title="VN-Index giảm gần 50 điểm" published_at="2026-06-08T12:15:07+07:00"
- AC-P2V-2 PASS: vn-vps-proxy.service Memory peak=35.7M (cap=64.0M) — within RAM budget
- AC-P2V-3 PASS: evil.com → 400 {"error":"Domain not allowed","allowed":["cafef.vn","vneconomy.vn","vnexpress.net"]}
- AC-P2V-4 PASS: cafef.vn article → 200 status:ok body_text=2828ch (no regression)

Active scraper row updated: article-body now shows cafef.vn + vneconomy.vn + vnexpress.net.

---

## Key Findings — 2026-06-04T12:15Z RAPID-DATA-LAYER FIX-G Vietstock AGM Plan

### Scraper: vietstock-agm-plan.py — OPERATIONAL
- Source: finance.vietstock.vn — structured JSON API, no Cloudflare, no PDF needed
- Technique: aspnet-csrf-double-submit (stdlib urllib only, no pip install)
- Endpoints: GetData_PlannedTarget (plan) + GetData_PlannedTarget_ImplementStatus (actuals)
- Router: /proxy/agm-plan?ticker=X or ?batch=X,Y,Z added to vps-proxy-server.js
- Verified live: FPT 10 plan rows + 63 actuals; VIC/ACB/NVL all tickers_ok

### Critical Bugs Fixed During Implementation
1. CSRF unquoted attribute: Vietstock minified HTML has `value=TOKEN>` (no quotes). Fixed regex to handle `value=TOKEN[\s>]` (group 2 alternation) in addition to quoted form.
2. urllib gzip silent failure: If `Accept-Encoding: gzip` is included in headers, urllib receives compressed body but does NOT auto-decompress. `body.decode('utf-8')` returns garbage, CSRF extraction finds nothing. Fix: omit `Accept-Encoding` from both HTML and JSON headers. Added gzip safety-net (`\x1f\x8b` magic byte check → `gzip.decompress()`).

### Storage Shape for get_agm_plan MCP tool
VPS endpoint returns: `{ status, tickers_ok, tickers_fallback, tickers_error, data, fetched_at }`
`data.<TICKER>.planned[]` = `{ stock_code, ptid, pt_name, year, value_raw, value_ty }`
`data.<TICKER>.actuals[]` = `{ stock_code, year, report_term_id, report_norm_id, ptid, value_raw, value_ty }`
`value_ty` = value_raw / 1e9 (tỷ đồng). Plan-vs-actual deviation = `(actual - plan) / plan * 100`.

### Coverage
30 watchlist tickers expected; no fallback seen in FPT/VIC/ACB/NVL/SHB test set. PDF fallback path not needed (API covers all tested sectors: tech, conglomerate, bank, real estate).

---

