// Package moving_average computes Simple Moving Average (SMA) and
// Exponential Moving Average (EMA) for a closing price series.
// Pure functions: zero I/O, zero side effects, deterministic.
//
// Algorithms:
//   - SMA: rolling mean of `period` consecutive closes
//   - EMA: SMA-seeded, then alpha = 2/(period+1)  [standard, NOT Wilder]
//
// Output length = len(closes) - period + 1 for both SMA and EMA.
package moving_average

import (
	"errors"
	"math"
	"strings"
)

var (
	ErrInvalidPeriod    = errors.New("moving_average: period must be >= 1")
	ErrInsufficientData = errors.New("moving_average: insufficient data: need at least period closes")
	ErrInvalidPrice     = errors.New("moving_average: invalid price: NaN or negative value")
	ErrUnknownMAType    = errors.New("moving_average: unknown maType: must be SMA or EMA")
)

// CalculateSMA computes the Simple Moving Average for the given closing prices.
//
// Returns a slice of length len(closes) - period + 1.
// Returns an error on invalid period, insufficient data, or bad prices.
func CalculateSMA(closes []float64, period int) ([]float64, error) {
	if period < 1 {
		return nil, ErrInvalidPeriod
	}
	if len(closes) < period {
		return nil, ErrInsufficientData
	}
	for _, c := range closes {
		if math.IsNaN(c) || c < 0 {
			return nil, ErrInvalidPrice
		}
	}

	n := len(closes) - period + 1
	out := make([]float64, n)
	// Compute first window sum.
	var sum float64
	for i := 0; i < period; i++ {
		sum += closes[i]
	}
	out[0] = sum / float64(period)
	// Slide window: add next, drop oldest.
	for i := 1; i < n; i++ {
		sum += closes[i+period-1] - closes[i-1]
		out[i] = sum / float64(period)
	}
	return out, nil
}

// CalculateEMA computes the Exponential Moving Average for the given closing prices.
//
// Seed convention: ema[0] = SMA of closes[0:period].
// Recurrence:      ema[i] = (closes[period+i-1] - ema[i-1]) * alpha + ema[i-1]
// Alpha:           2 / (period + 1)  [standard EMA, NOT Wilder's 1/period]
//
// Returns a slice of length len(closes) - period + 1.
// Returns an error on invalid period, insufficient data, or bad prices.
func CalculateEMA(closes []float64, period int) ([]float64, error) {
	if period < 1 {
		return nil, ErrInvalidPeriod
	}
	if len(closes) < period {
		return nil, ErrInsufficientData
	}
	for _, c := range closes {
		if math.IsNaN(c) || c < 0 {
			return nil, ErrInvalidPrice
		}
	}

	k := 2.0 / float64(period+1)

	// Seed: SMA of first `period` closes.
	var sum float64
	for i := 0; i < period; i++ {
		sum += closes[i]
	}
	seed := sum / float64(period)

	n := len(closes) - period + 1
	out := make([]float64, n)
	out[0] = seed
	for i := 1; i < n; i++ {
		out[i] = (closes[period+i-1]-out[i-1])*k + out[i-1]
	}
	return out, nil
}

// CalculateMovingAverage dispatches to CalculateSMA or CalculateEMA based on maType.
//
// maType is case-insensitive: "SMA", "sma", "EMA", "ema" are all accepted.
// Returns ErrUnknownMAType for any other value.
func CalculateMovingAverage(closes []float64, period int, maType string) ([]float64, error) {
	switch strings.ToUpper(maType) {
	case "SMA":
		return CalculateSMA(closes, period)
	case "EMA":
		return CalculateEMA(closes, period)
	default:
		return nil, ErrUnknownMAType
	}
}
