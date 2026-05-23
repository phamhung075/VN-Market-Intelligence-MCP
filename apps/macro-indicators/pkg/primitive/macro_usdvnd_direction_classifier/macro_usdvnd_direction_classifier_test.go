package macro_usdvnd_direction_classifier_test

import (
	"testing"

	usdvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
)

// TestClassify is a table-driven test covering all three direction tiers + boundary + edge cases.
// Requirement: ≥5 rows (AC-2). This file provides 9 rows.
func TestClassify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		input             usdvnd.UsdVndDirectionInput
		expectedDirection string
		expectedRate      float64
	}{
		// --- Row 1: Above bearish threshold → BEARISH (VND depreciation) ---
		{
			name:              "USDVND 26000 above 25000 threshold → BEARISH",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 26000.0},
			expectedDirection: usdvnd.DirectionBearish,
			expectedRate:      26000.0,
		},
		// --- Row 2: At exact bearish threshold (25000) → NEUTRAL (not > 25000) ---
		{
			name:              "USDVND exactly 25000 at bearish threshold → NEUTRAL",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 25000.0},
			expectedDirection: usdvnd.DirectionNeutral,
			expectedRate:      25000.0,
		},
		// --- Row 3: In neutral band → NEUTRAL ---
		{
			name:              "USDVND 24000 in neutral band → NEUTRAL",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 24000.0},
			expectedDirection: usdvnd.DirectionNeutral,
			expectedRate:      24000.0,
		},
		// --- Row 4: At exact bullish threshold (23000) → NEUTRAL (not < 23000) ---
		{
			name:              "USDVND exactly 23000 at bullish threshold → NEUTRAL",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 23000.0},
			expectedDirection: usdvnd.DirectionNeutral,
			expectedRate:      23000.0,
		},
		// --- Row 5: Below bullish threshold → BULLISH (VND appreciation) ---
		{
			name:              "USDVND 22000 below 23000 threshold → BULLISH",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 22000.0},
			expectedDirection: usdvnd.DirectionBullish,
			expectedRate:      22000.0,
		},
		// --- Row 6: Extreme depreciation scenario → BEARISH ---
		{
			name:              "USDVND 30000 extreme depreciation → BEARISH",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 30000.0},
			expectedDirection: usdvnd.DirectionBearish,
			expectedRate:      30000.0,
		},
		// --- Row 7: Extreme appreciation scenario → BULLISH ---
		{
			name:              "USDVND 20000 extreme appreciation → BULLISH",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 20000.0},
			expectedDirection: usdvnd.DirectionBullish,
			expectedRate:      20000.0,
		},
		// --- Row 8: Zero rate (data unavailable) → NEUTRAL (graceful) ---
		{
			name:              "USDVND 0 data unavailable → NEUTRAL graceful",
			input:             usdvnd.UsdVndDirectionInput{RateVND: 0},
			expectedDirection: usdvnd.DirectionNeutral,
			expectedRate:      0,
		},
		// --- Row 9: Negative rate (invalid data) → NEUTRAL (graceful) ---
		{
			name:              "negative USDVND rate invalid → NEUTRAL graceful",
			input:             usdvnd.UsdVndDirectionInput{RateVND: -1000.0},
			expectedDirection: usdvnd.DirectionNeutral,
			expectedRate:      -1000.0,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := usdvnd.Classify(tc.input)

			if got.Direction != tc.expectedDirection {
				t.Errorf("Direction: want %q, got %q", tc.expectedDirection, got.Direction)
			}
			if got.RateVND != tc.expectedRate {
				t.Errorf("RateVND: want %v, got %v", tc.expectedRate, got.RateVND)
			}
			if got.Reasoning == "" {
				t.Error("Reasoning must not be empty")
			}

			// Determinism: running Classify again must return identical output.
			got2 := usdvnd.Classify(tc.input)
			if got2.Direction != got.Direction || got2.RateVND != got.RateVND || got2.Reasoning != got.Reasoning {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec.
func TestConstants(t *testing.T) {
	t.Parallel()

	if usdvnd.BearishThreshold != 25000.0 {
		t.Errorf("BearishThreshold: want 25000.0, got %v", usdvnd.BearishThreshold)
	}
	if usdvnd.BullishThreshold != 23000.0 {
		t.Errorf("BullishThreshold: want 23000.0, got %v", usdvnd.BullishThreshold)
	}
	if usdvnd.DirectionBullish != "BULLISH" {
		t.Errorf("DirectionBullish: want BULLISH, got %s", usdvnd.DirectionBullish)
	}
	if usdvnd.DirectionBearish != "BEARISH" {
		t.Errorf("DirectionBearish: want BEARISH, got %s", usdvnd.DirectionBearish)
	}
	if usdvnd.DirectionNeutral != "NEUTRAL" {
		t.Errorf("DirectionNeutral: want NEUTRAL, got %s", usdvnd.DirectionNeutral)
	}
}
