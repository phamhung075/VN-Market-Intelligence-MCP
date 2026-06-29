# VN Market Intelligence — Indicator Roadmap

> **Status:** VERIFIED (56-agent multi-agent gap analysis; supply-vs-demand mapped; every proposal adversarially checked against the STANDING no-fake-data rule and VN data reachability). Persisted by PO 2026-06-29.
> **Why this exists:** user directive — "we need more indices to analyze the market better — deeper analysis to add more indicators so the helper (analyst) agents analyze better."
> **Sprint of record (first):** `MARKET-INDICATOR-DEPTH-P0` (orch-state `.sprint_goal.entries[]`) — Sprint 0 OHLCV backfill + the 5 P0 indicator families + breadth time-series. See §5.
> **Hard gate on EVERY item below:** no-fake-data. An indicator ships ONLY when every value is computed from data already on hand or already fetched (Tier 1–2 real). Anything whose distribution would have to be invented is in §4 (DO NOT BUILD).
> **Owners legend (helper/analyst agents):** MW=market-watcher · AC=alert-commander · DP=digest-predict · CHEF=unified-agent · TNB=tran-ngoc-bau · NS=news-scout · BCTC=bctc-analyst.
> **Build-owners (dev agents):** dev-technical-analysis · dev-stock-price · dev-macro-indicators · dev-rag-service · dev-mcp-server · dev-pdf-extractor.
> **† = gated on the OHLCV backfill (Sprint 0). Tier: P0 = data on hand · P1 = needs new real fetch / backfill · P2 = stretch / hard data.**

---

## 1. What we already have

| Surface | Current coverage | Blind spots baked in |
|---|---|---|
| Technical (per-stock) | RSI14, MACD, MA5/20/50, Bollinger20 (`get_technical_indicators`) | single-stock trend only — no MA200, no cross-sectional rank, no volatility/beta |
| Breadth & flows | `get_market_breadth` (HOSE snapshot adv/dec/ceiling/floor/turnover — never historized), `get_market_foreign_flow` (watchlist SUM), `get_foreign_flow` (per-ticker, serves raw foreign_room) | no time-series, no aggregation, no room utilization |
| Macro | `get_macro_snapshot`, `get_vn_liquidity_state` (OMO net + policy rates + SJC gold + FX coupling), trade-balance/BOP/CPI/IIP, carry & yield-spread (deposit-rate proxy), investment-clock, IMF/Fed-liquidity | six macro-health tracks run `is_estimate=true` pending new tools; no sovereign curve |
| Valuation | market earning-yield + median PE (current snapshot), `get_sector_comparison` (text), `get_bctc_full`/series (corpus-depth-limited) | no historical percentile, no ERP-vs-sovereign |
| Sentiment / other | `get_sentiment_trend` (per-stock OLS), `get_insider_transactions` (live SSC feed), kinh-dich, prediction markets, backtest engine (`export_backtest_run_csv`) | no market-aggregate sentiment, no insider signal, no fear dial |
| Stores | SQLite `daily_ohlcv` (~48 sessions only), `vnstock_trading_stats`, `rag_analyses`, `insider_transactions` + LanceDB | OHLCV depth blocks long-horizon momentum/breadth |

## 2. The biggest gaps (by analytical impact)

1. **No volatility / risk-normalization layer — at all.** Only Bollinger 2σ exists. Agents can't say whether a −2% day is abnormal, can't size stops to the ±7% band, can't gate conviction by vol regime, can't separate market move (β) from idiosyncratic break. Every alert threshold is a hardcoded number.
2. **No leverage / forced-deleveraging visibility** — the dominant VN crash mechanism. VN is >85% retail; selloffs are margin-call cascades. Can't explain index gapping −5% on no news, nor pre-tighten CRITICAL thresholds when leverage is extended. (Hard-data problem — only partial P2 path.)
3. **No cross-sectional ranking and no breadth/foreign-capacity structure.** Zero "which names lead" ranking; breadth snapshot never historized (no A-D line/McClellan); foreign-room served per-ticker but never aggregated. Can't tell broad rally from 3-large-cap index move, nor "no FII buying because bearish" from "because no room left."
4. **No domestic risk-free curve, no derivatives or aggregate-sentiment dial.** `get_yield_spread_signal` uses the deposit rate, so true equity cost-of-capital and curve dynamics are invisible; no VN30F basis, no market-wide news-sentiment z-score, no insider-sentiment aggregate.

