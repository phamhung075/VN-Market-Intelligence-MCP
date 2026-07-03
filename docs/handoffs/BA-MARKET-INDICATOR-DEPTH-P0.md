# BA Spec — MARKET-INDICATOR-DEPTH-P0

**Task ID:** BA-INDICATOR-DEPTH-P0
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Status:** APPROVED — PO sign-off granted 2026-06-29; 5 blockers resolved (see § PO SIGN-OFF). Next: architect blueprint.
**BA:** ba · 2026-06-29T20:23:00Z
**PO sign-off:** po · 2026-06-29 (review-ba-spec flow)
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

## PO SIGN-OFF — Spec Approved + 5 Blocker Rulings

**Verdict:** APPROVED. Spec matches the VERIFIED roadmap §3/§5 vision, ACs are testable, no-fake-data is correctly baked into every FR (hard gate + per-FR honest-null handling). The Gauge-Readiness forward-dependency contract (6 named scalar fields) is the right way to avoid a future breaking refactor and is ratified as-is. Architect is unblocked on all 5 questions below. Every ruling is held to the STANDING no-fake-data rule.

**R-B1 — Sprint-0 dispatch mode → APPROVE separate parallel task.**
Sprint-0 (OHLCV backfill) is dispatched as its OWN parallel task (`OHLCV-BACKFILL-P0`), NOT folded inside the P0-indicator decomposition. Rationale: the six OHLCV-independent deliverables — P0-2 Foreign-Room, P0-3 OMO, P0-4 News-Z, P0-5 Insider, Breadth time-series, AND P0-1's RV10/20d + ATR%(14) + regime-band sub-FRs — must not wait behind the backfill. Only `P0-1-FR-5` (252d drawdown) and the `rv_60d_pct` field are gated on Sprint-0 landing; they ship returning `null` until ≥252 / ≥61 real bars exist. No-fake-data: gated metrics return honest null until real history exists — never an extrapolated or seeded series. PM decomposes accordingly: Sprint-0 + 6 indicator tasks all dispatchable in parallel at kickoff.

