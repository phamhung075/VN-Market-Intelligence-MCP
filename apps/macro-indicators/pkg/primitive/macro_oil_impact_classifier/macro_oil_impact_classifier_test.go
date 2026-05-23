package macro_oil_impact_classifier_test

import (
	"testing"

	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
)

// TestClassify is a table-driven test covering all three impact tiers + boundary + edge cases.
// Requirement: ≥5 rows (AC-2). This file provides 9 rows.
func TestClassify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		input          oil.OilImpactInput
		expectedImpact string
		expectedPrice  float64
	}{
		// --- Row 1: Above bearish threshold → BEARISH ---
		{
			name:           "price 120 USD above 100 threshold → BEARISH",
			input:          oil.OilImpactInput{PriceUSD: 120.0},
			expectedImpact: oil.ImpactBearish,
			expectedPrice:  120.0,
		},
		// --- Row 2: At exact bearish threshold boundary (100) → NEUTRAL (not > 100) ---
		{
			name:           "price exactly 100 USD at bearish threshold → NEUTRAL",
			input:          oil.OilImpactInput{PriceUSD: 100.0},
			expectedImpact: oil.ImpactNeutral,
			expectedPrice:  100.0,
		},
		// --- Row 3: In neutral band → NEUTRAL ---
		{
			name:           "price 80 USD in neutral band → NEUTRAL",
			input:          oil.OilImpactInput{PriceUSD: 80.0},
			expectedImpact: oil.ImpactNeutral,
			expectedPrice:  80.0,
		},
		// --- Row 4: At exact bullish threshold boundary (60) → NEUTRAL (not < 60) ---
		{
			name:           "price exactly 60 USD at bullish threshold → NEUTRAL",
			input:          oil.OilImpactInput{PriceUSD: 60.0},
			expectedImpact: oil.ImpactNeutral,
			expectedPrice:  60.0,
		},
		// --- Row 5: Below bullish threshold → BULLISH ---
		{
			name:           "price 45 USD below 60 threshold → BULLISH",
			input:          oil.OilImpactInput{PriceUSD: 45.0},
			expectedImpact: oil.ImpactBullish,
			expectedPrice:  45.0,
		},
		// --- Row 6: Very high oil price (war scenario) → BEARISH ---
		{
			name:           "price 200 USD extreme case → BEARISH",
			input:          oil.OilImpactInput{PriceUSD: 200.0},
			expectedImpact: oil.ImpactBearish,
			expectedPrice:  200.0,
		},
		// --- Row 7: Very low oil price (oversupply) → BULLISH ---
		{
			name:           "price 10 USD extreme low → BULLISH",
			input:          oil.OilImpactInput{PriceUSD: 10.0},
			expectedImpact: oil.ImpactBullish,
			expectedPrice:  10.0,
		},
		// --- Row 8: Zero price (data unavailable) → NEUTRAL (graceful) ---
		{
			name:           "price 0 data unavailable → NEUTRAL graceful",
			input:          oil.OilImpactInput{PriceUSD: 0},
			expectedImpact: oil.ImpactNeutral,
			expectedPrice:  0,
		},
		// --- Row 9: Negative price (invalid data) → NEUTRAL (graceful) ---
		{
			name:           "negative price invalid → NEUTRAL graceful",
			input:          oil.OilImpactInput{PriceUSD: -5.0},
			expectedImpact: oil.ImpactNeutral,
			expectedPrice:  -5.0,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := oil.Classify(tc.input)

			if got.Impact != tc.expectedImpact {
				t.Errorf("Impact: want %q, got %q", tc.expectedImpact, got.Impact)
			}
			if got.PriceUSD != tc.expectedPrice {
				t.Errorf("PriceUSD: want %v, got %v", tc.expectedPrice, got.PriceUSD)
			}
			if got.Reasoning == "" {
				t.Error("Reasoning must not be empty")
			}

			// Determinism: running Classify again must return identical output.
			got2 := oil.Classify(tc.input)
			if got2.Impact != got.Impact || got2.PriceUSD != got.PriceUSD || got2.Reasoning != got.Reasoning {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec.
func TestConstants(t *testing.T) {
	t.Parallel()

	if oil.BearishThreshold != 100.0 {
		t.Errorf("BearishThreshold: want 100.0, got %v", oil.BearishThreshold)
	}
	if oil.BullishThreshold != 60.0 {
		t.Errorf("BullishThreshold: want 60.0, got %v", oil.BullishThreshold)
	}
	if oil.ImpactBullish != "BULLISH" {
		t.Errorf("ImpactBullish: want BULLISH, got %s", oil.ImpactBullish)
	}
	if oil.ImpactBearish != "BEARISH" {
		t.Errorf("ImpactBearish: want BEARISH, got %s", oil.ImpactBearish)
	}
	if oil.ImpactNeutral != "NEUTRAL" {
		t.Errorf("ImpactNeutral: want NEUTRAL, got %s", oil.ImpactNeutral)
	}
}
