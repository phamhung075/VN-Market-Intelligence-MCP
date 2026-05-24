// Package reading_composer provides the reading composition module for kinh-dich-service.
//
// Fence-B: imports ONLY from domain models, primitive packages, and stdlib.
// Zero imports from application, interface, or infrastructure layers.
//
// Decision: Option B (inline slim interface) chosen over Option A (re-export from domain)
// because:
//   - A slimmer MarkovPort with a module-scoped MarkovData shape (transitionProb +
//     historicalConfidence) avoids leaking the infrastructure DB row schema into the
//     module tier and is future-proof for Phase 2 when the real Markov adapter is wired.
//   - Go interface satisfaction is implicit — any concrete infra impl that satisfies
//     this interface is usable at the composition root without modification.
package reading_composer

// MarkovData represents Markov transition data for a hexagram — shape owned by the module tier.
//
// Note: domain/models.go has its own MarkovData (nextMostLikely, nextName, probability)
// used internally by domain services. This module-tier MarkovData carries the blending
// weights needed for confidence adjustment (transitionProb + historicalConfidence),
// distinct from the domain's next-hexagram prediction data.
type MarkovData struct {
	// TransitionProb is the Markov transition probability for this hexagram (0-1).
	TransitionProb float64 `json:"transitionProb"`

	// HistoricalConfidence is derived from past readings (0-1).
	HistoricalConfidence float64 `json:"historicalConfidence"`
}

// MarkovPort is the port for Markov data access — injected into ComposeReading().
//
// Implementations live in pkg/infrastructure/. This interface is the
// inversion-of-control boundary: the module depends on the interface,
// not the concrete adapter.
type MarkovPort interface {
	// GetMarkovData returns Markov blending data for a given hexagram number,
	// or nil if unavailable.
	//
	// Parameters:
	//   hexagramNumber - Hexagram number (1-64)
	//
	// Returns:
	//   *MarkovData if data exists for this hexagram, nil otherwise
	//   error if there's a system failure (distinct from "no data")
	GetMarkovData(hexagramNumber int) (*MarkovData, error)
}
