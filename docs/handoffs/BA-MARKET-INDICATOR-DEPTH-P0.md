# BA Spec — MARKET-INDICATOR-DEPTH-P0

**Task ID:** BA-INDICATOR-DEPTH-P0
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Status:** REVIEW — awaiting PO approval before architect
**BA:** ba · 2026-06-29T20:23:00Z
**Source of truth:** docs/roadmaps/vn-market-indicator-roadmap.md §3 (P0 block) + §5 (first sprint)
**Roadmap provenance:** 56-agent multi-agent gap analysis; VERIFIED; do NOT re-do.

---

## HARD GATE — baked into every FR

NO FAKE DATA. Every computed value MUST derive from data already on hand or already fetched.
Exactly what is excluded is in roadmap §4 — do NOT re-introduce any rejected item.
Any FR whose value would require an invented distribution (a z-score over a history we do not really have) MUST fail the gate.
QA done_verified flips ONLY after RAW live verify via gateway + no-fake-data adversarial check.

---

## Sprint-0 — OHLCV History Backfill (Parallel Prerequisite)

**Why parallel:** can run concurrently with planning but must complete before P0-1 Volatility Primitives testing, and before any P1 † items start.
**Why it is in-scope:** it is the single unlock for the entire dagger (†) momentum/long-horizon P1 family and for the 252d-drawdown output of P0-1.

### S0-FR-1: Drain the `ohlcv_backfill_queue` to push ~2yr daily bars

- **DDD layer:** infrastructure (scheduler job — existing `taOhlcvBackfillJob` or a dedicated backfill runner)
- **Data source:** VPS VnDirect dchart UDF JSON (Tier 1–2 real). Same endpoint as existing backfill. Queue table `ohlcv_backfill_queue` already holds 450 rows.
- **Target depth:** ~500 trading sessions (~2 calendar years) for VN-Index and every watchlist ticker
- **Target table:** `daily_ohlcv` (TEXT `date` YYYY-MM-DD, same schema, same unit invariant: full VND, not thousand-VND)
- **Owner:** dev-mcp-server (scheduler job in apps/mcp-server/src/scheduler/market-data/)
- **Constraint:** Must run through the established `writeOhlcvBatch` SSOT path (not a bypass writer) to respect the unit invariant guard. See project memory: feedback_ohlcv_startup_purge_defeated_by_backfill_seeder.

### S0-FR-2: Backfill completion signal

- **DDD layer:** infrastructure / domain
- **Requirement:** When all 450 queue rows are marked `done=1`, write a completion marker (e.g. `ohlcv_backfill_done_at` in a meta or config table, or a log line at INFO with row count) so QA can verify without querying 500-row counts.
- **Owner:** dev-mcp-server

### S0-NFR

- NFR-S0-1: Unit integrity — all pushed bars pass the existing `validateOhlcvUnit` guard. Zero corrupt scale rows acceptable post-backfill.
- NFR-S0-2: Idempotent — re-running the backfill job over already-present rows is a no-op (ON CONFLICT IGNORE or UPDATE with same values).
- NFR-S0-3: No fabrication — if VPS returns an empty/error response for a ticker-date, skip (honest gap, NULL row acceptable) rather than emitting a zero or synthesized price.

### S0-Edge Cases

- VPS returns partial data (some tickers 200, others 404): skip missing, continue the rest. Log each skip.
- VN-Index historical series may have pre-2020 dates with different column formats on dchart: validate OHLCV columns present before insert.
- Suspended tickers: if a watchlist ticker was suspended during a window, the dchart response returns no rows for that window. Do NOT fill with previous-close copies (fabrication). Accept the gap.

---

## P0-1 — Volatility Primitives

**Owner:** dev-technical-analysis
**New MCP tool:** `get_volatility_indicators`
**Data source:** `daily_ohlcv` (Tier 3 derived from T1/T2 real closes already stored) + `vn_index_cache` (VN-Index daily series). No new fetch.
**Gated on:** Sprint-0 for full 252d metrics (RV60d, drawdown). RV10/20d and ATR%(14) are viable with ~48 sessions already on hand.

### P0-1-FR-1: VN-Index Realized Volatility (RV) — 10d / 20d / 60d

- **DDD layer:** domain (pure calculation service)
- **Inputs:** VN-Index close series from `daily_ohlcv` (code = 'VNINDEX') or `vn_index_cache`
- **Computation:** Daily log-returns r_t = ln(P_t / P_{t-1}). RV_N = sqrt(252) × sqrt(mean(r_t² over N days)) expressed as annualized % volatility.
- **Outputs:** `rv_10d_pct`, `rv_20d_pct`, `rv_60d_pct` (REAL, nullable when insufficient history)
- **Gauge-readiness:** Also output `rv_20d_percentile` = rank of rv_20d_pct in the available history window (0.0–1.0). This is the field the P1 Fear & Greed gauge uses.
- **Minimum bars:** rv_10d needs ≥11 bars, rv_20d ≥21, rv_60d ≥61. Return null when below minimum.

### P0-1-FR-2: Garman-Klass Volatility

