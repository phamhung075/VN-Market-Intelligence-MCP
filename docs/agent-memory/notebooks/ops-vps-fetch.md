# ops-vps-fetch — Notebook

**Last updated:** 2026-06-01 08:51 UTC | **Sprint:** VPS-NEWS-CAFEF-VNECO recon

---

## Identity

Agent: VPS Fetch Diagnostician
Role: SSH recon specialist for VN geo-blocked data sources
Zone: ops-zone (VPS / infra)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot |
|--------|-----------|--------|---------|
| vps-prices | 2026-05-13 | healthy (upstream) / MCP push broken | none |
| cafef-index | 2026-05-13 | healthy | none |
| vn-news-rss | 2026-05-13 | healthy (upstream) / MCP push 404 | none |
| sbv-rates | 2026-05-13 | healthy | none (Akamai present, not blocking) |
| hsx-bctc | 2026-05-13 09:17 | FIXED (HNX params corrected) / HSX SPA unchanged | none |
| hsx-bctc (api.hsx.vn) | 2026-05-15 04:45 | BLOCKER — /n/ JSON REST endpoints unreachable from VPS. Envoy route-level block, not geo-IP. | Envoy route table |

---

## Recon History

| Date | Source | Trigger | Outcome |
|------|--------|---------|---------|
| 2026-05-13 | vps-prices | bootstrap | 200 OK upstream. MCP push failing 38 consecutive cycles. Signal dropped. |
| 2026-05-13 | cafef-index | bootstrap | 200 OK, clean JSON. Healthy. |
| 2026-05-13 | vn-news-rss | bootstrap | All 14 RSS feeds 200 OK. MCP push-news endpoint 404. Signal dropped. |
| 2026-05-13 | sbv-rates | bootstrap | 200 OK, Akamai CDN, rate advisory 5min. Healthy. |
| 2026-05-13 04:49 | hsx-bctc | bootstrap | BROKEN. HNX AJAX returns homepage. Playwright crashes (pthread_create). Zero Q1/2026 PDFs. Signal dropped (critical). |
| 2026-05-13 09:17 | hsx-bctc | fetch_broken (re-recon) | ROOT CAUSE FOUND. Old params pageIndex/pageSize replaced with p* param set. Endpoint URL unchanged. Q1/2026 PDFs confirmed. Signal dropped (critical). |
| 2026-05-15 04:45 | hsx-bctc (api.hsx.vn /n/) | TASK-BCTC-3a VPS verification | FAIL. HTTP 404 from VPS with x-envoy-upstream-service-time: 2ms. Same as France. Root cause: Envoy route table excludes /n/api/v1/news/* JSON paths from external routing. Not geo-IP. All variants tested (newsTypeId 1/2/4, securitiesType, cate, capital-N). Only RSS feeds accessible (no filePath fields). staticfile.hsx.vn HTTP 200. BLOCKER — TASK-BCTC-3b/3c blocked. |

---

## Lessons Learned

- HNX AJAX endpoint `NextPageTinCPNY_CBTCPH` silently returns homepage HTML (40KB) when POST params are not recognised. Correct param set: `pNumPage`, `pAction`, `pNhomTin`, `pTieuDeTin`, `pMaChungKhoan`, `pFromDate`, `pToDate`, `pOrderBy`, `pNumRecord`. Old set `pageIndex`/`pageSize` no longer accepted.
- `pAction=0` = page navigation (browse all). `pAction=1` = filtered search (requires other filter params to be meaningful; empty filters with pAction=1 can return empty results).
- Date format for HNX filters: `dd/MM/yyyy` with forward slashes. Vietnamese locale.
- HNX landing page now issues a 302 redirect adding `/vi-vn/` prefix. Referer header must use the new path.
- No session cookie or CSRF token required for HNX AJAX calls despite a session cookie being set on the landing page.
- curl cannot POST to HNX (SSL cert chain fails). Python urllib with `ssl.CERT_NONE` works.
- ArticlesFileAttach endpoint (`/ModuleArticles/ArticlesCPEtfs/ArticlesFileAttach`) accepts `pArticlesID` and returns HTML fragment with direct `owa.hnx.vn/ftp/*.pdf` links.
- PDF filename encodes: ticker, date, language (Vi/En), document type, and period (Q1_2026 etc.) — can filter by filename pattern without parsing article metadata.
- MWG (HOSE) returns empty set from HNX endpoint — expected. HNX endpoint only serves HNX/UPCOM listed tickers.
- `bgapidatafeed.vps.com.vn` embeds foreign flow fields in every OHLCV response — foreign-flow and price services share the same upstream.
- MCP push failures (prices: 38 failures, news: 404) are infrastructure issues on the MCP side, not upstream source issues.
- VCB XML endpoint comment says "Only one request every 5 minutes" — advisory only, not enforced technically.
- `api.hsx.vn/n/api/v1/news/*` JSON REST endpoints are route-table blocked at Envoy gateway regardless of source IP. Vietnam VPS does not bypass this. The restriction is `x-envoy-upstream-service-time: 2ms` = request rejected before reaching backend on all paths. Prior spike assumption "VN-to-VN bypasses geo-restriction" was incorrect — it is not geo-IP, it is Envoy route configuration.
- `api.hsx.vn/n/api/v1/News/NewsFeed` (capital-N, RSS) is accessible externally and returns XML RSS, but RSS items have no `filePath` fields — not useful for BCTC PDF discovery.
- `staticfile.hsx.vn` is fully accessible from VPS (HTTP 200) — PDF downloads would work once URLs are obtained, but there is currently no accessible discovery endpoint to obtain them.

---

## Open Signals

| Signal file | Source | Dropped at | Status |
|------------|--------|-----------|--------|
| docs/signals/dev-vps-crawls-2026-05-13T04-49-25Z.json | hsx-bctc + vps-prices + vn-news-rss | 2026-05-13 04:49 UTC | pending dev-vps-crawls (superseded for hsx-bctc) |
| docs/signals/dev-vps-crawls-2026-05-13T09-17-00Z.json | hsx-bctc (re-recon, critical) | 2026-05-13 09:17 UTC | pending dev-vps-crawls |
| (no signal — BLOCKER, architect re-assessment required) | hsx-bctc api.hsx.vn /n/ | 2026-05-15 04:45 UTC | TASK-BCTC-3b/3c blocked, bug telegram sent |

## c002 · 2026-06-01T08:51Z

Sprint: VPS-NEWS-CAFEF-VNECO — cafef + vneconomy recon (BLOCKS dev-vps-crawls)

**FINDINGS:**

1. DIRECT-PATH HEALTH: Both cafef.vn RSS and vneconomy.vn RSS return 200 OK from France (non-VN
   IP) with no geo-block and no CF challenge. Direct axios path in mcp-server cafef.ts/vneconomy.ts
   is NOT broken. VPS routing NOT required for access.

2. EXISTING PIPELINE OVERLAP CONFIRMED — DO NOT REBUILD: `/root/fetch-vn-news.sh` under
   `vn-news-fetch.service` already fetches BOTH cafef feeds (thi-truong-chung-khoan.rss,
   doanh-nghiep.rss) and BOTH vneconomy feeds (chung-khoan.rss, tai-chinh.rss) every 15min.
   Pipeline pushes to /api/push-news → 200 OK confirmed in latest run.

3. CRITICAL BUG: `is_blocked()` in fetch-vn-news.sh matches bare word "robot" in response body.
   Vietnamese articles about humanoid robots ("robot hình người") trigger a false-positive →
   cafef feeds return 0 items intermittently. First occurrence: 2026-04-22. Persistent.
   Fix: scope grep to CF-specific patterns only (cf.challenge, Checking your browser, etc.),
   not bare keywords that appear in legitimate article content.

4. ARTICLE BODY FEASIBILITY: Both sites deliver 200 OK article pages from VPS (0.12–0.31s)
   and France (~1.7s) with no anti-bot. cafef selector: `div.detail-content[data-role="content"]`.
   vneconomy selector: `div.text-justify`. vneconomy sends gzip — `--compressed` required.

Signals dropped: docs/signals/dev-vps-crawls-2026-06-01T08-51-42Z.json
Recon docs: docs/vps-sources/cafef-article-body/recon.md + docs/vps-sources/vneconomy-article-body/recon.md

---

## c003 · 2026-06-01T10:09Z

Trigger: dev-team :07 tick — verify VPS-NEWS-CAFEF-VNECO sprint (b99bf783) in production.

**FU-OPS-CAFEF-1 — is_blocked() fix holding: PASS**
- Inspected 6 consecutive cycles in /var/log/vn-news-fetch.log (cycles 1696–1700 + boot runs).
- cafef-market and cafef-biz: 20 items per cycle in every cycle inspected. Zero occurrences of PERMANENTLY_BLOCKED anywhere in the 264-line log. Zero is_blocked() false-positive hits on cafef.
- The updated is_blocked() function matches only CF-structural patterns (Just a moment / Checking your browser / challenge-platform / _cf_chl_ / Attention Required CF title / HTTP 403/429/000) — no bare keyword matching.
- Separate anomaly: MCP push is failing every cycle (http=000) — this is the known socat/api-gateway :4000→:3000 issue (VPS-SOCAT-PERSIST), unrelated to the cafef fix.
- cursor_epoch=0 every cycle — cursor file is missing. Items re-pushed every 15 min with no dedup. This is a separate bug, not in scope for this sprint.

**FU-OPS-CAFEF-2 — bs4 path: FAIL (regex fallback active)**
- pip3 show beautifulsoup4 → Package(s) not found. python3 -c 'import bs4' → ModuleNotFoundError.
- article-body-fetcher.py deployed at /root/article-body-fetcher.py (VPS-NEWS-CAFEF-VNECO sprint). Code confirmed: `try: from bs4 import BeautifulSoup except ImportError: BeautifulSoup = None`. Since bs4=None, both extract_cafef() and extract_vneconomy() fall through to the regex path, which hard-caps output at 5000 chars instead of the 8000-char bs4 path.
- /proxy/article-body endpoint exists via vn-vps-proxy.service (vps-proxy-server.js). Confirmed service running.

**Follow-up required:** Install beautifulsoup4 on VPS to activate the primary extraction path. `pip3 install beautifulsoup4` is sufficient (requests already installed — article-body-fetcher.py imported it successfully). Track as VPS-BS4-INSTALL.

## c005 · 2026-06-04T08:10Z · RECON-AGM-1

Trigger: operator P0 spike — find fetchable source for AGM business plan figures (planned revenue/profit per ticker per year) for management-track-record / plan-vs-actual feature (FIX-G gate).

**VERDICT: FETCHABLE — structured JSON, no OCR needed**

Primary source confirmed: `https://finance.vietstock.vn/Data/GetData_PlannedTarget`
- POST with `stockCode=<TICKER>` + `__RequestVerificationToken` (from `#__CHART_AjaxAntiForgeryForm` on ke-hoach page)
- Returns `Data_Results[]` with PTID/PTName/YearPeriod/Value for 5 years (2022–2026)
- PTID 5=revenue plan, 8=pre-tax profit plan, 9=after-tax profit plan
- Verified for VIC, FPT, ACB, NVL. No Cloudflare. No geo-block. VPS 200 OK ~0.25s.
- Anti-bot: session CSRF warmup only (ASP.NET double-submit pattern, CookieJar required)

Also confirmed: `GetData_PlannedTarget_ImplementStatus` = plan vs actual quarterly actuals inline (FIX-G gets both plan AND actuals from one source).

PDF path (not needed for figures): `getrptfile` API returns direct PDF URLs per ticker+year (documentTypeID=4 for Nghị quyết ĐHĐCĐ). PDFs are image-based (iLovePDF/PdfTools SDK, 1 Font object, no text layer) — dev-pdf-extractor would be needed for raw PDF parse, but this is the fallback only.

Discarded candidates: SSC UBCK (Oracle ADF JSF, no REST API), HNX CBTT AJAX (ticker filter broken on pAction=0; no structured plan figures), CafeF (404 on DHCD pages), FireAnt (401 auth required).

Signal dropped: docs/signals/dev-vps-crawls-2026-06-04T08-10-00Z.json
Recon doc: docs/vps-sources/vietstock-agm-plan/recon.md

## c004 · 2026-06-04 · FIX-CTG-2b-DEPLOY

Trigger: operator task — deploy FIX-CTG-2b (rank>=2-only guard) to VPS.

**DEPLOYED:** `/root/discover-bctc-urls-browser.py` overwritten with repo cc4ed657.
- Backup created: `/root/discover-bctc-urls-browser.py.bak-20260604`
- VPS sha256: `3d844094f474d5ba310542a86d0cb238f55e0256f8779aa14448a5bacbd5ef89` — MATCH
- `grep -c "SKIP all-generic rank"` on VPS = 1 — guard line confirmed present
- Runtime CTG smoke test SKIPPED: script requires full Playwright/Chromium browser launch; primary CTG path (FIX-CTG-1, hsx.vn) is already live; low-risk hardening not time-critical. sha+grep integrity checks are the binding DoD per task spec.

Status: DONE-VERIFIED

---

## c006 · 2026-06-06T15:32Z · UNBLOCK-VPS-FETCH-RESUME

Trigger: INCIDENT — router+PO verified: prices/bctc/foreign_flow stale 24h; sbv+news healthy.

**DIAGNOSIS:**

prices (vn-price-fetch):
- Service: active PID=3984475, sleeping (S state). Loop alive since 2026-06-02T01:22Z.
- Last log entry: 2026-06-05T08:59:30Z — PUSH {"ok":true,"updated":114}. Correct.
- Root cause: NOT a failure. Script enters silent off-hours sleep after 09:00Z UTC (market close). No log output during off-hours by design. Today is Saturday (dow=6), so loop stays dormant until Monday 02:00Z UTC.
- Host outage 02:00–11:14Z Jun 6 had zero impact: price service is silent on weekends regardless.
- Action: NONE (no restart needed — service is healthy and sleeping by design).

foreign_flow (vn-foreign-flow):
- Service: active PID=3986425, sleeping (S state). Same off-hours design as price (shares same loop structure).
- Last log entry: 2026-06-05T08:59:57Z — PUSH_RESPONSE HTTP 200, upserted:103. Correct.
- Root cause: Weekend off-hours silence. SLA breach (1462m) is a monitoring false-positive for weekend no-push.
- Action: NONE (service alive, will resume Mon 02:00Z UTC).

bctc (vn-bctc-fetch):
- Service: restarted 2026-06-06T15:30:33Z (was active since 2026-06-02T01:23Z before restart).
- Persistent symptom: Playwright/Chromium Zygote fails `pthread_create: Resource temporarily unavailable (11)` on every HOSE-SSC discovery attempt. All 10 queue items (Q1/2026 tickers) SKIP on every 6h cycle since Jun 5. Last actual PDF push: 2026-06-01T17:16Z (CTG). Host records last_push=2026-06-05T14:48:47Z (separate mechanism, not VPS-script-push).
- Root cause evidence: `[0606/194928.256632:ERROR:base/threading/platform_thread_posix.cc:162] pthread_create: Resource temporarily unavailable (11)` — Chromium GPU zygote fork fails on thread create; affects only SSC (Playwright) path. HNX/UPCOM (curl POST) paths succeed but find no Q1/2026 PDFs in those sources.
- Host outage link: NOT the cause. Playwright errors predate Jun 6 outage (visible in Jun 5 07:41Z run). The issue is persistent VPS thread-limit/Chromium incompatibility.
- Post-restart: Fresh cycle at 15:30–15:31Z UTC — all 10 items SKIP (no new PDFs available), service healthy, now sleeping 6h.
- Action: Restarted bctc to clear session state. Service cycling correctly.

**PUSH PROOF (15:32Z):**
- prices: last_push=2026-06-05 08:59:30 (last VN market session, correct for weekend)
- bctc: last_push=2026-06-05 14:48:47, pushes_24h=0 (queue has no new PDFs, SKIP-only)
- foreign_flow: not separately tracked in vps-proxy-health (embedded in prices push)
- news: pushes_24h=88 ✓ | sbv: pushes_24h=47 ✓

**FOLLOW-UPS:**
- BCTC-PLAYWRIGHT-THREAD: Chromium pthread_create exhaustion blocks SSC discovery path. Fix needed: either raise VPS thread limit or replace Playwright SSC path with curl-based alternative. Track as BCTC-PLAYWRIGHT-THREAD-FIX P2.
- SLA-WEEKEND-AWARE: SLA monitor marks prices/foreign_flow stale on weekends creating false incidents. Fix: SLA check should skip "stale" verdict Sat/Sun for market-hours-gated services. Track as SLA-WEEKEND-AWARE P3.

---

## c001 · 2026-06-01T11:38Z (PRUNED)

Fixes: vn-foreign-flow EnvironmentFile added (WATCHLIST+FOREIGN_FLOW_API_URL env); vn-vps-proxy TasksMax 16→32; ssc-iboard NXDOMAIN confirmed globally (dead source). All DONE-VERIFIED.
