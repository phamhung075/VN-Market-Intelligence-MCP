// Package rsi computes Wilder's Relative Strength Index (RSI).
// Pure function: zero I/O, zero side effects, deterministic.
package rsi

import (
	"errors"
	"math"
)

var (
	ErrInsufficientData = errors.New("rsi: insufficient data: need at least period+1 closes")
	ErrInvalidPeriod    = errors.New("rsi: invalid period: must be >= 2")
	ErrInvalidPrice     = errors.New("rsi: invalid price: NaN or negative value")
)

// Calculate computes Wilder's RSI for the given closing prices and period.
// Seed: SMA of first `period` gain/loss values.
// Subsequent: avgGain = (prevAvgGain*(period-1) + currentGain) / period.
// Returns len(closes)-period values in [0,100], or an error on bad input.
func Calculate(closes []float64, period int) ([]float64, error) {
	if period < 2 {
		return nil, ErrInvalidPeriod
	}
	if len(closes) < period+1 {
		return nil, ErrInsufficientData
	}
	for _, c := range closes {
		if math.IsNaN(c) || c < 0 {
			return nil, ErrInvalidPrice
		}
	}

	// Seed: simple average of first `period` moves.
	var seedGain, seedLoss float64
	for i := 1; i <= period; i++ {
		if d := closes[i] - closes[i-1]; d > 0 {
			seedGain += d
		} else {
			seedLoss -= d
		}
	}
	avgGain := seedGain / float64(period)
	avgLoss := seedLoss / float64(period)

	out := make([]float64, 0, len(closes)-period)
	out = append(out, wilderRSI(avgGain, avgLoss))

	// Wilder smoothing for remaining candles.
	for i := period + 1; i < len(closes); i++ {
		var gain, loss float64
		if d := closes[i] - closes[i-1]; d > 0 {
			gain = d
		} else {
			loss = -d
		}
		avgGain = (avgGain*float64(period) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period) + loss) / float64(period)
		out = append(out, wilderRSI(avgGain, avgLoss))
	}
	return out, nil
}

// wilderRSI converts avgGain/avgLoss to RSI in [0,100].
func wilderRSI(avgGain, avgLoss float64) float64 {
	if avgLoss == 0 {
		return 100
	}
	if avgGain == 0 {
		return 0
	}
	return 100 - 100/(1+avgGain/avgLoss)
}
