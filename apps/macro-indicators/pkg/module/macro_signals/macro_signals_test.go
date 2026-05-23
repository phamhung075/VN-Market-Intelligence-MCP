package macro_signals_test

import (
	"testing"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	"github.com/vn-market-intelligence/macro-indicators/pkg/module/macro_signals"
	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
	gld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
	uvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// ---------------------------------------------------------------------------
// Mock — implements Classifier interface with deterministic, name-based dispatch.
// ---------------------------------------------------------------------------

// mockClassifier satisfies macro_signals.Classifier using the real primitive's
// Classify function — no randomness, fully deterministic (R-1 compliant).
type mockClassifier struct{}

func (m *mockClassifier) Classify(input mic.InvestmentClockInput) mic.InvestmentClockOutput {
	return mic.Classify(input)
}

// ---------------------------------------------------------------------------
// Table-driven tests — ClassifyBatch (AC-4 — ≥3 rows, preserved from P1-C1)
// ---------------------------------------------------------------------------

func TestMacroSignalsClassifyBatch_ResultCount(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   []string
		wantLen int
	}{
		{
			name:    "batch_vn_single",
			input:   []string{"VN_CPI"},
			wantLen: 1,
		},
		{
			name:    "batch_us_single",
			input:   []string{"Unemployment_Rate"},
			wantLen: 1,
		},
		{
			name:    "batch_empty",
			input:   []string{},
			wantLen: 0,
		},
		{
			name:    "batch_multi_mixed",
			input:   []string{"VN_CPI", "Unemployment_Rate", "OIL_PRICE"},
			wantLen: 3,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sigs := macro_signals.New(&mockClassifier{})
			got := sigs.ClassifyBatch(tt.input)
			if len(got) != tt.wantLen {
				t.Fatalf("ClassifyBatch(%v): got %d results, want %d", tt.input, len(got), tt.wantLen)
			}
		})
	}
}

func TestMacroSignalsClassifyBatch_ClassificationValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		indicator string
		wantTier  string
		wantScore int
		wantPhase string
	}{
		{
			name:      "vn_cpi_direct_tier",
			indicator: "VN_CPI",
			wantTier:  mic.VN_DIRECT_TIER,
			wantScore: mic.VN_DIRECT_SCORE,
			wantPhase: "CORE_VN",
		},
		{
			name:      "unemployment_rate_us_domestic",
			indicator: "Unemployment_Rate",
			wantTier:  mic.US_DOMESTIC_TIER,
			wantScore: mic.US_DOMESTIC_SCORE,
			wantPhase: "US_DOMESTIC",
		},
		{
			name:      "oil_price_regional",
			indicator: "OIL_PRICE",
			wantTier:  mic.REGIONAL_TIER,
			wantScore: mic.REGIONAL_SCORE,
			wantPhase: "REGIONAL",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sigs := macro_signals.New(&mockClassifier{})
			results := sigs.ClassifyBatch([]string{tt.indicator})
			if len(results) != 1 {
				t.Fatalf("expected 1 result, got %d", len(results))
			}
			r := results[0]
			if r.Indicator != tt.indicator {
				t.Errorf("Indicator: got %q, want %q", r.Indicator, tt.indicator)
			}
			if r.Tier != tt.wantTier {
				t.Errorf("Tier: got %q, want %q", r.Tier, tt.wantTier)
			}
			if r.Score != tt.wantScore {
				t.Errorf("Score: got %d, want %d", r.Score, tt.wantScore)
			}
			if r.Phase != tt.wantPhase {
				t.Errorf("Phase: got %q, want %q", r.Phase, tt.wantPhase)
			}
		})
	}
}

func TestMacroSignalsClassifyBatch_NilInputReturnsEmpty(t *testing.T) {
	t.Parallel()
	sigs := macro_signals.New(&mockClassifier{})
	got := sigs.ClassifyBatch(nil)
	if len(got) != 0 {
		t.Fatalf("nil input: expected 0 results, got %d", len(got))
	}
}

