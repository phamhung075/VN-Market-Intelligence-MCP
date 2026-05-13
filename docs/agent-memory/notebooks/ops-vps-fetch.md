# ops-vps-fetch — Notebook

**Last updated:** 2026-05-13 04:49 UTC | **Sprint:** bootstrap-inventory

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
| hsx-bctc | 2026-05-13 | CRITICAL — no PDFs acquired | page_restructure + resource_limit |

---

## Recon History

| Date | Source | Trigger | Outcome |
|------|--------|---------|---------|
| 2026-05-13 | vps-prices | bootstrap | 200 OK upstream. MCP push failing 38 consecutive cycles. Signal dropped. |
| 2026-05-13 | cafef-index | bootstrap | 200 OK, clean JSON. Healthy. |
| 2026-05-13 | vn-news-rss | bootstrap | All 14 RSS feeds 200 OK. MCP push-news endpoint 404. Signal dropped. |
| 2026-05-13 | sbv-rates | bootstrap | 200 OK, Akamai CDN, rate advisory 5min. Healthy. |
| 2026-05-13 | hsx-bctc | bootstrap | BROKEN. HNX AJAX returns homepage. Playwright crashes (pthread_create). Zero Q1/2026 PDFs. Signal dropped (critical). |

---

## Lessons Learned

- HNX AJAX endpoint `NextPageTinCPNY_CBTCPH` silently returns homepage HTML instead of error when parameters are wrong or endpoint has moved. Hard to detect without checking response `<title>` or size (expected: 1-5KB fragment; actual: 40KB full page).
- curl cannot POST to HNX (SSL cert validation fails: `unable to get local issuer certificate`). Must use Python urllib with `ssl.CERT_NONE`.
- VPS `TasksMax=32` in `vn-bctc-fetch.service` is hitting Playwright thread limits. Chromium spawn fails with `pthread_create: Resource temporarily unavailable`.
- `bgapidatafeed.vps.com.vn` embeds foreign flow fields (`fBVol`, `fSVolume`, `fRoom`) in every OHLCV response — foreign-flow and price services share the same upstream.
- MCP push failures (prices: 38 failures, news: 404) are infrastructure issues on the MCP side, not upstream source issues.
- VCB XML endpoint comment says "Only one request every 5 minutes" — advisory only, not enforced technically (Akamai would enforce harder limits at higher frequency).

---

## Open Signals

| Signal file | Source | Dropped at | Status |
|------------|--------|-----------|--------|
| docs/signals/dev-vps-crawls-2026-05-13T04-49-25Z.json | hsx-bctc + vps-prices + vn-news-rss | 2026-05-13 04:49 UTC | pending dev-vps-crawls |
