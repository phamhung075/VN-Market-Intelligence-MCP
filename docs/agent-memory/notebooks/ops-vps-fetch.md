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

## c001 · 2026-06-01T11:38Z

Trigger: operator-directed safe-recovery fixes (3 scoped items). Market hours active (~04:4xZ Mon).

**Fix 1 — vn-foreign-flow env: APPLIED+VERIFIED**
- Added `EnvironmentFile=-/etc/vn-market.env` under `[Service]` in `/etc/systemd/system/vn-foreign-flow.service`.
- Appended FOREIGN_FLOW_API_URL, WATCHLIST_URL, API_KEY to `/etc/vn-market.env` (VPS_API_KEY was already present).
- Backups: `/root/vn-foreign-flow.service.bak-1780288599`, `/root/vn-market.env.bak-1780288599`.
- Post-restart log confirmed: `WATCHLIST_FETCH took 828ms, 111 codes loaded` + `PUSH_RESPONSE: HTTP 200, upserted:102, validationErrors:0`.

**Fix 3 — vn-vps-proxy TasksMax: APPLIED+VERIFIED**
- Changed `TasksMax=16` → `TasksMax=32` in `/etc/systemd/system/vn-vps-proxy.service`.
- Backup: `/root/vn-vps-proxy.service.bak-1780288653`.
- Post-restart: `cat /sys/fs/cgroup/.../pids.max` = 32; `/health` = `{"ok":true}` confirmed.

**Fix 2 — ssc-iboard domain recon: RECON-ONLY (no change)**
- `iboard-query.ssc.vn` confirmed NXDOMAIN globally (8.8.8.8 + VPS DNS). Dead since 2026-04-27 per proxy code comment.
- Probed: iboard.ssc.vn, iboard-api.ssc.vn, iboard2.ssc.vn, iboard-query1/2.ssc.vn, portal.ssc.vn, stockmarket.ssc.vn — ALL NXDOMAIN globally.
- ssc.gov.vn subdomain variants also all NXDOMAIN (ssc.gov.vn itself resolves but no iboard subdomains).
- ssc.vn redirects to saigonsportsclub.com (unrelated domain), confirming SSC moved off ssc.vn entirely.
- No working alternate found returning real financial JSON. This is a globally-dead domain, not VPS-DNS-only.
- Action required: data-source-migration task (SSC iboard → replacement source TBD; HOSE/HNX direct APIs are candidates but need separate recon).
