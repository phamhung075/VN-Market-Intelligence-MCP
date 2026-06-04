# ops-mainserver-fetch — Notebook

**Last updated:** 2026-06-04 20:20 UTC | **Sprint:** fred-effr fetch broken recon

---

## Identity

Agent: Main Server Fetch Diagnostician
Role: Direct HTTP recon specialist for international (non-geo-blocked) data sources
Zone: ops-zone (local probe, no VPS)

---

## Active Sources Under Watch

| Source | Last recon | Status | Anti-bot | Geo-blocked check |
|--------|-----------|--------|---------|------------------|
| trading-economics-vn | 2026-05-13 | clean 200 | none | confirmed no |
| yahoo-finance-fx-indices | 2026-05-13 | v8 API open | none | confirmed no |
| reuters-asia-news | 2026-05-13 | DataDome hard block | datadome | confirmed no |
| bloomberg-markets | 2026-05-13 | PerimeterX passive | perimeterx | confirmed no |
| imf-datamapper | 2026-05-13 | Akamai 403 | akamai_bot | confirmed no |
| world-bank-macro | 2026-05-13 | open API | none | confirmed no |
| adb-kidb | 2026-05-13 | SPA, API unknown | none | confirmed no |
| investing-economic-calendar | 2026-05-13 | CF managed passive | cloudflare_managed | confirmed no |
| fred-macro | 2026-05-13 | API key required | login_required | confirmed no |
| fred-effr | 2026-06-04 | fredgraph.csv BROKEN (Akamai) — api.stlouisfed.org WORKING | akamai_bot (web) / none (api) | confirmed no |
| marketwatch-indices | 2026-05-13 | clean 200 (VN N/A) | none | confirmed no |
| cnbc-world-markets | 2026-05-13 | open + quote API | none | confirmed no |

---

## Recon History

| Date | Source | Trigger | Outcome | Re-routed to VPS |
|------|--------|---------|---------|-----------------|
| 2026-05-13 | trading-economics-vn | new_source_needed | recon complete, no anti-bot | no |
| 2026-05-13 | yahoo-finance-fx-indices | new_source_needed | recon complete, v8 API open | no |
| 2026-05-13 | reuters-asia-news | new_source_needed | DataDome block — headless needed | no |
| 2026-05-13 | bloomberg-markets | new_source_needed | PerimeterX passive — headless needed | no |
| 2026-05-13 | imf-datamapper | new_source_needed | Akamai 403 — headless needed / try api.imf.org | no |
| 2026-05-13 | world-bank-macro | new_source_needed | recon complete, open API | no |
| 2026-05-13 | adb-kidb | new_source_needed | SPA — Playwright needed for API discovery | no |
| 2026-05-13 | investing-economic-calendar | new_source_needed | CF managed passive, POST API exists | no |
| 2026-05-13 | fred-macro | new_source_needed | recon complete, free API key required | no |
| 2026-06-04 | fred-effr | fetch_broken (EFFR stale 7d) | fredgraph.csv blocked by Akamai; api.stlouisfed.org WORKING — fix = change URL in fredEffrIorb.ts | no |
| 2026-05-13 | marketwatch-indices | new_source_needed | VN Index not available on MW | no |
| 2026-05-13 | cnbc-world-markets | new_source_needed | recon complete, quote API open | no |

---

## Geo-Block Reroutes

| Date | Source | Evidence | Signal dropped |
|------|--------|---------|---------------|
| (none) | — | — | — |

No geo-blocks detected in this cycle. All 11 sources are accessible from main server (France IP).

---

## Lessons Learned

### 2026-06-04 — fred-effr Fetch Broken Recon

11. **fredEffrIorb.ts targets the wrong FRED URL** — `fredgraph.csv` on `fred.stlouisfed.org` (Akamai-blocked) instead of `api.stlouisfed.org` (Apache, no bot protection). The 2026-05-13 recon already documented this block; the fetcher was implemented AFTER without checking recon docs. Fix: swap URL to api.stlouisfed.org JSON endpoint; FRED_API_KEY already in .env. Latest EFFR via API: 2026-06-03 = 3.62%.

### 2026-05-13 — Bootstrap Cycle

1. **Yahoo Finance v7 API is dead** — returns 401 Unauthorized. v8 chart API (`/v8/finance/chart/<symbol>`) is the working replacement. No auth needed.

2. **FRED web pages use Akamai TLS fingerprint block** — TLS handshake succeeds but body is empty (STATUS:000). The API subdomain (`api.stlouisfed.org`) is unprotected — always use API, not web scraping.

3. **IMF DataMapper API now blocked by Akamai** — was open in 2024, now behind Akamai Bot Manager. Alternative: `api.imf.org` (WEO API) on different domain — requires separate recon.

4. **ADB KIDB is a pure SPA** — zero REST API routes match at `/api/*` paths tested. Need Playwright network intercept to find correct endpoints. All Azure-CDN hosted with open CORS headers.

5. **Reuters DataDome is a hard block** — `x-dd-b:3` = outright block, not soft challenge. Playwright stealth or RSS fallback required.

6. **Bloomberg delivers 200 but PerimeterX passive** — `_pxhd` cookie at first load. PX active challenge likely on 2nd+ request. Subscription paywall is the bigger blocker than bot protection.

7. **World Bank API** — cleanest open macro API in this set. No auth, no anti-bot, open CORS. Best for VN annual macro data.

8. **CNBC quote API** — underappreciated clean JSON endpoint. `quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol` returns JSON with no auth. Useful for US/global indices.

9. **MarketWatch VNI redirect** — `/investing/index/vni` redirects to German stock VNI. VNINDEX not tracked on MW. Not a useful source for VN market data.

10. **Investing.com CF is passive** — `__cf_bm` cookie mode, not JS challenge. cloudscraper should work without full Playwright for initial session acquisition.

---

## Open Signals

| Signal file | Source | Dropped at | Status |
|------------|--------|-----------|--------|
| docs/signals/dev-mainserver-crawls-2026-05-13T05-06-40Z.json | 11 sources (batch) | 2026-05-13T05:06:40Z | pending dev-mainserver-crawls |
| docs/signals/dev-mainserver-crawls-2026-06-04T202000Z.json | fred-effr | 2026-06-04T20:20:00Z | pending dev-mcp-server (fix fredEffrIorb.ts URL) |

---

## Priority Ranking for dev-mainserver-crawls

Based on data value + ease of implementation:

1. **world-bank-macro** — open API, high value VN annual macro data (implement first)
2. **yahoo-finance-fx-indices** — open v8 API, critical FX rates for VN market context (implement first)
3. **cnbc-world-markets** — open quote API, US/global indices (quick win)
4. **trading-economics-vn** — free API key + HTML, rich VN indicators (implement early)
5. **fred-macro** — free API key needed, US macro context (implement after key provisioned)
6. **investing-economic-calendar** — CF managed, cloudscraper bypass, high value calendar (medium effort)
7. **reuters-asia-news** — DataDome + Playwright stealth (high effort, check RSS first)
8. **bloomberg-markets** — PerimeterX + paywall (high effort, limited value — headlines only)
9. **adb-kidb** — SPA API discovery needed (medium effort once API found)
10. **imf-datamapper** — Akamai block (probe api.imf.org first as lower-effort path)
11. **marketwatch-indices** — VN data not available (low priority)
