package macro_carry_trade_signal_test

import (
	"testing"

	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
)

// fixedTs is the fixed timestamp used in all test inputs to satisfy R-1 (no time.Now()).
const fixedTs = "2026-05-23T00:00:00Z"

// TestCompute is a table-driven test covering all three regimes + zero-data + boundary cases.
// Requirement: ≥5 rows (AC-2). This file provides 8 rows.
func TestCompute(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		input          carry.CarryTradeInput
		expectedRegime string
		expectedSpread float64
	}{
		// --- Row 1: Hot money inflow — VND much higher than USD ---
		{
			name: "VND 6.5% vs Fed 3.5% → HOT_MONEY_INFLOW (spread 3.0)",
			input: carry.CarryTradeInput{
				VNDDepositRate: 6.5,
				FedFundsRate:   3.5,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeHotMoneyInflow,
			expectedSpread: 3.0,
		},
		// --- Row 2: Boundary at HotMoneyThreshold (exactly 2.5) → NEUTRAL (not > 2.5) ---
		{
			name: "spread exactly 2.5pp → NEUTRAL (not strictly above threshold)",
			input: carry.CarryTradeInput{
				VNDDepositRate: 6.0,
				FedFundsRate:   3.5,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeNeutral,
			expectedSpread: 2.5,
		},
		// --- Row 3: Neutral — carry spread within 0.5–2.5pp range ---
		{
			name: "VND 5.5% vs Fed 4.0% → NEUTRAL (spread 1.5)",
			input: carry.CarryTradeInput{
				VNDDepositRate: 5.5,
				FedFundsRate:   4.0,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeNeutral,
			expectedSpread: 1.5,
		},
		// --- Row 4: FII outflow risk — spread below 0.5pp ---
		{
			name: "VND 4.5% vs Fed 4.2% → FII_OUTFLOW_RISK (spread 0.3)",
			input: carry.CarryTradeInput{
				VNDDepositRate: 4.5,
				FedFundsRate:   4.2,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeFIIOutflowRisk,
			expectedSpread: 0.3,
		},
		// --- Row 5: Negative spread (Fed > VND) → FII_OUTFLOW_RISK ---
		{
			name: "VND 3.0% vs Fed 5.33% → FII_OUTFLOW_RISK (negative spread)",
			input: carry.CarryTradeInput{
				VNDDepositRate: 3.0,
				FedFundsRate:   5.33,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeFIIOutflowRisk,
			expectedSpread: -2.33,
		},
		// --- Row 6: Zero VND rate → NEUTRAL (data unavailable guard) ---
		{
			name: "VND rate 0 → NEUTRAL data unavailable",
			input: carry.CarryTradeInput{
				VNDDepositRate: 0,
				FedFundsRate:   5.0,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeNeutral,
			expectedSpread: 0,
		},
		// --- Row 7: Zero Fed rate → NEUTRAL (data unavailable guard) ---
		{
			name: "Fed rate 0 → NEUTRAL data unavailable",
			input: carry.CarryTradeInput{
				VNDDepositRate: 5.0,
				FedFundsRate:   0,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeNeutral,
			expectedSpread: 0,
		},
		// --- Row 8: Both rates 0 → NEUTRAL (data unavailable guard) ---
		{
			name: "both rates 0 → NEUTRAL data unavailable",
			input: carry.CarryTradeInput{
				VNDDepositRate: 0,
				FedFundsRate:   0,
				ComputedAt:     fixedTs,
			},
			expectedRegime: carry.RegimeNeutral,
			expectedSpread: 0,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := carry.Compute(tc.input)

			if got.Regime != tc.expectedRegime {
				t.Errorf("Regime: want %q, got %q", tc.expectedRegime, got.Regime)
			}
			if got.CarrySpread != tc.expectedSpread {
				t.Errorf("CarrySpread: want %v, got %v", tc.expectedSpread, got.CarrySpread)
			}
			if got.ComputedAt != fixedTs {
				t.Errorf("ComputedAt: want %q, got %q", fixedTs, got.ComputedAt)
			}
			if got.Reasoning == "" {
				t.Error("Reasoning must not be empty")
			}

			// Determinism: same input → same output.
			got2 := carry.Compute(tc.input)
			if got2.Regime != got.Regime || got2.CarrySpread != got.CarrySpread || got2.Reasoning != got.Reasoning {
				t.Errorf("non-deterministic: first call %+v, second call %+v", got, got2)
			}
		})
	}
}

// TestConstants verifies the exported constant values are locked to spec.
func TestConstants(t *testing.T) {
	t.Parallel()

	if carry.HotMoneyThreshold != 2.5 {
		t.Errorf("HotMoneyThreshold: want 2.5, got %v", carry.HotMoneyThreshold)
	}
	if carry.OutflowRiskThreshold != 0.5 {
		t.Errorf("OutflowRiskThreshold: want 0.5, got %v", carry.OutflowRiskThreshold)
	}
	if carry.RegimeHotMoneyInflow != "HOT_MONEY_INFLOW" {
		t.Errorf("RegimeHotMoneyInflow: want HOT_MONEY_INFLOW, got %s", carry.RegimeHotMoneyInflow)
	}
	if carry.RegimeNeutral != "NEUTRAL" {
		t.Errorf("RegimeNeutral: want NEUTRAL, got %s", carry.RegimeNeutral)
	}
	if carry.RegimeFIIOutflowRisk != "FII_OUTFLOW_RISK" {
		t.Errorf("RegimeFIIOutflowRisk: want FII_OUTFLOW_RISK, got %s", carry.RegimeFIIOutflowRisk)
	}
}
