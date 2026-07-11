# Recon SPIKE — Earnings-Revisions + Valuation-History-Percentile Feasibility

**Date:** 2026-07-11 08:00–08:15 UTC
**Agent:** ops-mainserver-fetch
**Task:** SPIKE-EARNINGS-REV-VALUATION-PCTILE-FEASIBILITY (sprint ANALYSIS-QUALITY-CONVERGENCE, Lane E / FR-7)
**Trigger:** new_source_needed (recon SPIKE, PLAN-ONLY — no build)
**Probe origin:** main-server (direct HTTP, no VPS proxy, France IP)
**Mandate:** `docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md` §4 / AC-12; `docs/roadmaps/vn-market-indicator-roadmap.md` §4

---

## VERDICTS

| Gap | Verdict | Basis |
|---|---|---|
| (a) Analyst-consensus earnings-revisions for VN listed companies | **INFEASIBLE** | No source probed exposes a syndicated sell-side consensus-EPS-revision feed over HTTP without a paid subscription/terminal login. Roadmap rejection confirmed by live probe. |
| (b) VN-Index / per-ticker P/E multi-year history deep enough for percentile ranks | **INFEASIBLE** | No source probed serves a real multi-year P/E (or P/B) *time series* — only single-point-in-time current-day valuation snapshots exist on the reachable candidates. Roadmap rejection confirmed by live probe. |

No candidate triggered the geo-block detection protocol (HTTP 451 / geo-subdomain redirect / VN-only text / `X-Country-Block`) — **no VPS-LANE handoff required for this SPIKE's specific candidates.** (Noted anomaly: VN-domestic hosts CafeF, VNDirect `dchart-api`, and Vietstock all answered directly from the main server with real content, not geo-fenced — see Notes.)

---

## Candidates Probed (BA §4 mandate list)

### 1. FiinGroup / FiinTrade — consensus API — **paywalled, confirmed**

| URL | Status | Finding |
|---|---|---|
| `https://fiingroup.vn/` | 200 | Corporate marketing site only — no data API, no estimates content. |
| `https://fiintrade.vn/` | 200 | Body = 3,361-byte React/webpack shell (`<div id="root">`, `You need to enable JavaScript to run this app`) — zero server-rendered data. All data loads client-side post-auth; product is explicitly described as serving "chuyên viên tư vấn, môi giới, nhà giao dịch" (paid professional/broker/trader tier). No public unauthenticated JSON endpoint discoverable via static HTTP probe. |

**Verdict: paywalled / auth-gated, matches prior `IND-P2-MARGIN-LEVERAGE` confirmation. No structured-data leak.**

### 2. VNDirect / SSI / Simplize research portals — **narrative/snapshot-only, confirmed**

