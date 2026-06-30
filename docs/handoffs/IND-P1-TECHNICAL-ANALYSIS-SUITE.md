# Dev Task — IND-P1 Technical-Analysis Indicator Suite (3 Tools)

**Task ID:** IND-P1-TECHNICAL-ANALYSIS-SUITE (spans 3 backlog placeholders)
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Tier:** P1
**Zone:** apps/technical-analysis (Go)
**Dev Agent:** dev-technical-analysis
**Created:** 2026-06-30T03:00:00Z
**PM Decomposition of:** BA-IND-P1-MOMENTUM-RS

---

## Scope (3 Tools — Bundled by Zone)

Implement the **3 technical-analysis indicator tools** as a coordinated zone delivery:

1. **Tool: `get_roc_momentum`** (Backlog ID: IND-P1-ROC-MOMENTUM)
2. **Tool: `get_relative_strength`** (Backlog ID: IND-P1-RELATIVE-STRENGTH)
3. **Tool: `get_52w_proximity`** (Backlog ID: IND-P1-52W-HIGH-PROXIMITY)

All read from `daily_ohlcv` table; all are OHLCV-derived computations. This is a **single zone-locked dev task** spanning 3 related tools — not 3 separate tasks.

---

## Critical Corrections (Carry Verbatim into Code)

**RISK-3 [HIGH] — TS-DEAD-CODE:** `apps/technical-analysis/src/` (TypeScript) is DEAD CODE; the Dockerfile builds ONLY from `pkg/` + `cmd/`. **Dev MUST work exclusively in Go under `pkg/`/`cmd/`.** Any `src/` edit is wasted work.

---

## Mandatory Architecture (from Architect Blueprint)

### Domain Layer (Go `pkg/domain/`)

**New model files:**
- `momentum_models.go` — `ROCPerTickerResult`, `FactorReturnBucket`, `CrossSectionalROCResult`, `MomentumLabel` enum
- `momentum_service.go` — `CalculateROCMomentumService`: ROC formula, skip-month window (252-21), z-score, decile, factor-return; honest-null guards
- `relative_strength_models.go` — `RSHorizonResult` (63d/126d/252d Mansfield RS + percentile), `CompositeRSResult`, `RSLabel` enum
- `relative_strength_service.go` — `CalculateRelativeStrengthService`: multi-horizon Mansfield RS vs VNINDEX (ticker_id = "VNINDEX" per ARCH-RATIFY-RS-1); partial RS support (>=63d real, <126d null per FR-7); `index_data_absent` null-guard
- `proximity_models.go` — `ProximityResult`, `ProximityLabel` enum, `NetNewHighsAggregate` (incl. `denominator_ma200` field)
- `proximity_service.go` — `Calculate52WProximityService`: 52w high/low from `daily_ohlcv`, MA50/MA200 inline via `TACalculator`, proximity labels (AT_HIGH, NEAR_HIGH, MID_RANGE, NEAR_LOW, AT_LOW), net-new-highs aggregate

**New shared port (for all 3 tools):**
- `multi_ticker_ports.go` — `MultiTickerOHLCVRepository` interface: `GetMultiTickerCandles(codes []string, limit int) (map[string][]OHLCVBar, error)`

### Application Layer (Go `pkg/application/`)

**New DTO files:**
- `momentum_dtos.go` — `ROCMomentumRequest`, `ROCMomentumResponse` (per-ticker + feed-forward `momentum_factor_z` scalar)
- `momentum_usecase.go` — `ComputeROCMomentumUseCase`: reads `WATCHLIST_TICKERS` env var
- `relative_strength_dtos.go` — `RSRequest`, `RSResponse` (per-ticker + feed-forward `market_rs_composite` scalar)
- `relative_strength_usecase.go` — `ComputeRelativeStrengthUseCase`: prepends VNINDEX to watchlist
- `proximity_dtos.go` — `ProximityRequest`, `ProximityResponse` (per-ticker + aggregate `net_new_highs` scalar + `denominator_ma200`)
- `proximity_usecase.go` — `Compute52WProximityUseCase`

### Infrastructure Layer (Go `pkg/infrastructure/`)

**New repository file:**
- `multi_ticker_ohlcv_repository.go` — `SQLiteMultiTickerOHLCVRepository implements MultiTickerOHLCVRepository`
  - Single parameterized SQL: `SELECT date, open, high, low, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol FROM daily_ohlcv WHERE code IN (...) ORDER BY code, date ASC LIMIT ?`
  - IN-clause parameterization: `strings.Repeat("?,", n)` pattern (watchlist <= 50 tickers)

