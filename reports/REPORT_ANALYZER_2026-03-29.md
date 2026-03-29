# VN Market Intelligence — Report Analyzer Run
**Date:** 2026-03-29 | **Run time:** ~13:13 UTC (20:13 Vietnam time)
**Agent:** vn-report-analyzer (scheduled task)

---

## Executive Summary

This cycle was **severely impacted by infrastructure failures**. No BCTC financial data could be extracted for any of the four watchlist stocks (VNM, FPT, VCB, VEA). Financial comparisons (YoY, QoQ) were not possible. The root cause is a PDF URL scheme incompatibility in the SSC fetcher that requires developer attention. One HIGH alert for VCB is pending for Alert Commander.

---

## Step 1 — Financial Summaries

| Stock | DB Status | Most Recent Period | Notes |
|-------|-----------|-------------------|-------|
| VNM   | ❌ No data | — | No records in database |
| FPT   | ❌ No data | — | No records in database |
| VCB   | ⚠️ Partial | 2024-Q1 | Record exists but ALL values = 0 (failed extraction) |
| VEA   | ❌ No data | — | No records in database |

**⚠️ Low data confidence on all stocks — PDFs require manual review.**

---

## Step 2 — SSC Report Fetch Attempts

Fetch attempts made for Q4 2024 and Q3 2024 for all four stocks. **All failed.**

Root cause identified from error logs:

```
[ERROR] pdf: failed to download or extract PDF —
        "ssc-adf://pt9:t1:15:cil4z" cannot be parsed as a URL.
```

The SSC portal is returning PDF links using the `ssc-adf://` protocol (an Adobe-specific deep-link scheme), which the PDF downloader cannot resolve as a standard HTTP/HTTPS URL. This is a **systematic blocker** — it affects every stock, every quarter, and will continue to fail on every scheduled run until fixed.

**Affected fetches (all failed):**
- VNM 2025-Q4, VNM 2024-Q4, VNM 2024-Q3
- FPT 2025-Q4, FPT 2024-Q4, FPT 2024-Q3
- VCB 2025-Q4, VCB 2024-Q4, VCB 2024-Q3
- VEA 2025-Q4, VEA 2024-Q4, VEA 2024-Q3

---

## Step 3 — Critical Issues Detected

### 🔴 BLOCKER: `ssc-adf://` PDF URL scheme unresolvable
- **All BCTC extraction is broken** until `src/infrastructure/fetchers/pdf.ts` can resolve or convert these Adobe deep-link URLs to standard HTTPS download URLs.
- Recommended fix: In the SSC Puppeteer scraper (`src/infrastructure/fetchers/ssc.ts`), intercept the PDF download event directly via Puppeteer's `page.on('download')` rather than extracting the `href` attribute, which yields the `ssc-adf://` scheme instead of the actual PDF URL.

### 🔴 BLOCKER: VnDirect API timeouts — no live price data
- Repeated `timeout of 15000ms exceeded` on HOSE price fetches.
- VN-Index: N/A. All watchlist stocks: "no price data."
- VCB HIGH alert (price_drop + volume_spike) was generated but **price data reliability is uncertain** given the fetcher was timing out at the time.

### ⚠️ WARNING: Reuters RSS returning 404/403
- Both Reuters RSS endpoints are broken (`404` and `403`).
- Global news coverage is reduced — only VnExpress and VnEconomy are currently feeding the intelligence cycle.

### ⚠️ WARNING: CafeF RSS returning 404
- Vietnamese market news from CafeF unavailable.
- Impact: reduced domestic market signal quality.

### ⚠️ WARNING: SBV interest rate and FX pages returning 404
- Macro data (central bank rates, USD/VND) unavailable.
- `get_macro_snapshot` will return no data until SBV page URLs are updated.

### ⚠️ WARNING: Watchlist is empty
- The watchlist has 0 stocks configured.
- The scheduled tasks reference VNM, FPT, VCB, VEA but these are not in the watchlist DB.
- Alerts that do fire (like the VCB one) may be from legacy data or a prior watchlist state.
- **Action required:** Re-add VNM, FPT, VCB, VEA to the watchlist via `add_to_watchlist`.

### ⚠️ WARNING: Intelligence cycle — all 4 steps failed (one run)
- At 19:56 Vietnam time: pollNews, SSC check, fetchPrices, and runImpactChain all failed.
- DB was reported as "down" during that run. May have been a transient startup issue (server uptime was ~1h 19m at check time).

---

## Step 4 — Per-Stock Analysis