- **DDD layer:** domain
- **Inputs:** `daily_ohlcv` open/high/low/close for VN-Index
- **Computation:** GK estimator: 0.5×(ln(H/L))² − (2ln2−1)×(ln(C/O))² — annualized, rolling 20d window
- **Output:** `gk_vol_20d_pct` (REAL, nullable)
- **Edge case:** On days where H=L=O=C (stub bars or halt days), GK is zero — set null, not zero, to distinguish from genuinely zero volatility.

### P0-1-FR-3: Per-Stock ATR% (14-day)

- **DDD layer:** domain
- **Inputs:** `daily_ohlcv` per watchlist ticker (high / low / close), 15 bars minimum
- **Computation:** ATR(14) using Wilder smoothing; ATR% = ATR / previous_close × 100
- **Output:** `atr_pct_14d` per ticker (REAL, nullable)

### P0-1-FR-4: Volatility Regime Band

- **DDD layer:** application (classification service)
- **Inputs:** rv_20d_pct + historical rv_20d series
- **Computation:** Assign label `LOW` / `NORMAL` / `ELEVATED` / `CRISIS` based on percentile rank in available history. Thresholds: LOW < 25th pct, NORMAL 25–75th, ELEVATED 75–90th, CRISIS ≥ 90th.
- **Output:** `vol_regime` TEXT label; `vol_regime_pct` float (the percentile rank used)
- **Edge case:** With only 48 sessions of history pre-backfill, the percentile bands are honest approximations. Ship with a `history_sessions` count so consumers know the band quality. This is explicitly NOT a 10-year z-score (roadmap §4 reject).

### P0-1-FR-5: 252-Day Maximum Drawdown

- **DDD layer:** domain
- **Inputs:** VN-Index close series (252 bars — REQUIRES Sprint-0 completion)
- **Computation:** Max drawdown = (peak − trough) / peak over trailing 252-session window
- **Output:** `drawdown_252d_pct` (REAL, nullable). Null when fewer than 252 bars available.
- **Gate:** Ship FR-5 as part of the same tool; it returns null until Sprint-0 backfill confirms ≥252 bars.

### P0-1-NFR

- NFR-P01-1: Tool returns `{error: '...'}` JSON on failure (never throws). Consistent with project error contract.
- NFR-P01-2: Stateless calculation — no new persistent table required for P0. All inputs from read-only OHLCV store.
- NFR-P01-3: Tool registered in apps/mcp-server + toolCount updated in docs/data/project-stats.json. Routes via gateway.
- NFR-P01-4: Language — all label strings in English (no Vietnamese in enum values). Vietnamese display is the frontend/consumer layer's job.

### P0-1-Edge Cases

- Watchlist ticker with fewer than 15 bars: return `atr_pct_14d: null` for that ticker, do not break the whole response.
- VN-Index data gap (public holiday, VnDirect outage): log the gap, skip in rolling window. Do NOT forward-fill.

---

## P0-2 — Foreign-Room Utilization & Saturation Suite

**Owner:** dev-stock-price + dev-mcp-server
**New MCP tool:** `get_foreign_room`
**Data source:** `vnstock_trading_stats` persisted daily (Tier 2, no new fetch). Table already has: `code`, `date`, `foreign_room`, `foreign_volume`, `current_holding_ratio`, `max_holding_ratio`.
**Merges 5 sub-items from roadmap:** utilization, room→0/reopen events, 5d depletion velocity, ROOM_LOCKED/FULL-ROOM-SELL flags, market/sector saturation.

### P0-2-FR-1: Per-Ticker Room Utilization

- **DDD layer:** domain (derived metric)
- **Inputs:** `vnstock_trading_stats.foreign_room` (remaining room), `vnstock_trading_stats.max_holding_ratio`, `vnstock_trading_stats.current_holding_ratio`, `vnstock_trading_stats.foreign_volume` (daily foreign buy volume)
- **Computation:** `room_utilization_pct` = current_holding_ratio / max_holding_ratio × 100. Only computable when max_holding_ratio > 0.
- **Output per ticker:** `room_utilization_pct` (0–100), `foreign_room_remaining` (integer shares), `max_holding_ratio`, `current_holding_ratio`

### P0-2-FR-2: Room→0 / Reopen Events

- **DDD layer:** infrastructure (new table) + domain (event detection)
- **New table in mcp-server schema:** `foreign_room_events`
  - `id` INTEGER PK AUTOINCREMENT
  - `code` TEXT NOT NULL
  - `event_type` TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN'))
  - `event_date` TEXT NOT NULL (YYYY-MM-DD)
  - `room_remaining_before` INTEGER
  - `room_remaining_after` INTEGER
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
  - UNIQUE(code, event_date, event_type)
- **Write path:** dev-stock-price scheduler (daily, after vnstock_trading_stats row inserted) detects room transition and writes an event row.
- **Owner split:** dev-stock-price writes events; dev-mcp-server exposes them via get_foreign_room response.

### P0-2-FR-3: 5-Day Room Depletion Velocity

- **DDD layer:** domain
- **Inputs:** `vnstock_trading_stats` last 5 rows per ticker (daily series)
- **Computation:** `depletion_velocity_5d` = (room_5d_ago − room_today) / 5. Positive = room shrinking. Units = shares/day.
- **Output per ticker:** `depletion_velocity_5d` (REAL, nullable if <5 rows available)