func TestMacroSignalsClassifyBatch_IndicatorNamePreserved(t *testing.T) {
	t.Parallel()
	sigs := macro_signals.New(&mockClassifier{})
	names := []string{"VN_CPI", "Unemployment_Rate", "Unknown_XYZ"}
	results := sigs.ClassifyBatch(names)
	if len(results) != len(names) {
		t.Fatalf("result count mismatch: got %d, want %d", len(results), len(names))
	}
	for i, r := range results {
		if r.Indicator != names[i] {
			t.Errorf("result[%d].Indicator: got %q, want %q", i, r.Indicator, names[i])
		}
	}
}

// ---------------------------------------------------------------------------
// BuildMacroSignals — 6-primitive composition tests (P2-X2, AC-3)
// ---------------------------------------------------------------------------

// TestBuildMacroSignals_AllSixPrimitivesPopulated verifies that a single
// BuildMacroSignals call wires all 6 primitives and returns non-empty signal
// fields in the output. This is the AC-3 multi-primitive test.
func TestBuildMacroSignals_AllSixPrimitivesPopulated(t *testing.T) {
	t.Parallel()

	sigs := macro_signals.New(&mockClassifier{})

	input := macro_signals.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
		OilImpact:       oil.OilImpactInput{PriceUSD: 85.0},
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: 2300.0},
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 24500.0},
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: 5.5,
			FedFundsRate:   5.33,
			ComputedAt:     "2026-05-23T00:00:00Z",
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: 7.5,
			DepositRate:  5.5,
			ComputedAt:   "2026-05-23T00:00:00Z",
		},
	}

	out := sigs.BuildMacroSignals(input)

	// AC-3: all 6 signal fields populated (non-empty strings).
	if out.InvestmentClock.Tier == "" {
		t.Error("InvestmentClock.Tier is empty — investment clock not wired")
	}
	if out.OilImpact.Impact == "" {
		t.Error("OilImpact.Impact is empty — oil impact classifier not wired")
	}
	if out.GoldDirection.Direction == "" {
		t.Error("GoldDirection.Direction is empty — gold direction classifier not wired")
	}
	if out.UsdVndDirection.Direction == "" {
		t.Error("UsdVndDirection.Direction is empty — USDVND direction classifier not wired")
	}
	if out.CarryTrade.Regime == "" {
		t.Error("CarryTrade.Regime is empty — carry trade signal not wired")
	}
	if out.YieldSpread.Label == "" {
		t.Error("YieldSpread.Label is empty — yield spread signal not wired")
	}
}

// TestBuildMacroSignals_DeterministicOutput verifies R-1: same input always
// produces identical output (no randomness, no time.Now() drift).
func TestBuildMacroSignals_DeterministicOutput(t *testing.T) {
	t.Parallel()

	sigs := macro_signals.New(&mockClassifier{})

	input := macro_signals.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_GDP"},
		OilImpact:       oil.OilImpactInput{PriceUSD: 55.0},   // BULLISH
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: 1700.0}, // BEARISH
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 26000.0}, // BEARISH
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: 3.0,
			FedFundsRate:   5.33,
			ComputedAt:     "2026-05-23T00:00:00Z",
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: 5.0,
			DepositRate:  5.5,
			ComputedAt:   "2026-05-23T00:00:00Z",
		},
	}

	first := sigs.BuildMacroSignals(input)
	second := sigs.BuildMacroSignals(input)

	if first.InvestmentClock.Tier != second.InvestmentClock.Tier {
		t.Errorf("InvestmentClock.Tier non-deterministic: %q vs %q", first.InvestmentClock.Tier, second.InvestmentClock.Tier)
	}
	if first.OilImpact.Impact != second.OilImpact.Impact {
		t.Errorf("OilImpact.Impact non-deterministic: %q vs %q", first.OilImpact.Impact, second.OilImpact.Impact)
	}
	if first.GoldDirection.Direction != second.GoldDirection.Direction {
		t.Errorf("GoldDirection.Direction non-deterministic: %q vs %q", first.GoldDirection.Direction, second.GoldDirection.Direction)
	}
	if first.UsdVndDirection.Direction != second.UsdVndDirection.Direction {
		t.Errorf("UsdVndDirection.Direction non-deterministic: %q vs %q", first.UsdVndDirection.Direction, second.UsdVndDirection.Direction)
	}
	if first.CarryTrade.Regime != second.CarryTrade.Regime {
		t.Errorf("CarryTrade.Regime non-deterministic: %q vs %q", first.CarryTrade.Regime, second.CarryTrade.Regime)
	}
	if first.YieldSpread.Label != second.YieldSpread.Label {
		t.Errorf("YieldSpread.Label non-deterministic: %q vs %q", first.YieldSpread.Label, second.YieldSpread.Label)
	}
}

