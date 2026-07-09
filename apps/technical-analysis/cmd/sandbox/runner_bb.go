package main

import (
	"encoding/json"
	"fmt"

	bb "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/bollinger_bands"
)

// ---------------------------------------------------------------------------
// Bollinger Bands runner
// ---------------------------------------------------------------------------

type bbInput struct {
	Closes     []float64 `json:"closes"`
	Period     int       `json:"period"`
	Multiplier float64   `json:"multiplier"`
}

type bbExpected struct {
	Upper     []float64 `json:"upper"`
	Middle    []float64 `json:"middle"`
	Lower     []float64 `json:"lower"`
	Length    int       `json:"length"`
	Tolerance float64   `json:"tolerance"`
	Error     *string   `json:"error"`
}

func runBB(s *RawScenario) (interface{}, []string, error) {
	var inp bbInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("bb input parse: %w", err)
	}
	var exp bbExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("bb expected parse: %w", err)
	}

	result, calcErr := bb.Calculate(inp.Closes, inp.Period, inp.Multiplier)
	tol := exp.Tolerance
	if tol <= 0 {
		tol = defaultTolerance
	}

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
		"upper":  result.Upper,
		"middle": result.Middle,
		"lower":  result.Lower,
		"length": len(result.Upper),
	}

	if exp.Length > 0 {
		diffLen("bb", len(result.Upper), exp.Length, &diffs)
	}
	if exp.Upper != nil {
		if len(result.Upper) != len(exp.Upper) {
			diffs = append(diffs, fmt.Sprintf("upper length: got %d, want %d", len(result.Upper), len(exp.Upper)))
		} else {
			for i := range exp.Upper {
				diffFloat(fmt.Sprintf("upper[%d]", i), result.Upper[i], exp.Upper[i], tol, &diffs)
				diffFloat(fmt.Sprintf("middle[%d]", i), result.Middle[i], exp.Middle[i], tol, &diffs)
				diffFloat(fmt.Sprintf("lower[%d]", i), result.Lower[i], exp.Lower[i], tol, &diffs)
			}
		}
	}

	return actual, diffs, nil
}