### P0-2-FR-4: ROOM_LOCKED and FULL_ROOM_SELL Flags

- **DDD layer:** application (flag derivation)
- **ROOM_LOCKED:** `room_utilization_pct >= 99` AND `depletion_velocity_5d <= 0` (room full AND not recovering). Blocks new foreign buy.
- **FULL_ROOM_SELL:** `room_utilization_pct >= 99` AND recent foreign_volume shows net selling pattern (current_holding_ratio declining over 3d). Foreigners are selling out of a full-room stock.
- **Output per ticker:** `room_locked: boolean`, `full_room_sell: boolean`

### P0-2-FR-5: Market-Wide and Sector Cap-Weighted Saturation

- **DDD layer:** application (aggregation)
- **Computation:** Weight each ticker's room_utilization_pct by `market_cap_bn` (already in vnstock_trading_stats). Aggregate to: watchlist-level cap-weighted saturation, and sector-level cap-weighted saturation (using stock-classification.json sector mapping).
- **Output:** `market_saturation_pct` (watchlist cap-weighted), `sector_saturation: { [sectorName]: number }` (cap-weighted per sector)
- **Gauge-readiness:** Output `foreign_outflow_z_5d`: compute z-score of the market-wide depletion_velocity_5d vs 20-session rolling mean and stddev. This is the field the P1 Fear & Greed gauge uses for the foreign-outflow leg. Return null when <20 sessions of saturation data available.

### P0-2-NFR

- NFR-P02-1: Tool routes via gateway; toolCount updated in docs/data/project-stats.json.
- NFR-P02-2: `{error: '...'}` on failure. NEVER expose raw DB error messages in the tool response.
- NFR-P02-3: If `max_holding_ratio = 0` or NULL for a ticker, `room_utilization_pct` = null (do NOT emit 0 or Infinity).
- NFR-P02-4: New table `foreign_room_events` is additive only (ALTER TABLE + CREATE TABLE IF NOT EXISTS pattern). Schema migration follows the established idempotent pattern in schema-financial-reports.ts.

### P0-2-Edge Cases

- Ticker with only 1 day of data: depletion_velocity = null, ROOM_LOCKED / FULL_ROOM_SELL require minimum 3d window.
- max_holding_ratio = 0 (foreign-restricted stock, e.g. defence sector): flag `foreign_restricted: true`, return all derived fields as null.
- VN rule change (SBV increases/decreases max holding ratio): the UNIQUE(code, date) constraint in vnstock_trading_stats absorbs the change correctly on the next daily fetch.

---

## P0-3 — SBV OMO Short-Rate & Liquidity-Stress Curve

**Owner:** dev-macro-indicators
**Extend existing tool:** `get_vn_liquidity_state` + optionally add `get_omo_curve` as a new endpoint
**Data source:** SBV Liferay HTML (www.sbv.gov.vn, Tier 1, already fetched by existing `FetchSBVOMOFromHTML` in pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go). No new fetch domain.
**What is currently DISCARDED:** The "Lãi suất" (winning rate) column and "Số thành viên tham gia/trúng thầu" (member participation/win ratio) per row. The parser currently only captures `TotalAddBnVND` + `TotalAbsorbBnVND` + `AuctionDate`.
**Explicitly NOT in scope:** bid-to-cover ratio (roadmap §4: not sourceable from SBV Liferay HTML). Do NOT add.

### P0-3-FR-1: Parse Per-Tenor Winning Rate from OMO HTML

- **DDD layer:** infrastructure (extend `OMOParseResult` struct in pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go)
- **Column to parse:** 4th column = "Lãi suất" (winning rate %) in each table row
- **Per-row capture:** `operation_type` (mua/ban) + `tenor_text` (raw text from row, e.g. "7 ngày", "14 ngày", "28 ngày") + `volume_bn_vnd` (existing) + `winning_rate_pct` (new)
- **New struct fields in OMOParseResult:**
  - `Tenors []OMOTenorRow` where `OMOTenorRow = { OperationType string, TenorText string, VolumeBnVND float64, WinningRatePct float64, ParsedTenorDays int }`
  - `ParsedTenorDays`: parse "7 ngày" → 7, "14 ngày" → 14, "28 ngày" → 28. If parsing fails, set to -1 (unknown tenor).
- **Fail-graceful:** If a row has a missing or unparseable Lãi suất cell, set `WinningRatePct = 0` and add a parse warning to a `ParseWarnings []string` field. Do NOT fail the whole parse for a single bad row.

### P0-3-FR-2: Member Win Ratio per Row

- **DDD layer:** infrastructure
- **Column:** "Số thành viên tham gia/trúng thầu" — two sub-numbers in the format "X/Y" where X = members participating, Y = members winning.
- **Parse:** Extract `MembersParticipating int` and `MembersWinning int` per row. If only one number present (older HTML format), set `MembersWinning = MembersParticipating` and note in ParseWarnings.
- **Ratio:** `MemberWinRatio = MembersWinning / MembersParticipating` (0.0–1.0). Low ratio = competitive auction, many losers. High ratio ≈ 1 = loose/easy conditions.

