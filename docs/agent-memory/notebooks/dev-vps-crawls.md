# dev-vps-crawls — Notebook

**Last updated:** 2026-06-04T12:30Z | **Sprint:** RAPID-DATA-LAYER / FIX-G-1

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
| vietstock-agm-plan | /root/vietstock-agm-plan.py | aspnet-csrf-double-submit | OPERATIONAL — FPT 10 plan + 63 actual rows. VIC/ACB/NVL confirmed. Endpoint: VPS:8765/proxy/agm-plan | 2026-06-04 |
| vps-prices | /root/fetch-prices.sh | plain-requests-open-api | healthy end-to-end (112 items 200 OK) | 2026-05-13 |
| cafef-index | /root/fetch-prices.sh (Step 3) | plain-requests-open-api | healthy | 2026-05-13 |
| sbv-rates | /root/fetch-sbv.sh | plain-requests-open-api | healthy end-to-end | 2026-05-13 |
| vn-news-rss | /root/fetch-vn-news.sh | ua-rotation-rss | FIXED 2026-06-01 — is_blocked() false-positive on "robot" → cafef/vnexpress/tuoitre/nhandan restored. cafef-market: 20 items, cafef-biz: 20 items (was 0 since 2026-04-22). | 2026-06-01 |
| article-body | /root/article-body-fetcher.py | plain-requests-open-api | NEW 2026-06-01 — cafef.vn + vneconomy.vn article body fetch. Endpoint: VPS:8765/proxy/article-body?url=. cafef 5000ch 200 OK, vneco 5000ch 200 OK. | 2026-06-01 |
| vn-foreign-flow | /root/fetch-foreign-flow.sh | plain-requests-open-api | FIXED 2026-05-30 — field drift: fBuyVol→fBVol, fSellVol→fSVolume. FPT fBVol=110629 fSVolume=148534 confirmed. 103 items pushed 200 OK. | 2026-05-30 |
| hsx-bctc (HNX/UPCOM) | /root/discover-bctc-urls-browser.py | hnx-ajax-post | OPERATIONAL — Q1/2026 BCTC flowing. SHB e2e PASS. | 2026-05-13T09:30Z |
| hsx-bctc (HOSE/SSC) | /root/discover-bctc-urls-browser.py | ssc-playwright-download | OPERATIONAL — Q1/2026 BCTC flowing. ACB Q1 PASS (1953a pattern fix). | 2026-05-19 |

---

## Technique Registry

| Technique | Doc | First used for | RAM/req | Notes |
|-----------|-----|---------------|---------|-------|
| aspnet-csrf-double-submit | docs/vps-crawl-techniques/aspnet-csrf-double-submit.md | vietstock-agm-plan | 3–8 MB | Stdlib urllib only. Session warmup + CSRF token parse (unquoted minified HTML). Gzip safety-net. |
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
| 2026-06-01T09:10Z | vn-news-rss + article-body | is_blocked-fix + plain-requests-open-api | VPS-NEWS-CAFEF-VNECO DONE — P1: fixed is_blocked() false-positive on "robot" keyword; cafef-market/cafef-biz/vnexpress/tuoitre/nhandan PERMANENTLY_BLOCKED → all restored (cafef 0→20 items each). P2: article-body-fetcher.py + /proxy/article-body endpoint deployed; cafef 5000ch OK + vneconomy 5000ch OK. Also fixed LOG_ROTATE_BYTES unset bug (vn-news-rss had same pattern as ff-diag fix). |
| 2026-05-30T11:50Z | vn-foreign-flow | field-drift-fix | FF-DIAG DONE — root cause: API uses fBVol/fSVolume, script defaulted to fBuyVol/fSellVol (nonexistent → jq→0). All pushes had foreignBuyVol=0/foreignSellVol=0, get_foreign_flow returned "never collected" fleet-wide. Fix: correct defaults in fetch-foreign-flow.sh + run-foreign-flow-debug.sh. Also fixed LOG_ROTATE_BYTES fallback bug (unary operator stderr noise). Live proof: FPT fBVol=110629 fSVolume=148534, HPG fBVol=204669 fSVolume=279789, 103 items HTTP 200. Service restarted armed for Mon 02:00 UTC. Commit 0cbce0b4. |
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

## Key Findings — 2026-06-01T09:10Z VPS-NEWS-CAFEF-VNECO

### is_blocked() False-Positive on "robot" (P1 — production data loss since 2026-04-22)
- Root cause: `grep -qi "robot"` on the full RSS response body matched legitimate Vietnamese article titles ("robot hình người" = humanoid robot) — triggered on cafef, vnexpress, tuoitre, nhandan
- Impact: cafef-market and cafef-biz stuck at 0 items every cycle for ~40 days; vnexpress/tuoitre/nhandan intermittently 0
- Fix: replaced the bare keyword grep with anchored CF challenge-page structural patterns: `just a moment...`, `checking your browser`, `cf-browser-verification`, `challenge-platform`, `_cf_chl_`, `<title>.*captcha`
- Also fixed LOG_ROTATE_BYTES unset bug (same pattern as FF-DIAG fix — vps-lib.sh lacks the constant, grep returns empty, unary operator expected in -gt)
- Evidence: cafef-market 0→20 items, cafef-biz 0→20 items, vnexpress 0→20 items, tuoitre 0→20 items, nhandan 0→20+10 items in first post-fix cycle (2026-06-01T08:58Z)
- Repo copy: `vps-scripts/fetch-vn-news.sh` updated to match VPS