| URL | Status | Finding |
|---|---|---|
| `https://livedragon.vndirect.com.vn` | DNS fail (`Could not resolve host`) | Legacy research subdomain dead. |
| `https://dchart-api.vndirect.com.vn/dchart/history?...symbol=VNINDEX` | 200 | Live OHLCV bar API — real, reachable, **but price-only** (`t`,`o`,`h`,`l`,`c`,`v` fields per roadmap §"Sprint 0" backfill source). No valuation multiple or earnings-estimate field in the response shape. Confirms VNDirect's open surface = price data, not fundamentals/estimates. |
| `https://iboard.ssi.com.vn/` | 403 | Cloudflare Managed Challenge (`__cf_bm` cookie set, `server: cloudflare`, `cf-ray` present, no plain body). Blocked at the anti-bot layer, not geo-fenced (no VN-only text/451/X-Country-Block). |
| `https://simplize.vn/co-phieu/VNM` | 200 | Real SSR JSON embedded in page (`__NEXT_DATA__`): `"peRatio":20.25`, `"epsRatio":...`, `"bookValue":...`, `"valuationPoint":5` (Simplize's own proprietary 1–5 composite score, not a raw sell-side estimate). Grep for `"pe[A-Za-z]*"` across the full body returns **only the single key `"peRatio"`** — no `peHistory` / `historicalPE` / `percentile` key anywhere. Confirms current-day snapshot only, no time series. |
| `https://simplize.vn/co-phieu/VNM/dinh-gia` (valuation sub-route guess) | 404 (soft) | No dedicated valuation-history route exists at this path. |
| `https://simplize.vn/co-phieu/VNINDEX/dinh-gia` | 404 (soft) | Same — no VN-Index-level valuation-history page. |

**Verdict: VNDirect = price-only API (no fundamentals); SSI = anti-bot blocked; Simplize = real per-ticker structured JSON but single-point PE snapshot only, no historical series, no consensus-revision field.**

### 3. Refinitiv / Bloomberg VN coverage — **enterprise-paywalled, confirmed**

| URL | Status | Finding |
|---|---|---|
| `https://www.bloomberg.com/quote/VNINDEX:IND` | 403 | PerimeterX cookie (`_pxhd`) + body contains `SUBSCRIBE`/`captcha`/`subscribe` markers. Matches existing `docs/mainserver-sources/bloomberg-markets/recon.md` finding (PerimeterX passive + subscription paywall) — re-confirmed live for the VN-specific quote page. Consensus estimates (Bloomberg Estimates) are a Terminal-only feature, never exposed on the free web quote page even without the bot-block. |
| `https://www.lseg.com/en/data-analytics/market-data/vietnam` | 404 | LSEG/Refinitiv VN market-data marketing page not found at guessed path. Immaterial to the verdict: Refinitiv's I/B/E/S consensus-estimate database is delivered exclusively via the Eikon/Workspace terminal (enterprise login), never as a scrapeable public HTTP page — no further probing changes this structural fact. |

**Verdict: enterprise-paywalled, confirmed by live 403+PerimeterX+subscribe-wall evidence.**

### 4. TradingEconomics — **checked "already-used slug family" — no P/E series found**

Working slug pattern from prior recon (`docs/mainserver-sources/trading-economics-vn/recon.md`): `https://tradingeconomics.com/vietnam/<indicator-slug>`.

| URL | Status | Finding |
|---|---|---|
| `https://tradingeconomics.com/vietnam/price-earnings-ratio` | 200 (soft-404) | `<title>TRADING ECONOMICS \| 20 Million Indicators for 196 Countries</title>` — the **generic homepage/search-fallback title**, plus a `Search-result` DOM marker in the body. This is TE's soft-404 pattern (HTTP 200 masking "no such indicator page"), contrasted directly against a real indicator page (`/vietnam/gdp` → `<title>Vietnam GDP</title>`). |
| `https://tradingeconomics.com/vietnam/stock-market-pe-ratio` | 200 (soft-404) | Identical soft-404 signature as above. |
| `https://tradingeconomics.com/vietnam/stock-market` | 200 (real page) | Confirmed real VN-Index page — but `temporalCoverage: "2000-07-28/2026-07-10"` covers **price/index-level data only** (schema.org Dataset = "Vietnam Ho Chi Minh Stock Index"). Full-body grep for `p/e`, `price.to.earning`, `pe ratio`, `earnings.ratio` → **zero matches**. No P/E field anywhere on the page. |
| `https://api.tradingeconomics.com/country/vietnam?c=guest:guest` | 410 | TE's public demo/guest API key has been discontinued ("guest account has been discontinued... subscribe to a plan"). No free API path remains either. |

**Verdict: TE has no VN P/E indicator page under the standard slug family (soft-404), and the real VNI page it does carry is price-only. No multi-year P/E series exists on TradingEconomics for Vietnam. Confirms roadmap's own doubt correctly — this was the one candidate BA flagged as "check," and the check comes back negative.**

---

## Sample soft-404 vs real-page contrast (diagnostic evidence)

```
# Real indicator page:
<title>Vietnam GDP</title>

# Real (different-metric) indicator page:
<title>Vietnam Ho Chi Minh Stock Index - Quote - Chart - Historical Data - News | Trading Economics</title>

# P/E slug candidates (soft-404, HTTP 200):
<title>TRADING ECONOMICS | 20 Million Indicators for 196 Countries</title>
... "Search-result" ...
```

---

## Anti-Bot / Access Summary

| Source | Type | Evidence |
|---|---|---|
| FiinTrade | JS-SPA + auth wall | webpack shell only, no SSR data |
| SSI iBoard | Cloudflare Managed | `__cf_bm` cookie, 403, no geo-block markers |
| Bloomberg quote page | PerimeterX + subscription paywall | `_pxhd` cookie, `SUBSCRIBE`/`captcha` body text |
| Yahoo Finance v10 `quoteSummary` | Auth (crumb) gate | `{"error":{"code":"Unauthorized","description":"Invalid Crumb"}}`, HTTP 401 — and structurally irrelevant even if bypassed: Yahoo has no historical index-level P/E time-series endpoint, only current-day per-equity `summaryDetail.trailingPE` |
| TradingEconomics `guest:guest` API | Deprecated | HTTP 410, "guest account has been discontinued" |
| VNDirect, Simplize, CafeF, Vietstock (wrong-slug redirect) | None / reachable | No anti-bot or geo-block triggered; data present but shape-insufficient (snapshot, not series) for this SPIKE's gaps |

**Geo-block check: negative across all candidates** — no HTTP 451, no geo/region subdomain redirect, no VN-only-language gate, no `X-Country-Block` header anywhere in this probe set.

---

## Notes

- The roadmap's own text (`docs/roadmaps/vn-market-indicator-roadmap.md` §4) frames this gap as "the z-score IS the fabricated distribution" — this SPIKE's live evidence is fully consistent: every reachable source that carries VN valuation data (Simplize, TradingEconomics's VNI page) exposes only a **current-day snapshot**, never a queryable historical series, and none carry the ~1,700-constituent per-ticker earnings depth or consensus-revision counts the roadmap's rejected indicators would need.
- **Unexpected side-finding (out of this SPIKE's scope, flagged for awareness only, no action taken):** CafeF (`cafef.vn`), VNDirect's `dchart-api.vndirect.com.vn`, and Vietstock (`finance.vietstock.vn`, wrong-slug 302→Error page, not geo-blocked) were all directly reachable from the main server with real HTTP 200 content — none of these VN-domestic hosts geo-fenced this session's France-origin IP. This does not change either verdict above (none of the three carry a multi-year P/E series or a consensus-revision feed on the pages probed), but is worth noting for any future ops-vps-fetch vs. ops-mainserver-fetch routing decision on VN-domestic sources — reachability should not be assumed VPS-only without a live check.
- No code, compute, or indicator design was produced in this cycle — PLAN-ONLY discipline held. Raw probe artifacts (headers/bodies) were kept in the session scratchpad only, not committed.

## Sample Response Excerpts (≤500 chars each)

```
# TradingEconomics soft-404 (price-earnings-ratio slug):
<title>	TRADING ECONOMICS | 20 Million Indicators for 196 Countries</title>
... Search-result ...

# Simplize VNM embedded valuation JSON fragment:
{"epsRatio":4914.19,"evEbitdaRatio":6.8,"bookValue":15725.95,"freeFloatRate":40,
"valuationPoint":5,"growthPoint":2,...,"peRatio":20.25}

# Bloomberg VNINDEX quote (403 body fragment):
... SUBSCRIBE ... captcha ...

# TE guest API (410):
<p>We are sorry, but the guest account has been discontinued.</p>
<p>Please subscribe to a plan at https://tradingeconomics.com/api/pricing.aspx.</p>
```

---

## RETURN

Both gaps (a) earnings-consensus-revisions and (b) VN-Index P/E multi-year-history-percentile are **INFEASIBLE** — no real, machine-reachable, HTTP-only, no-paid-API-key feed exists on any of the BA-mandated candidate sources (FiinGroup/FiinTrade, VNDirect/SSI/Simplize, Refinitiv/Bloomberg, TradingEconomics), each backed by a live probe result documented above. Roadmap §4 rejection is **confirmed, not merely restated**. No VPS-LANE handoff needed — no candidate triggered geo-block signals. No build/compute/indicator-design work should follow from this SPIKE per its own PLAN-ONLY mandate.