### P0-3-FR-3: Implied Short-Rate by Tenor

- **DDD layer:** domain (Go service, macro-indicators)
- **Computation:** `ImpliedShortRatePct` = cap-weighted average of WinningRatePct across all "mua kỳ hạn" (add) rows in the same tenor bucket. Weight by volume.
- **Output fields in get_vn_liquidity_state / get_omo_curve response:**
  - `omo_rate_7d_pct`: float | null
  - `omo_rate_14d_pct`: float | null
  - `omo_rate_28d_pct`: float | null
  - `omo_weighted_avg_rate_pct`: float | null (volume-weighted across all tenors)
  - `omo_member_win_ratio`: float | null (average across rows)
  - `omo_auction_date`: string (already exists)

### P0-3-FR-4: Net Injection 5-Day Rolling Sum

- **DDD layer:** application
- **Requirement:** Persist each day's `net_outstanding_bn_vnd = TotalAddBnVND - TotalAbsorbBnVND` to a time-series table so a 5-day rolling sum can be computed.
- **New table (macro-indicators SQLite or shared market.db):** `sbv_omo_daily`
  - `id` INTEGER PK AUTOINCREMENT
  - `auction_date` TEXT NOT NULL UNIQUE (YYYY-MM-DD)
  - `add_bn_vnd` REAL NOT NULL
  - `absorb_bn_vnd` REAL NOT NULL
  - `net_outstanding_bn_vnd` REAL NOT NULL
  - `weighted_avg_rate_pct` REAL
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- **Computation:** `net_injection_5d_bn_vnd` = sum of `net_outstanding_bn_vnd` over the last 5 auction dates in `sbv_omo_daily`.
- **Note on DB location:** architect must decide whether `sbv_omo_daily` lives in the macro-indicators Go service's own SQLite or the shared market.db. Mark as ARCH-RATIFY-OMO-1.

### P0-3-FR-5: Liquidity-Stress Label

- **DDD layer:** domain (classification)
- **Computation:** Derive a `liquidity_stress` label from combination of `net_injection_5d_bn_vnd` + `omo_weighted_avg_rate_pct`:
  - `DRAIN` — 5d net < -20,000 BnVND (heavy absorption)
  - `TIGHT` — 5d net < 0 (net drain) AND rate rising (omo_weighted_avg_rate_pct > prev session)
  - `NEUTRAL` — within ±20,000 BnVND and rate stable
  - `EASY` — 5d net > +20,000 BnVND (heavy injection)
- **Gauge-readiness:** output `liquidity_stress_score`: float 0.0–1.0 where 0=EASY, 0.5=NEUTRAL, 1.0=DRAIN. Linear interpolation within thresholds. This is the field the P1 Fear & Greed gauge uses.
- **Thresholds are approximate** — architect/dev can adjust constants; the BA constraint is only that they derive from REAL net_injection figures, not invented bounds.

### P0-3-NFR

- NFR-P03-1: Extend existing `get_vn_liquidity_state` response payload; do NOT break existing fields. Additive only.
- NFR-P03-2: If `Tenors` array is empty (no per-tenor data parsed), existing net_outstanding still serves; the new rate/stress fields return null. is_estimate=true propagates correctly.
- NFR-P03-3: `sbv_omo_daily` table is write-once per auction_date (ON CONFLICT REPLACE) — re-fetching the same HTML for the same auction rewrites the same row (idempotent).
- NFR-P03-4: Routes via gateway; toolCount updated.

### P0-3-Edge Cases

- SBV publishes multiple auctions on the same HTML page for different dates: parse all, insert each separately into `sbv_omo_daily` keyed by auction_date.
- SBV skips an auction week (rare): no row for that date, 5d rolling sum skips the gap (honest partial sum, annotate `days_in_window` count in response).
- Lãi suất column value uses Vietnamese decimal comma (e.g. "4,75%"): normalize to float before storing.
- Zero-member rows (tổng cộng subtotals): the existing parser already skips these. Ensure the new per-tenor extraction also skips them.

---

## P0-4 — Market-Wide News-Sentiment Z-Score

**Owner:** dev-rag-service + dev-mcp-server
**New MCP tool:** `get_market_sentiment_index`
**Data source:** `rag_analyses` table (Tier 3 derived, no new fetch). Key columns: `sentiment` (TEXT: bullish/bearish/neutral), `confidence` (REAL), `impact_score` (REAL), `created_at` (TEXT ISO-8601).

### P0-4-FR-1: Confidence-Weighted Daily Sentiment Score

- **DDD layer:** domain (pure computation)
- **Computation per day:**
  - Filter `rag_analyses` rows where `sentiment IN ('bullish','bearish','neutral')` and `confidence IS NOT NULL` and `confidence > 0`
  - Assign: bullish=+1, bearish=−1, neutral=0
  - `daily_score_d = sum(sentiment_value × confidence × impact_score) / sum(confidence)` where `impact_score` defaults to 1.0 when NULL
  - One score per day (group by DATE(created_at))
- **Output:** `daily_score` time series (REAL, range roughly -1 to +1) for the last 90 days
- **DDD layer:** domain (stateless computation over raw rows)

