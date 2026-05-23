// Package macro_signals orchestrates macro-indicator classification at the module layer.
//
// Day 0 lesson L1 (carried over from TA pilot): ship a thin module stub early to prove
// the composition wiring pattern before Phase 2 primitives pile in.
//
// P2-X2: module expanded from 1-primitive to 6-primitive composition.
// BuildMacroSignals wires all six primitives in a single call:
//   - macro_investment_clock       (investment-clock tier + phase)
//   - macro_oil_impact_classifier  (oil-impact BEARISH/NEUTRAL/BULLISH)
//   - macro_gold_direction_classifier (gold direction BEARISH/NEUTRAL/BULLISH)
//   - macro_usdvnd_direction_classifier (USDVND direction BEARISH/NEUTRAL/BULLISH)
//   - macro_carry_trade_signal     (carry-trade regime HOT_MONEY_INFLOW/NEUTRAL/FII_OUTFLOW_RISK)
//   - macro_yield_spread_signal    (yield spread label CHEAP/FAIRLY_VALUED/EXPENSIVE/UNKNOWN)
//
// DDD Fence-B: imports only from pkg/primitive/ and the standard library.
// No cross-layer imports (app/infra/iface layers excluded per pilot charter §Fence-B).
//
// The module receives primitives via constructor injection (dependency-inversion principle).
package macro_signals

import (
	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
	gld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
	uvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// ---------------------------------------------------------------------------
// Classifier is the port (local interface) this module requires from the macro-investment-clock primitive.
// Using a local interface (rather than a concrete type) lets tests inject a mock without
// importing the concrete primitive package — and keeps the module decoupled from the
// primitive's internal changes.
// ---------------------------------------------------------------------------

type Classifier interface {
	Classify(input mic.InvestmentClockInput) mic.InvestmentClockOutput
}

// Result is the per-indicator classification result returned by ClassifyBatch.
// It wraps InvestmentClockOutput and adds the original indicator name so callers
// do not need to correlate by position.
type Result struct {
	Indicator string `json:"indicator"`
	mic.InvestmentClockOutput
}

// Signals orchestrates 1+ primitives to produce macro investment-clock classifications.
// Phase 1 wired only the macro-investment-clock primitive.
// Phase 2 adds all 5 remaining primitives via BuildMacroSignals.
type Signals struct {
	clock Classifier
}

// New constructs a Signals module with the given Classifier implementation injected.
// The constructor never instantiates the primitive itself — callers supply it, which
// enables testing with mocks and future multi-primitive composition.
func New(clock Classifier) *Signals {
	return &Signals{clock: clock}
}

// ClassifyBatch runs the macro-investment-clock classification for each indicator name
// and returns one Result per entry. An empty or nil input slice returns an empty slice
// (not nil) to simplify caller range loops.
func (s *Signals) ClassifyBatch(names []string) []Result {
	results := make([]Result, 0, len(names))
	for _, name := range names {
		out := s.clock.Classify(mic.InvestmentClockInput{IndicatorName: name})
		results = append(results, Result{
			Indicator:             name,
			InvestmentClockOutput: out,
		})
	}
	return results
}

// ---------------------------------------------------------------------------
// BuildMacroSignals — 6-primitive composition (P2-X2)
// ---------------------------------------------------------------------------

// MacroSignalsInput is the combined input for all 6 primitives in a single call.
// All timestamps must be injected by the caller (R-1: no time.Now() calls here).
type MacroSignalsInput struct {
	// InvestmentClock input for macro-investment-clock primitive.
	InvestmentClock mic.InvestmentClockInput `json:"investmentClock"`

	// OilImpact input for macro-oil-impact-classifier primitive.
	OilImpact oil.OilImpactInput `json:"oilImpact"`

	// GoldDirection input for macro-gold-direction-classifier primitive.
	GoldDirection gld.GoldDirectionInput `json:"goldDirection"`

	// UsdVndDirection input for macro-usdvnd-direction-classifier primitive.
	UsdVndDirection uvnd.UsdVndDirectionInput `json:"usdVndDirection"`

	// CarryTrade input for macro-carry-trade-signal primitive.
	CarryTrade carry.CarryTradeInput `json:"carryTrade"`

	// YieldSpread input for macro-yield-spread-signal primitive.
	YieldSpread yld.YieldSpreadInput `json:"yieldSpread"`
}

// MacroSignalsOutput is the combined output from all 6 primitives.
// Each field corresponds to one primitive result. All outputs are populated
// in every call — there are no optional fields (zero-value outputs represent
// the primitive's own zero-data guard response).
type MacroSignalsOutput struct {
	// InvestmentClock is the macro-investment-clock classification result.
	InvestmentClock mic.InvestmentClockOutput `json:"investmentClock"`

	// OilImpact is the macro-oil-impact-classifier result.
	OilImpact oil.OilImpactOutput `json:"oilImpact"`

	// GoldDirection is the macro-gold-direction-classifier result.
	GoldDirection gld.GoldDirectionOutput `json:"goldDirection"`

	// UsdVndDirection is the macro-usdvnd-direction-classifier result.
	UsdVndDirection uvnd.UsdVndDirectionOutput `json:"usdVndDirection"`

	// CarryTrade is the macro-carry-trade-signal result.
	CarryTrade carry.CarryTradeOutput `json:"carryTrade"`

	// YieldSpread is the macro-yield-spread-signal result.
	YieldSpread yld.YieldSpreadOutput `json:"yieldSpread"`
}

// BuildMacroSignals invokes all 6 primitives in sequence and returns their combined output.
// This is the primary composition entry point for the macro-signals module (P2-X2).
//
// Fence-B compliant: calls only pkg/primitive/* package-level functions (pure functions).
// No cross-layer imports — only stdlib and primitive packages.
// No randomness, no time.Now() — fully deterministic (R-1 compliant).
//
// The investment-clock primitive is called via the injected Classifier port
// (dependency inversion); the remaining 5 primitives are called directly via their
// package-level Classify/Compute functions (no port needed for pure functions
// with stable signatures at the module tier).
func (s *Signals) BuildMacroSignals(input MacroSignalsInput) MacroSignalsOutput {
	return MacroSignalsOutput{
		InvestmentClock: s.clock.Classify(input.InvestmentClock),
		OilImpact:       oil.Classify(input.OilImpact),
		GoldDirection:   gld.Classify(input.GoldDirection),
		UsdVndDirection: uvnd.Classify(input.UsdVndDirection),
		CarryTrade:      carry.Compute(input.CarryTrade),
		YieldSpread:     yld.Compute(input.YieldSpread),
	}
}
