# Architecture Brief: Rapid-Analysis Skills — Data-Layer Gap Analysis
**Date:** 2026-06-04
**Slug:** rapid-analysis-data-layer-gaps
**Author:** agents-architect
**Status:** READY-FOR-PM-SEQUENCING
**Input brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md
**Zone:** apps/mcp-server/ (primary); new data sources (VPS-crawl path)

---

## 1. Scope

Six skills (SKILL-1 through SKILL-6) were authored and rely on exactly three MCP tools:
`get_market_snapshot`, `get_bctc_full`, `get_company_info` (assumed). This brief maps every
data field consumed by each skill against live source code to determine which fields are
COVERED, PARTIAL, or GAP, then prescribes the exact remediation and routes each gap.

---

## 2. Verified Tool Surface (source confirmed)

| Tool | Exists? | File | Notes |
|---|---|---|---|
| `get_market_snapshot` | YES | `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts:147` | Returns formatted TEXT, `source_tier`, `fetchedAt`; NO structured price/cap/float fields |
| `get_bctc_full` | YES | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts:806` | Latest period only (no `years` param); returns text summary; DB columns include `pe`, `pb`, `roe`, `debt_to_equity`, `equity_total`, `total_assets`, `operating_cf`, `net_profit` |
| `get_price_history` | YES | `apps/mcp-server/src/interface/mcp/tools/market-data/priceHistoryTools.ts:176` | Max 90 days (hard-coded `Math.min(..., 90)`); queries `daily_ohlcv`; no EPS column |
| `get_insider_transactions` | YES | `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts:89` | SSC disclosures; fields: code, insiderName, position, type (buy/sell), executedVolume, registeredVolume, price, fromDate, toDate; lookback max 90 days |
| `get_insider_signals` | YES | `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts:101` | Wraps leadershipSignal domain service; requires `outstandingShares` as caller-supplied param; returns classified signals only |
| `get_company_info` | NO | — | **PHANTOM** — assumed by SKILL-4 but no `server.tool("get_company_info", ...)` exists anywhere in apps/. The `vnstock_shareholders` table exists in schema (`schema-financial-reports.ts:345`) and is populated by `syncVnstockData.ts` but has no MCP exposure |
| `get_ticker_intelligence` | YES | `apps/mcp-server/src/interface/mcp/tools/market-data/tickerIntelligenceTools.ts:358` | Aggregates 6 sections incl. insider (7d) and foreign flow; no ownership %, no market cap |

---

## 3. Per-Skill Data Requirements Matrix

### SKILL-1: rapid-market-cap-screen

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| `market_cap_billion` | `get_market_snapshot` | **GAP** | `marketTools.ts` returns formatted text string, no structured `market_cap_billion` field. `VnstockRatioSummary.marketCap` exists in `vnstockBridge.ts:82` as a dead export — defined but never stored or served |
| `shares_outstanding` (fallback for cap derivation) | `get_market_snapshot` | **GAP** | Not in market snapshot output or any MCP tool |
| `pe_current` | `get_bctc_full` | **PARTIAL** | `pe` column exists in DB row (`bctcFullTools.ts:76`), rendered in text output (`bctcFullTools.ts:277`). But `get_bctc_full` returns TEXT not structured JSON with labelled fields; agent must parse text |
| `pb_current` | `get_bctc_full` | **PARTIAL** | Same as pe_current — exists in DB, rendered in text |
| `pe_median_10y` (10-year P/E history) | `get_bctc_full` | **GAP** | `get_bctc_full` has no `years` parameter. Returns latest period only. No multi-year P/E history available via any tool |
| `pb_median_10y` (10-year P/B history) | `get_bctc_full` | **GAP** | Same as pe_median_10y |

**SKILL-1 summary:** 1 PARTIAL / 5 fields total including 2 structural GAPss. Cannot compute valuation bands without 10-year history and cannot get market cap without a new tool. BLOCKED.

---

### SKILL-2: balance-sheet-first-read

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| `total_assets` | `get_bctc_full` | **PARTIAL** | DB column `total_assets` (`bctcFullTools.ts:55`). Returned in text format only; latest period only |
| `total_liabilities` | `get_bctc_full` | **PARTIAL** | DB column `total_liabilities` (`bctcFullTools.ts:59`). Text only |
| `equity` (vốn chủ sở hữu) | `get_bctc_full` | **PARTIAL** | DB column `equity_total` (`bctcFullTools.ts:61`). Text only |
| `charter_capital` (vốn điều lệ) | `get_bctc_full` | **GAP** | No `charter_capital` column in `financial_reports` schema. Not in `ReportRow` interface. Not rendered by `buildSummarySection`. Not stored anywhere in mcp-server source |
| `receivables` (absolute value) | `get_bctc_full` | **PARTIAL** | `vnstock_balance_sheet.receivables_bn` exists (`schema-financial-reports.ts:379`); `vnstockBridge.ts:786` fetches it. BUT `financial_reports` table (BCTC-extraction path) has no `receivables` column — only `vnstock_balance_sheet` parallel store has it. `get_bctc_full` does NOT expose it |
| `receivables as % of total_assets` | derived | **GAP** | No tool computes this ratio |
| `investment_property` (fair value / book value age) | `get_bctc_full` | **GAP** | No `investment_property` column anywhere in `financial_reports` or `vnstock_balance_sheet`. Not fetched, not stored |
| `cash_and_equivalents` (for CASH-PARKED flag) | `get_bctc_full` | **PARTIAL** | DB column `cash` (`bctcFullTools.ts:57`). Text only |
| `market_cap_billion` (passed from SKILL-1) | inherited | **GAP** | Blocked by SKILL-1 gap |

**SKILL-2 summary:** 4 PARTIAL / 1 COVERED / 4 GAP. `charter_capital` and `investment_property` are pure extraction gaps (not stored). `receivables` is stored in `vnstock_balance_sheet` but not exposed in `get_bctc_full`. BLOCKED on charter_capital.

---

### SKILL-3: four-factor-synthesis

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| `roe` (latest year) | `get_bctc_full` | **PARTIAL** | DB column `roe` (`bctcFullTools.ts:71`). Recomputed on read (`bctcFullTools.ts:884`). Text only |
| `debt_to_equity` | `get_bctc_full` | **PARTIAL** | DB column `debt_to_equity`. Recomputed on read. Text only |
| `operating_cf` (CFO time series, 4 years) | `get_bctc_full` | **GAP** | `get_bctc_full` returns ONE period. No multi-year series available. `operating_cf` column exists for latest period (`bctcFullTools.ts:63`) |
| `pe_band`, `pb_band` (from SKILL-1) | inherited | **GAP** | Blocked by SKILL-1 gaps |
| `governance_score` (from SKILL-4) | inherited | **GAP** | Blocked by SKILL-4 gaps |
| Moat / business model (Factor B) | qualitative | **COVERED** | Agent qualitative judgment — no tool call required |

**SKILL-3 summary:** Factor F requires 4-year CFO series (GAP); Factors V and G inherit upstream GAPss. Only Factor B is self-contained. BLOCKED.

---

### SKILL-4: ownership-governance-screen

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| Top shareholders list (name, %, quantity) | `get_company_info` | **GAP** | `get_company_info` does NOT EXIST. `vnstock_shareholders` table exists and is populated by `syncVnstockData.ts:345`, but has NO MCP tool wrapping it |
| Founder/controlling stake % | `get_company_info` | **GAP** | Same — no tool |
| Foreign institutional holder ≥ 5% | `get_company_info` | **PARTIAL** | `vnstock_trading_stats.current_holding_ratio` gives total foreign holding ratio (exposed in `get_ticker_intelligence` section 4). But no per-institution foreign holder breakdown — only aggregate foreign % |
| Free float % | `get_company_info` | **GAP** | Not stored. `vnstock_trading_stats` has `foreign_room` / `max_holding_ratio` but no free-float column |
| Insider buy/sell events (last 6 months) | `get_insider_transactions` | **PARTIAL** | `get_insider_transactions` exists (`insiderTools.ts:89`) but max lookback is 90 days (≈3 months). SKILL-4 Step 2 requires 6-month window. Sufficient for 3-month net-sell check but SHORT for 6-month coverage |
| Net insider sell % of holdings in 3-month window | derived | **PARTIAL** | Transactions available (90d window); but `registeredVolume` (baseline holding size) is available per-transaction. The net-sell-as-%-of-holdings calculation is derivable from the data but not pre-computed |
| `daily_turnover_ratio` = avg_daily_value_30d / market_cap | derived | **GAP** | `get_price_history` returns close+volume for up to 90 days — volume is available. But `market_cap` is a GAP (see SKILL-1), so the ratio cannot be computed |
| Year-over-year total_assets change (back-door listing) | `get_bctc_full` | **GAP** | Single period only. Multi-year series needed |
| Long-term bank debt presence | `get_bctc_full` | **PARTIAL** | DB columns `long_term_debt` derived from `short_term_debt + long_term_debt` sum; `long_term_debt` is a separate column (`bctcFullTools.ts:65`). Text only. Present for latest period |
| `reward_fund` (quỹ khen thưởng) | `get_bctc_full` | **GAP** | Not a column in `financial_reports`. Not in `ReportRow` interface. Not extracted by BCTC pipeline. BCTC notes extraction only, not structured |
| `lntt` (profit_before_tax) | `get_bctc_full` | **PARTIAL** | DB column `profit_before_tax` (`bctcFullTools.ts:51`). Text only |

**SKILL-4 summary:** The `get_company_info` phantom is the single biggest blocker — it gates ownership structure (OWNERLESS, SKIN-GAME-WEAK) and insider free-float checks. `reward_fund` requires BCTC notes extraction. BLOCKED on ownership and reward_fund.

---

### SKILL-5: management-track-record

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| Revenue targets (AGM stated plans) | `get_bctc_full` | **GAP** | AGM resolution data does not exist in any tool or table. BCTC PDFs contain financial statements, not AGM resolutions. AGM plans are a separate disclosed document class |
| Actual revenue (multi-year) | `get_bctc_full` | **GAP** | `get_bctc_full` returns one period. `net_revenue` column exists but no multi-year series tool |
| CEO start date | `get_company_info` | **GAP** | `vnstock_officers` table exists (`schema-financial-reports.ts:330`) with `name`, `position`, `own_percent`. No `start_date` column. No MCP tool wrapping `vnstock_officers` |
| ROE time series (pre/post-CEO tenure) | derived | **GAP** | Requires multi-year ROE series. `get_bctc_full` = one period only |
| IPO prospectus / fundraising earmarks | external | **GAP** | Not stored. Requires BCTC notes or prospectus PDF. VPS source needed |
| Public record search (founder legal history) | external | **GAP** | No tool. Web search capability needed. Candidate: `fetch_and_analyze` (news-scout tool) could proxy a VN search, but not structured |
| IR publication frequency | `get_company_info` | **GAP** | No tool or table tracks IR disclosure frequency |

**SKILL-5 summary:** Deepest gap profile. Revenue plan accuracy requires AGM resolution data (new source). CEO tenure requires officer history. Multi-year financials require a series tool. MOST BLOCKED skill.

---

### SKILL-6: value-trap-avoidance

| Field | Tool assumed | Status | Source evidence |
|---|---|---|---|
| Price history (24 months for Signal A/B) | `get_market_snapshot` with `period: "24m"` | **GAP** | `get_market_snapshot` has NO period parameter. `get_price_history` max = 90 days. 24-month price history is not available via any tool |
| EPS history (24 months for Signal B divergence) | `get_bctc_full` | **GAP** | `get_bctc_full` = one period. No EPS series tool. `eps` column exists in DB but no multi-period query |
| `governance_score` + `factor_scores` (from SKILL-3/4) | inherited | **GAP** | Blocked by upstream gaps |
| Moat check | qualitative | **COVERED** | Agent qualitative judgment — no tool call |
| Conviction test | qualitative | **COVERED** | Agent provides 2-sentence statement — no tool call |

**SKILL-6 summary:** Signal A requires 18-month P/B history (GAP). Signal B requires correlated EPS+price series over 18 months (GAP). Both are blocked by the same root: no multi-period price or earnings series tool. BLOCKED.

---

## 4. Consolidated Gap Inventory

**COVERED:** 3 fields (moat judgment x2, conviction test — agent qualitative, no tool needed)

**PARTIAL:** 12 fields — tool/table exists but wrong format (text-only), wrong scope (single period), or insufficient lookback (90d vs 6m for insider)

**GAP:** 22 fields — tool does not exist, field not stored, source not fetched

Total assessed fields: 37 (counting distinct field requirements across all 6 skills).

Summary: **COVERED 3 / PARTIAL 12 / GAP 22**

---

## 5. Root Cause Clusters

All 22 gaps trace to four root causes:

**RC-1: No structured market-cap / shares-outstanding tool** (affects SKILL-1, SKILL-4, SKILL-6 turnover ratio)
`VnstockRatioSummary.marketCap` is a dead export. `vnstockBridge.ts:82` defines it but nothing stores it to DB or serves it via MCP.

**RC-2: No multi-period series from `get_bctc_full`** (affects SKILL-1, SKILL-3, SKILL-4, SKILL-5, SKILL-6)
`get_bctc_full` returns one period. 10-year P/E history, 4-year CFO, 2-year EPS, multi-year YoY assets all require a series variant or separate history tool.

**RC-3: No `get_company_info` / no shareholders MCP tool** (affects SKILL-4 ownership, SKILL-5 CEO tenure)
`vnstock_shareholders` and `vnstock_officers` tables are populated (by `syncVnstockData`) but have zero MCP exposure. SKILL-4 assumed `get_company_info` which does not exist.

**RC-4: Missing BCTC-notes fields: charter_capital, investment_property, reward_fund** (affects SKILL-2, SKILL-4)
These are balance-sheet line items that our BCTC extraction pipeline (PDF OCR → scalar aggregator) does not map. They exist in the raw BCTC tables but are not in `financial_reports` columns.

**RC-5: No 24-month price history / no EPS time series** (affects SKILL-6)
`get_price_history` hard-caps at 90 days. `daily_ohlcv` may hold more data but the tool blocks it. No EPS time series tool.

**RC-6: No AGM resolution / revenue-target data source** (affects SKILL-5 plan accuracy)
This is a new data category entirely — not a financial statement field. Requires a new source fetch from HSX/HNX disclosure portals or VIETSTOCK.

---

## 6. Prioritized Remediation List

Ordered by leverage (number of skills unblocked per fix):

---

### FIX-A: `get_company_profile` — New MCP tool wrapping `vnstock_shareholders` + `vnstock_officers`

**Leverage:** Unblocks SKILL-4 (ownership step 1, free-float, skin-game), SKILL-5 (CEO name for tenure calc)
**Classification:** (b) NEW MCP tool over data we already store
**Zone:** `dev-mcp-server`
**What:** New tool `get_company_profile` serving from existing tables:
- From `vnstock_shareholders`: name, quantity, own_percent (sorted by own_percent DESC, limit 10)
- From `vnstock_officers`: name, position, own_percent, quantity
- From `vnstock_trading_stats`: current_holding_ratio (aggregate foreign %)
- Compute: free-float approximation = 100% - sum(own_percent for non-free-float holders)
**Output:** Structured JSON (not text-only) — agents can parse fields directly.
**Note:** `vnstock_shareholders` has `(code, name) UNIQUE` but no `start_date` for officers. CEO tenure (SKILL-5 Step 2) will still be PARTIAL until an officer-history extension ships (FIX-F).

---

### FIX-B: `get_market_cap` — New MCP tool for market cap + shares outstanding

**Leverage:** Unblocks SKILL-1 size gate (primary blocker), SKILL-4 turnover ratio, SKILL-6 (inherited from SKILL-1)
**Classification:** (b) NEW MCP tool over data we already store + (a) UPGRADE to store `marketCap`
**Zone:** `dev-mcp-server`
**What:**
1. Wire `VnstockRatioSummary.marketCap` storage: extend `syncVnstockData` to write `marketCap` from vnstock ratio summary to a `vnstock_ratio_summary` table (or add `market_cap_bn` column to `vnstock_trading_stats`). `vnstockBridge.ts:82` already defines the struct.
2. New tool `get_market_cap` returning `{code, market_cap_billion, shares_outstanding_approx, fetched_at}`.
**Source:** vnstock `stock.trading.price_board()` already returns marketCap in the bridge — it just isn't being persisted.

---

### FIX-C: `get_bctc_series` — New MCP tool for multi-year BCTC financials

**Leverage:** Unblocks SKILL-1 (10yr P/E/P/B history), SKILL-3 (4yr CFO series), SKILL-4 (YoY assets for back-door detection), SKILL-5 (multi-year revenue actuals), SKILL-6 (2yr EPS for Signal B)
**Classification:** (b) NEW MCP tool over data we already store
**Zone:** `dev-mcp-server`
**What:** New tool `get_bctc_series` with params `{code, fields: string[], periods: number}`.
- Queries `financial_reports` ordered by `sort_key DESC LIMIT periods` for the given code
- Returns array of period rows with subset fields (pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps, total_assets, net_revenue, equity_total)
- Output: structured JSON array, one object per period, period-labeled
**Constraint:** Only returns `refine_status = 'DONE'` rows (same guard as `get_bctc_full` PUB-1 gate) to prevent serving OCR garbage. Sparse history (fewer than requested periods) is honest — return what exists.
**Corpus depth note:** Most watchlist tickers have 4–8 quarters of DONE BCTC; true 10-year history will be sparse for many tickers until corpus grows.

---

### FIX-D: Extend `get_bctc_full` to expose structured JSON output + missing balance-sheet fields

**Leverage:** Unblocks SKILL-1/2/3/4 partial fields (text-only → parseable JSON), SKILL-2 `receivables`
**Classification:** (a) UPGRADE existing MCP tool
**Zone:** `dev-mcp-server`
**What:** Dual change:
1. Add `structured_data: {...}` section to `get_bctc_full` output alongside existing text (non-breaking). Include all ReportRow numeric columns as a machine-readable JSON block.
2. Add `receivables` to the structured output by reading from `vnstock_balance_sheet` table (JOIN or secondary query on same `code + latest period`) since `receivables_bn` is already stored there.
**This unblocks:** pe_current, pb_current, total_assets, equity, total_liabilities, cash, long_term_debt, profit_before_tax, operating_cf — all become directly readable without text parsing.

---

### FIX-E: Extend `get_price_history` to 730 days + add EPS overlay capability

**Leverage:** Unblocks SKILL-6 Signal A (18-month price history for chronic-cheap detection) and Signal B (price-vs-EPS divergence)
**Classification:** (a) UPGRADE existing MCP tool
**Zone:** `dev-mcp-server`
**What:**
1. Remove the 90-day hard cap: `Math.min(..., 90)` in `priceHistoryTools.ts:191` → `Math.min(..., 730)`. The `daily_ohlcv` table holds permanent daily candles (Task 1804c confirmed no pruning). DB query at line 210 uses `date >= date('now', '-' || ? || ' days')` — already parameter-driven, no schema change needed.
2. Return structured JSON array (code, date, close, volume) in addition to text for machine-parseable output.
3. For Signal B: EPS overlay is a SEPARATE TOOL (see FIX-C `get_bctc_series`) — cross-reference by date.

---

### FIX-F: Charter capital + investment property + reward fund — BCTC scalar extraction

**Leverage:** Unblocks SKILL-2 charter_capital_ratio, SKILL-2 INV-PROPERTY-STALE flag, SKILL-4 COMP-EXTRACTION flag
**Classification:** (c) NEW microservice function — dev-pdf-extractor path
**Zone:** `dev-mcp-server` (scalar aggregator + finalize tool) — same zone, PDF extraction already done
**What:** Three new scalar fields to extract from BCTC PDFs and store in `financial_reports`:
1. `charter_capital` (vốn điều lệ, BS line item ~code 411): add to `bctcScalarAggregator` ScalarAggregate + finalize BLOCK-1 + DB migration
2. `investment_property` (bất động sản đầu tư, BS line item ~code 217): same pipeline path
3. `reward_fund` (quỹ khen thưởng, equity section ~code 418): same pipeline path
**Precedent:** FIX-DE-1 (from 2026-06-03 brief) already extended bctcScalarAggregator for short_term_debt/long_term_debt. Same pattern applies here.
**Risk:** VAS code numbers vary by form version (Mẫu B01, B02-TCTD). Need VAS code validation pass same as FIX-DE-1/FIX-DE-4 pattern. Bank forms (B02-TCTD) do not have charter_capital as a standalone line.

---

### FIX-G: AGM revenue-plan data — New VPS fetch source

**Leverage:** Unblocks SKILL-5 Step 1 (plan accuracy — the signature management check)
**Classification:** (d) NEW DATA SOURCE
**Zone:** `dev-vps-crawls` (fetch) + `dev-mcp-server` (store + tool)
**Source candidates (VN, all geo-blocked → must route via Vinahost VPS):**
- **HSX disclosure portal** — `hsx.vn/Modules/Listed/Web/Disclosure` — AGM resolutions (Nghị quyết ĐHĐCĐ) are filed here as PDF/HTML. Searchable by ticker + document type "Nghị quyết ĐHĐCĐ" or "Kế hoạch kinh doanh"
- **HNX disclosure portal** — `hnx.vn/en-gb/tin-cong-bo-thong-tin` — same document class
- **SSC portal** — `congbothongtin.ssc.gov.vn` — official CBTT filings; same documents are re-uploaded here
**Recon spike required (ops-vps-fetch):** An ops agent must run a fetch probe on VPS to confirm: (1) document availability for 3 sample tickers (VNM, FPT, VCB), (2) URL structure / pagination pattern, (3) response format (PDF = requires PDF-Extract-Kit pipeline; HTML = scrape directly). This MUST be done before any dev work starts on this source.
**Prerequisite:** ops-vps-fetch RECON spike → confirm fetch recipe → THEN dev-vps-crawls build the AGM fetcher → THEN dev-mcp-server: store in new `agm_revenue_plans` table + new `get_agm_plans` tool.

---

### FIX-H: Insider lookback window — extend `get_insider_transactions` to 180 days

**Leverage:** Unblocks SKILL-4 Step 2 full 6-month insider-exit detection
**Classification:** (a) UPGRADE existing MCP tool
**Zone:** `dev-mcp-server`
**What:** Change max in `insiderTools.ts:108` from `.max(90)` to `.max(180)`. The underlying `insiderStore` queries SQLite by date — no schema change needed. Data availability depends on how far back `insiderCheckJob` has populated `insider_transactions` table. May be sparse beyond 90 days for early-added watchlist tickers.

---

## 7. Dependency Ordering

```
Phase 0 — Recon (prerequisite for FIX-G only)
  ops-vps-fetch: AGM portal probe (HSX/HNX/SSC) → confirm fetch recipe
  → estimated 1 day

