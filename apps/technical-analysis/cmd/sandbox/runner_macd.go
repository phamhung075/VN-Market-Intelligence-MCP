package main

import (
	"encoding/json"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/macd"
)

// ---------------------------------------------------------------------------
// MACD runner
// ---------------------------------------------------------------------------

func runMACD(s *RawScenario) (interface{}, []string, error) {
	var inp macdInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("macd input parse: %w", err)
	}
	var exp macdExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("macd expected parse: %w", err)
	}

	// Multi-case failure.
	if inp.Cases != nil {
		return runMACDMultiCase(inp.Cases)
	}

	closes := resolveMACDCloses(inp, exp)

	result, calcErr := macd.Calculate(closes, inp.Fast, inp.Slow, inp.SignalPeriod)

	if exp.Error != nil {
		var diffs []string
		if calcErr == nil {
			diffs = append(diffs, fmt.Sprintf("expected error %q but got none", *exp.Error))
		}
		return map[string]interface{}{"error": errStr(calcErr)}, diffs, nil
	}

	var diffs []string
	if calcErr != nil {
		diffs = append(diffs, fmt.Sprintf("unexpected error: %v", calcErr))
		return map[string]interface{}{"error": calcErr.Error()}, diffs, nil
	}

	actual := map[string]interface{}{
		"outputLength": len(result.MACDLine),
		"firstTriple": map[string]float64{
			"macdLine":   safeIdx(result.MACDLine, 0),
			"signalLine": safeIdx(result.SignalLine, 0),
			"histogram":  safeIdx(result.Histogram, 0),
		},
		"lastTriple": map[string]float64{
			"macdLine":   safeIdx(result.MACDLine, -1),
			"signalLine": safeIdx(result.SignalLine, -1),
			"histogram":  safeIdx(result.Histogram, -1),
		},
	}

	tol := exp.Tolerance
	if tol <= 0 {
		tol = defaultTolerance
	}

	diffs = append(diffs, applyMACDDiffs(result, exp, tol)...)

	return actual, diffs, nil
}

func runMACDMultiCase(casesRaw json.RawMessage) (interface{}, []string, error) {
	type caseShape struct {
		Name         string    `json:"name"`
		Closes       []float64 `json:"closes"`
		ClosesCount  *int      `json:"closes_count"`
		Fast         int       `json:"fast"`
		Slow         int       `json:"slow"`
		SignalPeriod int       `json:"signalPeriod"`
	}
	var cases []caseShape
	if err := json.Unmarshal(casesRaw, &cases); err != nil {
		return nil, nil, fmt.Errorf("macd multi-case parse: %w", err)
	}
	var diffs []string
	results := make([]map[string]interface{}, len(cases))
	for i, c := range cases {
		closes := c.Closes
		if closes == nil && c.ClosesCount != nil {
			closes = make([]float64, *c.ClosesCount) // zeros
		}
		_, calcErr := macd.Calculate(closes, c.Fast, c.Slow, c.SignalPeriod)
		if calcErr == nil {
			diffs = append(diffs, fmt.Sprintf("case %q: expected error but got none", c.Name))
		}
		results[i] = map[string]interface{}{
			"name":  c.Name,
			"error": errStr(calcErr),
		}
	}
	return results, diffs, nil
}
