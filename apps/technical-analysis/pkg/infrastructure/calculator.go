// Package infrastructure — TACalculator implements the TAIndicatorCalculator port.
// Stub: returns "not implemented yet" until P1-B primitives are extracted.
package infrastructure

import (
	"errors"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// TACalculator is the infrastructure adapter for technical-indicator math.
type TACalculator struct{}

// NewTACalculator constructs a TACalculator (no external deps at scaffold stage).
func NewTACalculator() *TACalculator {
	return &TACalculator{}
}

// Calculate is a stub that satisfies the TAIndicatorCalculator port interface.
// Real implementation added in P1-B1g..B5g.
func (c *TACalculator) Calculate(_ []float64, _ int) (*domain.TechnicalIndicators, error) {
	return nil, errors.New("not implemented yet")
}
