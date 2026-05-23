package macro_investment_clock_test

import (
	"testing"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
)

// TestClassify is a table-driven test covering all three tiers + boundary cases.
// Requirement: ≥5 rows (AC-3). This file provides 10 rows.
func TestClassify(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    mic.InvestmentClockInput
		expected mic.InvestmentClockOutput
	}{
		// --- Row 1: VN named indicator → VN_DIRECT, score 8, phase CORE_VN ---
		{
			name:  "VN_CPI canonical name → VN_DIRECT tier",
			input: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.VN_DIRECT_TIER,
				Score: mic.VN_DIRECT_SCORE,
				Phase: "CORE_VN",
			},
		},
		// --- Row 2: VN keyword match via substring ---
		{
			name:  "vietnam keyword in name → VN_DIRECT tier",
			input: mic.InvestmentClockInput{IndicatorName: "Vietnam GDP Growth"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.VN_DIRECT_TIER,
				Score: mic.VN_DIRECT_SCORE,
				Phase: "CORE_VN",
			},
		},
		// --- Row 3: REGIONAL named indicator → REGIONAL, score 5, phase REGIONAL ---
		{
			name:  "ASEAN_GROWTH canonical name → REGIONAL tier",
			input: mic.InvestmentClockInput{IndicatorName: "ASEAN_GROWTH"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.REGIONAL_TIER,
				Score: mic.REGIONAL_SCORE,
				Phase: "REGIONAL",
			},
		},
		// --- Row 4: REGIONAL keyword match ---
		{
			name:  "oil keyword → REGIONAL tier",
			input: mic.InvestmentClockInput{IndicatorName: "Brent Oil Price"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.REGIONAL_TIER,
				Score: mic.REGIONAL_SCORE,
				Phase: "REGIONAL",
			},
		},
		// --- Row 5: Unknown indicator → US_DOMESTIC fallthrough ---
		{
			name:  "unknown indicator → US_DOMESTIC tier",
			input: mic.InvestmentClockInput{IndicatorName: "US_HOUSING_STARTS"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.US_DOMESTIC_TIER,
				Score: mic.US_DOMESTIC_SCORE,
				Phase: "US_DOMESTIC",
			},
		},
		// --- Row 6: Empty string → US_DOMESTIC fallthrough ---
		{
			name:  "empty string → US_DOMESTIC fallthrough",
			input: mic.InvestmentClockInput{IndicatorName: ""},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.US_DOMESTIC_TIER,
				Score: mic.US_DOMESTIC_SCORE,
				Phase: "US_DOMESTIC",
			},
		},
		// --- Row 7: VN_UNEMPLOYMENT canonical name ---
		{
			name:  "VN_UNEMPLOYMENT canonical name → VN_DIRECT tier",
			input: mic.InvestmentClockInput{IndicatorName: "VN_UNEMPLOYMENT"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.VN_DIRECT_TIER,
				Score: mic.VN_DIRECT_SCORE,
				Phase: "CORE_VN",
			},
		},
		// --- Row 8: VN_INTEREST_RATE canonical name ---
		{
			name:  "VN_INTEREST_RATE canonical name → VN_DIRECT tier",
			input: mic.InvestmentClockInput{IndicatorName: "VN_INTEREST_RATE"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.VN_DIRECT_TIER,
				Score: mic.VN_DIRECT_SCORE,
				Phase: "CORE_VN",
			},
		},
		// --- Row 9: APAC_PMI canonical name ---
		{
			name:  "APAC_PMI canonical name → REGIONAL tier",
			input: mic.InvestmentClockInput{IndicatorName: "APAC_PMI"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.REGIONAL_TIER,
				Score: mic.REGIONAL_SCORE,
				Phase: "REGIONAL",
			},
		},
		// --- Row 10: Determinism check — same input twice → same output ---
		{
			name:  "gold keyword → REGIONAL tier (determinism)",
			input: mic.InvestmentClockInput{IndicatorName: "Gold Spot Price USD"},
			expected: mic.InvestmentClockOutput{
				Tier:  mic.REGIONAL_TIER,
				Score: mic.REGIONAL_SCORE,
				Phase: "REGIONAL",
			},
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := mic.Classify(tc.input)

			if got.Tier != tc.expected.Tier {
				t.Errorf("Tier: want %q, got %q", tc.expected.Tier, got.Tier)
			}
			if got.Score != tc.expected.Score {
				t.Errorf("Score: want %d, got %d", tc.expected.Score, got.Score)
			}
			if got.Phase != tc.expected.Phase {
				t.Errorf("Phase: want %q, got %q", tc.expected.Phase, got.Phase)
			}

			// Determinism: running Classify again must return identical output.
			got2 := mic.Classify(tc.input)
			if got2 != got {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec (AC-1).
func TestConstants(t *testing.T) {
	t.Parallel()

	if mic.VN_DIRECT_SCORE != 8 {
		t.Errorf("VN_DIRECT_SCORE: want 8, got %d", mic.VN_DIRECT_SCORE)
	}
	if mic.REGIONAL_SCORE != 5 {
		t.Errorf("REGIONAL_SCORE: want 5, got %d", mic.REGIONAL_SCORE)
	}
	if mic.US_DOMESTIC_SCORE != 2 {
		t.Errorf("US_DOMESTIC_SCORE: want 2, got %d", mic.US_DOMESTIC_SCORE)
	}
	if mic.VN_DIRECT_TIER != "VN_DIRECT" {
		t.Errorf("VN_DIRECT_TIER: want VN_DIRECT, got %s", mic.VN_DIRECT_TIER)
	}
	if mic.REGIONAL_TIER != "REGIONAL" {
		t.Errorf("REGIONAL_TIER: want REGIONAL, got %s", mic.REGIONAL_TIER)
	}
	if mic.US_DOMESTIC_TIER != "US_DOMESTIC" {
		t.Errorf("US_DOMESTIC_TIER: want US_DOMESTIC, got %s", mic.US_DOMESTIC_TIER)
	}
}