**R-B2 — OMO DB location (ARCH-RATIFY-OMO-1) → PRODUCT PREFERENCE: Option A (zone-clean, macro-indicators own SQLite); architect ratifies the final technical call.**
DB placement is a technical-design decision (architect's job), so this is a stated preference, not a mandate. Preference = Option A: `sbv_omo_daily` lives in the macro-indicators Go service's own SQLite. Rationale: macro-indicators owns `get_vn_liquidity_state`; no other zone consumes the RAW daily OMO series — every derived field (implied rate, net_injection_5d, liquidity_stress_score) is exposed through the tool response, and a gateway hop already exists. Keeping the table zone-local respects the deep-module / two-data-planes boundary (project memory). Constraint if architect picks Option B (shared market.db) instead: it must not become a second write-path that bypasses the macro-indicators owner. Either way NFR-P03-3 (write-once-per-auction_date, ON CONFLICT REPLACE, idempotent) is binding. Future cross-zone need → expose via a tool endpoint, not a shared-DB read.

**R-B3 — Insider free-float proxy (ARCH-RATIFY-INS-1) → CONFIRM ACCEPTABLE for P0, with a mandatory honesty label.**
`market_cap_bn` as the free-float denominator is an honest, real-fetched value used as a documented approximation — it is NOT fabricated data, so it passes the no-fake-data gate. Real free-float shares deferred to P1. BLOCKING condition: the `get_insider_sentiment` response MUST self-label the normalization basis (e.g. `normalization_basis: "market_cap_proxy"`) so no consumer mistakes the proxy for true free-float. A proxy openly labeled = honest; a proxy silently passed off as free-float = misleading and would FAIL QA. Architect bakes the label into the response contract.

**R-B4 — Breadth persister scheduler slot → CONFIRMED: use the EXISTING post-close market-data window. Do NOT invent a new top-of-hour cron.**
Verified against `apps/mcp-server/src/scheduler/cronConfig.ts`. HOSE closes 14:45 VN = 07:45 UTC; an existing post-close market-data cluster already runs 08:13–08:45 UTC weekdays. The natural sibling is `vnstockTradingStatsRefresh` (`30 8 * * 1-5`, 08:30 UTC) — it already persists the post-close `vnstock_trading_stats` snapshot from the same EOD market-data family, and the breadth persister has the identical shape (one final post-close row per `session_date`). Ruling: register `market_breadth_history` persister in THIS window adjacent to `vnstockTradingStatsRefresh`, weekday-only (`* * 1-5`, breadth exists only on trading days). Architect assigns the exact jitter-offset minute per the standing T2-ARCH-CRON-RECOVER-JITTER Lever C — pick a FREE minute, NOT the :30 pile-up (signalOutcomeJob + vnstockTradingStatsRefresh both at 08:30). No-fake-data: ON CONFLICT(session_date) IGNORE + NFR-BR-1 (reject any row not derived from live fetch) already enforce forward-accruing honesty; `accruing_since` marks the real start.

**R-B5 — News-Z baseline adequacy → CONFIRM: SHIP with honest null. Do NOT delay.**
The STANDING no-fake-data rule decisively favors honest-null over delay-or-fabricate. The spec already bakes the correct posture (P0-4-FR-2 HARD CONSTRAINT: <21 real days → both z-scores null + `history_quality: 'INSUFFICIENT'`; "the z-score IS the fabricated distribution when history is thin"). Ship the tool now: the EMA-5d, bull/bear dispersion, and article-spike FRs deliver value at far lower history thresholds, and `news_sentiment_z` populates automatically as `rag_analyses` accrues real days. BLOCKING condition: `history_quality` must ALWAYS be present in the response so every consumer (and the future P1 gauge) self-gates on baseline adequacy. A null z-score with an honest quality flag is shippable; a back-filled or extrapolated z-score would FAIL QA and contradict roadmap §4.

**Cross-cutting reaffirmations carried into the blueprint:** NFR-CC-1 no-fake-data gate is BLOCKING at QA; NFR-CC-3 tool-count SSOT re-derived from 3-way probe (never baked); NFR-CC-7 ops REBUILD after each zone's code change before QA re-verifies on the rebuilt image. The six Gauge-Ready scalar fields are part of the acceptance contract, not optional.

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

APPROVED — PO sign-off granted 2026-06-29 (review-ba-spec flow). All 5 blockers resolved in § PO SIGN-OFF. Architect blueprint appended below.

---

## [Architect] Brownfield Findings

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Architect:** architect · 2026-06-29T21:10Z
**Session:** (session-scrubbed)

---

### Zone: MULTI — 4 zones

PM must split into per-zone developer tasks. All zones are brownfield (existing microservices).

| Zone | Developer | Deliverables |
|---|---|---|
| `apps/mcp-server/` | dev-mcp-server | Sprint-0 backfill job, P0-2 tool+table+event hook, P0-4 tool, P0-5 tool, Breadth table+persister+tool, cron registration, schema migrations, registry wiring |
| `apps/technical-analysis/` | dev-technical-analysis | P0-1 domain/application/infra/interface, Breadth algorithms + HTTP route |
| `apps/macro-indicators/` | dev-macro-indicators | P0-3 Go parser extension, new domain/application layers, sbv_omo_daily persistence, LiquidityState response extension |
| `apps/stock-price/` | dev-stock-price | P0-2 foreign_room_events: NO code needed here — event detection is relocated to mcp-server (see design decision below) |

---

### CRITICAL BROWNFIELD NOTE — macro-indicators is Go, NOT TypeScript

Architecture doc (docs/ARCHITECTURE.md) lists macro-indicators as "TypeScript/Bun" — this is **outdated**. The production service runs the Go binary at `apps/macro-indicators/cmd/server/main.go` with domain/application/infrastructure in `apps/macro-indicators/pkg/`. The `src/` directory contains TypeScript code where most subdirectories are under `_deprecated/`; the only active TypeScript is `src/infrastructure/scrapers/` (external data adapters). Dev-macro-indicators MUST work in `pkg/` and `cmd/`, NOT `src/`.

---

### Verified Paths

**Sprint-0 OHLCV Backfill (dev-mcp-server):**
- `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — `writeOhlcvBatch` SSOT write path. MANDATORY: Sprint-0 job MUST import and call this function. Direct INSERT bypasses unit guard and risks CONTAM-6 regression.
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` — `ohlcv_backfill_queue` DDL already exists. `daily_ohlcv` DDL confirmed: code TEXT, date TEXT, open/high/low/close REAL, volume, updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol.
- `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` — existing `TA_MIN_ROWS=35` backfill job (heals per-ticker TA minimums). Sprint-0 is a SEPARATE parallel job; do NOT extend taOhlcvBackfillJob — its conflict strategy and fetch pattern are optimized for per-ticker TA restoration, not history depth.
- `apps/mcp-server/src/scheduler/cronConfig.ts` — existing cron map; new key pattern verified.

**P0-1 Volatility (dev-technical-analysis):**
- `apps/technical-analysis/src/domain/services.ts` — `CalculateTAService` (L1–L58). Pattern: pure, zero I/O, injected via constructor. `VolatilityService` follows same pattern.
- `apps/technical-analysis/src/domain/models.ts` — `CandleStick` interface (date, open, high, low, close, volume). Ready to extend with `VolatilityIndicators`.
- `apps/technical-analysis/src/infrastructure/repositories.ts` — `SQLitePriceRepository` queries `daily_ohlcv WHERE code=? ORDER BY day ASC`. Extend with VNINDEX series query and per-ticker OHLCV (open+high+low+close required for GK and ATR).
- `apps/technical-analysis/src/interface/handlers.ts` — `createRouter()` with POST /ta/indicators handler. Add POST /ta/volatility-indicators route.
- `apps/mcp-server/src/interface/mcp/tools/market-data/` — technicalIndicatorTools.ts exists (pattern to follow for new volatilityIndicatorTools.ts).

**P0-2 Foreign Room (dev-mcp-server):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `vnstock_trading_stats` DDL confirmed (L308–L341): has `code`, `date`, `foreign_room INTEGER`, `foreign_volume INTEGER`, `current_holding_ratio REAL`, `max_holding_ratio REAL`, `market_cap_bn REAL`, UNIQUE(code, date). All P0-2-FR-1..FR-5 inputs are present.
- `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — `JOB_NAME_TRADING_STATS = "vnstockTradingStatsRefresh"` (L44), runs at 08:30 UTC weekdays. **Event detection extension goes here** (after trading_stats row upserted, detect ROOM_FULL/ROOM_REOPEN transition, write to foreign_room_events — keeps mcp-server as single writer of market.db).
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts` — existing foreign-flow tool (pattern reference).

**P0-3 OMO Curve (dev-macro-indicators):**
- `apps/macro-indicators/pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go` — `OMOParseResult` struct (L56–L71) has TotalAddBnVND, TotalAbsorbBnVND, AuctionDate, ParseOK. The `collectOMORow` function (L182–L221) reads col[0] (type) and col[2] (volume), SKIPPING col[1] (members) and col[3] (rate) — exactly the two columns P0-3-FR-1 and FR-2 need to add.
- `apps/macro-indicators/pkg/application/dtos_vmt_liquidity.go` — `LiquidityStateResponse` struct (L147–L187): policy_rates, sjc_gold_gap, fx_coupling, irs, omo, interbank_1w. Additive extension confirmed safe.
- `apps/macro-indicators/cmd/server/main.go` — uses `DB_PATH` env (default `/app/data/market.db`) for the main DB read. New env `MACRO_DB_PATH` (default `/app/data/macro_indicators.db`) adds a second SQLite for zone-owned time-series.
- `apps/macro-indicators/pkg/infrastructure/repositories.go` — uses `modernc.org/sqlite` Go SQLite driver. Pattern to reuse for new macro_indicators.db connection.

**P0-4 News Sentiment (dev-mcp-server):**
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — `rag_analyses` DDL confirmed (L20–L46): id, created_at, level, sentiment TEXT, confidence REAL, impact_score REAL. Existing indexes: `idx_rag_created ON rag_analyses(created_at)` (L43), `idx_rag_level`, `idx_rag_sentiment`. **A covering index is needed** for the 90d window GROUP BY query (see Schema § below).
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/` — existing folder with news tools (pattern reference).

**P0-5 Insider Sentiment (dev-mcp-server):**
- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — `insider_transactions` DDL confirmed (L261–L277): code, type TEXT CHECK('buy'/'sell'/'other'), executed_volume, price, from_date, to_date, plus indexes on (code, from_date DESC) and (type, from_date DESC).
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts` — existing `get_insider_transactions` tool (raw DB rows). New `get_insider_sentiment` is a different tool (aggregate signal).
- `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts` — `get_insider_signals` (domain classifier, caller-provided data). New tool is distinct from both.

**Breadth Time-Series (dev-mcp-server + dev-technical-analysis):**
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` — `get_market_breadth` (L501–L584): existing snapshot tool that returns HOSE advancing/declining/unchanged/ceiling/floor counts from `vnmarket_prices`. The breadth persister job queries the SAME underlying data source (not the MCP tool itself — scheduler calls internal function).
- `apps/mcp-server/src/scheduler/cronConfig.ts` — verified FREE slot: minute `37` in hour `08` weekdays. No existing entry at `37 8 * * 1-5`.

---

### Ratifications

**ARCH-RATIFY-OMO-1 — FINAL DECISION: Option A (zone-clean, dedicated SQLite)**

`sbv_omo_daily` will live in a new `macro_indicators.db` SQLite file owned exclusively by the macro-indicators Go service.

Technical rationale:
1. The architectural single-writer invariant mandates market.db writes only from mcp-server. While macro-indicators already writes `macro_vmt_cache` to market.db (an existing exception for caching), adding `sbv_omo_daily` as a second zone-owned table further erodes the boundary. Each additional exception increases the surface area for write contention bugs.
2. The Go service already uses `modernc.org/sqlite` and `*sql.DB` — opening a second connection for a dedicated file is 4 lines of Go code.
3. `sbv_omo_daily` is consumed ONLY via the macro-indicators tool response (no cross-zone raw DB reads). The gateway hop is already designed for this.
4. Aligns with PO preference (Option A) and the deep-module / two-data-planes project memory.

Implementation: new env var `MACRO_DB_PATH` (default `/app/data/macro_indicators.db`). The Go service opens this DB alongside market.db. `sbv_omo_daily` is initialized in the macro-indicators startup sequence. No docker-compose volume change needed if `/app/data/` is already a shared volume mount — the file lives alongside market.db.

NFR-P03-3 (ON CONFLICT REPLACE, idempotent per auction_date) is binding regardless of DB choice.

**ARCH-RATIFY-INS-1 — FINAL DECISION: Accept market_cap_bn proxy, mandatory honesty label**

`market_cap_bn` from vnstock_trading_stats is a real fetched value — it passes the no-fake-data gate. It is NOT fabricated.

Binding implementation constraint: every `get_insider_sentiment` response MUST include `"normalization_basis": "market_cap_proxy"` as a top-level field. This is a QA hard gate — absence of this field = FAIL.

Additionally: when `market_cap_bn IS NULL` for a ticker, `net_sentiment_score` is null for that ticker (cannot normalize without denominator — honest null).

**B4 Breadth Cron — FINAL ASSIGNMENT: `37 8 * * 1-5`**

Verified against cronConfig.ts (L1–L221): minute 37 in the 08:xx hour is free for weekdays. The nearest neighbours are `reputationCompute` (33 8) and `alertOutcomeJob` (45 8). The +7 minute offset from the :30 pile-up matches the established Lever C pattern used by `cascadeBacktest` (+7 from :30) and `baseRateComputation` (+7 from :00).

New CRONS key:
```typescript
breadthHistoryPersister: Bun.env.CRON_BREADTH_HISTORY_PERSISTER ?? '37 8 * * 1-5',
```

---

### Design Decisions

**P0-2 Event Writer — relocated from dev-stock-price to dev-mcp-server**

The BA spec assigned foreign_room_events writes to dev-stock-price (Go service). However, stock-price pushes all data to mcp-server via HTTP (POST /api/push-prices pattern). stock-price has no direct market.db write access by architecture contract. To write foreign_room_events, stock-price would need either a new API endpoint on mcp-server or a direct DB write — both create coupling.

Cleaner design: the `vnstockTradingStatsRefresh` job in `vnstockFundamentalsJob.ts` (which already inserts to vnstock_trading_stats at 08:30 UTC) extends to also detect ROOM_FULL/ROOM_REOPEN transitions by comparing the freshly-inserted row to the previous row. mcp-server writes foreign_room_events directly. This collapses a cross-service write into a single-zone operation. dev-stock-price has NO changes in P0-2.

**P0-3 Persistence pattern — write-on-fetch (side effect in use case)**

The macro-indicators Go service has no internal scheduler. Rather than adding one, `LiquidityStateUseCase.Execute()` will call `PersistOMODaily(result OMOParseResult)` as a side effect whenever `ParseOK=true`. Since `sbv_omo_daily` uses ON CONFLICT REPLACE keyed on `auction_date`, this is idempotent — re-fetching the same HTML for the same auction date rewrites the same row safely. The mcp-server scheduler can trigger persistence indirectly by calling `get_vn_liquidity_state` on its daily schedule (or the VPS-side vn-sbv-fetch.service triggers the SBV fetch which propagates through the system).

**Separate `get_omo_curve` tool — deferred to P1**

The BA spec lists `get_omo_curve` as an optional separate endpoint. Architect decision: P0 extends `get_vn_liquidity_state` only (per NFR-P03-1 additive constraint). A standalone time-series endpoint for `sbv_omo_daily` history (e.g., `get_omo_curve`) is deferred to P1 when a consumer explicitly needs multi-date OMO history.

---

### Schema Changes (all additive — no destructive migrations)

**`apps/mcp-server/src/infrastructure/db/schema-market-data.ts`** — ADD:
```sql
CREATE TABLE IF NOT EXISTS market_breadth_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date TEXT NOT NULL UNIQUE,
  advancing    INTEGER NOT NULL,
  declining    INTEGER NOT NULL,
  unchanged    INTEGER NOT NULL,
  ceiling      INTEGER NOT NULL,
  floor        INTEGER NOT NULL,
  total        INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mbh_date ON market_breadth_history(session_date DESC);
```

**`apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`** — ADD:
```sql
CREATE TABLE IF NOT EXISTS foreign_room_events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  code                  TEXT NOT NULL,
  event_type            TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN')),
  event_date            TEXT NOT NULL,
  room_remaining_before INTEGER,
  room_remaining_after  INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code, event_date, event_type)
);
```

**`apps/mcp-server/src/infrastructure/db/schema-news.ts`** — ADD covering index (idempotent, CREATE INDEX IF NOT EXISTS):
```sql
CREATE INDEX IF NOT EXISTS idx_rag_sentiment_covering
  ON rag_analyses(created_at DESC, sentiment, confidence, impact_score);
