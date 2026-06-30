# BA Spec — P1 Momentum & Relative-Strength Indicator Wave

**Task ID:** BA-IND-P1-MOMENTUM-RS
**Sprint:** MARKET-INDICATOR-DEPTH-P0 (P1 momentum sub-wave)
**Created:** 2026-06-30T01:41:01Z
**Author:** ba
**Source of record:** docs/roadmaps/vn-market-indicator-roadmap.md §P1
**Backlog placeholders specced:** IND-P1-ROC-MOMENTUM · IND-P1-RELATIVE-STRENGTH · IND-P1-52W-HIGH-PROXIMITY · IND-P1-FOREIGN-ACCUM-RANK
**Gate cleared:** IND-P1-CONSUMER-WIRING-AUDIT done_verified (all 5 P0 tools consumed by >=1 helper agent); OHLCV-BACKFILL-P0 LIVE_VERIFIED; P0-2-FOREIGN-ROOM-SUITE LIVE_VERIFIED.
**Status:** spec_complete — hand off to architect

---

## Standing Hard Contracts (Non-Negotiable Across All 4 Tools)

**NO FAKE DATA.**
- Every scalar value MUST be REAL or DERIVED from real data in `daily_ohlcv`, `vnstock_trading_stats`, or `foreign_room_events`.
- Absent source → **honest-NULL** with an explicit `null_reason` string field. NEVER default-fill, NEVER estimate, NEVER fabricate.
- Honest-NULL is the **DESIGNED PASS STATE** — the same contract the P0 tools hold. A tool that returns `null` with `null_reason: "insufficient_history"` is correct behavior, not a bug.
- QA gate: verify `null_reason` appears in the live response when triggered — a bare `null` with no reason is a defect.

---

## Cascade Architecture Directive (Mandatory for Architect)

This wave MUST be split across TWO service zones:

| Zone | Service | Tools |
|---|---|---|
| `apps/technical-analysis` | dev-technical-analysis (Go) | `get_roc_momentum` · `get_relative_strength` · `get_52w_proximity` |
| `apps/stock-price` | dev-stock-price (Go) | `get_foreign_accum_rank` |

**Rationale:** ROC-Momentum, Cross-Sectional RS, and 52W-High-Proximity all read `daily_ohlcv` and VN-Index data — these are OHLCV-derived computations owned by the technical-analysis service. Foreign-Accumulation Momentum Rank reads `vnstock_trading_stats` (daily foreign flow) and `foreign_room_events` (from P0-2 Foreign-Room suite) — these data planes are owned by the stock-price service. Cross-zone reads are prohibited per zone isolation policy.

Architect MUST NOT colocate all 4 in one service. Each service group gets its own architect sub-task in PM decomposition.

---

## Tool 1 — ROC-Momentum (`get_roc_momentum`)

**Backlog ref:** IND-P1-ROC-MOMENTUM
**Zone:** apps/technical-analysis
**Roadmap description:** Multi-Horizon ROC Momentum Factor (12-1), Jegadeesh-Titman skip-month, z-score/decile, factor-return series. Closes DP backtest/Brier requirement.
**Consumers (success_metric gate):** DP · CHEF · MW
**Effort:** S

### DDD Layer Map

| Layer | Content |
|---|---|
| Domain | ROC formula per ticker per horizon: `roc(t, n) = (close_t / close_{t-n}) - 1`; skip-month exclusion (most-recent 21 trading days excluded from 12-month window = Jegadeesh-Titman); z-score cross-sectional normalization; decile rank 1–10 |
| Application | Factor-return series aggregation: for each decile, compute average next-period return; classify MOMENTUM_LEADER (decile 10) / MOMENTUM_LAGGARD (decile 1) / NEUTRAL |
| Infrastructure | Read `daily_ohlcv` (ticker, date, close) for all watchlist tickers; needs 273 calendar-adjacent trading bars (252d lookback + 21d skip + 1 current) |
| Interface | MCP tool handler `get_roc_momentum`; returns ranked list per ticker + cross-sectional stats |

### Functional Requirements

- **FR-1 (domain):** Compute rolling 12-1 month ROC for each ticker in the watchlist using `daily_ohlcv.close`. The 12-month window = bars from `t-252` to `t-22` (21-bar skip-month exclusion). Formula: `(close[t-22] / close[t-252]) - 1`.
- **FR-2 (domain):** Cross-sectionally z-score the raw ROC values across all tickers with sufficient history: `z = (roc_i - mean(roc)) / stddev(roc)`. Decile rank: 1=lowest (laggard) to 10=highest (leader).
- **FR-3 (application):** Classify each ticker: `MOMENTUM_LEADER` (decile 8–10), `MOMENTUM_NEUTRAL` (decile 3–7), `MOMENTUM_LAGGARD` (decile 1–2).
- **FR-4 (application):** Output a factor-return snapshot: for each decile bucket, compute the average realized return over the prior 21-day forward window (this is the backward-looking factor-validity check — NOT a prediction). Closes DP's backtest/Brier calibration requirement by providing a real realized-return input.
- **FR-5 (domain/honest-null):** A ticker with fewer than 273 trading bars in `daily_ohlcv` MUST return `null` for all momentum fields with `null_reason: "insufficient_history"` (e.g., recently listed tickers). The ticker still appears in the response list; it is not silently dropped.
- **FR-6 (application/honest-null):** If fewer than 5 tickers have sufficient history to form a cross-sectional distribution, z-score and decile fields for ALL tickers MUST return `null` with `null_reason: "insufficient_cross_section"`. This is the honest-null for degenerate-population edge case.

### Non-Functional Requirements

- **NFR-1 (performance):** Full watchlist computation (<=50 tickers, 273 bars) MUST complete within 2 seconds.
- **NFR-2 (data freshness):** Tool reads the latest available close date in `daily_ohlcv` per ticker — not a fixed date. Include `computed_as_of` field = max close date used.
- **NFR-3 (no-fake-data):** z-score/decile are derived computations, not fetched — this is acceptable provided the input `close` values are all from real `daily_ohlcv` rows. Synthetic/interpolated closes are prohibited.

### Verification Gate