// TestBuildMacroSignals_SignalValues verifies expected output values for known inputs
// across all 6 primitives (golden-path table test).
func TestBuildMacroSignals_SignalValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                   string
		input                  macro_signals.MacroSignalsInput
		wantClockTier          string
		wantOilImpact          string
		wantGoldDirection      string
		wantUsdVndDirection    string
		wantCarryRegime        string
		wantYieldLabel         string
	}{
		{
			name: "vn_bullish_all_signals",
			input: macro_signals.MacroSignalsInput{
				InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
				OilImpact:       oil.OilImpactInput{PriceUSD: 50.0},       // < 60 → BULLISH
				GoldDirection:   gld.GoldDirectionInput{PriceUSD: 2300.0}, // > 2200 → BULLISH
				UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 22000.0}, // < 23000 → BULLISH
				CarryTrade: carry.CarryTradeInput{
					VNDDepositRate: 8.0, FedFundsRate: 5.0,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread 3.0 > 2.5 → HOT_MONEY_INFLOW
				YieldSpread: yld.YieldSpreadInput{
					EarningYield: 9.0, DepositRate: 5.0,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread 4.0 > 2.0 → CHEAP
			},
			wantClockTier:       mic.VN_DIRECT_TIER,
			wantOilImpact:       oil.ImpactBullish,
			wantGoldDirection:   gld.DirectionBullish,
			wantUsdVndDirection: uvnd.DirectionBullish,
			wantCarryRegime:     carry.RegimeHotMoneyInflow,
			wantYieldLabel:      yld.LabelCheap,
		},
		{
			name: "neutral_band_all_signals",
			input: macro_signals.MacroSignalsInput{
				InvestmentClock: mic.InvestmentClockInput{IndicatorName: "Unemployment_Rate"},
				OilImpact:       oil.OilImpactInput{PriceUSD: 80.0},       // 60–100 → NEUTRAL
				GoldDirection:   gld.GoldDirectionInput{PriceUSD: 2000.0}, // 1800–2200 → NEUTRAL
				UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 24000.0}, // 23000–25000 → NEUTRAL
				CarryTrade: carry.CarryTradeInput{
					VNDDepositRate: 6.0, FedFundsRate: 5.5,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread 0.5 → NEUTRAL (≥ 0.5)
				YieldSpread: yld.YieldSpreadInput{
					EarningYield: 6.5, DepositRate: 5.5,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread 1.0, ≤2.0 → FAIRLY_VALUED
			},
			wantClockTier:       mic.US_DOMESTIC_TIER,
			wantOilImpact:       oil.ImpactNeutral,
			wantGoldDirection:   gld.DirectionNeutral,
			wantUsdVndDirection: uvnd.DirectionNeutral,
			wantCarryRegime:     carry.RegimeNeutral,
			wantYieldLabel:      yld.LabelFairlyValued,
		},
		{
			name: "vn_bearish_stress_signals",
			input: macro_signals.MacroSignalsInput{
				InvestmentClock: mic.InvestmentClockInput{IndicatorName: "OIL_PRICE"},
				OilImpact:       oil.OilImpactInput{PriceUSD: 120.0},      // > 100 → BEARISH
				GoldDirection:   gld.GoldDirectionInput{PriceUSD: 1600.0}, // < 1800 → BEARISH
				UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 26000.0}, // > 25000 → BEARISH
				CarryTrade: carry.CarryTradeInput{
					VNDDepositRate: 3.0, FedFundsRate: 5.33,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread -2.33 < 0.5 → FII_OUTFLOW_RISK
				YieldSpread: yld.YieldSpreadInput{
					EarningYield: 4.0, DepositRate: 5.5,
					ComputedAt: "2026-05-23T00:00:00Z",
				}, // spread -1.5 ≤ 0 → EXPENSIVE
			},
			wantClockTier:       mic.REGIONAL_TIER,
			wantOilImpact:       oil.ImpactBearish,
			wantGoldDirection:   gld.DirectionBearish,
			wantUsdVndDirection: uvnd.DirectionBearish,
			wantCarryRegime:     carry.RegimeFIIOutflowRisk,
			wantYieldLabel:      yld.LabelExpensive,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sigs := macro_signals.New(&mockClassifier{})
			out := sigs.BuildMacroSignals(tt.input)

			if out.InvestmentClock.Tier != tt.wantClockTier {
				t.Errorf("InvestmentClock.Tier: got %q, want %q", out.InvestmentClock.Tier, tt.wantClockTier)
			}
			if out.OilImpact.Impact != tt.wantOilImpact {
				t.Errorf("OilImpact.Impact: got %q, want %q", out.OilImpact.Impact, tt.wantOilImpact)
			}
			if out.GoldDirection.Direction != tt.wantGoldDirection {
				t.Errorf("GoldDirection.Direction: got %q, want %q", out.GoldDirection.Direction, tt.wantGoldDirection)
			}
			if out.UsdVndDirection.Direction != tt.wantUsdVndDirection {
				t.Errorf("UsdVndDirection.Direction: got %q, want %q", out.UsdVndDirection.Direction, tt.wantUsdVndDirection)
			}
			if out.CarryTrade.Regime != tt.wantCarryRegime {
				t.Errorf("CarryTrade.Regime: got %q, want %q", out.CarryTrade.Regime, tt.wantCarryRegime)
			}
			if out.YieldSpread.Label != tt.wantYieldLabel {
				t.Errorf("YieldSpread.Label: got %q, want %q", out.YieldSpread.Label, tt.wantYieldLabel)
			}
		})
	}
}

