// Package macro_oil_impact_classifier classifies a Brent/WTI oil price
// into a deterministic impact tier for the Vietnamese economy.
//
// Go rewrite of MacroScoreService.oilDirection() from
// apps/macro-indicators/src/_deprecated/domain/services.ts.
//
// Business logic (Thien Thoi methodology):
//   - Oil price above $100/barrel → BEARISH for VN (high import cost pressure)
//   - Oil price below $60/barrel  → BULLISH for VN (low energy costs)
//   - Oil price $60–$100/barrel   → NEUTRAL
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface/module layers excluded per pilot charter).
package macro_oil_impact_classifier

import "fmt"

// ---------------------------------------------------------------------------
// Impact + threshold constants (exported)
// ---------------------------------------------------------------------------

const (
	// ImpactBullish labels a low-oil-price environment (positive for VN economy).
	ImpactBullish = "BULLISH"

	// ImpactBearish labels a high-oil-price environment (negative for VN economy).
	ImpactBearish = "BEARISH"

	// ImpactNeutral labels a moderate-oil-price environment.
	ImpactNeutral = "NEUTRAL"

	// BearishThreshold is the price above which oil becomes BEARISH for VN (USD/barrel).
	BearishThreshold = 100.0

	// BullishThreshold is the price below which oil becomes BULLISH for VN (USD/barrel).
	BullishThreshold = 60.0
)

// ---------------------------------------------------------------------------
// Input / Output types (exported)
// ---------------------------------------------------------------------------

// OilImpactInput is the request to the Classify function.
type OilImpactInput struct {
	// PriceUSD is the Brent or WTI crude oil price in USD per barrel.
	PriceUSD float64 `json:"priceUSD"`
}

// OilImpactOutput is the deterministic result of the Classify function.
type OilImpactOutput struct {
	// Impact is one of: BEARISH | NEUTRAL | BULLISH.
	Impact string `json:"impact"`

	// PriceUSD echoes the input price for traceability.
	PriceUSD float64 `json:"priceUSD"`

	// Reasoning is a human-readable explanation of the classification.
	Reasoning string `json:"reasoning"`
}

// ---------------------------------------------------------------------------
// Classify — deterministic oil-impact classification
// ---------------------------------------------------------------------------

// Classify assigns a deterministic BEARISH/NEUTRAL/BULLISH impact to the given
// Brent/WTI oil price. Same input always produces the same output (no randomness).
//
// Classification logic (mirrors TS oilDirection):
//  1. price > 100 USD/barrel → BEARISH (high energy import cost for VN)
//  2. price < 60 USD/barrel  → BULLISH (low energy costs stimulate VN growth)
//  3. otherwise              → NEUTRAL
//
// Edge case: price ≤ 0 is treated as NEUTRAL with an "invalid input" reasoning.
func Classify(input OilImpactInput) OilImpactOutput {
	price := input.PriceUSD

	switch {
	case price <= 0:
		return OilImpactOutput{
			Impact:    ImpactNeutral,
			PriceUSD:  price,
			Reasoning: "Invalid or unavailable oil price — defaulting to NEUTRAL",
		}
	case price > BearishThreshold:
		return OilImpactOutput{
			Impact:   ImpactBearish,
			PriceUSD: price,
			Reasoning: fmt.Sprintf(
				"Oil at $%.2f/barrel exceeds $%.0f threshold — high energy import costs pressure VN economy (BEARISH)",
				price, BearishThreshold,
			),
		}
	case price < BullishThreshold:
		return OilImpactOutput{
			Impact:   ImpactBullish,
			PriceUSD: price,
			Reasoning: fmt.Sprintf(
				"Oil at $%.2f/barrel is below $%.0f threshold — low energy costs support VN growth (BULLISH)",
				price, BullishThreshold,
			),
		}
	default:
		return OilImpactOutput{
			Impact:   ImpactNeutral,
			PriceUSD: price,
			Reasoning: fmt.Sprintf(
				"Oil at $%.2f/barrel is within the $%.0f–$%.0f neutral band (NEUTRAL)",
				price, BullishThreshold, BearishThreshold,
			),
		}
	}
}