### P0-4-FR-2: Z-Score vs 60/90-Day Baseline

- **DDD layer:** domain
- **Inputs:** `daily_score` series from FR-1
- **Computation:**
  - `baseline_mean_60d` = mean of daily_score over last 60 days
  - `baseline_std_60d` = stdev of daily_score over last 60 days
  - `sentiment_z_60d` = (today_daily_score − baseline_mean_60d) / baseline_std_60d
  - Same for 90d baseline
- **Output:** `sentiment_z_60d` (REAL, nullable when <60d data), `sentiment_z_90d` (REAL, nullable when <90d data)
- **HARD CONSTRAINT (no-fake-data):** Do NOT back-fill or extrapolate to claim a z-score distribution if we have fewer than 21 actual days of data. When days < 21, set both z-scores to null and set `history_quality: 'INSUFFICIENT'`. The z-score IS the fabricated distribution when history is thin — do not ship.
- **Gauge-readiness:** The field `news_sentiment_z` = `sentiment_z_60d` (preferred) or `sentiment_z_90d` when 60d unavailable. This is the P1 gauge field.

### P0-4-FR-3: 5-Day EMA of Sentiment

- **DDD layer:** domain
- **Computation:** EMA(5) over the daily_score time series. alpha = 2/(5+1) = 0.333.
- **Output:** `sentiment_ema_5d` (REAL, nullable when <5d)

### P0-4-FR-4: Bull/Bear Dispersion

- **DDD layer:** domain
- **Inputs:** last 5 days of rag_analyses rows
- **Computation:** `bull_ratio_5d` = count(bullish) / total_articles_5d; `bear_ratio_5d` = count(bearish) / total_articles_5d
- **Output:** `bull_ratio_5d`, `bear_ratio_5d`, `neutral_ratio_5d` (all REAL 0–1)

### P0-4-FR-5: Article-Volume Spike Flag

- **DDD layer:** application
- **Inputs:** daily article count series (count(rag_analyses rows) per day over 30d)
- **Computation:**
  - `article_volume_30d_avg` = mean articles/day
  - `today_article_count` = count(rag_analyses) for today
  - `article_spike: boolean` = today_article_count > 2.0 × article_volume_30d_avg
- **Output:** `article_spike: boolean`, `today_article_count: int`, `article_volume_30d_avg: float`

### P0-4-NFR

- NFR-P04-1: Tool is a READ-ONLY query on `rag_analyses`. No writes. No schema migration required.
- NFR-P04-2: The 90-day window queries are indexed by `idx_rag_created`. If the query exceeds 1s, architect must add a covering index.
- NFR-P04-3: `{error: '...'}` on failure; never expose raw SQL error.
- NFR-P04-4: Routes via gateway; toolCount updated.
- NFR-P04-5: Tool respects the language boundary — response field names and enum values are in English. Display-layer Vietnamese is the consumer's job.

### P0-4-Edge Cases

- `rag_analyses` is empty (fresh deployment): all outputs null + `history_quality: 'EMPTY'`.
- All rows for a given day have `confidence = 0`: divide-by-zero guard — daily_score = null for that day (not 0).
- `sentiment` column contains unexpected value (not bullish/bearish/neutral): exclude from computation; log at WARN. Do not crash.
- Weekend/holiday: no rag_analyses rows for Saturday/Sunday in VN market context. Skip in daily series rather than treating as score=0.

---

## P0-5 — Insider-Transaction Net Sentiment

**Owner:** dev-mcp-server
**New MCP tool:** `get_insider_sentiment`
**Data source:** `insider_transactions` table (Tier 1 SSC via live `sscInsider.ts` → persisted). Key columns: `code`, `type` (buy/sell/other), `executed_volume`, `price`, `from_date`, `to_date`.
**FIX-H note:** The roadmap calls out 180d history requirement. This is only honest if `insider_transactions` has ≥180 days of rows. The table feeds from the live SSC feed via sscInsider.ts. Developer must probe how far back the feed actually goes; if <180d data exists, the 180d signal returns null (honest partial), never fabricated.

### P0-5-FR-1: Net Buy-Sell Value by Window (30d / 90d / 180d)

- **DDD layer:** domain
- **Inputs:** `insider_transactions` rows filtered by `from_date >= window_start`
- **Computation:**
  - `buy_value = sum(executed_volume × price)` where `type = 'buy'`
  - `sell_value = sum(executed_volume × price)` where `type = 'sell'`
  - `net_sentiment_vnd = buy_value − sell_value`
- **Output per window:** `net_buy_sell_30d_bn_vnd`, `net_buy_sell_90d_bn_vnd`, `net_buy_sell_180d_bn_vnd` (all REAL, nullable when insufficient history)
- **Scope options:** tool accepts optional `code` param to get per-ticker signal; when code omitted, returns market-wide aggregate across all watchlist tickers.

### P0-5-FR-2: Free-Float-Normalized Net Sentiment