### Interface Layer (Go `pkg/interface/http/`)

**New handler files:**
- `momentum_handler.go` — `handleROCMomentum(uc, logger)` → `POST /ta/roc-momentum`
- `relative_strength_handler.go` — `handleRelativeStrength(uc, logger)` → `POST /ta/relative-strength`
- `proximity_handler.go` — `handle52WProximity(uc, logger)` → `POST /ta/52w-proximity`

**Modified:**
- `router.go` — add 3 routes; extend `NewRouter()` signature (or use `RouterConfig` struct to avoid explosion)
- `cmd/server/main.go` — wire new repositories + services + use cases into composition root

---

## Functional Requirements (Distilled from BA Spec)

### Tool 1: `get_roc_momentum`

**FR-1:** 12-1 ROC formula: `(close[t-22] / close[t-252]) - 1` (21-bar skip-month per Jegadeesh-Titman).
**FR-2:** Cross-sectional z-score normalization across all tickers with sufficient history.
**FR-3:** Decile rank (1=laggard, 10=leader); classify: `MOMENTUM_LEADER` (decile 8–10), `MOMENTUM_NEUTRAL` (3–7), `MOMENTUM_LAGGARD` (1–2).
**FR-4:** Factor-return snapshot: per decile, compute average realized return over prior 21-day window.
**FR-5:** Tickers with <273 bars → `null` + `null_reason: "insufficient_history"` (not dropped from response).
**FR-6:** Fewer than 5 tickers with sufficient history → z-score/decile = `null` + `null_reason: "insufficient_cross_section"`.
**Edge:** gap >3 sessions → `null_reason: "data_gap_too_large"`; all-same-direction → `null_reason: "degenerate_distribution"` for z/decile only (raw ROC emitted).

### Tool 2: `get_relative_strength`

**FR-1:** Mansfield RS per horizon (63d/126d/252d): `(stock_%change - index_%change)`.
**FR-2:** VN-Index sourced from `daily_ohlcv` (ticket_id = "VNINDEX" per ARCH-RATIFY-RS-1); no runtime API call.
**FR-3:** Cross-sectional percentile rank per horizon: `percentile = (rank / N) * 100`.
**FR-4:** RS posture labels per horizon: `LEADING` (pct >=75), `LAGGING` (pct <=25), `IN_LINE` (26–74).
**FR-5:** Composite RS score = arithmetic mean of 3 horizon percentiles; composite label: `STRONG` (>=70), `WEAK` (<=30), `NEUTRAL` (31–69).
**FR-6:** Partial RS support: <63 bars = all null; >=63 but <126 = 63d real + 126d/252d null with distinct null_reason; >=126 but <252 = 63d/126d real + 252d null.
**FR-7:** VN-Index absent → all tickers = `null` + `null_reason: "index_data_absent"` (not panic).
**NFR:** Include `low_sample_warning: true` when N<5.

### Tool 3: `get_52w_proximity`

**FR-1:** Per-ticker: `high_52w = max(close)` and `low_52w = min(close)` over 252 bars; `pct_from_52w_high = (current - high) / high`; `pct_from_52w_low = (current - low) / low`.
**FR-2:** `above_ma50 = current > ma50` (50-period SMA); `above_ma200 = current > ma200` (200-period SMA).
**FR-3:** `new_high_today = (current == high_52w)` boolean flag per ticker.
**FR-4:** Proximity labels: `AT_HIGH` (pct >= -0.02), `NEAR_HIGH` (-0.10 to -0.02), `MID_RANGE` (middle), `NEAR_LOW` (0 to 0.10), `AT_LOW` (pct <= 0.02).
**FR-5:** Aggregate net-new-highs: count tickers at/near highs and lows; compute `pct_above_ma50` and `pct_above_ma200` (MA200 denominator EXCLUDES tickers with <200 bars).
**FR-6:** <252 bars = 52w fields null; >=50 but <252 = above_ma50 real + above_ma200 null; include `denominator_ma200` field for sample transparency.
**Edge:** breakout possible (pct_from_52w_high > 0) but rare; plausibility: pct_from_52w_low >= 0 for all tickers always (sanity check).

---

## Honest-NULL Discipline (Standing Contract)

- **No fake data:** Every value is REAL or NULL (with `null_reason`).
- **Insufficient history:** Return `null` + explicit `null_reason` string.
- **Degenerate stddev:** z-score undefined → `null` + `null_reason: "degenerate_distribution"` (raw values may still be emitted).
- **Missing benchmark (VNINDEX):** ALL tickers → `null` + `null_reason: "index_data_absent"`.
- **Data gap:** Gap >3 sessions → `null_reason: "data_gap_too_large"` for affected ticker.