## 3. Recommended new indicators (37 kept, 2 dropped)

### P0 — build now (data on hand / already fetched — cleanest under no-fake-data)

<a id="p0-volatility"></a>
- **Volatility Primitives** — VN-Index RV 10/20/60d + Garman-Klass, per-stock ATR%(14), regime band, 252d drawdown. Helps MW·AC·DP·CHEF·TNB. T3 from `daily_ohlcv` + `vn_index_cache` (no fetch). dev-technical-analysis → `get_volatility_indicators`. Effort **S**.

<a id="p0-foreign-room"></a>
- **Foreign-Room Utilization & Saturation Suite** (merges 5) — per-ticker room_utilization, room→0/reopen events, 5d depletion velocity, ROOM_LOCKED/FULL-ROOM-SELL flags, market & sector cap-weighted saturation. MW·AC·CHEF·NS·DP·BCTC. T2 `vnstock_trading_stats` persisted daily (no fetch). dev-stock-price + dev-mcp-server → `get_foreign_room`. Effort **M**.

<a id="p0-news-sentiment-z"></a>
- **Market-Wide News-Sentiment Z-Score** — confidence-weighted daily sentiment, z vs 60–90d baseline, 5d EMA, bull/bear dispersion, article-volume spike. NS·DP·CHEF·MW. T3 from `rag_analyses` (no fetch). dev-rag-service/dev-mcp-server → `get_market_sentiment_index`. Effort **S–M**.

<a id="p0-insider-sentiment"></a>
- **Insider-Transaction Net Sentiment** — net buy−sell value 30/90/180d, free-float-normalized, ACCUMULATION/DISTRIBUTION label, large-deal flags. NS·CHEF·BCTC·TNB. T1 SSC via live `sscInsider.ts` → `insider_transactions` (no fetch; FIX-H 180d). dev-mcp-server → `get_insider_sentiment`. Effort **M**.

<a id="p0-breadth-thrust"></a>
- **Breadth Time-Series: A-D Line + McClellan + Ceiling/Floor Thrust** (merges 2) — persist HOSE breadth to `market_breadth_history`; A-D line, RANA, McClellan Osc/Summation, FloorPanic/CeilingFOMO, Zweig thrust. MW·AC·CHEF·DP. T2 `vnmarket_prices` already fetched; derived T3. **FORWARD-ACCRUING ONLY** (~40-session warm-up, no backfill — mark `accruing_since`). dev-mcp-server (table) + dev-technical-analysis → `get_breadth_thrust`. Effort **M**.

<a id="p0-omo-curve"></a>
- **SBV OMO Short-Rate & Liquidity-Stress Curve** — parse the per-tenor winning-rate + member-ratio columns currently DISCARDED; derive implied short-rate by tenor, net_injection_5d, liquidity-stress. MW·AC·DP·TNB. T1 SBV Liferay HTML, direct fetch (already fetched for net_outstanding). bid-to-cover NOT sourceable. dev-macro-indicators → extend `get_vn_liquidity_state` / `get_omo_curve`. Effort **M**.

### P1 — needs new real fetch or backfill

