// Package detect_cross detects signal-line crossovers between two parallel float64 series.
// Pure function: zero I/O, zero side effects, deterministic.
//
// Algorithm:
//   - Scan adjacent pairs (i-1, i) for a sign change in (fast[i] - slow[i]).
//   - Bullish cross: fast[i-1] <= slow[i-1] && fast[i] > slow[i]
//   - Bearish cross: fast[i-1] >= slow[i-1] && fast[i] < slow[i]
//   - Equal-then-cross: strict inequality at index i is sufficient; equality at i-1 counts.
//   - Cross index reported at i (the bar where the cross is confirmed).
//
// Canonical use: detect MACD line vs signal line crossovers.
package detect_cross

import (
	"errors"
	"math"
)

// CrossEvent records a single crossover occurrence.
type CrossEvent struct {
	Index     int    // bar index where the cross is confirmed (fast crossed slow at this bar)
	Direction string // "bullish" (fast crossed above slow) or "bearish" (fast crossed below slow)
}

var (
	// ErrMismatchedLengths is returned when fastLine and slowLine differ in length.
	ErrMismatchedLengths = errors.New("detect_cross: fastLine and slowLine must have equal length")
	// ErrInsufficientData is returned when fewer than 2 data points are provided.
	ErrInsufficientData = errors.New("detect_cross: need at least 2 data points to detect a cross")
	// ErrInvalidValue is returned when any value is NaN.
	ErrInvalidValue = errors.New("detect_cross: NaN value detected in input")
)

// DetectCross scans two parallel series and returns all crossover events.
//
// Parameters:
//   - fastLine: the "fast" series (e.g. MACD line, fast EMA)
//   - slowLine: the "slow" series (e.g. signal line, slow EMA)
//
// Returns a slice of CrossEvent (may be empty if no crosses occur) and an error
// on invalid input (mismatched lengths, < 2 points, NaN values).
func DetectCross(fastLine, slowLine []float64) ([]CrossEvent, error) {
	if len(fastLine) != len(slowLine) {
		return nil, ErrMismatchedLengths
	}
	if len(fastLine) < 2 {
		return nil, ErrInsufficientData
	}
	for i := range fastLine {
		if math.IsNaN(fastLine[i]) || math.IsNaN(slowLine[i]) {
			return nil, ErrInvalidValue
		}
	}

	var events []CrossEvent
	for i := 1; i < len(fastLine); i++ {
		prevDiff := fastLine[i-1] - slowLine[i-1]
		currDiff := fastLine[i] - slowLine[i]

		switch {
		case prevDiff <= 0 && currDiff > 0:
			events = append(events, CrossEvent{Index: i, Direction: "bullish"})
		case prevDiff >= 0 && currDiff < 0:
			events = append(events, CrossEvent{Index: i, Direction: "bearish"})
		}
	}

	return events, nil
}