Phase 1 — Unblock SKILL-1 and turn on market-cap gate
  FIX-B (market cap tool + storage) → FIX-D (bctc_full structured output)
  These two are independent; run in parallel.
  → SKILL-1 goes LIVE after FIX-B

Phase 2 — Unblock ownership screening
  FIX-A (get_company_profile) → SKILL-4 partial-live (ownership + partial insider)
  FIX-H (insider lookback 180d) → SKILL-4 fully live on insider window
  Independent of Phase 1; can run in parallel.
  → SKILL-4 goes LIVE (partial, no reward_fund) after FIX-A + FIX-H

Phase 3 — Unblock multi-period analysis
  FIX-C (get_bctc_series) → SKILL-3 Factor F (CFO series), SKILL-5 revenue actuals, SKILL-6 EPS series
  FIX-E (price history 730d) → SKILL-6 Signal A (chronic cheap price history)
  Independent of each other; run in parallel.
  → SKILL-3 Factor F goes LIVE after FIX-C (Factors V,G still need Phase 1+2)
  → SKILL-6 Signal A goes LIVE after FIX-C + FIX-E together

Phase 4 — Extend BCTC scalar extraction
  FIX-F (charter_capital + investment_property + reward_fund extraction)
  Prerequisite: VAS code audit for new fields (same pattern as FIX-DE-1)
  → SKILL-2 charter_capital_ratio goes LIVE
  → SKILL-4 COMP-EXTRACTION goes LIVE