- **Cross-Sectional Relative-Strength Rank †** — RSC percentile (63/126/252d) + Mansfield RS. MW·CHEF·AC·DP·TNB. T3 local OHLCV+index. dev-technical-analysis → `get_relative_strength`. **M**.
- **Sector RRG Quadrant Classifier †** — JdK RS-Ratio/RS-Momentum, 4 quadrants, 5-wk tail. MW·CHEF·DP·TNB. T3 local OHLCV(126d)+sector map+`get_market_cap`. dev-technical-analysis. **L**.
- **52-Week-High Proximity + Net-New-Highs †** — %-from-52w-high/low, %>MA50/MA200, net-new-highs line. MW·AC·CHEF. T3 `daily_ohlcv`(252d). dev-technical-analysis. **M**.
- **Multi-Horizon ROC Momentum Factor (12-1) †** — Jegadeesh-Titman skip-month, z-score/decile, factor-return series. Closes DP backtest/Brier requirement. DP·CHEF·MW. T3 derived (needs 273 bars→backfill). dev-technical-analysis. **S**.
- **Per-Stock Beta/Downside-Beta/Correlation & Concentration †** — systematic vs idiosyncratic; rising systemic ρ = panic precursor; effective-N concentration. DP·TNB·CHEF·AC. T1 OHLCV via VPS/local once retained (→backfill). dev-technical-analysis → `get_risk_decomposition`. **M**.
- **VN Sovereign Yield Anchor + Equity Risk Premium** (merges 2) — 10Y VGB + real rate + 10Y-2Y spread; ERP = earnings-yield − 10Y VGB. MW·DP·CHEF·AC·TNB. T2 TradingEconomics VN 10Y (live ~4.52%, main-server, +1 slug to existing scraper) + T3 real rate via `get_cpi_components`. 2Y/5Y unreconnoitered → ship 10Y+ERP first. dev-macro-indicators → `get_vn_yield_curve`. **M**.
- **VN-Index Regional Decoupling Index** — rolling 60d β/corr to S&P500/SHCOMP/Nikkei/MSCI-EM, decoupling score, 20v60d delta. MW·DP·CHEF·AC. VN-Index local(T1)+Yahoo regional main-server(T2); reuses `correlationCalculator.ts` (β new). dev-technical-analysis/dev-mcp-server → `get_regional_decoupling`. **M**.
- **VN30F Futures Basis Fear Gauge** — front-month basis pts/%, F1M/F2M/F1Q/F2Q slope, z-score, DISCOUNT_FEAR/PREMIUM_GREED. VN has no options — futures basis is the ONLY listed-derivatives positioning proxy. AC·MW·CHEF·DP. T2 VnDirect dchart UDF JSON via VPS (new fetch + roll handling). dev-stock-price + dev-mcp-server → `get_vn30f_basis`. **M**.
- **Limit-Lock / Daily-Band Liquidity-Trap** — market floor/ceiling lock ratio (P0-cheap) + per-stock limit_lock_frequency. AC·MW·CHEF. (A) market-level from `get_market_breadth` (on hand); (B) per-stock needs NEW persisted ref/ceiling/floor series + tick-size/ex-div handling. Drop order-book one-sided flag. dev-mcp-server + dev-technical-analysis → `get_limit_lock_risk`. **S–M**.
- **Proprietary (Tự doanh) Net Flow** — daily net VND, 3/5d cum, streak, matched-vs-putthrough split. Third flow vector. MW·AC·CHEF. T2 HOSE prop report mirrored by CafeF/Vietstock via VPS (new EOD fetch; reuses `cafef.ts`). dev-stock-price + dev-mcp-server. **M**.
- **Block/Putthrough Deal Flow** — putthrough value/volume + putthrough_share per ticker & market. NS·MW·AC. T2 VnDirect `stock_prices` ptVolume/ptValue (same endpoint already hit). Drop per-deal large-block + net-direction. dev-stock-price + dev-mcp-server. **M**.
- **Retail Participation Pulse — New Securities Accounts (VSD)** — monthly net new domestic accounts, MoM, 3m-MA, retail-intensity vs turnover. DP·MW·TNB. T2 VSD monthly mirrored by CafeF/Vietstock static HTML via VPS. Drop margin-per-account. dev-macro-indicators + dev-mcp-server. **low–M**.
- **Foreign-Accumulation Momentum Rank** — ADTV-normalized 5/20d foreign net-flow z-rank + room_exhaustion flag. MW·CHEF·AC·NS. foreign net-vol+volume(T2 VPS)+room_exhaustion shares Foreign-Room suite. **Build after foreign-room ingest live.** dev-stock-price. **M**.
- **VN Market-Cap-to-GDP (Buffett, VN-calibrated)** — total listed cap / rolling-4Q nominal GDP, z vs VN's own band. DP·TNB·CHEF·MW. numerator=new exchange-wide cap fetch via VPS; denominator=IMF/WB annual(wired)+GSO quarterly nominal(parse-fragile). dev-macro-indicators + dev-stock-price. **M**.
- **Commodity-Import-Cost Pressure Index** — sector×commodity weight matrix × 60d %Δ, FX-adjusted to VND, NEGATIVE-MARGIN-TRAP flag. CHEF·MW·BCTC·DP. PARTIAL: Brent/copper/FX live(Yahoo T2); HRC steel/cotton addable; DROP naphtha/urea/coking-coal (paywalled). dev-macro-indicators + dev-mcp-server. **M**.
- **VN Composite Fear & Greed Gauge (0–100)** (merges 2) — weighted z-blend: RV percentile + breadth + foreign-outflow z + floor-lock + news z + VN30F basis; component attribution + regime label. **BUILD LAST — composes P0/P1 legs**; NO margin leg (quarterly-stale→fabrication risk); foreign-outflow leg watchlist-scoped (honest caveat). all. dev-mcp-server → `get_vn_fear_gauge`. **M**.

