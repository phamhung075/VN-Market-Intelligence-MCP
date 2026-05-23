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

// MacroSnapshotResponse is the output DTO returned by ComputeMacroUseCase.Execute.
// Mirrors domain.MacroSnapshot but adds HTTP-level metadata (Status, FetchedAt)
// and the 6-primitive signals block required by AC-2 (P2-X3).
type MacroSnapshotResponse struct {
	Status    string       `json:"status"`
	VNIndex   float64      `json:"vnIndex"`
	OilUSD    float64      `json:"oilUsd"`
	GoldUSD   float64      `json:"goldUsd"`
	USDVnd    float64      `json:"usdVnd"`
	Signals   SignalResult `json:"signals"`
	FetchedAt time.Time    `json:"fetchedAt"`
}
