package main

import (
	"fmt"
	"math"
)

// ---------------------------------------------------------------------------
// Tolerance helper
// ---------------------------------------------------------------------------

const defaultTolerance = 1e-3

func floatEq(a, b, tol float64) bool {
	if tol <= 0 {
		tol = defaultTolerance
	}
	return math.Abs(a-b) <= tol
}

func diffFloat(label string, got, want, tol float64, diffs *[]string) {
	if !floatEq(got, want, tol) {
		*diffs = append(*diffs, fmt.Sprintf("%s: got %.6f, want %.6f (tol %.6g)", label, got, want, tol))
	}
}

func diffLen(label string, got, want int, diffs *[]string) {
	if got != want {
		*diffs = append(*diffs, fmt.Sprintf("%s length: got %d, want %d", label, got, want))
	}
}