### Article Body Fetch Endpoint (P2 — new capability)
- Implemented: `/root/article-body-fetcher.py` — HTTP-only, requests library, BeautifulSoup optional
- Extractors: cafef.vn (div[data-role=content] or div#mainContent) + vneconomy.vn (div.text-justify)
- Endpoint: `GET VPS:8765/proxy/article-body?url=<https-url>` (X-API-Key required)
- Whitelist: cafef.vn and vneconomy.vn only (open-proxy guard in both script and server)
- No anti-bot needed — both sites return 200 from VPS with browser UA
- Integration note: wiring to /api/push-news is NOT done (would change push payload schema); endpoint is available for on-demand pull by MCP server or new enrichment job — flagged as follow-up
- Evidence: cafef title "SACOMBANK chính thức đổi tên...", body 5000ch, published_at 2026-06-01T15:12:00; vneconomy title "Ngân hàng Nhà nước và Bộ Tài chính Mỹ...", body 5000ch

## Key Findings — 2026-05-30T11:50Z FF-DIAG Field Drift Fix

### Foreign Flow Field Name Drift (bgapidatafeed.vps.com.vn)
- API fields: `fBVol` (buy vol), `fSVolume` (sell vol), `fRoom` (remaining room)
- Script was defaulting to `fBuyVol` / `fSellVol` — NEITHER exists in the API
- jq `(.["fBuyVol"] // 0)` resolves to 0 for absent keys → all items pushed with foreignBuyVol=0, foreignSellVol=0
- Handler's `foreign_volume = buyVol - sellVol = 0 - 0 = 0` → DB rows written but with zero volume
- `get_foreign_flow` zero-detection guard fires (`history.every(r => r.foreignVolume === 0)`) → "never collected" for every ticker
- fRoom was correct (field name unchanged) — that's why 102–103 items passed the jq filter (fRoom > 0)
- Fix: `FBUY_FIELD` default `fBuyVol`→`fBVol`, `FSELL_FIELD` default `fSellVol`→`fSVolume`
- Also fixed: LOG_ROTATE_BYTES one-liner left var empty when vps-lib.sh lacks the constant → "unary operator expected" stderr every run

### LOG_ROTATE_BYTES Bug
- Old: `[ -f /root/vps-lib.sh ] && LOG_ROTATE_BYTES=$(grep '^LOG_ROTATE_BYTES=' /root/vps-lib.sh | cut -d= -f2) || LOG_ROTATE_BYTES=10485760`
- vps-lib.sh does NOT define `LOG_ROTATE_BYTES=` at top level → grep returns empty → `$LOG_ROTATE_BYTES` is empty string
- `[ "$LOG_SIZE" -gt $LOG_ROTATE_BYTES ]` = `[ 8306911 -gt ]` → bash: unary operator expected
- Fix: set default first, then conditionally override if vps-lib.sh provides a value

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

## Key Findings — 2026-06-03T00:00Z FIX-CTG-2 Cover-Letter Discrimination

### Defect A: HNX portal returns cover-letter PDF instead of full B02-TCTD statement
- Root cause: `_parse_article_ids_and_titles` returned FIRST quarter/year match regardless of document type.
  Cover-letter titles ("CV CBTT BCTC Quy 1.2026") pass `matches_quarter_and_year` → wrong 524 KB PDF selected.
- Fix: added `is_cover_letter_title()` / `is_full_statement_title()` / `_title_rank()` classifier block.
  Cover-letter keywords: "cv cbtt", "cong van cbtt", "công văn cbtt", "công văn công bố thông tin",
  "cbtt link bctc", "cbtt kem link". NOTE: "giai trinh" excluded — real CTG filenames contain
  "va giai trinh bien dong loi nhuan" as a sub-clause (not a cover-letter signal).
- `_parse_article_ids_and_titles` now collects ALL matching candidates on a page, skips cover letters,
  ranks remaining by: 0=consolidated-full-statement > 1=full-statement > 2=generic, returns best.
- 25/25 unit tests pass: `vps-scripts/test_discover_bctc_title_classifier.py`
- NEEDS OPS-VPS DEPLOY: commit is repo-only. No SSH executed. Deploy = scp updated script to VPS +
  confirm next CTG discovery run returns BCTC hop nhat URL (not owa.hnx.vn cover letter).
- HOSE-listed tickers (CTG) should ideally resolve via hsx.vn Strategy-0 (FIX-CTG-1, DONE-LIVE-VERIFIED).
  This fix is defence-in-depth for the HNX-portal fallback path used by HNX/UPCOM-listed tickers.
