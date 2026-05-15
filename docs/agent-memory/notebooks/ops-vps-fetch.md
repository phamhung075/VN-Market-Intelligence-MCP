# ops-vps-fetch — Notebook

**Last updated:** 2026-05-15 04:45 UTC | **Sprint:** TASK-BCTC-3a VPS verification

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