// TestBuildMacroSignals_ZeroDataGuards verifies graceful degradation when data is
// unavailable (zero-value inputs propagate to zero-data guard responses).
func TestBuildMacroSignals_ZeroDataGuards(t *testing.T) {
	t.Parallel()

	sigs := macro_signals.New(&mockClassifier{})

	input := macro_signals.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: ""},
		OilImpact:       oil.OilImpactInput{PriceUSD: 0},
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: 0},
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: 0},
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: 0,
			FedFundsRate:   0,
			ComputedAt:     "2026-05-23T00:00:00Z",
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: 0,
			DepositRate:  0,
			ComputedAt:   "2026-05-23T00:00:00Z",
		},
	}

	out := sigs.BuildMacroSignals(input)

	// Zero-data guard: oil/gold/usdvnd default to NEUTRAL, carry/yield to their own guards.
	if out.OilImpact.Impact != oil.ImpactNeutral {
		t.Errorf("OilImpact zero-guard: got %q, want %q", out.OilImpact.Impact, oil.ImpactNeutral)
	}
	if out.GoldDirection.Direction != gld.DirectionNeutral {
		t.Errorf("GoldDirection zero-guard: got %q, want %q", out.GoldDirection.Direction, gld.DirectionNeutral)
	}
	if out.UsdVndDirection.Direction != uvnd.DirectionNeutral {
		t.Errorf("UsdVndDirection zero-guard: got %q, want %q", out.UsdVndDirection.Direction, uvnd.DirectionNeutral)
	}
	if out.CarryTrade.Regime != carry.RegimeNeutral {
		t.Errorf("CarryTrade zero-guard: got %q, want %q", out.CarryTrade.Regime, carry.RegimeNeutral)
	}
	if out.YieldSpread.Label != yld.LabelUnknown {
		t.Errorf("YieldSpread zero-guard: got %q, want %q", out.YieldSpread.Label, yld.LabelUnknown)
	}
}
