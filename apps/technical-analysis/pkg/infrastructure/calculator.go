// Package infrastructure — TACalculator implements the TAIndicatorCalculator port.
// P1-B1g: RSI wired. P1-B2g: MACD wired. Remaining primitives wired in P1-B3g..B5g.
package infrastructure

import (
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/rsi"
)

// TACalculator is the infrastructure adapter for technical-indicator math.
type TACalculator struct{}

// NewTACalculator constructs a TACalculator (no external deps at scaffold stage).
func NewTACalculator() *TACalculator {
	return &TACalculator{}
}

// Calculate computes technical indicators from closing prices.
// P1-B1g: RSI wired.
// P1-B2g: MACD wired (default 12/26/9 periods).
// Bollinger / MA / DetectCross wired in P1-B3g..B5g.
func (c *TACalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	rsiValues, err := rsi.Calculate(closes, period)
	if err != nil {
		return nil, err
	}

	// MACD: default 12/26/9. Non-fatal if insufficient data for MACD
	// (caller may pass a short series for RSI-only queries).
	var macdLine, signalLine, histogram []float64
	macdResult, macdErr := macd.Calculate(closes, 12, 26, 9)
	if macdErr == nil {
		macdLine = macdResult.MACDLine
		signalLine = macdResult.SignalLine
		histogram = macdResult.Histogram
	}

	return &domain.TechnicalIndicators{
		RSI:        rsiValues,
		MACDLine:   macdLine,
		SignalLine:  signalLine,
		Histogram:  histogram,
	}, nil
}
