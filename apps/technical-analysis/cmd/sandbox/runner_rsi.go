package main

import (
	"encoding/json"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/primitive/rsi"
)

// ---------------------------------------------------------------------------
// RSI runner
// ---------------------------------------------------------------------------

type rsiInput struct {
	Closes []float64       `json:"closes"`
	Period int             `json:"period"`
	Cases  json.RawMessage `json:"cases"` // multi-case failure scenario
}

type rsiExpected struct {
	RSI       []float64 `json:"rsi"`
	Tolerance float64   `json:"tolerance"`
	Length    int       `json:"length"`
	Error     *string   `json:"error"`
	RangeMin  *float64  `json:"rangeMin"`
	RangeMax  *float64  `json:"rangeMax"`
}

func runRSI(s *RawScenario) (interface{}, []string, error) {
	var inp rsiInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("rsi input parse: %w", err)
	}
	var exp rsiExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("rsi expected parse: %w", err)
	}

	tol := exp.Tolerance
	if tol <= 0 {
		tol = defaultTolerance
	}

	var diffs []string

	// Multi-case failure scenario (rsi-insufficient-data.json).
	if inp.Cases != nil {
		return runRSIMultiCase(inp.Cases, &exp)
	}

	// Single scenario.
	result, calcErr := rsi.Calculate(inp.Closes, inp.Period)

	// Expect an error.
	if exp.Error != nil {
		if calcErr == nil {
			diffs = append(diffs, fmt.Sprintf("expected error %q but got none", *exp.Error))
		}
		return map[string]interface{}{"error": errStr(calcErr), "rsi": result}, diffs, nil
	}

	// Expect success.
	if calcErr != nil {
		diffs = append(diffs, fmt.Sprintf("unexpected error: %v", calcErr))
		return map[string]interface{}{"error": calcErr.Error()}, diffs, nil
	}

	actual := map[string]interface{}{"rsi": result, "length": len(result)}

	if exp.Length > 0 {
		diffLen("rsi", len(result), exp.Length, &diffs)
	}
	if exp.RSI != nil {
		if len(result) != len(exp.RSI) {
			diffs = append(diffs, fmt.Sprintf("rsi slice length: got %d, want %d", len(result), len(exp.RSI)))
		} else {
			for i, v := range exp.RSI {
				diffFloat(fmt.Sprintf("rsi[%d]", i), result[i], v, tol, &diffs)
			}
		}
	}
	if exp.RangeMin != nil || exp.RangeMax != nil {
		for i, v := range result {
			if exp.RangeMin != nil && v < *exp.RangeMin-tol {
				diffs = append(diffs, fmt.Sprintf("rsi[%d]=%.4f below rangeMin %.4f", i, v, *exp.RangeMin))
			}
			if exp.RangeMax != nil && v > *exp.RangeMax+tol {
				diffs = append(diffs, fmt.Sprintf("rsi[%d]=%.4f above rangeMax %.4f", i, v, *exp.RangeMax))
			}
		}
	}

	return actual, diffs, nil
}

func runRSIMultiCase(casesRaw json.RawMessage, _ *rsiExpected) (interface{}, []string, error) {
	var cases []struct {
		Name   string    `json:"name"`
		Closes []float64 `json:"closes"`
		Period int       `json:"period"`
	}
	if err := json.Unmarshal(casesRaw, &cases); err != nil {
		return nil, nil, fmt.Errorf("rsi multi-case parse: %w", err)
	}
	var diffs []string
	results := make([]map[string]interface{}, len(cases))
	for i, c := range cases {
		_, calcErr := rsi.Calculate(c.Closes, c.Period)
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