- **DDD layer:** application (normalization)
- **Inputs:** `net_sentiment_vnd` from FR-1 + `market_cap_bn` from `vnstock_trading_stats` (proxy for free-float — architect may refine to actual free-float; mark as ARCH-RATIFY-INS-1)
- **Computation:** `net_sentiment_score = net_buy_sell_90d_bn_vnd / (market_cap_bn × 1e9)` clamped to [-1.0, +1.0]
- **Output:** `net_sentiment_score` (REAL -1 to +1)
- **Gauge-readiness:** This is the field the P1 Fear & Greed gauge uses for the insider leg.

### P0-5-FR-3: ACCUMULATION / DISTRIBUTION Label

- **DDD layer:** application
- **Computation:**
  - `ACCUMULATION` — net_buy_sell_90d_bn_vnd > 0 AND net_buy_sell_30d_bn_vnd > 0 (both windows positive: sustained buying)
  - `DISTRIBUTION` — net_buy_sell_90d_bn_vnd < 0 AND net_buy_sell_30d_bn_vnd < 0 (both windows negative: sustained selling)
  - `MIXED` — signs diverge between windows
  - `NEUTRAL` — all values zero (no activity)
- **Output:** `insider_label` TEXT

### P0-5-FR-4: Large-Deal Flags

- **DDD layer:** application
- **Computation:** Flag any single transaction in the 30d window where `executed_volume × price > 10_000_000_000 VND (10 billion)` as a large deal.
- **Output:** `large_deals_30d: boolean`, `large_deal_count_30d: int`, `largest_deal_value_30d_bn_vnd: float | null`
- **Note:** Threshold of 10B VND is a suggested default. Architect can make it configurable.

### P0-5-NFR

- NFR-P05-1: READ-ONLY on `insider_transactions`. No schema migration.
- NFR-P05-2: When code IS supplied, tool filters to that ticker. When omitted, aggregates across all tickers in the watchlist (system-map.json .project.watchlist — never hardcode the list, query from config/system-map).
- NFR-P05-3: `{error: '...'}` on failure.
- NFR-P05-4: Routes via gateway; toolCount updated.

### P0-5-Edge Cases

- `insider_transactions` table is empty or only has `other` type rows (no buy/sell): all outputs null + `insider_label: 'NEUTRAL'`.
- `price = 0` on a row (data quality from SSC): exclude from value computation (zero-price = invalid deal value). Log at WARN.
- Same insider registers a buy and a sell in the same 30d window: count both faithfully (net = buy − sell). Do NOT deduplicate.
- SSC feed may use `executed_volume = 0` on a registered-but-not-executed transaction: exclude from value computation (only executed_volume > 0 rows contribute).

---

## Breadth Time-Series — A-D Line + McClellan + Ceiling/Floor Thrust

**Owner:** dev-mcp-server (new table + persister) + dev-technical-analysis (algorithms)
**New MCP tool:** `get_breadth_thrust`
**Data source:** `vnmarket_prices` already fetched (Tier 2) — existing `get_market_breadth` returns HOSE advancing/declining/unchanged/ceiling/floor counts per session. These are the inputs to persist.
**CRITICAL CONSTRAINT: FORWARD-ACCRUING ONLY.** No backfill. Mark `accruing_since` on first persistence. Approximately 40 sessions needed for McClellan Oscillator warmup; approximately 10 consecutive sessions for Zweig Thrust trigger.

### BR-FR-1: New Persistence Table `market_breadth_history`

- **DDD layer:** infrastructure (new schema in mcp-server)
- **New table:**
  ```sql
  CREATE TABLE IF NOT EXISTS market_breadth_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD
    advancing  INTEGER NOT NULL,
    declining  INTEGER NOT NULL,
    unchanged  INTEGER NOT NULL,
    ceiling    INTEGER NOT NULL,  -- tickers at upper limit
    floor      INTEGER NOT NULL,  -- tickers at lower limit
    total      INTEGER NOT NULL,  -- advancing + declining + unchanged
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mbh_date ON market_breadth_history(session_date DESC);
  ```
- **Write path:** A new daily scheduler job (dev-mcp-server) calls the existing breadth fetch logic and writes one row per session to `market_breadth_history`. Runs once per trading day, after market close. ON CONFLICT(session_date) IGNORE (first write wins — breadth is final when market closes).
- **accruing_since:** Store the date of the first row ever inserted in a meta key or derive as MIN(session_date) from the table.

### BR-FR-2: Advance-Decline Line (A-D Line)

- **DDD layer:** domain
- **Computation:** Cumulative running sum. `adl_today = adl_yesterday + (advancing_today − declining_today)`. Starts at 0 from accruing_since.
- **Output:** `adl` (INTEGER, relative to start), `adl_history: [{date, adl}]` for last N sessions (architect decides N, suggest 60)

### BR-FR-3: RANA and McClellan Oscillator

- **DDD layer:** domain
- **Computation:**
  - `RANA_d` = (advancing − declining) / (advancing + declining + unchanged) × 100 (range -100 to +100)
  - `McClellan Osc` = EMA(19, RANA) − EMA(39, RANA)
  - `McClellan Summation` = running sum of McClellan Osc values
- **Minimum:** 39 sessions needed for EMA(39) to stabilize. Return `mclellan_osc: null` until 39 sessions in `market_breadth_history`.
- **Output:** `rana_today` (REAL), `mclellan_osc` (REAL | null), `mclellan_summation` (REAL | null)

