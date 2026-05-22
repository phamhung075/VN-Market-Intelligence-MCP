// Package bollinger_bands computes Standard Bollinger Bands.
// Pure function: zero I/O, zero side effects, deterministic.
//
// Algorithm:
//   - middle = SMA(closes, period)
//   - stdDev = populationStdDev(window, N)  — divisor N, not N-1
//   - upper  = middle + multiplier * stdDev
//   - lower  = middle - multiplier * stdDev
//
// Output length = len(closes) - period + 1.
// Population std dev is required by the canonical Bollinger Band specification
// (John Bollinger's original formula uses population, not sample).
package bollinger_bands

import (
	"errors"
	"math"
)

var (
	ErrInvalidPeriod     = errors.New("bollinger_bands: period must be >= 2")
	ErrInvalidMultiplier = errors.New("bollinger_bands: multiplier must be > 0")
	ErrInsufficientData  = errors.New("bollinger_bands: insufficient data: need at least period closes")
	ErrInvalidPrice      = errors.New("bollinger_bands: invalid price: NaN or negative value")
)

// Result holds the three Bollinger Band output series.
type Result struct {
	Upper  []float64 // middle + multiplier * stdDev
	Middle []float64 // SMA of closes over period
	Lower  []float64 // middle - multiplier * stdDev
}

// Calculate computes Bollinger Bands for the given closing prices.
//
// Parameters:
//   - closes:     closing price series (chronological, oldest first)
//   - period:     look-back window (default 20); must be >= 2
//   - multiplier: band width factor (default 2.0); must be > 0
//
// Returns three parallel slices of length len(closes) - period + 1.
// Returns an error on invalid parameters, insufficient data, or bad prices.
func Calculate(closes []float64, period int, multiplier float64) (Result, error) {
	if period < 2 {
		return Result{}, ErrInvalidPeriod
	}
	if multiplier <= 0 {
		return Result{}, ErrInvalidMultiplier
	}
	if len(closes) < period {
		return Result{}, ErrInsufficientData
	}
	for _, c := range closes {
		if math.IsNaN(c) || c < 0 {
			return Result{}, ErrInvalidPrice
		}
	}

	n := len(closes) - period + 1
	upper := make([]float64, n)
	middle := make([]float64, n)
	lower := make([]float64, n)

	for i := 0; i < n; i++ {
		mean := sma(closes, i, period)
		sd := populationStdDev(closes, i, period, mean)
		middle[i] = mean
		upper[i] = mean + multiplier*sd
		lower[i] = mean - multiplier*sd
	}

	return Result{Upper: upper, Middle: middle, Lower: lower}, nil
}

// sma returns the simple moving average of closes[start : start+period].
func sma(closes []float64, start, period int) float64 {
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += closes[start+i]
	}
	return sum / float64(period)
}

// populationStdDev returns the population standard deviation (divisor N)
// of closes[start : start+period] given the pre-computed mean.
func populationStdDev(closes []float64, start, period int, mean float64) float64 {
	sumSq := 0.0
	for i := 0; i < period; i++ {
		d := closes[start+i] - mean
		sumSq += d * d
	}
	return math.Sqrt(sumSq / float64(period))
}
