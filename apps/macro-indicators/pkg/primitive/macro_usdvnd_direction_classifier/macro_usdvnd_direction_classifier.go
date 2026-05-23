// Package macro_usdvnd_direction_classifier classifies a USDVND exchange rate
// into a deterministic direction signal for the Vietnamese economy.
//
// Go rewrite of MacroScoreService.usdVndDirection() from
// apps/macro-indicators/src/_deprecated/domain/services.ts.
//
// Business logic:
//   - USDVND > 25000 → BEARISH (VND depreciation = import cost pressure)
//   - USDVND < 23000 → BULLISH (VND appreciation = lower import costs)
//   - USDVND 23000–25000 → NEUTRAL
//
// DDD Fence-A: this package imports ONLY standard library packages.
// No cross-layer imports (app/infra/iface/module layers excluded per pilot charter).
package macro_usdvnd_direction_classifier

import "fmt"

// ---------------------------------------------------------------------------
// Direction + threshold constants (exported)
// ---------------------------------------------------------------------------

const (
	// DirectionBullish labels a low-USDVND environment (VND strong, lower import costs).
	DirectionBullish = "BULLISH"

	// DirectionBearish labels a high-USDVND environment (VND weak, higher import cost pressure).
	DirectionBearish = "BEARISH"

	// DirectionNeutral labels a moderate USDVND rate environment.
	DirectionNeutral = "NEUTRAL"

	// BearishThreshold is the rate above which direction becomes BEARISH (VND/USD).
	BearishThreshold = 25000.0

	// BullishThreshold is the rate below which direction becomes BULLISH (VND/USD).
	BullishThreshold = 23000.0
)

// ---------------------------------------------------------------------------
// Input / Output types (exported)
// ---------------------------------------------------------------------------

// UsdVndDirectionInput is the request to the Classify function.
type UsdVndDirectionInput struct {
	// RateVND is the USDVND spot exchange rate (number of VND per 1 USD).
	RateVND float64 `json:"rateVND"`
}

// UsdVndDirectionOutput is the deterministic result of the Classify function.
type UsdVndDirectionOutput struct {
	// Direction is one of: BULLISH | NEUTRAL | BEARISH.
	Direction string `json:"direction"`

	// RateVND echoes the input rate for traceability.
	RateVND float64 `json:"rateVND"`

	// Reasoning is a human-readable explanation of the classification.
	Reasoning string `json:"reasoning"`
}

// ---------------------------------------------------------------------------
// Classify — deterministic USDVND direction classification
// ---------------------------------------------------------------------------

// Classify assigns a deterministic BULLISH/NEUTRAL/BEARISH direction to the given
// USDVND exchange rate. Same input always produces the same output (no randomness).
//
// Classification logic (mirrors TS usdVndDirection):
//  1. rate > 25000 → BEARISH (VND depreciation creates import cost pressure)
//  2. rate < 23000 → BULLISH (VND appreciation reduces import costs)
//  3. otherwise    → NEUTRAL
//
// Edge case: rate ≤ 0 is treated as NEUTRAL with an "invalid input" reasoning.
func Classify(input UsdVndDirectionInput) UsdVndDirectionOutput {
	rate := input.RateVND

	switch {
	case rate <= 0:
		return UsdVndDirectionOutput{
			Direction: DirectionNeutral,
			RateVND:   rate,
			Reasoning: "Invalid or unavailable USDVND rate — defaulting to NEUTRAL",
		}
	case rate > BearishThreshold:
		return UsdVndDirectionOutput{
			Direction: DirectionBearish,
			RateVND:   rate,
			Reasoning: fmt.Sprintf(
				"USDVND at %.0f exceeds %.0f threshold — VND depreciation creates import cost pressure (BEARISH)",
				rate, BearishThreshold,
			),
		}
	case rate < BullishThreshold:
		return UsdVndDirectionOutput{
			Direction: DirectionBullish,
			RateVND:   rate,
			Reasoning: fmt.Sprintf(
				"USDVND at %.0f is below %.0f threshold — VND appreciation reduces import costs (BULLISH)",
				rate, BullishThreshold,
			),
		}
	default:
		return UsdVndDirectionOutput{
			Direction: DirectionNeutral,
			RateVND:   rate,
			Reasoning: fmt.Sprintf(
				"USDVND at %.0f is within the %.0f–%.0f neutral band (NEUTRAL)",
				rate, BullishThreshold, BearishThreshold,
			),
		}
	}
}