- AT-1: With full backfill history, `get_roc_momentum` returns `roc_12_1`, `z_score`, `decile` (1–10), `label` for every watchlist ticker with >=273 bars.
- AT-2: Tickers with <273 bars return `null` fields + explicit `null_reason: "insufficient_history"`.
- AT-3: `computed_as_of` matches the latest close date in `daily_ohlcv` for the majority ticker.
- AT-4: Tool is called by >=1 consumer (DP / CHEF / MW) in a helper agent session — verified via `get_tool_usage_stats` or Telegram work log.

### Edge Cases

- **Missing data:** Some tickers may have gaps mid-series (suspension days, circuit breaks). Gap policy: if a gap is <=3 sessions, forward-fill; if >3 sessions, mark `null_reason: "data_gap_too_large"` for that ticker.
- **VN price scale:** `daily_ohlcv.close` is stored in raw VND units (e.g., 50000 not 500). ROC formula is dimensionless — scale cancels out. No normalization needed.
- **All-same-direction market crash:** stddev(roc) → 0, z-scores undefined → `null_reason: "degenerate_distribution"` for z/decile. Raw ROC values still emitted.

---

## Tool 2 — Cross-Sectional Relative-Strength (`get_relative_strength`)

**Backlog ref:** IND-P1-RELATIVE-STRENGTH
**Zone:** apps/technical-analysis
**Roadmap description:** RSC percentile (63/126/252d) + Mansfield RS. Multi-horizon.
**Consumers (success_metric gate):** MW · CHEF · AC · DP · TNB
**Effort:** M

### DDD Layer Map

| Layer | Content |
|---|---|
| Domain | Per-ticker performance vs VN-Index benchmark over 63d / 126d / 252d windows; Mansfield RS = (stock % change - index % change); percentile rank cross-sectionally within watchlist |
| Application | Classify RS posture: LEADING (top quartile, >=75th pct), LAGGING (bottom quartile, <=25th pct), IN_LINE (middle) per each horizon; composite RS signal (average of 3 horizon percentiles) |
| Infrastructure | Read `daily_ohlcv` (ticker + VN-Index rows) for 252d; VN-Index treated as a special ticker in `daily_ohlcv` (ticker_id = 'VNINDEX' or equivalent — ARCH-RATIFY-RS-1 confirms canonical ticker_id) |
| Interface | MCP tool handler `get_relative_strength`; per-ticker RS percentile at 3 horizons + Mansfield RS + label + composite |

### Functional Requirements

- **FR-1 (domain):** For each watchlist ticker, compute % price change over 63d, 126d, 252d windows using `daily_ohlcv.close`.
- **FR-2 (domain):** Compute VN-Index % change over the same 3 windows. VN-Index MUST be sourced from `daily_ohlcv` itself — not from a runtime API call (avoids cross-service coupling).
- **FR-3 (domain):** Mansfield RS (3-horizon) = `(stock_%change_Nd - index_%change_Nd)` — positive = stock outperforms, negative = underperforms.
- **FR-4 (domain):** Cross-sectional percentile rank: for each horizon, rank each ticker's Mansfield RS among all tickers with sufficient history. Percentile = `(rank / N) * 100`.
- **FR-5 (application):** Classify RS posture per horizon: `LEADING` (percentile >=75), `LAGGING` (percentile <=25), `IN_LINE` (26–74).
- **FR-6 (application):** Composite RS score = arithmetic mean of the 3 horizon percentiles. Composite label: `STRONG` (composite >=70), `WEAK` (composite <=30), `NEUTRAL` (31–69).
- **FR-7 (domain/honest-null):** A ticker with <63 bars returns `null` for all RS fields with `null_reason: "insufficient_history_63d"`. A ticker with >=63 but <126 bars returns the 63d RS real, and 126d/252d RS as `null` with explicit per-field null_reason. Partial results are valid and preferred over full-null.
- **FR-8 (domain/honest-null):** If VN-Index is absent from `daily_ohlcv` for a required window, ALL tickers return `null` for RS with `null_reason: "index_data_absent"`. This is the honest-null for missing benchmark.

### Non-Functional Requirements

- **NFR-1:** Computation for full watchlist (<=50 tickers, 252 bars) MUST complete within 3 seconds.
- **NFR-2:** Include `computed_as_of` = max(close date across all tickers + index).
- **NFR-3:** VN-Index lookup MUST read from `daily_ohlcv` — never from a live fetch during the tool call.

### Verification Gate

- AT-1: Response contains `rs_63d_pct`, `rs_126d_pct`, `rs_252d_pct`, `mansfield_rs_63d`, `composite_rs_score`, `composite_label` per ticker.
- AT-2: A ticker with 70 bars of history: 63d fields are real, 126d/252d fields are null with distinct `null_reason` values.
- AT-3: All percentile values are in [0, 100]; composite score = mean of non-null horizon percentiles (not null-penalized average).
- AT-4: Tool consumed by >=1 of MW / CHEF / AC / DP / TNB.

### Edge Cases

