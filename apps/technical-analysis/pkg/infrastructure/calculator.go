// Package infrastructure — TACalculator implements the TAIndicatorCalculator port.
// P1-B1g: wires RSI primitive. Remaining primitives wired in P1-B2g..B5g.
package infrastructure

import (
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/rsi"
)

// TACalculator is the infrastructure adapter for technical-indicator math.
type TACalculator struct{}

// NewTACalculator constructs a TACalculator (no external deps at scaffold stage).
func NewTACalculator() *TACalculator {
	return &TACalculator{}
}

// Calculate computes technical indicators from closing prices.
// P1-B1g: RSI wired. MACD / Bollinger / MA / DetectCross wired in subsequent tasks.
func (c *TACalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	rsiValues, err := rsi.Calculate(closes, period)
	if err != nil {
		return nil, err
	}
	return &domain.TechnicalIndicators{RSI: rsiValues}, nil
}