### BR-FR-4: Floor Panic / Ceiling FOMO Flags

- **DDD layer:** application
- **Computation:**
  - `floor_panic: boolean` = `floor / total > 0.15` (>15% of tickers hitting floor = widespread panic)
  - `ceiling_fomo: boolean` = `ceiling / total > 0.15` (>15% hitting ceiling = FOMO buying)
- **Output:** `floor_panic: boolean`, `ceiling_fomo: boolean`, `floor_pct: float`, `ceiling_pct: float`

### BR-FR-5: Zweig Thrust Flag

- **DDD layer:** application
- **Computation:**
  - Zweig definition: breadth > 61.5% (advancing / (advancing+declining) > 0.615) for 10 consecutive sessions within a 14-session window
  - Track: `thrust_window`: last 14 sessions from `market_breadth_history`
  - `thrust_triggered: boolean` = met criteria
  - `thrust_sessions_count: int` = count of qualifying sessions in window
  - `thrust_possible: boolean` = thrust_sessions_count >= 5 (flag early)
- **Minimum:** 14 sessions in table. Before that, `thrust_triggered: null`, `thrust_possible: null`.

### BR-FR-6: Tool Response with Gauge-Ready Scalar

- **Gauge-readiness:** `breadth_z_score` = z-score of `mclellan_osc` vs its rolling mean/stdev over available history. Return null when <21 sessions. This is the field the P1 Fear & Greed gauge uses.
- **Output summary fields:** `accruing_since` (TEXT date), `sessions_accrued` (INT), `history_quality: 'SUFFICIENT'|'WARMUP'|'INSUFFICIENT'` (SUFFICIENT = ≥40, WARMUP = 10–39, INSUFFICIENT = <10)

### BR-NFR

- NFR-BR-1: The table `market_breadth_history` is append-only from market data; no manual backfill mechanism. If someone attempts to seed it with synthetic data — that is a NO-FAKE-DATA violation. The persister must log and reject rows not derived from live fetch.
- NFR-BR-2: The scheduler job must be idempotent (ON CONFLICT IGNORE ensures double-fire is safe).
- NFR-BR-3: `get_breadth_thrust` returns `{error: '...'}` when table is empty; never fabricates a score.
- NFR-BR-4: Routes via gateway; toolCount updated.

### BR-Edge Cases

- Market holiday: no row for that session. The A-D line does not advance. This is correct (market was closed).
- Market circuit-breaker halt: breadth data may be partial. Persist whatever get_market_breadth returns (could show 0 advancing, 0 declining, high floor/ceiling). Flag `is_halt_day: boolean` if floor > 50% of total.
- Very thin market days (public half-sessions): total < 100 tickers returned from get_market_breadth. Still persist; consumer can decide to exclude thin sessions.

---

## Cross-Cutting NFRs (All Deliverables)

- **NFR-CC-1: No fake data gate (BLOCKING).** Every indicator value traces to a real fetched or stored row. Any value requiring a fabricated distribution fails QA.
- **NFR-CC-2: Gateway routing.** All new MCP tools use the gateway call_tool proxy. Direct mcp__vn-market__* calls are forbidden (disabled connection).
- **NFR-CC-3: Tool count SSOT.** When any new tool is registered (FR-P01, FR-P02, FR-P04, FR-P05, FR-BR), dev-mcp-server must update `docs/data/project-stats.json#toolCount`. Use re-derive from 3-way probe (per project memory: feedback_ssot_toolcount_drift_after_waves), never bake.
- **NFR-CC-4: Error contract.** All new tools return `{ error: 'message' }` JSON on failure. Never throw uncaught exceptions. Fail-loud for unexpected states (not silent-swallow).
- **NFR-CC-5: Language boundary.** Tool response field names and enum values are in English. Any user-facing Vietnamese strings are the consumer agent's responsibility, not the tool's.
- **NFR-CC-6: VPS proxy gate.** No new VN-geo-blocked sources are introduced in P0. All P0 data is either already fetched or reachable direct (SBV OMO). VPS proxy only needed for P1+ new fetches (dchart for VN30F, etc.).
- **NFR-CC-7: Rebuild after dev change.** After each zone's implementation, PO must trigger ops REBUILD (standard pattern). QA re-verifies on rebuilt image, not stale.
- **NFR-CC-8: Existing tests must stay green.** All P0 additions are additive. The existing test suite (pnpm check) must pass before merge of any P0 task.

---

## Gauge-Readiness Forward Dependency (P1 Contract)

The 5 P0 legs + breadth are the building blocks of the P1 VN Composite Fear & Greed Gauge (`get_vn_fear_gauge`, IND-P1-FEAR-GREED). Architect MUST design each new tool's response to include these specifically-named scalar fields to enable future gauge composition without breaking-change refactors:

