// Package application — request/response DTOs (data-transfer objects) for the
// /ta/indicators endpoint.
//
// FACTORY-TECHANALYSIS-reconcile-ta-contract: this struct pair, together with
// api/openapi.yaml, is now the SINGLE authoritative /ta/indicators contract.
// A second, divergent contract used to live in the dead TS shadow service
// (apps/technical-analysis/src/ — never started by Dockerfile/docker-compose,
// deleted 2026-07-28 by FACTORY-TECHANALYSIS-delete-orphaned-ts-service):
// {code, days} -> scalar values + a `trend` field computed by determineTrend().
// That shape is intentionally NOT reflected here. Investigation (repo-wide
// grep across mcp-server/frontend/alert-engine/packages/shared-types; see
// docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-technical-analysis.md
// STEP dev-technical-analysis-S2) found no live caller depending on
// determineTrend's 70/30-threshold semantics, so trend was dropped rather
// than ported — do not reintroduce a `trend` field without a corroborated
// live caller.
package application

// ComputeTARequest is the inbound payload for POST /ta/indicators.
//
// Two mutually-exclusive-in-practice paths (Closes wins when both are sent):
//   - Pure-compute: Closes is non-empty -> compute directly, market.db is
//     never touched.
//   - DB-backed: Closes is empty and Symbol is set -> the most recent 60
//     candles are fetched from market.db (limit is fixed at 60, independent
//     of Period) and their closes are extracted, oldest -> newest.
//
// At least one of Symbol or Closes is required; the empty-both case is a 400
// ("closes or symbol required"), enforced identically in the use case
// (pkg/application/usecases.go) and the HTTP handler
// (pkg/interface/http/router.go) as a defence-in-depth pair.
type ComputeTARequest struct {
	Symbol string `json:"symbol"`
	// Period drives ONLY the RSI window and the parameterised sma/ema window
	// (module.ComputeParams.RSIPeriod / MAPeriod). It does NOT change how many
	// candles are read from the DB (always 60) and does NOT affect MACD
	// (fixed 12/26/9), Bollinger Bands (fixed 20, 2σ), or ma5/ma20/ma50
	// (always fixed at their namesake periods). Optional: <= 0 defaults to 14
	// (pkg/application/usecases.go Execute — "sensible default").
	Period int       `json:"period"`
	Closes []float64 `json:"closes,omitempty"`
}

// ComputeTAResponse is the outbound payload returned by the use case.
// All indicator fields are time-series []float64 arrays (oldest -> newest),
// not scalars — the last element is the most-recent value. Arrays are
// omitted (omitempty) when there is insufficient history for that indicator.
type ComputeTAResponse struct {
	Symbol string `json:"symbol"`
	// RSI: Wilder-smoothed RSI, window = request Period (default 14).
	RSI []float64 `json:"rsi,omitempty"`
	// MACDLine/SignalLine/Histogram: fixed 12/26/9 EMA-based MACD, independent of Period.
	MACDLine   []float64 `json:"macdLine,omitempty"`
	SignalLine []float64 `json:"signalLine,omitempty"`
	Histogram  []float64 `json:"histogram,omitempty"`
	// BollingerUpper/Middle/Lower: fixed SMA(20) +/- 2 * population stddev, independent of Period.
	BollingerUpper  []float64 `json:"bollingerUpper,omitempty"`
	BollingerMiddle []float64 `json:"bollingerMiddle,omitempty"`
	BollingerLower  []float64 `json:"bollingerLower,omitempty"`
	// SMA/EMA: parameterised moving averages, window = request Period (default 14).
	// EMA uses the standard smoothing factor alpha = 2/(period+1) — NOT Wilder's
	// 1/period smoothing (see pkg/primitive/moving_average/moving_average.go).
	SMA []float64 `json:"sma,omitempty"`
	EMA []float64 `json:"ema,omitempty"`
	// MA5/MA20/MA50: fixed-period SMAs, always computed at 5/20/50 regardless
	// of the request Period. Present when sufficient data; absent (omitempty) otherwise.
	MA5  []float64 `json:"ma5,omitempty"`
	MA20 []float64 `json:"ma20,omitempty"`
	MA50 []float64 `json:"ma50,omitempty"`
}
