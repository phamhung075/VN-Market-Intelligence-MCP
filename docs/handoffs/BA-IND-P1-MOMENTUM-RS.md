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
