package macro_yield_spread_signal_test

import (
	"testing"

	yield "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// fixedTs is the fixed timestamp used in all test inputs to satisfy R-1 (no time.Now()).
const fixedTs = "2026-05-23T00:00:00Z"

// TestCompute is a table-driven test covering all four labels + boundary + edge cases.
// Requirement: ≥5 rows (AC-2). This file provides 9 rows.
func TestCompute(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		input          yield.YieldSpreadInput
		expectedLabel  string
		expectedSpread float64
	}{
		// --- Row 1: CHEAP — spread well above +2pp threshold ---
		{
			name: "earnings 8.5% vs deposit 5.0% → CHEAP (spread 3.5)",
			input: yield.YieldSpreadInput{
				EarningYield: 8.5,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelCheap,
			expectedSpread: 3.5,
		},
		// --- Row 2: Boundary at CheapThreshold (exactly 2.0) → FAIRLY_VALUED (not > 2.0) ---
		{
			name: "spread exactly 2.0pp at cheap threshold → FAIRLY_VALUED",
			input: yield.YieldSpreadInput{
				EarningYield: 7.0,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelFairlyValued,
			expectedSpread: 2.0,
		},
		// --- Row 3: FAIRLY_VALUED — spread 0 < spread ≤ 2pp ---
		{
			name: "earnings 6.0% vs deposit 5.0% → FAIRLY_VALUED (spread 1.0)",
			input: yield.YieldSpreadInput{
				EarningYield: 6.0,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelFairlyValued,
			expectedSpread: 1.0,
		},
		// --- Row 4: EXPENSIVE — spread zero (earnings == deposits) ---
		{
			name: "earnings 5.0% vs deposit 5.0% → EXPENSIVE (spread 0)",
			input: yield.YieldSpreadInput{
				EarningYield: 5.0,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelExpensive,
			expectedSpread: 0,
		},
		// --- Row 5: EXPENSIVE — negative spread (deposits beat equities) ---
		{
			name: "earnings 4.0% vs deposit 6.0% → EXPENSIVE (negative spread -2.0)",
			input: yield.YieldSpreadInput{
				EarningYield: 4.0,
				DepositRate:  6.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelExpensive,
			expectedSpread: -2.0,
		},
		// --- Row 6: UNKNOWN — zero earning yield (data unavailable) ---
		{
			name: "earning yield 0 → UNKNOWN data unavailable",
			input: yield.YieldSpreadInput{
				EarningYield: 0,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelUnknown,
			expectedSpread: 0,
		},
		// --- Row 7: UNKNOWN — zero deposit rate (data unavailable) ---
		{
			name: "deposit rate 0 → UNKNOWN data unavailable",
			input: yield.YieldSpreadInput{
				EarningYield: 7.0,
				DepositRate:  0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelUnknown,
			expectedSpread: 0,
		},
		// --- Row 8: CHEAP — realistic VN market scenario (high PE → low earnings yield) ---
		{
			name: "earnings 9.2% vs deposit 4.75% → CHEAP (spread 4.45)",
			input: yield.YieldSpreadInput{
				EarningYield: 9.2,
				DepositRate:  4.75,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelCheap,
			expectedSpread: 4.45,
		},
		// --- Row 9: FAIRLY_VALUED — tight spread just above zero ---
		{
			name: "earnings 5.1% vs deposit 5.0% → FAIRLY_VALUED (spread 0.1)",
			input: yield.YieldSpreadInput{
				EarningYield: 5.1,
				DepositRate:  5.0,
				ComputedAt:   fixedTs,
			},
			expectedLabel:  yield.LabelFairlyValued,
			expectedSpread: 0.1,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := yield.Compute(tc.input)

			if got.Label != tc.expectedLabel {
				t.Errorf("Label: want %q, got %q", tc.expectedLabel, got.Label)
			}
			if got.Spread != tc.expectedSpread {
				t.Errorf("Spread: want %v, got %v", tc.expectedSpread, got.Spread)
			}
			if got.ComputedAt != fixedTs {
				t.Errorf("ComputedAt: want %q, got %q", fixedTs, got.ComputedAt)
			}
			if got.Reasoning == "" {
				t.Error("Reasoning must not be empty")
			}

			// Determinism: same input → same output.
			got2 := yield.Compute(tc.input)
			if got2.Label != got.Label || got2.Spread != got.Spread || got2.Reasoning != got.Reasoning {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec.
func TestConstants(t *testing.T) {
	t.Parallel()

	if yield.CheapThreshold != 2.0 {
		t.Errorf("CheapThreshold: want 2.0, got %v", yield.CheapThreshold)
	}
	if yield.LabelCheap != "CHEAP" {
		t.Errorf("LabelCheap: want CHEAP, got %s", yield.LabelCheap)
	}
	if yield.LabelFairlyValued != "FAIRLY_VALUED" {
		t.Errorf("LabelFairlyValued: want FAIRLY_VALUED, got %s", yield.LabelFairlyValued)
	}
	if yield.LabelExpensive != "EXPENSIVE" {
		t.Errorf("LabelExpensive: want EXPENSIVE, got %s", yield.LabelExpensive)
	}
	if yield.LabelUnknown != "UNKNOWN" {
		t.Errorf("LabelUnknown: want UNKNOWN, got %s", yield.LabelUnknown)
	}
}
