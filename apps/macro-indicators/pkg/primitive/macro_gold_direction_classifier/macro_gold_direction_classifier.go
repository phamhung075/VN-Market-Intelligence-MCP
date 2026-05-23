// Package macro_gold_direction_classifier classifies an XAU/USD (gold) price
// into a deterministic direction signal for macroeconomic trend analysis.
//
// Go rewrite of MacroScoreService.goldDirection() from
// apps/macro-indicators/src/_deprecated/domain/services.ts.
//
// Business logic:
//   - Gold price > $2200/oz → BULLISH (safe-haven demand, risk-off sentiment)
//   - Gold price < $1800/oz → BEARISH (risk-on, capital flowing away from safe haven)
//   - Gold price $1800–$2200/oz → NEUTRAL
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface/module layers excluded per pilot charter).
package macro_gold_direction_classifier

import "fmt"

// ---------------------------------------------------------------------------
// Direction + threshold constants (exported)
// ---------------------------------------------------------------------------

const (
	// DirectionBullish labels a high-gold-price environment (risk-off, safe-haven demand).
	DirectionBullish = "BULLISH"

	// DirectionBearish labels a low-gold-price environment (risk-on, reduced safe-haven premium).
	DirectionBearish = "BEARISH"

	// DirectionNeutral labels a moderate gold price environment.
	DirectionNeutral = "NEUTRAL"

	// BullishThreshold is the gold price above which direction becomes BULLISH (USD/oz).
	BullishThreshold = 2200.0

	// BearishThreshold is the gold price below which direction becomes BEARISH (USD/oz).
	BearishThreshold = 1800.0
)

// ---------------------------------------------------------------------------
// Input / Output types (exported)
// ---------------------------------------------------------------------------

// GoldDirectionInput is the request to the Classify function.
type GoldDirectionInput struct {
	// PriceUSD is the XAU/USD spot gold price in USD per troy ounce.
	PriceUSD float64 `json:"priceUSD"`
}

// GoldDirectionOutput is the deterministic result of the Classify function.
type GoldDirectionOutput struct {
	// Direction is one of: BULLISH | NEUTRAL | BEARISH.
	Direction string `json:"direction"`

	// PriceUSD echoes the input price for traceability.
	PriceUSD float64 `json:"priceUSD"`

	// Reasoning is a human-readable explanation of the classification.
	Reasoning string `json:"reasoning"`
}

// ---------------------------------------------------------------------------
// Classify — deterministic gold-direction classification
// ---------------------------------------------------------------------------

// Classify assigns a deterministic BULLISH/NEUTRAL/BEARISH direction to the given
// XAU/USD gold price. Same input always produces the same output (no randomness).
//
// Classification logic (mirrors TS goldDirection):
//  1. price > 2200 → BULLISH (safe-haven demand signals global risk-off)
//  2. price < 1800 → BEARISH (reduced safe-haven premium signals risk-on)
//  3. otherwise    → NEUTRAL
//
// Edge case: price ≤ 0 is treated as NEUTRAL with an "invalid input" reasoning.
func Classify(input GoldDirectionInput) GoldDirectionOutput {
	price := input.PriceUSD

	switch {
	case price <= 0:
		return GoldDirectionOutput{
			Direction: DirectionNeutral,
			PriceUSD:  price,
			Reasoning: "Invalid or unavailable gold price — defaulting to NEUTRAL",
		}
	case price > BullishThreshold:
		return GoldDirectionOutput{
			Direction: DirectionBullish,
			PriceUSD:  price,
			Reasoning: fmt.Sprintf(
				"Gold at $%.2f/oz exceeds $%.0f threshold — safe-haven demand signals risk-off (BULLISH)",
				price, BullishThreshold,
			),
		}
	case price < BearishThreshold:
		return GoldDirectionOutput{
			Direction: DirectionBearish,
			PriceUSD:  price,
			Reasoning: fmt.Sprintf(
				"Gold at $%.2f/oz is below $%.0f threshold — reduced safe-haven premium signals risk-on (BEARISH)",
				price, BearishThreshold,
			),
		}
	default:
		return GoldDirectionOutput{
			Direction: DirectionNeutral,
			PriceUSD:  price,
			Reasoning: fmt.Sprintf(
				"Gold at $%.2f/oz is within the $%.0f–$%.0f neutral band (NEUTRAL)",
				price, BearishThreshold, BullishThreshold,
			),
		}
	}
}