Phase 5 — AGM revenue plan (dependent on Phase 0 recon result)
  ops-vps-fetch confirms recipe → dev-vps-crawls builds fetcher → dev-mcp-server: store + tool
  → SKILL-5 Step 1 plan-accuracy goes LIVE

CEO tenure / IR transparency remain UNKNOWN until officer history and
IR-frequency tracking are scoped as separate tasks.
```

---

## 8. Skills Go-Live Readiness

| Skill | Can go live now? | Blocking gaps | Unblocked by |
|---|---|---|---|
| SKILL-1 rapid-market-cap-screen | **BLOCKED** | market_cap (RC-1), 10yr P/E history (RC-2) | FIX-B + FIX-C |
| SKILL-2 balance-sheet-first-read | **BLOCKED** | charter_capital (RC-4), market_cap (RC-1) | FIX-B + FIX-D + FIX-F |
| SKILL-3 four-factor-synthesis | **BLOCKED** | CFO series (RC-2), upstream SKILL-1/4 | FIX-C + Phase 1+2 |
| SKILL-4 ownership-governance-screen | **BLOCKED** | get_company_info phantom (RC-3), reward_fund (RC-4) | FIX-A + FIX-H + FIX-F (partial without reward_fund) |
| SKILL-5 management-track-record | **BLOCKED** | AGM data (RC-6), multi-year revenue (RC-2), CEO tenure | FIX-C + FIX-G (after Phase 0 recon) |
| SKILL-6 value-trap-avoidance | **BLOCKED** | 24m price history (RC-5), EPS series (RC-2) | FIX-E + FIX-C |

**No skill can go live without at least FIX-B (market cap) completing first**, as SKILL-1 is the mandatory entry gate for all subsequent skills per the architecture brief §5 flow design.

**Earliest partial live path:** FIX-B + FIX-A + FIX-H in parallel → SKILL-1 (size gate only, no P/E bands) + SKILL-4 (ownership + insider, no reward_fund flag). This delivers governance screening for the 30 watchlist tickers within ~1 sprint.

---

## 9. Implementation Handoff

Ordered task list:

| Priority | Task ID | Action | Zone/Target Agent | Dep |
|---|---|---|---|---|
| P0 | RECON-AGM-1 | ops-vps-fetch probe: HSX/HNX/SSC AGM portal fetch recipe for 3 tickers | ops-vps-fetch | none |
| P1 | FIX-B | Persist marketCap from vnstock ratio summary; new `get_market_cap` MCP tool | dev-mcp-server | none |
| P1 | FIX-A | New `get_company_profile` MCP tool (shareholders + officers + foreign %) | dev-mcp-server | none |
| P1 | FIX-D | Extend `get_bctc_full` to emit structured JSON block; add `receivables` join | dev-mcp-server | none |
| P1 | FIX-H | Extend `get_insider_transactions` max lookback from 90d to 180d | dev-mcp-server | none |
| P2 | FIX-C | New `get_bctc_series` multi-period tool (pe, pb, roe, cfo, eps, assets, revenue) | dev-mcp-server | FIX-B |
| P2 | FIX-E | Extend `get_price_history` hard cap from 90d to 730d; add JSON output | dev-mcp-server | none |
| P3 | FIX-F | Add charter_capital, investment_property, reward_fund to BCTC scalar extraction pipeline | dev-mcp-server | VAS code audit |
| P4 | FIX-G | AGM fetcher (VPS crawl) + store + `get_agm_plans` tool | dev-vps-crawls + dev-mcp-server | RECON-AGM-1 |
| P5 | FIX-I | Officer history (CEO start date) — extend `vnstock_officers` with start_date if available in vnstock source | dev-mcp-server | FIX-A |

**Route to PM:** pm to break into atomic per-zone sprint tasks and schedule in `orch-state.json` task_board.
**Route to ops-vps-fetch:** RECON-AGM-1 can start immediately — 1-2 day spike, no code needed.

---

## 10. Zone Classification (Standard Detection)

All remediations touch an **existing** service (`apps/mcp-server/`) → BUILD-STANDARD: lean.
Exception: FIX-G (AGM fetcher) touches `dev-vps-crawls` which is an existing VPS script zone, not a new service → BUILD-STANDARD: lean for the dev-mcp-server side; ops-vps-fetch handles the VPS probe + script.

BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md

---

## 11. Risk Flags

- **Risk-1 (BCTC corpus depth):** `get_bctc_series` will return sparse 10-year history for most tickers because our BCTC ingest only covers recent quarters (post-PDF-Extract-Kit integration, 2026-05-28). Skills should degrade gracefully when < 10 years of P/E data are available — use median of whatever is present.
- **Risk-2 (vnstock_shareholders staleness):** `syncVnstockData` fetches shareholders with a 24h TTL. If a major ownership change is announced intraday, the tool will lag. Skills must emit `data_as_of` field.
- **Risk-3 (FIX-F VAS code variance):** charter_capital code is ~411 in standard VAS but banks use a different layout (B02-TCTD). FIX-F must handle bank-form guard same as existing `isBankFormFromDb` pattern.
- **Risk-4 (AGM PDF path):** If HSX/HNX portals serve AGM resolutions as PDF only (likely), FIX-G will require PDF-Extract-Kit pipeline integration (already shipped 2026-05-28) — significantly higher effort than HTML scraping. Recon spike must determine format.

---
