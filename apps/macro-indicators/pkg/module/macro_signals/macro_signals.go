// Package macro_signals orchestrates macro-indicator classification at the module layer.
//
// Day 0 lesson L1 (carried over from TA pilot): ship a thin module stub early to prove
// the composition wiring pattern before Phase 2 primitives pile in.
//
// Composition rule (DDD Fence-B):
//   - This package imports ONLY from pkg/primitive/ and the standard library.
//   - NO imports from pkg/application/, pkg/interface/, or pkg/infrastructure/.
//
// The module receives primitives via constructor injection (dependency-inversion principle).
// Phase 2 will grow the constructor to accept additional primitives (yield spread, carry trade)
// without changing the composition pattern.
package macro_signals

import (
	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
)

// Classifier is the port (interface) this module requires from the macro-investment-clock primitive.
// Using a local interface (rather than a concrete type) lets tests inject a mock without
// importing the concrete primitive package — and keeps the module decoupled from the
// primitive's internal changes.
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
// Phase 1 wires only the macro-investment-clock primitive.
// Phase 2 will add yield-spread and carry-trade primitives via additional constructor params.
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
