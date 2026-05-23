// Package macro_carry_trade_signal computes the carry trade attractiveness
// of VND-denominated assets relative to USD assets.
//
// Go rewrite of computeCarryTradeSignal() from
// apps/mcp-server/src/domain/services/macro/carryTradeSignal.ts.
//
// Business logic (Thien Thoi methodology — Question 1: Global liquidity regime):
//   carrySpread = vndDepositRate − fedFundsRate
//   spread > 2.5%         → HOT_MONEY_INFLOW  (VND assets strongly attractive)
//   0.5% ≤ spread ≤ 2.5% → NEUTRAL            (balanced carry)
//   spread < 0.5%         → FII_OUTFLOW_RISK   (USD nearing or exceeding VND rate)
//
// Key deviation from TS original: computedAt is an injected parameter rather than
// time.Now() — this ensures deterministic output for scenario testing (R-1 gate).
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface/module layers excluded per pilot charter).
package macro_carry_trade_signal

import (
	"fmt"
	"math"
)

// ---------------------------------------------------------------------------
// Regime constants (exported)
// ---------------------------------------------------------------------------

const (
	// RegimeHotMoneyInflow signals strong carry trade attractiveness for VND assets.
	RegimeHotMoneyInflow = "HOT_MONEY_INFLOW"

	// RegimeNeutral signals balanced carry — neither strongly attracting nor repelling capital.
	RegimeNeutral = "NEUTRAL"

	// RegimeFIIOutflowRisk signals carry spread is too thin — FII exit pressure rising.
	RegimeFIIOutflowRisk = "FII_OUTFLOW_RISK"

	// HotMoneyThreshold is the carry spread above which regime = HOT_MONEY_INFLOW.
	HotMoneyThreshold = 2.5

	// OutflowRiskThreshold is the carry spread below which regime = FII_OUTFLOW_RISK.
	OutflowRiskThreshold = 0.5
)

// ---------------------------------------------------------------------------
// Input / Output types (exported)
// ---------------------------------------------------------------------------

// CarryTradeInput is the request to the Compute function.
type CarryTradeInput struct {
	// VNDDepositRate is the SBV max deposit rate in percentage points (e.g. 5.5 = 5.5% p.a.).
	VNDDepositRate float64 `json:"vndDepositRate"`

	// FedFundsRate is the US Fed Funds effective rate in percentage points (e.g. 5.33 = 5.33%).
	FedFundsRate float64 `json:"fedFundsRate"`

	// ComputedAt is an ISO 8601 timestamp injected by the caller for deterministic output.
	// Use a fixed string in tests (e.g. "2026-05-23T00:00:00Z") to satisfy R-1.
	ComputedAt string `json:"computedAt"`
}

// CarryTradeOutput is the deterministic result of the Compute function.
type CarryTradeOutput struct {
	// Regime is one of: HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK.
	Regime string `json:"regime"`

	// CarrySpread is vndDepositRate minus fedFundsRate, rounded to 2 decimal places.
	CarrySpread float64 `json:"carrySpread"`

	// VNDDepositRate echoes the input VND rate for traceability.
	VNDDepositRate float64 `json:"vndDepositRate"`

	// FedFundsRate echoes the input Fed rate for traceability.
	FedFundsRate float64 `json:"fedFundsRate"`

	// Reasoning is a human-readable explanation of the classification.
	Reasoning string `json:"reasoning"`

	// ComputedAt echoes the injected timestamp.
	ComputedAt string `json:"computedAt"`
}

// ---------------------------------------------------------------------------
// Compute — deterministic carry-trade signal computation
// ---------------------------------------------------------------------------

// Compute calculates the carry trade signal for VND vs USD.
// Same input always produces the same output (no randomness, no time.Now()).
//
// Zero-data guard: if either rate is 0, returns NEUTRAL with "Data unavailable" reasoning.
// This mirrors the TS original behaviour without using time.Now().
func Compute(input CarryTradeInput) CarryTradeOutput {
	vndRate := input.VNDDepositRate
	fedRate := input.FedFundsRate
	computedAt := input.ComputedAt

	// Zero-data guard (mirrors TS original).
	if vndRate == 0 || fedRate == 0 {
		return CarryTradeOutput{
			Regime:         RegimeNeutral,
			CarrySpread:    0,
			VNDDepositRate: vndRate,
			FedFundsRate:   fedRate,
			Reasoning:      "Data unavailable — one or both rates are zero",
			ComputedAt:     computedAt,
		}
	}

	// Carry spread: round to 2 decimal places (mirrors TS Math.round(rawSpread * 100) / 100).
	rawSpread := vndRate - fedRate
	carrySpread := math.Round(rawSpread*100) / 100

	var regime string
	var reasoning string

	switch {
	case carrySpread > HotMoneyThreshold:
		regime = RegimeHotMoneyInflow
		reasoning = fmt.Sprintf(
			"VND carry spread of %.2fpp is attractive: SBV deposit rate (%.2f%%) materially exceeds USD Fed Funds (%.2f%%), incentivising foreign inflow into VND assets.",
			carrySpread, vndRate, fedRate,
		)
	case carrySpread >= OutflowRiskThreshold:
		regime = RegimeNeutral
		reasoning = fmt.Sprintf(
			"VND carry spread of %.2fpp is moderate: SBV rate (%.2f%%) offers a balanced premium over USD (%.2f%%) — neither strongly attracting nor repelling foreign institutional capital.",
			carrySpread, vndRate, fedRate,
		)
	default:
		regime = RegimeFIIOutflowRisk
		reasoning = fmt.Sprintf(
			"VND carry spread of %.2fpp signals outflow risk: USD (%.2f%%) yields near or above SBV deposit rate (%.2f%%), reducing the incentive to hold VND assets and increasing FII exit pressure.",
			carrySpread, fedRate, vndRate,
		)
	}

	return CarryTradeOutput{
		Regime:         regime,
		CarrySpread:    carrySpread,
		VNDDepositRate: vndRate,
		FedFundsRate:   fedRate,
		Reasoning:      reasoning,
		ComputedAt:     computedAt,
	}
}