### P2 — stretch / hard data

- **Aggregate Broker Margin-Debt & Leverage-Stress Index** (merges 5) — sum per-broker "dư nợ cho vay ký quỹ", margin/float-cap, utilization vs ~2× cap, CASH-vs-MARGIN regime. THE dominant VN crash mechanism. all. T1 per-broker BCTC via pdf-extractor, needs NEW Circular-210 (CTCK) parser; partial coverage (Mirae/KIS unlisted), quarterly +30–45d lag. **SHIP level+QoQ+coverage% ONLY** — z-score band NOT computable honestly. dev-pdf-extractor + dev-macro-indicators + dev-mcp-server → `get_margin_leverage_state`. **L**.
- **Participation Breadth — %>MA50/%>MA200 †** — index-led vs broad; <20%>MA200 = washed out. MW·CHEF·DP. T3 `daily_ohlcv` aggregated — **BLOCKED on 200-session history**. dev-technical-analysis + dev-mcp-server. **M**.
- **Up/Down-Volume + Arms Index (TRIN)** — volume confirmation of breadth; climax/exhaustion flags. AC·MW. watchlist UV/DV from `daily_ohlcv`(on hand); exchange-wide has NO direction-split source → **ship watchlist-scoped**. dev-technical-analysis + dev-mcp-server. **M**.
- **ETF Creation/Redemption Flow** — passive-foreign leading proxy. MW·DP·AC. PARTIAL: VanEck VNM + Fubon solid(main-server); DCVFM only if static HTTP(VPS no-Chromium); **EXCLUDE Xtrackers(synthetic swap)**. dev-stock-price/dev-macro-indicators + dev-mcp-server. **high**.

## 4. Rejected / not feasible — DO NOT BUILD (would require fabrication)