- **VN-Index ticker_id:** ARCH-RATIFY-RS-1 — architect must confirm the canonical ticker_id used for VN-Index in `daily_ohlcv` (e.g., `VNINDEX`, `VNI`, or a numeric ID). If not present, architect proposes the ingestion fix.
- **Data gap on VN-Index:** VN-Index suspension dates (national holidays, force-close days) — use last available close for the gap day (forward-fill for VN-Index only, same as the exchange's reference price convention).
- **Watchlist size <5:** Percentile ranking with N<5 is unreliable but still real. Include `low_sample_warning: true` field when N<5.

---

## Tool 3 — 52-Week-High Proximity (`get_52w_proximity`)

**Backlog ref:** IND-P1-52W-HIGH-PROXIMITY
**Zone:** apps/technical-analysis
**Roadmap description:** %-from-52w-high/low, %>MA50/MA200, net-new-highs line.
**Consumers (success_metric gate):** MW · AC · CHEF
**Effort:** M

### DDD Layer Map

| Layer | Content |
|---|---|
| Domain | Per-ticker: `pct_from_52w_high = (close - max_close_252d) / max_close_252d`; `pct_from_52w_low = (close - min_close_252d) / min_close_252d`; above_ma50 flag; above_ma200 flag |
| Application | Classify proximity posture: `AT_HIGH` (within 2% of 52w high), `NEAR_HIGH` (2–10% below), `MID_RANGE`, `NEAR_LOW` (2–10% above 52w low), `AT_LOW` (within 2% of 52w low); net-new-highs line (aggregated across watchlist) |
| Infrastructure | Read `daily_ohlcv` (ticker, date, close) — 252d for 52w high/low; 50d and 200d for MA |
| Interface | MCP tool handler `get_52w_proximity`; per-ticker proximity scalars + labels + net-new-highs aggregate |

### Functional Requirements

- **FR-1 (domain):** For each ticker, compute:
  - `high_52w = max(close)` over the trailing 252 trading bars in `daily_ohlcv`
  - `low_52w = min(close)` over the same 252 bars
  - `pct_from_52w_high = (current_close - high_52w) / high_52w` (will be <=0 unless price exceeds prior 52w high — possible on breakouts)
  - `pct_from_52w_low = (current_close - low_52w) / low_52w` (will be >=0)
- **FR-2 (domain):** `above_ma50 = current_close > ma50` (50-period SMA); `above_ma200 = current_close > ma200` (200-period SMA). MA200 requires 200 bars — honest-null per FR-5 below.
- **FR-3 (domain):** `new_high_today = (current_close == high_52w)` — boolean flag at ticker level.
- **FR-4 (application):** Proximity label per ticker:
  - `AT_HIGH`: `pct_from_52w_high >= -0.02` (within 2%)
  - `NEAR_HIGH`: `-0.10 <= pct_from_52w_high < -0.02`
  - `NEAR_LOW`: `0.00 <= pct_from_52w_low <= 0.10`
  - `AT_LOW`: `pct_from_52w_low <= 0.02`
  - `MID_RANGE`: all others
- **FR-5 (application/aggregate):** Net-new-highs line (watchlist aggregate):
  - `new_highs_count` = count of tickers where `new_high_today = true`
  - `new_lows_count` = count of tickers where `pct_from_52w_low <= 0.02` AND current_close == min_close_252d
  - `net_new_highs = new_highs_count - new_lows_count`
  - `pct_above_ma50` = (count above_ma50 = true) / total tickers with >=50 bars
  - `pct_above_ma200` = (count above_ma200 = true) / total tickers with >=200 bars
- **FR-6 (domain/honest-null):** Tickers with <252 bars: `high_52w`, `low_52w`, `pct_from_52w_high`, `pct_from_52w_low` are `null` with `null_reason: "insufficient_history_252d"`. Tickers with >=50 but <252 bars: `above_ma50` is real, `above_ma200` and 52w fields are null with distinct null_reason.
- **FR-7 (domain/honest-null):** `pct_above_ma200` denominator MUST exclude tickers with <200 bars. Include `denominator_ma200` field = count of tickers with >=200 bars, so consumers know the sample size.

### Non-Functional Requirements

- **NFR-1:** Full watchlist within 2 seconds.
- **NFR-2:** `computed_as_of` = the close date used (latest common date across tickers).
- **NFR-3:** All percentage fields are decimal fractions (e.g., `-0.03` not `-3`). Consistent with existing `get_volatility_indicators` convention.

### Verification Gate

- AT-1: Response contains `high_52w`, `low_52w`, `pct_from_52w_high`, `pct_from_52w_low`, `above_ma50`, `above_ma200`, `proximity_label`, `new_high_today` per ticker.
- AT-2: `net_new_highs`, `pct_above_ma50`, `pct_above_ma200`, `denominator_ma200` in the aggregate section.
- AT-3: A ticker with 60 days of history: `above_ma50` real, `above_ma200` null with `null_reason`, 52w fields null with `null_reason`.
- AT-4: `pct_from_52w_high` <=0 for all tickers (unless in breakout); `pct_from_52w_low` >=0 for all tickers. Plausibility check.
- AT-5: Tool consumed by >=1 of MW / AC / CHEF.

### Edge Cases

- **Recently relisted tickers:** A ticker may have a gap > 6 months due to delisting/relisting. If `daily_ohlcv` has <252 continuous bars, use whatever bars are present and return honest-null for the 252-bar fields with `null_reason: "insufficient_history_252d"`.
- **Upper/lower circuit on close date:** A close at ceiling price is still a valid close — no special handling needed. The proximity label correctly captures this (likely `AT_HIGH`).
- **VN-Index as a ticker in watchlist:** VN-Index does not have MA50/MA200 in the same context as individual stocks. If VNINDEX is requested, still compute using daily_ohlcv data — valid behavior.

---

## Tool 4 — Foreign-Accumulation Momentum Rank (`get_foreign_accum_rank`)

**Backlog ref:** IND-P1-FOREIGN-ACCUM-RANK
**Zone:** apps/stock-price
**Roadmap description:** ADTV-normalized 5/20d foreign net-flow z-rank + room_exhaustion flag. Build after P0 Foreign-Room suite live.
**Gate:** P0-2-FOREIGN-ROOM-SUITE LIVE_VERIFIED (cleared 2026-06-30).
**Consumers (success_metric gate):** MW · CHEF · AC · NS
**Effort:** M

### DDD Layer Map

| Layer | Content |
|---|---|
| Domain | Per-ticker foreign net-flow = `foreign_buy_vol - foreign_sell_vol` per day (from `vnstock_trading_stats`); ADTV-normalization = `net_flow_VND / adtv_VND` where adtv = 20d average daily turnover; 5d and 20d cumulative net-flow; z-score of ADTV-normalized 5d net-flow cross-sectionally |
| Application | Rank tickers by ADTV-normalized 5d z-score (descending = most accumulated); classify: `ACCUMULATING` (z>=1.5), `DISTRIBUTING` (z<=-1.5), `NEUTRAL`; `room_exhaustion` flag from `foreign_room_events` |
| Infrastructure | Read `vnstock_trading_stats` (ticker, date, foreign_buy_vol, foreign_sell_vol, turnover/total_volume for ADTV); read `foreign_room_events` (room_utilization, ROOM_LOCKED/FULL_ROOM_SELL flags from P0-2) |
| Interface | MCP tool handler `get_foreign_accum_rank`; ranked list per ticker with net-flow scalars + z-rank + accumulation label + room_exhaustion flag |

### Functional Requirements

- **FR-1 (infrastructure):** Read from `vnstock_trading_stats` table: for each watchlist ticker, fetch the trailing 20 daily rows sorted by date DESC. Required columns: `foreign_buy_vol`, `foreign_sell_vol`, and either `total_vol` or `turnover_vnd` for ADTV computation. ARCH-RATIFY-FAR-1: architect confirms available column names in the live `vnstock_trading_stats` schema.
- **FR-2 (domain):** Per-ticker per-day: `net_foreign_flow_vol = foreign_buy_vol - foreign_sell_vol`. Positive = net foreign buy; negative = net foreign sell.
- **FR-3 (domain):** ADTV (Average Daily Turnover): `adtv_20d = mean(total_vol_per_day)` over the 20-day window. If `turnover_vnd` is directly available, prefer it over reconstructing from vol×price.
- **FR-4 (domain):** ADTV-normalized daily flow: `normalized_flow_d = net_foreign_flow_vol_d / adtv_20d`. This makes flow comparable across large-cap (high ADTV) and small-cap (low ADTV) names.
- **FR-5 (domain):** 5d and 20d cumulative normalized flow:
  - `cum_net_flow_5d = sum(normalized_flow_d)` for last 5 rows
  - `cum_net_flow_20d = sum(normalized_flow_d)` for all 20 rows
- **FR-6 (domain):** Cross-sectional z-score of `cum_net_flow_5d` across all tickers with >=5 bars: `z = (cum_net_flow_5d_i - mean) / stddev`.
- **FR-7 (application):** Rank tickers by z-score descending. Include `rank` integer (1 = most accumulated, N = most distributed).
- **FR-8 (application):** Classification label per ticker: `ACCUMULATING` (z>=1.5), `DISTRIBUTING` (z<=-1.5), `NEUTRAL`.
- **FR-9 (infrastructure):** `room_exhaustion` flag per ticker: read from `foreign_room_events` table (P0-2 output). Flag = true if latest event for the ticker has `ROOM_LOCKED=true` OR `FULL_ROOM_SELL=true`. If no event row for ticker, flag = `null` with `null_reason: "room_event_not_found"` (NOT default false — absence is NOT proof of no exhaustion).
- **FR-10 (domain/honest-null):** Tickers with <5 bars in `vnstock_trading_stats`: all flow fields `null` with `null_reason: "insufficient_flow_history"`. Tickers with <20 bars but >=5: `cum_net_flow_5d` and z-score are real; `cum_net_flow_20d` returns `null` with `null_reason: "insufficient_20d_history"`. Partial is valid.
- **FR-11 (domain/honest-null):** If `adtv_20d = 0` for a ticker (e.g., suspended stock with zero volume), ADTV-normalized flow is undefined — `null` with `null_reason: "zero_adtv"`. Raw net_foreign_flow_vol may still be reported.
- **FR-12 (honest-null edge — degenerate population):** If fewer than 3 tickers have >=5 bars, cross-sectional z-score returns `null` for all with `null_reason: "insufficient_cross_section"`.

### Non-Functional Requirements

- **NFR-1:** Computation for full watchlist within 2 seconds.
- **NFR-2:** `computed_as_of` = latest date in `vnstock_trading_stats` rows used.
- **NFR-3:** Flow values are in volume units (shares/contracts), not VND — unless `turnover_vnd` is used, in which case `adtv_unit: "vnd"` field is present in response. Architect decides unit convention per ARCH-RATIFY-FAR-1.
- **NFR-4:** The `room_exhaustion` lookup MUST be a read-only join — NEVER trigger a re-fetch of room data during this tool call.

### Verification Gate

- AT-1: Response contains per-ticker `net_flow_5d_raw`, `net_flow_20d_raw`, `cum_net_flow_5d_normalized`, `cum_net_flow_20d_normalized`, `z_score_5d`, `rank`, `label`, `room_exhaustion`.
- AT-2: A ticker with 8 bars: `cum_net_flow_5d_normalized` and z_score real; `cum_net_flow_20d_normalized` null with `null_reason`.
- AT-3: Tickers with `ROOM_LOCKED` in `foreign_room_events` show `room_exhaustion: true`.
- AT-4: `room_exhaustion: null` + `null_reason: "room_event_not_found"` for tickers with no `foreign_room_events` row (NOT false).
- AT-5: Tool consumed by >=1 of MW / CHEF / AC / NS.

### Edge Cases

- **Foreign ownership full (100% room used) but no ROOM_LOCKED event yet written:** The event table is written by the P0-2 pipeline. If there is a lag between the condition being true in `vnstock_trading_stats` and the event row being written, `room_exhaustion` may be stale. This is known and acceptable: `get_foreign_accum_rank` is read-only against events; event write latency is a P0-2 concern, not this tool's.
- **Negative ADTV-normalized flow:** Valid — indicates net foreign selling pressure. Consumers (MW, CHEF) must interpret sign correctly. Documentation in tool description field.
- **Newly listed ticker:** <5 sessions → honest-null for all flow fields. Not dropped from response.

---

## Architect Ratification Items (Non-Blocking — Dev Can Proceed in Parallel)

| ID | Tool | Question | Recommendation |
|---|---|---|---|
| ARCH-RATIFY-RS-1 | get_relative_strength | What is the canonical ticker_id for VN-Index in `daily_ohlcv`? | Probe live DB: `SELECT DISTINCT ticker FROM daily_ohlcv WHERE ticker LIKE '%VNI%' OR ticker LIKE '%INDEX%'`. If absent, architect adds ingestion. |
| ARCH-RATIFY-ROC-1 | get_roc_momentum | Should the factor-return series be persisted to a new table or computed-on-read each call? | Recommendation: compute-on-read for P1 (avoids schema churn); revisit for P2 if perf is issue. |
| ARCH-RATIFY-52W-1 | get_52w_proximity | MA50/MA200 — compute inline from `daily_ohlcv` or reuse the existing MA5/20/50 already in `get_technical_indicators`? | Reuse existing MA computation logic if in the same service; do NOT cross-service call. |
| ARCH-RATIFY-FAR-1 | get_foreign_accum_rank | Confirm `vnstock_trading_stats` column names for foreign_buy_vol, foreign_sell_vol, daily turnover. Also confirm `foreign_room_events` schema from P0-2 implementation. | Probe: `SELECT * FROM vnstock_trading_stats LIMIT 1` and `SELECT * FROM foreign_room_events LIMIT 1`. |
| ARCH-RATIFY-FAR-2 | get_foreign_accum_rank | Unit convention: volume (shares) or VND turnover for ADTV normalization? | Prefer VND if `turnover_vnd` col exists (more meaningful for cross-cap comparison). Emit `adtv_unit` field in response either way. |

**None of these block architect starting work.** All are probe-and-decide items resolvable by the architect during the design phase.

---

## PO Blockers

**Zero PO blockers.** All design parameters are locked in the verified roadmap. No question requires PO resolution before architect starts.

---

## Integration with P0 Consumer Wave

All 4 tools MUST emit a named scalar consumable by helper agents, consistent with the P0 gauge-readiness pattern established in BA-MARKET-INDICATOR-DEPTH-P0:

| Tool | Named scalar for Fear & Greed (future P1 FEAR-GREED leg) |
|---|---|
| `get_roc_momentum` | `momentum_factor_z` — cross-sectional z-score median across deciles |
| `get_relative_strength` | `market_rs_composite` — mean composite RS across watchlist |
| `get_52w_proximity` | `net_new_highs` — net new highs line (aggregate) |
| `get_foreign_accum_rank` | `foreign_accum_z_market` — cross-sectional z-score mean (positive = net accumulation market-wide) |

These scalars are forward-hooks for IND-P1-FEAR-GREED composition. They do NOT change the tool's primary per-ticker response structure — they are additional top-level aggregate fields.

---

## Verification Gate (Tool-Level, Consistent with P0 Bar)

**Each tool ships when:** consumed by >=1 helper agent AND the honest-null contract is verified live (a ticker with insufficient history returns `null` + `null_reason`, not a default/fabricated value).

QA must verify BOTH the happy-path (real values for tickers with full history) AND the null-path (null + reason for under-history tickers) before marking any tool DONE.

---

## [Architect] Brownfield Findings

**Task ID:** BA-IND-P1-MOMENTUM-RS
**Architect cycle:** 2026-06-30T02:00Z
**BUILD-STANDARD:** lean (all 2 zones brownfield — existing microservices extended, no new service)

---

### Zone

**MANDATORY split — 2 zones, 2 service-specific developer subtasks:**

| Zone | Service | Language | Dev agent | Tools |
|---|---|---|---|---|
| `apps/technical-analysis/` | technical-analysis (port 5003) | **Go** (`pkg/` + `cmd/`) | dev-technical-analysis | `get_roc_momentum`, `get_relative_strength`, `get_52w_proximity` |
| `apps/stock-price/` | stock-price (port 5000) | **Go** (`pkg/` + `cmd/`) | dev-stock-price | `get_foreign_accum_rank` |

**WARNING — DEAD CODE:** `apps/technical-analysis/src/` contains TypeScript files that are INACTIVE. The Dockerfile builds ONLY from `pkg/` and `cmd/`. Developer MUST NOT touch `src/`. All new code goes in `pkg/`.

MCP proxy layer (existing pattern, extends both zones):
- `apps/mcp-server/src/interface/mcp/tools/market-data/` — new tool file per tool
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — new `computeX()` function per tool
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register each tool

---

### ARCH-RATIFY Resolutions (5 items — all resolved via live code probe)

**ARCH-RATIFY-RS-1: VN-Index ticker_id in `daily_ohlcv`**
- **RESOLVED: `code = "VNINDEX"`**
- Evidence: `apps/mcp-server/src/scheduler/market-data/ohlcvHistoryBackfillJob.ts` line 52 defines `VNINDEX_CODE = "VNINDEX"`; lines 249-251 unconditionally prepend VNINDEX to every backfill run. VNINDEX rows ARE in `daily_ohlcv`.
- The `vn_index_cache` table stores only the LATEST snapshot (no time-series) — `get_relative_strength` MUST read from `daily_ohlcv`, not from `vn_index_cache`.

**ARCH-RATIFY-ROC-1: Factor-return series persistence**
- **RESOLVED: compute-on-read for P1**
- No new table; no schema churn. If P2 perf profiling shows >2s under 50 tickers, revisit by adding `roc_factor_cache` table in P2.

**ARCH-RATIFY-FAR-1: `vnstock_trading_stats` column names for foreign flow — CRITICAL MISMATCH**
- **RESOLVED: Foreign flow (buy/sell/net/volume) is in `daily_ohlcv`, NOT in `vnstock_trading_stats`**
- Probed `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` (lines 308-327): `vnstock_trading_stats` actual columns are: `code, date, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio, avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, market_cap_bn, fetched_at`. NO `foreign_buy_vol`, NO `foreign_sell_vol`, NO `turnover_vnd`.
- `daily_ohlcv` actual columns include: `foreign_buy_vol REAL, foreign_sell_vol REAL, foreign_net_vol REAL, volume REAL`. This is the CORRECT source for `get_foreign_accum_rank`.
- The `vnstock_trading_stats.foreign_volume` is total foreign holdings (cumulative position), NOT daily net-buy flow.
- **PM MUST flag this explicitly in the dev-stock-price task spec.**

**ARCH-RATIFY-FAR-2: ADTV unit convention**
- **RESOLVED: volume-shares unit from `daily_ohlcv.volume`**
- No VND turnover column exists in `daily_ohlcv`. ADTV = `mean(volume)` over 20d (shares). Normalization ratio = `net_foreign_flow_shares / adtv_20d_shares` (dimensionless, comparable across caps).
- Optional VND reconstruction: `volume × close` is feasible but adds complexity for no gain vs shares-normalized (cross-sectional comparison is preserved either way).
- Response MUST include `adtv_unit: "shares"` field per BA NFR-3.

**ARCH-RATIFY-52W: denominator_ma200 transparency field**
- **RESOLVED: Include in aggregate section, exclude tickers with <200 bars from denominator**
- MA50 and MA200 are both SMA computed from `close` column — reuse the existing `TACalculator` (Go, `pkg/infrastructure/calculator.go`) with period=200. The `calculateMA()` function already handles arbitrary periods.

**ADDITIONAL RATIFY — foreign_room_events event_type correction:**
- BA spec referenced `ROOM_LOCKED` and `FULL_ROOM_SELL` flags.
- **Actual schema** (`schema-financial-reports.ts` lines 736-747): `event_type TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN'))`.
- Mapping: `room_exhaustion = true` when the most recent event for the ticker is `ROOM_FULL` with no subsequent `ROOM_REOPEN`. There is NO `FULL_ROOM_SELL` event type. Implement accordingly.

---

### Verified Paths

**Zone 1 — apps/technical-analysis (Go, active under `pkg/`)**

Existing, verified:
- `pkg/domain/ports.go:1-16` — `PriceHistoryRepository`, `TAIndicatorCalculator` interfaces
- `pkg/domain/models.go` — `CandleStick`, `TechnicalIndicators`
- `pkg/domain/volatility_ports.go` — `OHLCVRepository` port (OHLCV bar reads)
- `pkg/domain/volatility_models.go` — `OHLCVBar`, `VolatilityResult`, regime types
- `pkg/domain/volatility_service.go` — `VolatilityService` (pure domain math)
- `pkg/infrastructure/calculator.go` — `TACalculator` with MA (arbitrary period), RSI, MACD, BB
- `pkg/infrastructure/repositories.go` — `SQLitePriceRepository` (close-only reads from `daily_ohlcv`)
- `pkg/infrastructure/ohlcv_repository.go` — `SQLiteOHLCVRepository` (full OHLCV bar reads, `SELECT date, open, high, low, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT ?`)
- `pkg/application/usecases.go` — `ComputeTAUseCase`
- `pkg/application/volatility_usecase.go` + `pkg/application/volatility_dtos.go`
- `pkg/interface/http/router.go` — chi router; routes: `POST /ta/indicators`, `POST /ta/volatility-indicators`
- `pkg/interface/http/volatility_handler.go` — handler pattern to follow
- `cmd/server/main.go` — composition root; wires infrastructure → domain → app → interface; reads `DB_PATH`, `PORT`, `WATCHLIST_TICKERS` env vars

**Zone 2 — apps/stock-price (Go, active under `pkg/`)**

Existing, verified:
- `pkg/domain/ports.go:1-15` — `PriceFetcherPort`, `PriceHistoryPort`
- `pkg/domain/models.go` — `PriceQuote`, `DailyOHLCV`, `PriceNotAvailableError`
- `pkg/infrastructure/fetchers.go` — HTTP price fetchers
- `pkg/application/usecases.go` — `FetchPriceUseCase`, `PriceHistoryUseCase`
- `pkg/interface/http/router.go` — `RegisterRoutes()` with `GET /health`, `POST /price/fetch`, `GET /price/history`
- `cmd/server/main.go` (inferred) — composition root

**MCP-Server — client pattern:**
- `apps/mcp-server/src/infrastructure/microservices/clients.ts:25` — `ta: Bun.env.TA_SERVICE_URL ?? 'http://localhost:5003'`
- `clients.ts:245` — `computeVolatilityIndicators()` function pattern to follow for new tools
- `apps/mcp-server/src/interface/mcp/tools/market-data/volatilityIndicatorTools.ts` — registration pattern: import client function → `server.tool(name, description, schema, handler)`
- `apps/mcp-server/src/interface/mcp/tools/registry.ts:262` — `registerVolatilityIndicatorTools` registration pattern

---

### Design Decisions

**Decision 1 — Multi-ticker OHLCV repository (Zone 1)**
All 3 technical-analysis tools need data for N tickers × M bars. The existing `SQLiteOHLCVRepository` reads one ticker at a time. Add `SQLiteMultiTickerOHLCVRepository` implementing a new `MultiTickerOHLCVRepository` port. Uses parameterized `WHERE code IN (?, ?, ...)` query to fetch all tickers in one round-trip. Sorted by `(code, date ASC)` for deterministic output.

**Decision 2 — MA200 computation inline (Zone 1, ARCH-RATIFY-52W)**
`TACalculator.calculateMA(closes, 200)` works as-is for 200-period SMA. No new primitive needed. For tickers with <200 bars, `calculateMA` returns `null` (period > length check already in place). The `get_52w_proximity` service uses the same calculator instance.

**Decision 3 — Factor-return series: compute-on-read (ARCH-RATIFY-ROC-1)**
The ROC domain service computes the factor-return snapshot from the same closes array already in memory. No DB write. No new table. This is a single additional aggregation pass over the already-sorted decile buckets.

**Decision 4 — get_foreign_accum_rank data source: daily_ohlcv not vnstock_trading_stats**
See ARCH-RATIFY-FAR-1 above. `foreign_room_events` is read-only for the `room_exhaustion` flag; never triggers a re-fetch.

**Decision 5 — Shared DB (Zone 2 reads market.db)**
The stock-price service reads the same `market.db` file via `DB_PATH` env var. Reading `daily_ohlcv` and `foreign_room_events` (both in market.db) from the stock-price process is a read-only DB join — no cross-service HTTP call, no write hazard. The stock-price service already opens market.db for `PriceHistoryUseCase`. The new `ForeignFlowRepository` opens the same file.

---

### Files to Create / Modify

**Zone 1: apps/technical-analysis**

New files — Go domain:
- `pkg/domain/momentum_models.go` — `ROCPerTickerResult`, `FactorReturnBucket`, `CrossSectionalROCResult`; `MomentumLabel` enum (`MOMENTUM_LEADER`/`MOMENTUM_NEUTRAL`/`MOMENTUM_LAGGARD`)
- `pkg/domain/momentum_service.go` — `CalculateROCMomentumService`: ROC formula, gap policy (<=3d forward-fill, >3d → null), z-score, decile, factor-return aggregation; degenerate-stddev guard → `null_reason: "degenerate_distribution"`
- `pkg/domain/relative_strength_models.go` — `RSHorizonResult` (63d/126d/252d Mansfield RS + percentile), `CompositeRSResult`, `RSLabel` enum
- `pkg/domain/relative_strength_service.go` — `CalculateRelativeStrengthService`: multi-horizon RS vs VNINDEX; `index_data_absent` guard; partial RS (>=63d real, <126d null)
- `pkg/domain/proximity_models.go` — `ProximityResult`, `ProximityLabel` enum, `NetNewHighsAggregate`; `denominator_ma200` in aggregate
- `pkg/domain/proximity_service.go` — `Calculate52WProximityService`: 52w high/low, MA50/MA200 inline, proximity label, net-new-highs aggregate

New port (shared across all 3 TA tools):
- `pkg/domain/multi_ticker_ports.go` — `MultiTickerOHLCVRepository` port interface: `GetMultiTickerCandles(codes []string, limit int) (map[string][]OHLCVBar, error)`

New files — Go application:
- `pkg/application/momentum_dtos.go` — `ROCMomentumRequest` (optional: `tickers []string`), `ROCMomentumResponse`
- `pkg/application/momentum_usecase.go` — `ComputeROCMomentumUseCase`; reads `WATCHLIST_TICKERS` from env or from request
- `pkg/application/relative_strength_dtos.go` — `RSRequest`, `RSResponse`
- `pkg/application/relative_strength_usecase.go` — `ComputeRelativeStrengthUseCase`; prepends VNINDEX to ticker list
- `pkg/application/proximity_dtos.go` — `ProximityRequest`, `ProximityResponse`
- `pkg/application/proximity_usecase.go` — `Compute52WProximityUseCase`

New files — Go infrastructure:
- `pkg/infrastructure/multi_ticker_ohlcv_repository.go` — `SQLiteMultiTickerOHLCVRepository implements MultiTickerOHLCVRepository`; single `SELECT date, open, high, low, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol FROM daily_ohlcv WHERE code IN (%s) ORDER BY code, date ASC LIMIT ?` with IN-clause parameterization

New files — Go interface:
- `pkg/interface/http/momentum_handler.go` — `handleROCMomentum(uc, logger)` — `POST /ta/roc-momentum`
- `pkg/interface/http/relative_strength_handler.go` — `handleRelativeStrength(uc, logger)` — `POST /ta/relative-strength`
- `pkg/interface/http/proximity_handler.go` — `handle52WProximity(uc, logger)` — `POST /ta/52w-proximity`

Modified files:
- `pkg/interface/http/router.go` — add 3 routes + extend `NewRouter()` signature: `(useCase, volUseCase, rocUseCase, rsUseCase, proxUseCase, logger)` or pass a `HandlerConfig` struct
- `cmd/server/main.go` — wire `SQLiteMultiTickerOHLCVRepository` + 3 new domain services + 3 new use cases into router

New files — MCP-server proxy:
- `apps/mcp-server/src/interface/mcp/tools/market-data/rocMomentumTools.ts` — register `get_roc_momentum`; proxy to `POST /ta/roc-momentum`
- `apps/mcp-server/src/interface/mcp/tools/market-data/relativeStrengthTools.ts` — register `get_relative_strength`; proxy to `POST /ta/relative-strength`
- `apps/mcp-server/src/interface/mcp/tools/market-data/52wProximityTools.ts` — register `get_52w_proximity`; proxy to `POST /ta/52w-proximity`

Modified files — MCP-server:
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — add `computeROCMomentum()`, `computeRelativeStrength()`, `compute52WProximity()` following `computeVolatilityIndicators()` pattern (env: `TA_SERVICE_URL ?? 'http://localhost:5003'`)
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — 3 new imports + registration calls

**Zone 2: apps/stock-price**

New files — Go domain:
- `pkg/domain/foreign_accum_models.go` — `ForeignFlowBar` (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume), `ForeignAccumResult`, `AccumLabel` enum (`ACCUMULATING`/`DISTRIBUTING`/`NEUTRAL`)
- `pkg/domain/foreign_accum_ports.go` — `ForeignFlowRepository` port: `GetForeignFlow(codes []string, limit int) (map[string][]ForeignFlowBar, error)`; `RoomEventRepository` port: `GetLatestRoomEvent(code string) (*RoomEvent, error)` returning event_type `ROOM_FULL`/`ROOM_REOPEN`
- `pkg/domain/foreign_accum_service.go` — `CalculateForeignAccumService`: ADTV normalization (shares), 5d/20d cumulative, z-score, rank, AccumLabel; zero-ADTV guard → `null_reason: "zero_adtv"`; insufficient-history guards per BA FR-10, FR-11, FR-12; degenerate population guard

New files — Go application:
- `pkg/application/foreign_accum_dtos.go` — `ForeignAccumRequest`, `ForeignAccumResponse` (includes `adtv_unit: "shares"`, `foreign_accum_z_market` gauge scalar, `computed_as_of`)
- `pkg/application/foreign_accum_usecase.go` — `ComputeForeignAccumUseCase`

New files — Go infrastructure:
- `pkg/infrastructure/foreign_flow_repository.go` — `SQLiteForeignFlowRepository implements ForeignFlowRepository`; reads `daily_ohlcv` (WHERE code IN (...) AND foreign_buy_vol IS NOT NULL); opens same `DB_PATH` (market.db)
- `pkg/infrastructure/room_event_repository.go` — `SQLiteRoomEventRepository implements RoomEventRepository`; reads `foreign_room_events` (latest event per ticker: `SELECT event_type FROM foreign_room_events WHERE code = ? ORDER BY event_date DESC LIMIT 1`); catches table-not-found → returns `(nil, nil)` (honest-null)

New files — Go interface:
- `pkg/interface/http/foreign_accum_handler.go` — `handleForeignAccumRank(uc, logger)` — `POST /price/foreign-accum-rank`

Modified files:
- `pkg/interface/http/router.go` — add `POST /price/foreign-accum-rank` route + extend `Handler` struct with `foreignAccumUC`
- `pkg/application/usecases.go` (or new cmd/server/main.go additions) — wire new repositories + service + use case

New files — MCP-server:
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignAccumRankTools.ts` — register `get_foreign_accum_rank`; proxy to `POST /price/foreign-accum-rank`

Modified files — MCP-server:
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — add `stockPrice` endpoint reference (env: `STOCK_PRICE_SERVICE_URL ?? 'http://localhost:5000'`) + `computeForeignAccumRank()` function
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — 1 new import + registration call

---

### Test Strategy

**Zone 1 (Go unit tests — follow existing `*_test.go` patterns):**
- `pkg/domain/momentum_service_test.go` — table-driven: full 273-bar ROC = real values; <273 bars = null+reason; all-same-direction = degenerate_distribution null for z/decile but raw ROC non-null; gap >3 sessions = null_reason data_gap_too_large; cross-section <5 tickers = null_reason insufficient_cross_section
- `pkg/domain/relative_strength_service_test.go` — VNINDEX missing = index_data_absent for all; 70-bar ticker = 63d real + 126d/252d null; low_sample_warning when N<5
- `pkg/domain/proximity_service_test.go` — <252 bars: 52w fields null; >=50 but <200: above_ma50 real + above_ma200 null; denominator_ma200 = count of tickers with >=200 bars; pct_from_52w_high <= 0 always (no breakout)
- `pkg/infrastructure/multi_ticker_ohlcv_repository_test.go` — integration: in-memory SQLite, populate daily_ohlcv, verify multi-ticker read

**Zone 2 (Go unit tests):**
- `pkg/domain/foreign_accum_service_test.go` — <5 bars: null+reason; zero ADTV: null+reason; ROOM_FULL latest event: room_exhaustion=true; no event row: room_exhaustion=null+reason; degenerate z: null+reason
- `pkg/infrastructure/foreign_flow_repository_test.go` — in-memory SQLite with daily_ohlcv + foreign_buy_vol/foreign_sell_vol columns

**Integration / e2e (MCP layer):**
- Verify `get_roc_momentum` returns `momentum_factor_z` gauge scalar
- Verify `get_foreign_accum_rank` returns `room_exhaustion: null` + `null_reason: "room_event_not_found"` (not false) for tickers with no `foreign_room_events` row (AT-4 in BA spec)
- Verify both happy-path (full history) and null-path (under-history) per QA gate

---

### Risk Flags

**RISK-1 [HIGH] — FA-DATA-SOURCE-MISMATCH:** `vnstock_trading_stats` does NOT have `foreign_buy_vol`/`foreign_sell_vol`. BA spec FR-1 incorrectly pointed to that table. Correct source: `daily_ohlcv`. PM MUST explicitly state this correction in the dev-stock-price task spec. Dev MUST NOT query `vnstock_trading_stats` for flow data.

**RISK-2 [HIGH] — FA-EVENT-TYPE-CORRECTION:** BA spec used `ROOM_LOCKED` and `FULL_ROOM_SELL` labels. Actual `foreign_room_events.event_type` enum is `('ROOM_FULL', 'ROOM_REOPEN')`. `room_exhaustion = true` when latest event is `ROOM_FULL` (no subsequent `ROOM_REOPEN`). PM MUST call this out in the dev-stock-price task.

**RISK-3 [HIGH] — TS-DEAD-CODE:** `apps/technical-analysis/src/` TypeScript files are inactive. Dockerfile builds from `pkg/` only. Dev-technical-analysis MUST work exclusively in `pkg/` and `cmd/`. Any TypeScript file edit is wasted work and risks confusion.

**RISK-4 [MEDIUM] — MULTI-TICKER-QUERY-IN-CLAUSE:** SQLite `IN (?, ?, ...)` with dynamic length needs parameterization at build time. Use `strings.Repeat("?,", n)` approach (Go). Limit to watchlist size (<=50 tickers) — safe.

**RISK-5 [MEDIUM] — VNINDEX-NULL-GATE:** If VNINDEX has no `daily_ohlcv` rows (fresh DB before backfill), `get_relative_strength` MUST return `null_reason: "index_data_absent"` for all tickers, NOT a 500/panic. Guard in `CalculateRelativeStrengthService`.

**RISK-6 [MEDIUM] — SHARED-DB-READ:** Stock-price service reads market.db (same file as mcp-server) via `DB_PATH` env. This is read-only — safe. BUT `daily_ohlcv.foreign_buy_vol`/`foreign_sell_vol` may be NULL for rows before the P0-2 foreign-flow column migration ran. The query MUST handle NULL gracefully (treat as 0 or skip row per FR-10).

**RISK-7 [LOW] — MA200-NULL-HONEST:** `calculateMA(closes, 200)` returns `null` when `len(closes) < 200`. Developer must return `null_reason: "insufficient_history_200d"` for `above_ma200`, NOT `false`. `false` would be data fabrication.

**RISK-8 [LOW] — ZERO-STDDEV-DEGENERATE:** If all tickers have identical ROC (e.g., market halt scenario), `stddev(roc) = 0` → z-score undefined. Return `null_reason: "degenerate_distribution"` for z/decile fields; raw ROC still emitted.

**RISK-9 [LOW] — ROUTER-SIGNATURE-GROWTH:** `NewRouter()` in technical-analysis now needs 3 new use case parameters. Use a `RouterConfig` struct to prevent signature explosion.

---

### Reuse Patterns

- **Do not duplicate** the `SQLiteOHLCVRepository` multi-ticker read — create `SQLiteMultiTickerOHLCVRepository` as a separate struct sharing the same DB_PATH pattern.
- **Extend** the `TACalculator` usage (MA200) — do NOT implement a second MA calculator.
- **Follow** the `volatility_handler.go` → `router.go` → `main.go` wiring pattern for all 3 new TA endpoints.
- **Follow** the `volatilityIndicatorTools.ts` → `clients.ts` → `registry.ts` MCP proxy pattern for all 4 new MCP tools.
- `WATCHLIST_TICKERS` env var already exists in `cmd/server/main.go` — reuse for multi-ticker use cases.

---

### Scan Clean

true — no existing code in either zone conflicts with or duplicates the required functionality. `get_technical_indicators` (single-ticker TA) and `get_volatility_indicators` (VN-Index volatility) are orthogonal to all 4 new tools.

---

### Feed-Forward Scalars (per BA Integration section)

Each tool MUST include these top-level aggregate fields alongside per-ticker data:

| Tool | Aggregate scalar | Description |
|---|---|---|
| `get_roc_momentum` | `momentum_factor_z` | median z-score across all deciles cross-sectionally |
| `get_relative_strength` | `market_rs_composite` | arithmetic mean of composite RS across watchlist |
| `get_52w_proximity` | `net_new_highs` | `new_highs_count - new_lows_count` (already a BA FR-5 field) |
| `get_foreign_accum_rank` | `foreign_accum_z_market` | mean z-score of `cum_net_flow_5d_normalized` across tickers with >=5 bars |

These are P1 Fear & Greed forward hooks — additive top-level fields, do not change per-ticker response structure.
