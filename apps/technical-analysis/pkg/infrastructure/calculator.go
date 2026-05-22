// Package infrastructure — TACalculator implements the TAIndicatorCalculator port.
// P1-B1g: RSI wired. P1-B2g: MACD wired. P1-B3g: Bollinger Bands wired.
// P1-B4g: SMA + EMA wired. DetectCross wired in P1-B5g.
package infrastructure

import (
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	bb "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/bollinger_bands"
	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
	ma "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
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
// P1-B3g: Bollinger Bands wired (default 20/2.0).
// MA / DetectCross wired in P1-B4g..B5g.
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

	// Bollinger Bands: default period 20, multiplier 2.0. Non-fatal if insufficient data.
	var bbUpper, bbMiddle, bbLower []float64
	bbResult, bbErr := bb.Calculate(closes, 20, 2.0)
	if bbErr == nil {
		bbUpper = bbResult.Upper
		bbMiddle = bbResult.Middle
		bbLower = bbResult.Lower
	}

	// SMA: default period equals caller period. Non-fatal if insufficient data.
	var smaValues []float64
	smaResult, smaErr := ma.CalculateSMA(closes, period)
	if smaErr == nil {
		smaValues = smaResult
	}

	// EMA: default period equals caller period. Non-fatal if insufficient data.
	var emaValues []float64
	emaResult, emaErr := ma.CalculateEMA(closes, period)
	if emaErr == nil {
		emaValues = emaResult
	}

	return &domain.TechnicalIndicators{
		RSI:             rsiValues,
		MACDLine:        macdLine,
		SignalLine:      signalLine,
		Histogram:       histogram,
		BollingerUpper:  bbUpper,
		BollingerMiddle: bbMiddle,
		BollingerLower:  bbLower,
		SMA:             smaValues,
		EMA:             emaValues,
	}, nil
}