```
Rationale: the P0-4 query does `GROUP BY DATE(created_at)` over a 90d window filtering on `sentiment IS NOT NULL AND confidence > 0`. The existing `idx_rag_created` is non-covering; adding `sentiment` + `confidence` + `impact_score` makes the 90d scan an index-only read. Required by NFR-P04-2.

**`apps/macro-indicators/` (Go service)** — NEW file `macro_indicators.db`:
```sql
-- opened by Go service at MACRO_DB_PATH (default /app/data/macro_indicators.db)
CREATE TABLE IF NOT EXISTS sbv_omo_daily (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_date            TEXT NOT NULL UNIQUE,
  add_bn_vnd              REAL NOT NULL,
  absorb_bn_vnd           REAL NOT NULL,
  net_outstanding_bn_vnd  REAL NOT NULL,
  weighted_avg_rate_pct   REAL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```
Init: called from `cmd/server/main.go` startup alongside market.db init.

---

### New Files (per zone)

**`apps/mcp-server/`**
```
scheduler/market-data/ohlcvHistoryBackfillJob.ts     ← Sprint-0
scheduler/market-data/breadthHistoryPersisterJob.ts  ← Breadth
domain/services/market-data/foreignRoomAnalyzer.ts   ← P0-2 (domain)
domain/services/market-data/insiderSentimentCalculator.ts ← P0-5 (domain)
domain/services/news-analysis/marketSentimentCalculator.ts ← P0-4 (domain)
application/usecases/getForeignRoom.ts               ← P0-2 (application)
application/usecases/getMarketSentimentIndex.ts      ← P0-4 (application)
application/usecases/getInsiderSentiment.ts          ← P0-5 (application)
infrastructure/db/foreignRoomStore.ts                ← P0-2 (infra)
infrastructure/db/insiderSentimentStore.ts           ← P0-5 (infra)
interface/mcp/tools/market-data/volatilityIndicatorTools.ts  ← P0-1 (interface)
interface/mcp/tools/market-data/foreignRoomTools.ts          ← P0-2 (interface)
interface/mcp/tools/market-data/insiderSentimentTools.ts     ← P0-5 (interface)
interface/mcp/tools/market-data/breadthThrustTools.ts        ← Breadth (interface)
interface/mcp/tools/news-analysis/marketSentimentTools.ts    ← P0-4 (interface)
```

**Modified in `apps/mcp-server/`**
```
infrastructure/db/schema-market-data.ts         ← add market_breadth_history
infrastructure/db/schema-financial-reports.ts   ← add foreign_room_events
infrastructure/db/schema-news.ts                ← add covering index
scheduler/cronConfig.ts                         ← add breadthHistoryPersister + ohlcvHistoryBackfill keys
scheduler/jobs.ts                               ← register 2 new scheduler jobs
scheduler/financial-reports/vnstockFundamentalsJob.ts ← extend with foreign_room_events detection
interface/mcp/tools/macro/liquidityStateTools.ts ← extend LiquidityStateResponseSchema additively
interface/mcp/tools/registry.ts                 ← register 5 new tools
```

**`apps/technical-analysis/`**
```
src/domain/models.ts           ← extend with VolatilityIndicators, BreadthRow interfaces
src/domain/repositories.ts     ← add VnIndexRepository port, BreadthDataRepository port
src/domain/services.ts         ← add VolatilityService + BreadthService (pure, zero I/O)
src/application/dtos.ts        ← add Compute{Volatility,Breadth}Request/Response
src/application/usecases.ts    ← add ComputeVolatilityUseCase + ComputeBreadthUseCase
src/infrastructure/repositories.ts ← extend SQLitePriceRepository + add BreadthDataRepository impl
src/interface/handlers.ts      ← add POST /ta/volatility-indicators + POST /ta/breadth routes
```

**`apps/macro-indicators/pkg/` (Go)**
```
infrastructure/parsers_vmt_sbv_interbank_omo.go ← extend OMOParseResult + collectOMORow
application/dtos_vmt_liquidity.go               ← extend LiquidityStateResponse additively
application/usecases_vmt_omo_persist.go         ← new PersistOMODaily use case (NEW file)
application/dtos_vmt_omo.go                     ← OMO daily DTOs (NEW file)
domain/services_vmt_omo.go                      ← ComputeImpliedShortRate + DeriveStressLabel (NEW file)
```
**Modified in macro-indicators:**
```
cmd/server/main.go              ← add MACRO_DB_PATH env, second DB init, wire PersistOMODaily
```

---

### Gauge-Readiness Contract (P1 forward dependency)

Each tool MUST include the named gauge scalar in its response. These fields are part of the QA acceptance contract.

| Tool | Gauge Field | Null Condition |
|---|---|---|
| `get_volatility_indicators` | `rv_20d_percentile` float 0–1 | `< 2 bars in history` |
| `get_foreign_room` | `foreign_outflow_z_5d` float | `< 20 sessions of vnstock_trading_stats` |
| `get_vn_liquidity_state` | `liquidity_stress_score` float 0–1 | `< 5 auction dates in sbv_omo_daily` |
| `get_market_sentiment_index` | `news_sentiment_z` float | `< 21 days data` (falls back to z_90d) |
| `get_insider_sentiment` | `net_sentiment_score` float -1 to +1 | `market_cap_bn IS NULL` |
| `get_breadth_thrust` | `breadth_z_score` float | `< 21 sessions in market_breadth_history` |

---

### Test Strategy

All new tools follow the project test template (`apps/mcp-server/src/__tests__/NNN-task-name.test.ts`, DB_PATH=:memory:).

| Zone | Test type | Key cases |
|---|---|---|
| dev-technical-analysis: VolatilityService | unit | RV with <11 bars → null; GK with H=L=O=C → null; ATR with <15 bars → null; regime band with 1 session → NORMAL (50th pct of 1); drawdown with <252 → null |
| dev-technical-analysis: BreadthService | unit | EMA warmup — McClellan null until 39 sessions; ADL cumulative correctness; Zweig 10/14 window |
| dev-mcp-server: P0-2 | integration | ROOM_FULL event detected on utilization ≥99%; null when max_holding_ratio=0; foreign_outflow_z_5d null when <20 sessions |
| dev-mcp-server: P0-4 | unit | history_quality='EMPTY' when rag_analyses empty; z-score null when <21 days; divide-by-zero guard on confidence=0 day |
| dev-mcp-server: P0-5 | unit | normalization_basis field always present; net_sentiment_score clamped [-1, +1]; price=0 rows excluded |
| dev-mcp-server: Breadth | integration | ON CONFLICT IGNORE idempotency; history_quality correctly transitions INSUFFICIENT→WARMUP→SUFFICIENT |
| dev-macro-indicators: OMO | unit (Go) | parseTenorDays "7 ngày"→7, "28 ngày"→28, unknown→-1; VN decimal comma in rate; X/Y member split; missing rate cell → WinningRatePct=0 + ParseWarning |
| Sprint-0 | integration | writeOhlcvBatch called (not direct INSERT); done=1 on success; meta completion marker written; VPS error → skip + log (no zero fill) |

---

### Risk Flags

**RISK-MACRO-LANG-CONFUSION [HIGH]:** Architecture doc says TypeScript/Bun for macro-indicators — it is Go. Developer working in wrong folder is a real risk. PM must explicitly specify `apps/macro-indicators/pkg/` and `apps/macro-indicators/cmd/` as the working directories in the dev task, and note the `src/` directory is deprecated.

**RISK-SPRINT0-WRITEPATH [HIGH]:** Sprint-0 backfill job must route through `writeOhlcvBatch` from `ohlcvWriteService.ts`. A direct INSERT bypasses `validateOhlcvUnit`, the unit scale guard, and the seed-bar rejection filter. QA must explicitly verify the write path is not bypassed (check taOhlcvBackfillJob.ts line ~35 for the import pattern to replicate).

**RISK-P0-4-COVERING-INDEX [MEDIUM]:** Without `idx_rag_sentiment_covering`, the 90d GROUP BY query on rag_analyses will full-table scan. Must be added in the same task that adds the P0-4 tool. The index creation is idempotent (CREATE INDEX IF NOT EXISTS).

**RISK-OMO-DUAL-DB-LIFECYCLE [MEDIUM]:** The Go macro-indicators service now opens two SQLite connections (market.db and macro_indicators.db). Developer must ensure: (a) WAL mode is enabled on macro_indicators.db at startup, (b) the DB connection is closed in the server's graceful shutdown handler, (c) the docker-compose `data` volume mount covers `/app/data/` so macro_indicators.db persists across container restarts.

**RISK-P0-1-NULL-PROPAGATION [MEDIUM]:** The rv_60d_pct and drawdown_252d_pct fields are null until Sprint-0 delivers ≥ 61/252 bars respectively. The tool MUST handle these as honest nulls at the MCP response layer. QA must verify null propagates correctly (not 0, not an error object).

**RISK-BREADTH-FIRST-RUN [LOW]:** `market_breadth_history` starts empty. `get_breadth_thrust` returns `{ error: 'no breadth history' }` when table empty (per NFR-BR-3). All consumers (market-watcher, etc.) must handle this error response. The P1 gauge also reads `breadth_z_score` which will be null for 21+ sessions after first deploy.

**RISK-P0-5-180D-DATA [LOW]:** Developer must probe actual row count in live `insider_transactions` table. If fewer than 180 days of data exist, `net_buy_sell_180d_bn_vnd` returns null. Response must include `data_window_days: { d30: n, d90: n, d180: n }` (count of actual rows in each window) so QA and consumers can self-validate.

---

### Build Standard

- **BUILD-STANDARD: lean** (all 4 zones are brownfield — services exist)
- **BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`
- PM note: decompose into 7 atomic developer tasks (Sprint-0 + P0-1 + P0-2 + P0-3 + P0-4 + P0-5 + Breadth). All 7 can be dispatched in parallel at kickoff per PO R-B1 ruling. Sequencing note: P0-1 full-depth (rv_60d, drawdown) blocks on Sprint-0; P0-1 partial (rv_10/20, ATR, regime) does not block. All other tasks are unconditionally parallel.

---

### orch-state update

Sprint-goal `next_agent` updated from "ba" to "pm". Sprint status: active. po_signoff: GRANTED.

---

NEXT: pm | break into 7 atomic developer tasks (Sprint-0, P0-1, P0-2, P0-3, P0-4, P0-5, Breadth) with per-zone handoffs. Each task specifies its zone, verified paths, DDD layer assignments, and gauge-readiness AC.
