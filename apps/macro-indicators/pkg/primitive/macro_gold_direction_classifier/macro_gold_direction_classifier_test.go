package macro_gold_direction_classifier_test

import (
	"testing"

	gold "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
)

// TestClassify is a table-driven test covering all three direction tiers + boundary + edge cases.
// Requirement: ≥5 rows (AC-2). This file provides 9 rows.
func TestClassify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		input             gold.GoldDirectionInput
		expectedDirection string
		expectedPrice     float64
	}{
		// --- Row 1: Above bullish threshold → BULLISH ---
		{
			name:              "gold 2300 USD above 2200 threshold → BULLISH",
			input:             gold.GoldDirectionInput{PriceUSD: 2300.0},
			expectedDirection: gold.DirectionBullish,
			expectedPrice:     2300.0,
		},
		// --- Row 2: At exact bullish threshold boundary (2200) → NEUTRAL (not > 2200) ---
		{
			name:              "gold exactly 2200 USD at bullish threshold → NEUTRAL",
			input:             gold.GoldDirectionInput{PriceUSD: 2200.0},
			expectedDirection: gold.DirectionNeutral,
			expectedPrice:     2200.0,
		},
		// --- Row 3: In neutral band → NEUTRAL ---
		{
			name:              "gold 2000 USD in neutral band → NEUTRAL",
			input:             gold.GoldDirectionInput{PriceUSD: 2000.0},
			expectedDirection: gold.DirectionNeutral,
			expectedPrice:     2000.0,
		},
		// --- Row 4: At exact bearish threshold boundary (1800) → NEUTRAL (not < 1800) ---
		{
			name:              "gold exactly 1800 USD at bearish threshold → NEUTRAL",
			input:             gold.GoldDirectionInput{PriceUSD: 1800.0},
			expectedDirection: gold.DirectionNeutral,
			expectedPrice:     1800.0,
		},
		// --- Row 5: Below bearish threshold → BEARISH ---
		{
			name:              "gold 1500 USD below 1800 threshold → BEARISH",
			input:             gold.GoldDirectionInput{PriceUSD: 1500.0},
			expectedDirection: gold.DirectionBearish,
			expectedPrice:     1500.0,
		},
		// --- Row 6: Very high gold (all-time high scenario) → BULLISH ---
		{
			name:              "gold 3000 USD extreme high → BULLISH",
			input:             gold.GoldDirectionInput{PriceUSD: 3000.0},
			expectedDirection: gold.DirectionBullish,
			expectedPrice:     3000.0,
		},
		// --- Row 7: Very low gold price → BEARISH ---
		{
			name:              "gold 1000 USD extreme low → BEARISH",
			input:             gold.GoldDirectionInput{PriceUSD: 1000.0},
			expectedDirection: gold.DirectionBearish,
			expectedPrice:     1000.0,
		},
		// --- Row 8: Zero price (data unavailable) → NEUTRAL (graceful) ---
		{
			name:              "gold 0 data unavailable → NEUTRAL graceful",
			input:             gold.GoldDirectionInput{PriceUSD: 0},
			expectedDirection: gold.DirectionNeutral,
			expectedPrice:     0,
		},
		// --- Row 9: Negative price (invalid data) → NEUTRAL (graceful) ---
		{
			name:              "negative gold price invalid → NEUTRAL graceful",
			input:             gold.GoldDirectionInput{PriceUSD: -100.0},
			expectedDirection: gold.DirectionNeutral,
			expectedPrice:     -100.0,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := gold.Classify(tc.input)

			if got.Direction != tc.expectedDirection {
				t.Errorf("Direction: want %q, got %q", tc.expectedDirection, got.Direction)
			}
			if got.PriceUSD != tc.expectedPrice {
				t.Errorf("PriceUSD: want %v, got %v", tc.expectedPrice, got.PriceUSD)
			}
			if got.Reasoning == "" {
				t.Error("Reasoning must not be empty")
			}

			// Determinism: running Classify again must return identical output.
			got2 := gold.Classify(tc.input)
			if got2.Direction != got.Direction || got2.PriceUSD != got.PriceUSD || got2.Reasoning != got.Reasoning {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec.
func TestConstants(t *testing.T) {
	t.Parallel()

	if gold.BullishThreshold != 2200.0 {
		t.Errorf("BullishThreshold: want 2200.0, got %v", gold.BullishThreshold)
	}
	if gold.BearishThreshold != 1800.0 {
		t.Errorf("BearishThreshold: want 1800.0, got %v", gold.BearishThreshold)
	}
	if gold.DirectionBullish != "BULLISH" {
		t.Errorf("DirectionBullish: want BULLISH, got %s", gold.DirectionBullish)
	}
	if gold.DirectionBearish != "BEARISH" {
		t.Errorf("DirectionBearish: want BEARISH, got %s", gold.DirectionBearish)
	}
	if gold.DirectionNeutral != "NEUTRAL" {
		t.Errorf("DirectionNeutral: want NEUTRAL, got %s", gold.DirectionNeutral)
	}
}
