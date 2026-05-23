// Package macro_yield_spread_signal computes the equity risk premium proxy
// for Vietnamese equities by comparing earnings yield against the SBV deposit rate.
//
// Go rewrite of computeYieldSpreadSignal() from
// apps/mcp-server/src/domain/services/macro/yieldSpreadSignal.ts.
//
// Business logic (Báu Phase 2 Dinh Gia methodology):
//   spread = earningYield − depositRate
//   spread > +2pp → CHEAP          (strong equity risk premium)
//   0 < spread ≤ +2pp → FAIRLY_VALUED
//   spread ≤ 0        → EXPENSIVE  (deposits as good or better than equities)
//   either input = 0  → UNKNOWN
//
// Key deviation from TS original: computedAt is an injected parameter rather than
// time.Now() — this ensures deterministic output for scenario testing (R-1 gate).
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface/module layers excluded per pilot charter).
package macro_yield_spread_signal

import (
	"fmt"
	"math"
)

// ---------------------------------------------------------------------------
// Label constants (exported)
// ---------------------------------------------------------------------------

const (
	// LabelCheap signals strong equity risk premium — equities well above deposit rate.
	LabelCheap = "CHEAP"

	// LabelFairlyValued signals modest equity premium — equities slightly above deposit rate.
	LabelFairlyValued = "FAIRLY_VALUED"

	// LabelExpensive signals no equity premium — deposits equal or better than equities.
	LabelExpensive = "EXPENSIVE"

	// LabelUnknown signals missing input data.
	LabelUnknown = "UNKNOWN"

	// CheapThreshold is the spread above which label = CHEAP (strictly >).
	CheapThreshold = 5.0
)

// ---------------------------------------------------------------------------
// Input / Output types (exported)
// ---------------------------------------------------------------------------

// YieldSpreadInput is the request to the Compute function.
type YieldSpreadInput struct {
	// EarningYield is the market-wide equity earnings yield in percentage points (e.g. 7.32 = 7.32%).
	EarningYield float64 `json:"earningYield"`

	// DepositRate is the SBV max deposit rate in percentage points (e.g. 5.50 = 5.50%).
	DepositRate float64 `json:"depositRate"`

	// ComputedAt is an ISO 8601 timestamp injected by the caller for deterministic output.
	// Use a fixed string in tests (e.g. "2026-05-23T00:00:00Z") to satisfy R-1.
	ComputedAt string `json:"computedAt"`
}

// YieldSpreadOutput is the deterministic result of the Compute function.
type YieldSpreadOutput struct {
	// Label is one of: CHEAP | FAIRLY_VALUED | EXPENSIVE | UNKNOWN.
	Label string `json:"label"`

	// Spread is earningYield minus depositRate, rounded to 2 decimal places.
	Spread float64 `json:"spread"`

	// EarningYield echoes the input earnings yield for traceability.
	EarningYield float64 `json:"earningYield"`

	// DepositRate echoes the input deposit rate for traceability.
	DepositRate float64 `json:"depositRate"`

	// Reasoning is a human-readable explanation of the classification.
	Reasoning string `json:"reasoning"`

	// ComputedAt echoes the injected timestamp.
	ComputedAt string `json:"computedAt"`
}

// ---------------------------------------------------------------------------
// Compute — deterministic yield spread signal computation
// ---------------------------------------------------------------------------

// Compute calculates the yield spread signal for Vietnamese equities vs. bank deposits.
// Same input always produces the same output (no randomness, no time.Now()).
//
// Zero-data guard: if either input is 0, returns UNKNOWN with "Data unavailable" reasoning.
// This mirrors the TS original behaviour without using time.Now().
func Compute(input YieldSpreadInput) YieldSpreadOutput {
	earningYield := input.EarningYield
	depositRate := input.DepositRate
	computedAt := input.ComputedAt

	// Zero-data guard (mirrors TS original).
	if earningYield == 0 || depositRate == 0 {
		return YieldSpreadOutput{
			Label:        LabelUnknown,
			Spread:       0,
			EarningYield: earningYield,
			DepositRate:  depositRate,
			Reasoning:    "Data unavailable — one or both inputs are zero",
			ComputedAt:   computedAt,
		}
	}

	// Spread: round to 2 decimal places (mirrors TS Math.round(rawSpread * 100) / 100).
	rawSpread := earningYield - depositRate
	spread := math.Round(rawSpread*100) / 100

	var label string
	var reasoning string

	switch {
	case spread > CheapThreshold:
		label = LabelCheap
		reasoning = fmt.Sprintf(
			"Equity earnings yield (%.2f%%) exceeds the SBV deposit rate (%.2f%%) by %.2fpp — well above the +%.0fpp threshold. Vietnamese equities offer a strong risk premium over bank deposits (CHEAP).",
			earningYield, depositRate, spread, CheapThreshold,
		)
	case spread > 0:
		label = LabelFairlyValued
		reasoning = fmt.Sprintf(
			"Equity earnings yield (%.2f%%) exceeds the SBV deposit rate (%.2f%%) by %.2fpp — a modest but positive premium. Vietnamese equities are fairly valued relative to bank deposits (FAIRLY_VALUED).",
			earningYield, depositRate, spread,
		)
	default:
		label = LabelExpensive
		reasoning = fmt.Sprintf(
			"Equity earnings yield (%.2f%%) does not exceed the SBV deposit rate (%.2f%%) — spread is %.2fpp. Bank deposits offer equal or better returns than equities at current prices (EXPENSIVE).",
			earningYield, depositRate, spread,
		)
	}

	return YieldSpreadOutput{
		Label:        label,
		Spread:       spread,
		EarningYield: earningYield,
		DepositRate:  depositRate,
		Reasoning:    reasoning,
		ComputedAt:   computedAt,
	}
}
