package main

import (
	"encoding/json"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
)

// ---------------------------------------------------------------------------
// MACD runner — result assertions
// ---------------------------------------------------------------------------

// applyMACDDiffs compares a macd.Calculate result against the scenario's
// expected block and returns the mismatch diffs.
func applyMACDDiffs(result macd.Result, exp macdExpected, tol float64) []string {
	var diffs []string

	if exp.OutputLength != nil {
		diffLen("outputLength", len(result.MACDLine), *exp.OutputLength, &diffs)
	}
	if exp.FirstTriple != nil {
		ft := exp.FirstTriple.Tolerance
		if ft <= 0 {
			ft = tol
		}
		diffFloat("firstTriple.macdLine", safeIdx(result.MACDLine, 0), exp.FirstTriple.MACDLine, ft, &diffs)
		diffFloat("firstTriple.signalLine", safeIdx(result.SignalLine, 0), exp.FirstTriple.SignalLine, ft, &diffs)
		diffFloat("firstTriple.histogram", safeIdx(result.Histogram, 0), exp.FirstTriple.Histogram, ft, &diffs)
	}
	if exp.LastTriple != nil {
		lt := exp.LastTriple.Tolerance
		if lt <= 0 {
			lt = tol
		}
		idx := exp.LastTriple.Index
		if idx < 0 {
			idx = len(result.MACDLine) + idx
		}
		diffFloat("lastTriple.macdLine", safeIdx(result.MACDLine, idx), exp.LastTriple.MACDLine, lt, &diffs)
		diffFloat("lastTriple.signalLine", safeIdx(result.SignalLine, idx), exp.LastTriple.SignalLine, lt, &diffs)
		diffFloat("lastTriple.histogram", safeIdx(result.Histogram, idx), exp.LastTriple.Histogram, lt, &diffs)
	}
	// Flat-array expected values for macdLine/signalLine/histogram (e.g. flat-zero scenario).
	// MACDLineRaw may be a []float64 array or a string narrative — detect via JSON type.
	if len(exp.MACDLineRaw) > 0 && exp.MACDLineRaw[0] == '[' {
		var expArr []float64
		if err := json.Unmarshal(exp.MACDLineRaw, &expArr); err == nil {
			for i, v := range expArr {
				if i < len(result.MACDLine) {
					diffFloat(fmt.Sprintf("macdLine[%d]", i), result.MACDLine[i], v, tol, &diffs)
				} else {
					diffs = append(diffs, fmt.Sprintf("macdLine[%d] missing", i))
				}
			}
		}
	}
	if len(exp.SignalLineRaw) > 0 && exp.SignalLineRaw[0] == '[' {
		var expArr []float64
		if err := json.Unmarshal(exp.SignalLineRaw, &expArr); err == nil {
			for i, v := range expArr {
				if i < len(result.SignalLine) {
					diffFloat(fmt.Sprintf("signalLine[%d]", i), result.SignalLine[i], v, tol, &diffs)
				} else {
					diffs = append(diffs, fmt.Sprintf("signalLine[%d] missing", i))
				}
			}
		}
	}
	if len(exp.HistogramRaw) > 0 && exp.HistogramRaw[0] == '[' {
		var expArr []float64
		if err := json.Unmarshal(exp.HistogramRaw, &expArr); err == nil {
			for i, v := range expArr {
				if i < len(result.Histogram) {
					diffFloat(fmt.Sprintf("histogram[%d]", i), result.Histogram[i], v, tol, &diffs)
				} else {
					diffs = append(diffs, fmt.Sprintf("histogram[%d] missing", i))
				}
			}
		}
	}
	// CrossAtIndex: verify histogram sign change.
	if exp.CrossAtIndex != nil {
		ci := *exp.CrossAtIndex
		if ci < 1 || ci >= len(result.Histogram) {
			diffs = append(diffs, fmt.Sprintf("crossAtIndex %d out of range [1, %d)", ci, len(result.Histogram)))
		} else {
			prev := result.Histogram[ci-1]
			curr := result.Histogram[ci]
			if !(prev < 0 && curr > 0) && !(prev > 0 && curr < 0) {
				diffs = append(diffs, fmt.Sprintf("crossAtIndex %d: no sign change (hist[%d]=%.4f, hist[%d]=%.4f)", ci, ci-1, prev, ci, curr))
			}
		}
	}

	return diffs
}