Since no financial data is available, the analysis below is based solely on news context and alerts.

### VCB — Vietcombank (Banking)
- **Alert:** 🔴 [HIGH] price_drop + volume_spike — generated 19:57 Vietnam time (unread)
- **BCTC:** ⚠️ Low data confidence — VCB 2024-Q1 record in DB with all-zero values; all subsequent fetch attempts failed
- **News context:** Analysis history includes "Dự báo lợi nhuận ngành ngân hàng tăng trưởng chậm lại trong quý 1/2026" (Banking sector profit growth forecast to slow in Q1/2026) — **bearish signal for VCB**
- **Sector benchmark check:** Cannot evaluate ROE vs. 15% banking benchmark — no data
- **For Alert Commander:** VCB [HIGH] alert is unread and awaiting action. Note that price data had network issues at time of generation — treat with moderate confidence.

### VNM — Vinamilk (Retail/FMCG)
- **Alert:** None in last 7 days
- **BCTC:** ❌ No data — cannot check revenue trend, margins, or leverage
- **News context:** No specific VNM mentions in recent analysis history
- **Sector benchmark:** Retail margin > 5% cannot be verified
- **Status:** Insufficient data — monitoring only

### FPT — FPT Corporation (Tech)
- **Alert:** None in last 7 days
- **BCTC:** ❌ No data — cannot evaluate revenue growth, operating CF, or P/E
- **News context:** No specific FPT mentions in recent analysis history
- **Status:** Insufficient data — monitoring only

### VEA — Vietnam Engine and Agricultural Machinery (Other)
- **Alert:** None in last 7 days
- **BCTC:** ❌ No data
- **News context:** No specific VEA mentions in recent analysis history
- **Status:** Insufficient data — monitoring only

---

## Step 5 — Historical Context Search

RAG memory returned no results for any query. The vector store appears to be empty or the embeddings have not been populated from news fetches yet. The 10 analysis history entries from today are the first signs of RAG population; context will accumulate over subsequent cycles.

---

## Step 6 — Daily Market Summary (Generated)

The `generate_market_summary` call succeeded. Key highlights from today's news context:

**Global (Bearish pressure):**
- US stocks at 7-month low; oil up ~6%; gold volatile amid Middle East conflict
- Fed reported ~$19B operating loss in 2025
- BYD profit declining for first time in 4 years (China demand signal)
- Safe-haven assets "losing steam" despite geopolitical tensions

**Vietnam (Mixed/Cautious):**
- VN-Index seeking equilibrium in 1,600–1,725 range
- Domestic institutions net buying 1,000 billion VND — supportive
- Foreign investors reversing to net buying (bottom-fishing activity)
- SSC issued warning on unlicensed investment platforms Tikop, Buff, Topi
- Banking sector Q1/2026 profit growth expected to slow

**Market mood:** Global bearish backdrop with selective domestic buying support. Caution warranted.

---

## Action Items for Developer / Ops

| Priority | Issue | Recommended Fix |
|----------|-------|----------------|
| 🔴 Critical | `ssc-adf://` PDF URLs unresolvable | Capture PDF via Puppeteer `download` event in `ssc.ts`, not `href` extraction |
| 🔴 Critical | VnDirect API timeouts (15s) | Increase timeout or switch to CafeF price fallback as primary for HOSE |
| ⚠️ High | Reuters RSS 404/403 | Update RSS URLs in `mcp.config.json` → `fetchers.reuters` |
| ⚠️ High | CafeF RSS 404 | Update RSS URL in `mcp.config.json` → `fetchers.cafef` |
| ⚠️ High | SBV pages 404 | Update page URLs in `mcp.config.json` → `fetchers.sbv` |
| ⚠️ High | Watchlist empty | Re-add VNM/FPT/VCB/VEA via `add_to_watchlist` MCP tool |
| ℹ️ Medium | VCB DB record all-zeros | Clear corrupt 2024-Q1 record and re-fetch once PDF issue resolved |

---

## For Alert Commander

- **VCB [HIGH] — UNREAD** — price_drop + volume_spike, generated 2026-03-29 19:57 Vietnam time
  - Cannot cross-validate with BCTC fundamentals (no financial data available)
  - Price data reliability uncertain (VnDirect timeouts at time of alert)
  - Monitor VCB closely; consider manual price check
- No alerts for VNM, FPT, VEA in last 7 days
- Global macro environment is risk-off (US selloff, oil spike) — elevated alert sensitivity recommended

---

*Generated by vn-report-analyzer | 2026-03-29 13:13 UTC*
