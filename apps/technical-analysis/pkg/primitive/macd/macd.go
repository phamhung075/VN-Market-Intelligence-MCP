// Package macd computes the Moving Average Convergence Divergence indicator.
// Pure function: zero I/O, zero side effects, deterministic.
//
// Algorithm:
//   - fastEMA  = EMA(closes, fast)         — seed = SMA of first `fast` closes
//   - slowEMA  = EMA(closes, slow)         — seed = SMA of first `slow` closes
//   - macdLine = fastEMA[aligned] - slowEMA (aligned to slow start; length = len(closes)-slow)
//   - signal   = EMA(macdLine, signalPeriod)
//   - histogram= macdLine[aligned] - signal
//
// All three output slices share the same index basis (histogram start).
// Length of each output = len(closes) - slow - signalPeriod + 1.
package macd

import (
	"errors"
	"math"
)

// Result holds the three MACD output series.
type Result struct {
	MACDLine   []float64 // fast EMA - slow EMA
	SignalLine []float64 // EMA(macdLine, signalPeriod)
	Histogram  []float64 // MACDLine - SignalLine
}

var (
	ErrInvalidPeriods    = errors.New("macd: fast must be < slow and both >= 1")
	ErrInvalidSignal     = errors.New("macd: signalPeriod must be >= 1")
	ErrInsufficientData  = errors.New("macd: insufficient data: need at least slow+signalPeriod closes")
	ErrInvalidPrice      = errors.New("macd: invalid price: NaN or negative value")
)

// Calculate computes MACD line, signal line, and histogram.
//
// Parameters:
//   - closes:       closing price series (chronological, oldest first)
//   - fast:         fast EMA period (default 12)
//   - slow:         slow EMA period (default 26); must be > fast
//   - signalPeriod: signal EMA period (default 9)
//
// Returns three parallel slices of length len(closes)-slow-signalPeriod+1.
// Returns an error on invalid parameters or insufficient data.
func Calculate(closes []float64, fast, slow, signalPeriod int) (Result, error) {
	// --- Validation ---
	if fast < 1 || slow < 1 || fast >= slow {
		return Result{}, ErrInvalidPeriods
	}
	if signalPeriod < 1 {
		return Result{}, ErrInvalidSignal
	}
	minLen := slow + signalPeriod
	if len(closes) < minLen {
		return Result{}, ErrInsufficientData
	}
	for _, c := range closes {
		if math.IsNaN(c) || c < 0 {
			return Result{}, ErrInvalidPrice
		}
	}

	// --- Fast and slow EMA series ---
	// fastEMASeries: length = len(closes) - fast + 1  (starts at index fast-1)
	// slowEMASeries: length = len(closes) - slow + 1  (starts at index slow-1)
	fastEMASeries := calcEMA(closes, fast)
	slowEMASeries := calcEMA(closes, slow)

	// Align fast EMA to slow EMA start.
	// fastEMASeries[0] corresponds to closes[fast-1].
	// slowEMASeries[0] corresponds to closes[slow-1].
	// Offset within fastEMASeries to align: slow - fast.
	offset := slow - fast
	macdLen := len(slowEMASeries) // = len(closes) - slow + 1

	macdLine := make([]float64, macdLen)
	for i := 0; i < macdLen; i++ {
		macdLine[i] = fastEMASeries[offset+i] - slowEMASeries[i]
	}

	// --- Signal line: EMA of macdLine ---
	signalSeries := calcEMA(macdLine, signalPeriod)
	// signalSeries length = macdLen - signalPeriod + 1

	// --- Align macdLine to signal start ---
	sigOffset := signalPeriod - 1
	outLen := len(signalSeries)

	alignedMACD := make([]float64, outLen)
	histogram := make([]float64, outLen)
	for i := 0; i < outLen; i++ {
		alignedMACD[i] = macdLine[sigOffset+i]
		histogram[i] = alignedMACD[i] - signalSeries[i]
	}

	return Result{
		MACDLine:   alignedMACD,
		SignalLine: signalSeries,
		Histogram:  histogram,
	}, nil
}