- **VN-Index Valuation Z-Score** (P/E·P/B percentile vs own 10y history) — no real multi-year daily series (~2mo only), no per-ticker earnings for ~1700 constituents, no historical free-float/shares/membership → the z-score IS the fabricated distribution. Only defensible path = a SEPARATE P2 spike to source a REAL external VN-Index P/E history feed first.
- **Margin-Lending Stress Index with 8-quarter z-score band** — no real aggregate-margin time-series to backfill, so "ELEVATED vs 8Q band" can't be computed honestly; numerator un-fetchable (FiinTrade paywalled). (The P2 margin index survives ONLY by dropping the z-score label.)
- **Dropped sub-components** (no machine-readable VN source under HTTP-only VPS): order-book one-sided-at-limit flag · per-deal large-block + net-direction on putthrough · OMO bid-to-cover · exchange-wide UV/DV · Xtrackers in ETF flow · naphtha/urea/coking-coal in commodity index · margin-per-account in VSD pulse.
- **Demand gaps with no source / out of scope for an indicator roadmap:** M2 stance · asset-class tier allocation · IPO-prospectus earmark-vs-actual · founder legal-history web search · IR publication-frequency regression — all qualitative/manual.
- **Note — BCTC line items** (charter capital, investment property, receivables, reward_fund — FIX-F) are extraction-pipeline tasks owned by dev-pdf-extractor, NOT this roadmap.
- **Note — macro-health "estimate-only" track:** PMI MA, CPI components, real retail sales, public-investment/FDI quality (`is_estimate=true`) are real demand but a data-INGESTION effort (`get_vn_macro_indicators` from GSO/SBV via VPS), parallel to this risk/flow set. Only OMO (P0) and oil→sector (commodity index) are covered here; the rest warrant a dedicated dev-macro-indicators ingestion sprint.

## 5. First sprint — `MARKET-INDICATOR-DEPTH-P0`

**Sprint 0 (parallel prerequisite, low-risk, no fabrication):** execute the OHLCV history backfill — `ohlcv_backfill_queue` (450 rows) already exists; push ~2yr daily bars for VN-Index + watchlist via VPS VnDirect dchart (Tier 1-2 real data). This is the single unlock for the entire † momentum/long-horizon family.

**Then the 5 P0 indicators, in order:**
1. Volatility Primitives — `dev-technical-analysis` (conf 0.90, S)
2. Foreign-Room Utilization & Saturation Suite — `dev-stock-price` + `dev-mcp-server` (conf 0.90)
3. SBV OMO Short-Rate & Liquidity-Stress Curve — `dev-macro-indicators` (conf 0.88)
4. Market-Wide News-Sentiment Z-Score — `dev-rag-service`/`dev-mcp-server` (conf 0.85)
5. Insider-Transaction Net Sentiment — `dev-mcp-server` (conf 0.82)

**Plus** Breadth Time-Series (A-D / McClellan / thrust) — `dev-mcp-server` + `dev-technical-analysis`. **Forward-accruing only** (~40-session warm-up, NO backfill; mark `accruing_since`).

**Rationale:** each is zero-new-fetch or already-fetched (cleanest under no-fake-data), each covers a DISTINCT blind surface, and the five become the legs the later Composite Fear & Greed gauge composes.

**Sequencing for P1/P2 (backlog this cycle, do NOT sprint):** P1 † items (relative-strength, RRG, 52w-high, ROC momentum, beta/correlation) are BLOCKED on Sprint 0's backfill landing. Foreign-Accumulation Momentum Rank builds after the P0 Foreign-Room suite is live. The Composite Fear & Greed gauge is BUILD-LAST (composes the P0/P1 legs). P2 Participation-Breadth is BLOCKED on ~200-session history.

## 6. Provenance

- Source: 56-agent multi-agent gap-analysis workflow (supply-vs-demand mapped; adversarially verified against the STANDING no-fake-data rule + VN data reachability). Analysis is VERIFIED — not to be re-done.
- Board record: orch-state `.sprint_goal.entries[]` → `MARKET-INDICATOR-DEPTH-P0`; BA task `BA-INDICATOR-DEPTH-P0`; P1/P2 backlog rows `IND-P1-*` / `IND-P2-*` (PLAN-ONLY, status BACKLOG).
- Cascade: BA spec → architect blueprint → pm task decomposition → orch-state task_board → dev → qa. Full gate IN EFFECT (not lifted) — these are genuinely new analytical features.