---

## Feed-Forward Scalars (for P1 Fear & Greed Composition)

Each tool MUST emit a top-level aggregate scalar consumable by future helper agents:

| Tool | Scalar | Description |
|---|---|---|
| `get_roc_momentum` | `momentum_factor_z` | Median z-score across all deciles cross-sectionally |
| `get_relative_strength` | `market_rs_composite` | Mean composite RS across watchlist |
| `get_52w_proximity` | `net_new_highs` | `new_highs_count - new_lows_count` (aggregate) |

---

## Testing Strategy (Go `*_test.go`)

- **momentum_service_test.go:** Table-driven tests covering full 273-bar path (real values), <273-bar path (null+reason), degenerate z-score, gap >3d, cross-section <5.
- **relative_strength_service_test.go:** VNINDEX absent case, partial RS (70-bar ticker = 63d real + 126d null), low_sample_warning.
- **proximity_service_test.go:** <252 bar handling, MA50/MA200 real/null split, denominator_ma200 count, plausibility checks (pct_from_52w_high <= 0, pct_from_52w_low >= 0).
- **multi_ticker_ohlcv_repository_test.go:** In-memory SQLite integration; multi-ticker read with IN-clause parameterization.

---

## Acceptance Criteria (QA Gate)

1. All 3 tools return per-ticker fields + feed-forward scalar.
2. Honest-NULL: tickers with insufficient history return `null` + `null_reason` (NEVER default-fill).
3. VNINDEX is read from `daily_ohlcv` (ticket_id = "VNINDEX"); no API call.
4. MA50 and MA200 are computed inline using existing `TACalculator` (Go pkg).
5. All 3 tools complete watchlist computation within 2 seconds.
6. Each tool is callable via `POST /ta/<tool-name>` endpoint.
7. Consumed by >=1 helper agent (MW/CHEF/DP/AC/TNB) — verified via helper-agent session logs or tool_usage_stats.

---

## Dependencies

- **Upstream:** OHLCV-BACKFILL-P0 (LIVE_VERIFIED) — `daily_ohlcv` table populated with 252+ bar history per ticker + VNINDEX rows.
- **Shared:** Existing `TACalculator` (Go `pkg/infrastructure/calculator.go`); no new MA primitives needed.
- **Downstream:** MCP proxy layer (`dev-mcp-server`) consumes these 3 HTTP endpoints and registers MCP tools.

---

## Files Overview (What to Create/Modify)

**Create (11 new):**
- pkg/domain/momentum_models.go
- pkg/domain/momentum_service.go
- pkg/domain/relative_strength_models.go
- pkg/domain/relative_strength_service.go
- pkg/domain/proximity_models.go
- pkg/domain/proximity_service.go
- pkg/domain/multi_ticker_ports.go
- pkg/application/momentum_dtos.go, momentum_usecase.go
- pkg/application/relative_strength_dtos.go, relative_strength_usecase.go
- pkg/application/proximity_dtos.go, proximity_usecase.go
- pkg/infrastructure/multi_ticker_ohlcv_repository.go
- pkg/interface/http/momentum_handler.go, relative_strength_handler.go, proximity_handler.go
- pkg/domain/momentum_service_test.go, relative_strength_service_test.go, proximity_service_test.go, multi_ticker_ohlcv_repository_test.go

**Modify (2):**
- pkg/interface/http/router.go — add 3 routes
- cmd/server/main.go — wire new dependencies

**Total touched files: 13 new + 2 modified = 15 files in apps/technical-analysis**

---

## Delivery Timeline

Estimated effort: **Medium** (M per BA, 3 tools bundled by zone).
Single dev, parallel domain/application/infrastructure development.
Target completion: next dev cycle (assume 6–8h delivery, next business day for QA handoff).

---

## No-Op Warnings

- **DO NOT touch** `apps/technical-analysis/src/` (TypeScript). Dockerfile ignores it.
- **DO NOT** implement a second MA calculator. Reuse `TACalculator.calculateMA()` with period=200.
- **DO NOT** create separate tasks for each tool. This IS one zone-locked task spanning 3 tools.

---

## Handoff to MCP Layer (Sequential Dependency)

When all 3 HTTP endpoints are LIVE and tested:
- Handoff to `dev-mcp-server` for MCP proxy layer task (IND-P1-MCP-PROXY-INDICATORS).
- MCP server will call `POST /ta/roc-momentum`, `POST /ta/relative-strength`, `POST /ta/52w-proximity`.
