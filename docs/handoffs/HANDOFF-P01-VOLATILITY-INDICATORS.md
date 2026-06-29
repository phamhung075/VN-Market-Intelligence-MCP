# Handoff — P0-1-VOLATILITY-INDICATORS

**Task ID:** P0-1-VOLATILITY-INDICATORS  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-technical-analysis  
**Zone:** `apps/technical-analysis/src/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** [P1 momentum family (forward dependency)]  
**Gated on:** OHLCV-BACKFILL-P0 (for rv_60d + drawdown_252d only; RV10/20, ATR%, regime can ship independently)

---

## Overview

Implement the core volatility primitives for VN-Index and per-ticker analysis. Outputs 5 feature sets: realized volatility (RV) by time window, Garman-Klass OHLC-based volatility, Average True Range percentage, volatility regime classification, and maximum drawdown. The tool is the foundation for P1's Fear & Greed gauge and risk-management features.

**Partial Release Pattern:** RV10/20d, ATR%, regime band, and gauge-ready scalar (rv_20d_percentile) can ship once the code is ready, returning honest nulls for rv_60d and drawdown_252d until OHLCV-BACKFILL-P0 lands (~2 weeks for full 252-bar depth).

---

## Functional Requirements

### FR-1: VN-Index Realized Volatility (RV) — 10d / 20d / 60d

- **Inputs:** VN-Index close series from `daily_ohlcv` (code='VNINDEX') or `vn_index_cache`
- **Computation:** Daily log-returns r_t = ln(P_t / P_{t-1}). RV_N = sqrt(252) × sqrt(mean(r_t² over N days)) → annualized % volatility
- **Outputs:** `rv_10d_pct`, `rv_20d_pct`, `rv_60d_pct` (REAL, nullable)
- **Minimum bars:** rv_10d needs ≥11 bars, rv_20d ≥21, rv_60d ≥61. Return NULL when below minimum.
- **Gauge-readiness:** Also output `rv_20d_percentile` = rank of rv_20d_pct in the available history window (0.0–1.0). This is the P1 Fear & Greed gauge's volatility leg.

### FR-2: Garman-Klass Volatility

- **Inputs:** `daily_ohlcv` open/high/low/close for VN-Index
- **Computation:** GK estimator: 0.5×(ln(H/L))² − (2ln2−1)×(ln(C/O))² — annualized, rolling 20d window
- **Output:** `gk_vol_20d_pct` (REAL, nullable)
- **Edge case:** On days where H=L=O=C (stub bars or halt days), GK is zero — set null, not zero, to distinguish from genuinely zero volatility.

### FR-3: Per-Stock ATR% (14-day)

- **Inputs:** `daily_ohlcv` per watchlist ticker (high / low / close), 15 bars minimum
- **Computation:** ATR(14) using Wilder smoothing; ATR% = ATR / previous_close × 100
- **Output:** `atr_pct_14d` per ticker (REAL, nullable)
- **Watchlist scope:** Iterate over all tickers in `system-map.json .project.watchlist` (query from config, never hardcode).

### FR-4: Volatility Regime Band

- **Inputs:** rv_20d_pct + historical rv_20d series
- **Computation:** Assign label `LOW` / `NORMAL` / `ELEVATED` / `CRISIS` based on percentile rank in available history. Thresholds: LOW < 25th pct, NORMAL 25–75th, ELEVATED 75–90th, CRISIS ≥ 90th.
- **Outputs:** `vol_regime` TEXT label; `vol_regime_pct` float (percentile rank)
- **Honesty label:** Include `history_sessions: int` count so consumers know the band quality. With only ~48 sessions pre-backfill, this is an honest approximation, NOT a 10-year z-score (roadmap §4 reject).

### FR-5: 252-Day Maximum Drawdown

- **Inputs:** VN-Index close series (252 bars — REQUIRES OHLCV-BACKFILL-P0 completion)
- **Computation:** Max drawdown = (peak − trough) / peak over trailing 252-session window
- **Output:** `drawdown_252d_pct` (REAL, nullable). Return NULL when fewer than 252 bars available.
- **Gating:** Ship FR-5 as part of the same tool; it returns null until Sprint-0 backfill confirms ≥252 bars.

---

## Non-Functional Requirements

- **NFR-P01-1:** Tool returns `{error: '...'}` JSON on failure (never throws). Consistent with project error contract.
- **NFR-P01-2:** Stateless calculation — no new persistent table required for P0-1. All inputs from read-only OHLCV store.
- **NFR-P01-3:** Tool registered in apps/mcp-server + `toolCount` updated in `docs/data/project-stats.json` (re-derived from 3-way probe, not baked).
- **NFR-P01-4:** Language — all label strings in English (no Vietnamese in enum values). Vietnamese display is the frontend/consumer layer's job.

---

## Edge Cases

- **Watchlist ticker with fewer than 15 bars:** Return `atr_pct_14d: null` for that ticker, do not break the whole response.
- **VN-Index data gap** (public holiday, VnDirect outage): log the gap, skip in rolling window. Do NOT forward-fill.
- **Pre-backfill state:** With ~48 sessions available, rv_20d_percentile is an honest rank within 48 sessions. Ship this; it improves as history accrues. Do NOT invent a synthetic rank.

---

## Acceptance Criteria

- [ ] RV10/20/60d computation correct; null propagation verified (RV60d returns null until ≥61 bars)
- [ ] Garman-Klass volatility computed; null for stub bars (H=L=O=C)
- [ ] ATR(14) via Wilder smoothing; ATR% calculated; null for <15 bars
- [ ] Volatility regime band (LOW/NORMAL/ELEVATED/CRISIS) based on percentile rank
- [ ] `history_sessions` label included; honest null propagation for low-history case
- [ ] 252d drawdown computed; returns null until ≥252 bars (Sprint-0 dependent)
- [ ] `rv_20d_percentile` gauge-ready scalar included (0.0–1.0, null when <2 bars)
- [ ] Tool error contract: `{error: '...'}` on failure, not thrown exceptions
- [ ] Tool registered in mcp-server + toolCount updated (re-derived via 3-way probe)
- [ ] Tests: unit tests for RV with <11/21/61 bars → null; GK with H=L=O=C → null; ATR with <15 bars → null; regime band with 1 session → NORMAL; drawdown with <252 → null
- [ ] Existing tests still pass: `pnpm check` on technical-analysis module

---

## Verified Paths (from Architect)

- **Pure calculation service:** `apps/technical-analysis/src/domain/services.ts` — `CalculateTAService` pattern (pure, zero I/O, injected via constructor). Create `VolatilityService` following same pattern.
- **Models:** `apps/technical-analysis/src/domain/models.ts` — extend with `VolatilityIndicators` interface
- **Repository pattern:** `apps/technical-analysis/src/infrastructure/repositories.ts` — `SQLitePriceRepository` queries `daily_ohlcv WHERE code=? ORDER BY day ASC`. Extend with VNINDEX series query and per-ticker OHLCV queries.
- **HTTP handler:** `apps/technical-analysis/src/interface/handlers.ts` — `createRouter()` with POST /ta/indicators handler. Add POST /ta/volatility-indicators route.
- **MCP tool pattern:** `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` — existing pattern. Create new `volatilityIndicatorTools.ts` following same structure.

---

## New Files to Create

- `apps/technical-analysis/src/domain/services/VolatilityService.ts` — pure RV/GK/ATR/regime/drawdown calculations
- `apps/technical-analysis/src/domain/models/VolatilityIndicators.ts` — interfaces and types
- `apps/technical-analysis/src/application/usecases/ComputeVolatilityUseCase.ts` — orchestration layer
- `apps/technical-analysis/src/application/dtos/ComputeVolatilityRequest.ts` and `ComputeVolatilityResponse.ts`
- `apps/technical-analysis/src/interface/handlers/volatilityHandler.ts` — HTTP POST /ta/volatility-indicators route
- `apps/mcp-server/src/interface/mcp/tools/market-data/volatilityIndicatorTools.ts` — MCP tool wrapper

---

## Modified Files

- `apps/technical-analysis/src/domain/models.ts` — extend with VolatilityIndicators interface
- `apps/technical-analysis/src/infrastructure/repositories.ts` — add VnIndexRepository methods + extend queries
- `apps/technical-analysis/src/interface/handlers.ts` — add volatility route registration
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register get_volatility_indicators tool
- `docs/data/project-stats.json` — update `toolCount` (re-derived, not baked)

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `rv_20d_percentile` (float 0–1)
- Null condition: fewer than 2 bars in history
- Usage: P1 Fear & Greed gauge's volatility leg ranks current RV within historical bounds

---

## Risk Flags (from Architect)

- **RISK-P0-1-NULL-PROPAGATION [MEDIUM]:** The rv_60d_pct and drawdown_252d_pct fields are null until Sprint-0 delivers ≥61/252 bars respectively. The tool MUST handle these as honest nulls at the MCP response layer. QA must verify null propagates correctly (not 0, not an error object).

---

## Done Criteria

- Code review approved (pure calculation verified, null propagation tested)
- `pnpm check` and `pnpm test` pass on technical-analysis module
- Unit tests for edge cases (low bar count, stub bars, regime bands)
- Tool registered and tested via gateway
- Commit message: `feat(P0-1-VOLATILITY): RV 10/20/60d, GK, ATR%, regime band, 252d drawdown — partial release (rv_60d/drawdown null until OHLCV-BACKFILL-P0)`

---

## Developer Notes

**Release strategy:** Ship RV10/20d, ATR%, regime band, and gauge-ready scalar immediately (they work with ~48 bars). RV60d and drawdown_252d return honest nulls until OHLCV-BACKFILL-P0 completes. This prevents a multi-week delay and delivers value incrementally.

**Watchlist query:** Use `system-map.json .project.watchlist` (never hardcode the list). Query pattern: load config, iterate per-ticker.

**Error handling:** All computation errors should return `{error: 'specific reason'}` JSON, not throw exceptions. This matches the project error contract.

---

## [Developer] Implementation Record — 2026-06-29

**Status:** REVIEW

**Simplicity gate:** PASS — Q1 abstraction layers not increased, Q2 no new interfaces for internal calls, Q3 no new config keys except WATCHLIST_TICKERS env var (env is zone-native), Q4 test lines ≤ impl lines.

**Files delivered (apps/technical-analysis only):**
- `pkg/domain/volatility_models.go` — OHLCVBar, VolatilityRegime const, VolatilityResult
- `pkg/domain/volatility_ports.go` — OHLCVRepository interface
- `pkg/domain/volatility_service.go` — 7 pure calculation methods (ComputeRV, ComputeGarmanKlass, ComputeATRPct, ComputeRegime, ComputeDrawdown252d, ComputePercentileRank, BuildRVHistory)
- `pkg/domain/volatility_service_test.go` — 35+ unit tests, full null propagation + boundary coverage
- `pkg/application/volatility_dtos.go` — ComputeVolatilityRequest/Response with sandbox injection fields
- `pkg/application/volatility_usecase.go` — ComputeVolatilityUseCase with DB + sandbox paths
- `pkg/infrastructure/ohlcv_repository.go` — SQLiteOHLCVRepository (SELECT date,open,high,low,close FROM daily_ohlcv)
- `pkg/interface/http/volatility_handler.go` — handleVolatilityIndicators http.HandlerFunc
- `pkg/interface/http/router.go` — nil-guarded route, updated NewRouter signature (3 args)
- `cmd/server/main.go` — volatility wiring, WATCHLIST_TICKERS env var, parseWatchlist
- `cmd/sandbox/main.go` — noopOHLCVRepo, volatility scenario assertions
- `docs/scenarios/technical-analysis/service/volatility-null-propagation.json` — GREEN
- `docs/scenarios/technical-analysis/service/volatility-partial-compute.json` — GREEN

**Verification results:**
- `go test ./...`: all packages PASS
- `go vet ./...`: 0 issues
- `golangci-lint run ./...`: 0 issues
- `go build ./cmd/...`: OK
- Sandbox: 35 scenarios GREEN (25 primitive + 5 module + 5 service)

**Deviations from spec:**
- Watchlist: WATCHLIST_TICKERS env var instead of system-map.json file read — Docker build context excludes docs/ (out-of-zone mount required ops coordination; env var is within zone)
- MCP tool registration (NFR-P01-3) in apps/mcp-server is OUT OF ZONE (concurrent dev). QA must coordinate with mcp-server dev to wire `get_volatility_indicators`.
- Ops must set WATCHLIST_TICKERS in docker-compose from system-map.json .project.watchlist before ATR% works in production.