| P0 Tool | Gauge-Ready Field | Type | Notes |
|---|---|---|---|
| `get_volatility_indicators` | `rv_20d_percentile` | float 0–1 | Rank of rv_20d in available history |
| `get_foreign_room` | `foreign_outflow_z_5d` | float | Z of depletion_velocity vs 20-session rolling stats; watchlist-scoped |
| `get_vn_liquidity_state` / `get_omo_curve` | `liquidity_stress_score` | float 0–1 | 0=EASY, 1=DRAIN; null when <5 auction dates |
| `get_market_sentiment_index` | `news_sentiment_z` | float | Z of daily_score vs 60d baseline; null when <21d data |
| `get_insider_sentiment` | `net_sentiment_score` | float -1 to +1 | Free-float normalized 90d net buy-sell |
| `get_breadth_thrust` | `breadth_z_score` | float | Z of mclellan_osc vs available history; null when <21 sessions |

The gauge does NOT use a margin leg (no aggregate margin data — roadmap §4 reject). The foreign-outflow leg is watchlist-scoped (honest caveat in the gauge description).

---

## Blockers (Questions only PO can answer)

- **B1 — Sprint-0 sequencing gate:** P0-1 RV60d and 252d drawdown are gated on Sprint-0 completion. Should Sprint-0 be dispatched as a SEPARATE parallel task (`OHLCV-BACKFILL-P0`) before the P0 indicator tasks, or is it decomposed inside the same PM task breakdown? Architect needs this to sequence dev tasks correctly. (PO recommendation: separate task, parallel.)

- **B2 — OMO DB location (ARCH-RATIFY-OMO-1):** `sbv_omo_daily` table should live in: (A) macro-indicators Go service's own local SQLite, OR (B) the shared market.db SQLite named volume. Option A keeps zone clean; Option B makes the data available to other zones without a service hop. BA defers to PO/architect.

- **B3 — Insider free-float normalization (ARCH-RATIFY-INS-1):** For FR P0-5-FR-2, market_cap_bn is used as proxy for free-float. Do we accept this approximation for P0, or does PO want actual free-float shares outstanding? The accurate number would require a new data field not currently in vnstock_trading_stats. BA recommendation: accept market_cap_bn as proxy for P0; add real free-float in P1.

- **B4 — Breadth persister timing:** The `market_breadth_history` persister needs to run daily after market close. Current scheduler has jobs for other data. Is there an existing daily post-close window (UTC 09:00 = 16:00 VN, market closes 14:45 VN = 07:45 UTC) that can host this? Or should it share a cron slot with existing vnstock fetch? Architect to confirm the scheduler slot.

- **B5 — P0-4 sentiment baseline adequacy:** `rag_analyses` may have fewer than 60 days of data on live deployment. If `history_quality: 'INSUFFICIENT'` is returned at QA time (fewer than 21 days), does PO accept a partial spec (ship the tool but z-score fields are null until baseline accrues naturally)? BA assumes yes (honest null is better than fabricated score). Confirm.

---

## DDD Layer Summary

| Deliverable | Domain | Application | Infrastructure | Interface |
|---|---|---|---|---|
| Sprint-0 OHLCV Backfill | — | batch runner | taOhlcvBackfillJob + writeOhlcvBatch | — |
| P0-1 Volatility | RV/GK/ATR/drawdown pure calc | regime classification | read daily_ohlcv | get_volatility_indicators handler |
| P0-2 Foreign-Room | utilization/velocity derivation | flag derivation + sector aggregation | foreign_room_events table + write path | get_foreign_room handler |
| P0-3 OMO Curve | implied-rate/stress derivation | stress classification | extend OMOParseResult; sbv_omo_daily table | extend get_vn_liquidity_state |
| P0-4 News Z-Score | daily-score/z/EMA pure calc | article-spike flag | read rag_analyses (no schema change) | get_market_sentiment_index handler |
| P0-5 Insider Sentiment | net-buy-sell/normalization | accumulation label + large-deal flag | read insider_transactions (no schema change) | get_insider_sentiment handler |
| Breadth Time-Series | ADL/RANA/McClellan calc | Zweig/floor-panic/ceiling-fomo | market_breadth_history table + daily persister | get_breadth_thrust handler |

---

## Sequencing Recommendation (for PM decomposition)

1. Sprint-0 OHLCV Backfill — start immediately (parallel to planning). Unlocks P0-1 full depth.
2. P0-2 Foreign-Room — start immediately (no dependency). vnstock_trading_stats already populated.
3. P0-3 OMO Curve — start immediately (SBV HTML already fetched; extend existing parser).
4. P0-4 News Sentiment Z-Score — start immediately (rag_analyses already populated).
5. P0-5 Insider Net Sentiment — start immediately (insider_transactions already populated).
6. Breadth Time-Series persister — start immediately (forward-accruing; start persisting ASAP to begin the 40-session warm-up clock).
7. P0-1 Volatility — full metrics require Sprint-0. RV10/20 + ATR% + regime can ship when Sprint-0 is in flight. FR-5 (252d drawdown) and FR-1 rv_60d_pct must wait for Sprint-0 to complete.

Note: P0-2 through P0-5 and Breadth are all independent of Sprint-0. They can be dispatched to dev in parallel. P0-1 is partially independent (RV10/20, ATR, regime = independent; RV60 and drawdown = Sprint-0 gated).

---

## Status

REVIEW — return to PO for approval per docs/agents/po/flow/review-ba-spec.md before dispatching to architect.
