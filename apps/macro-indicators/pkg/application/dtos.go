// Package application — Data Transfer Objects for HTTP/use-case boundaries.
package application

import "time"

// MacroSnapshotRequest is the input DTO for the ComputeMacroUseCase.
// Phase 1: empty body accepted (placeholder for future filter parameters).
type MacroSnapshotRequest struct {
	// Placeholder: Phase 1 accepts an empty request body ({}).
}

// SignalResult holds the classification result of one primitive signal.
// Used inside MacroSnapshotResponse.Signals to surface all 6 primitives.
type SignalResult struct {
	// InvestmentClock is the macro-investment-clock classification (tier/score/phase).
	InvestmentClock interface{} `json:"investment-clock"`

	// Oil is the macro-oil-impact-classifier result (impact/priceUSD).
	Oil interface{} `json:"oil"`

	// Gold is the macro-gold-direction-classifier result (direction/priceUSD).
	Gold interface{} `json:"gold"`

	// UsdVnd is the macro-usdvnd-direction-classifier result (direction/rateVND).
	UsdVnd interface{} `json:"usdvnd"`

	// Carry is the macro-carry-trade-signal result (regime/carrySpread/...).
	Carry interface{} `json:"carry"`

	// Yield is the macro-yield-spread-signal result (label/spread/...).
	Yield interface{} `json:"yield"`
}

// CarrySignalDTO wraps a carry-trade primitive output with provenance metadata.
//
// DSI-INV-1: when any carry input (fedFunds or vndDeposit) is estimated from a
// fixture fallback, IsEstimate=true, SourceTier=4 (fixture), Regime="UNKNOWN",
// and CarrySpread is omitted (null in JSON). This prevents fixture arithmetic from
// being served as actionable "FII_OUTFLOW_RISK".
//
// FetchedAtSource is the FRED MAX(date) timestamp for fedFunds (nil when absent).
// It is NEVER time.Now() on the fallback path.
type CarrySignalDTO struct {
	Regime         string     `json:"regime"`
	CarrySpread    *float64   `json:"carrySpread"`           // null when IsEstimate=true
	VNDDepositRate float64    `json:"vndDepositRate"`
	FedFundsRate   float64    `json:"fedFundsRate"`
	Reasoning      string     `json:"reasoning"`
	ComputedAt     string     `json:"computedAt"`
	IsEstimate     bool       `json:"is_estimate"`
	SourceTier     int        `json:"source_tier"`
	FetchedAtSource *time.Time `json:"fetched_at_source"` // FRED source date; nil when unavailable
}

// YieldSignalDTO wraps a yield-spread primitive output with provenance metadata.
//
// DSI-INV-1: when any yield input (earnYield or depositRate) is estimated from a
// fixture fallback, IsEstimate=true and SourceTier=4.
type YieldSignalDTO struct {
	Label        string   `json:"label"`
	Spread       float64  `json:"spread"`
	EarningYield float64  `json:"earningYield"`
	DepositRate  float64  `json:"depositRate"`
	Reasoning    string   `json:"reasoning"`
	ComputedAt   string   `json:"computedAt"`
	IsEstimate   bool     `json:"is_estimate"`
	SourceTier   int      `json:"source_tier"`
}

// MacroSnapshotResponse is the output DTO returned by ComputeMacroUseCase.Execute.
// Mirrors domain.MacroSnapshot but adds HTTP-level metadata (Status, FetchedAt)
// and the 6-primitive signals block required by AC-2 (P2-X3).
//
// MACRO-LIVE-PRICES: DataSource field added to indicate whether commodity values
// came from live DB ("live") or fixture defaults ("fixture"). Set by Execute()
// after resolveMarketPrices() runs; callers can detect degraded mode via this field.
//
// DSI-INV-1: DataSource is now "live" ONLY when oil+gold+usdVnd AND fedFunds AND
// vndDeposit are all live. Otherwise "estimate" (any fixture component present).
//
// FDA-2: per-field provenance added for VNIndex, OilUSD, GoldUSD, USDVnd.
// When a field falls back to fixture, IsEstimate=true and SourceTier=4 on that field.
// Mirrors the pattern established by CarrySignalDTO / YieldSignalDTO (DSI-INV-1).
//
// FDA-3: FetchedAt is a pointer — nil when all inputs are fixture (prevents
// fresh-stamping non-fresh data). Non-nil on any live-data path.
//
// U4: direction+delta fields added for all 4 headline values (additive — no rename/removal).
// VnIndex delta is computed from daily_ohlcv prev-session history (when available).
// Oil/gold/usdVnd: no prev-session history persisted → delta=null, direction="unknown".
// Direction enum: "up" | "down" | "flat" | "unknown".
// Flat threshold: |delta/current| < 0.001 (0.1% of current price — tunable, sprint-deferred).
type MacroSnapshotResponse struct {
	Status     string       `json:"status"`
	VNIndex    float64      `json:"vnIndex"`
	OilUSD     float64      `json:"oilUsd"`
	GoldUSD    float64      `json:"goldUsd"`
	USDVnd     float64      `json:"usdVnd"`
	DataSource string       `json:"dataSource"`
	Signals    SignalResult `json:"signals"`

	// FetchedAt is nil when the snapshot is fully fixture-fallback (FDA-3: no fresh-stamp).
	// Non-nil (time.Now()) when at least one live source contributed.
	FetchedAt time.Time `json:"fetchedAt"`

	// FDA-2: per-field provenance for top-level price fields.
	// Mirrors CarrySignalDTO.IsEstimate / SourceTier (DSI-INV-1 pattern).
	// is_estimate=true + source_tier=4 when the value is a fixture fallback.
	VNIndexIsEstimate bool `json:"vnIndex_is_estimate"`
	VNIndexSourceTier int  `json:"vnIndex_source_tier"`
	OilIsEstimate     bool `json:"oil_is_estimate"`
	OilSourceTier     int  `json:"oil_source_tier"`
	GoldIsEstimate    bool `json:"gold_is_estimate"`
	GoldSourceTier    int  `json:"gold_source_tier"`
	USDVndIsEstimate  bool `json:"usdVnd_is_estimate"`
	USDVndSourceTier  int  `json:"usdVnd_source_tier"`

	// U4: direction+delta fields — additive; no existing field renamed or removed.
	// VnIndex: delta computed from daily_ohlcv prev-session close (nil when < 2 rows).
	// Oil/Gold/UsdVnd: no prev-session history → always null delta + "unknown" direction.
	// Direction enum values: "up" | "down" | "flat" | "unknown".
	VNIndexDelta     *float64 `json:"vnIndexDelta"`     // null or signed point delta
	VNIndexDirection string   `json:"vnIndexDirection"` // "up"/"down"/"flat"/"unknown"
	OilUSDDelta      *float64 `json:"oilUsdDelta"`      // always null (no history)
	OilUSDDirection  string   `json:"oilUsdDirection"`  // always "unknown"
	GoldUSDDelta     *float64 `json:"goldUsdDelta"`     // always null (no history)
	GoldUSDDirection string   `json:"goldUsdDirection"` // always "unknown"
	USDVndDelta      *float64 `json:"usdVndDelta"`      // always null (no history)
	USDVndDirection  string   `json:"usdVndDirection"`  // always "unknown"
}
