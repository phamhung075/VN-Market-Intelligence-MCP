package main

import (
	"encoding/json"
	"fmt"

	ma "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
)

// ---------------------------------------------------------------------------
// Moving Average runner
// ---------------------------------------------------------------------------

func runMA(s *RawScenario) (interface{}, []string, error) {
	// Try to detect multi-case input.
	var multiInput struct {
		Cases json.RawMessage `json:"cases"`
	}
	_ = json.Unmarshal(s.Input, &multiInput)

	var exp maExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("ma expected parse: %w", err)
	}

	tol := exp.Tolerance
	if tol <= 0 {
		tol = defaultTolerance
	}

	// Multi-case scenario (ma-edge.json and ma-failure.json).
	if multiInput.Cases != nil {
		return runMAMultiCase(multiInput.Cases, exp.Cases, tol)
	}

	// Single-case.
	var inp maSingleInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("ma input parse: %w", err)
	}

	if exp.Error != nil {
		smaRes, smaErr := ma.CalculateSMA(inp.Closes, inp.Period)
		emaRes, emaErr := ma.CalculateEMA(inp.Closes, inp.Period)
		var diffs []string
		if smaErr == nil && emaErr == nil {
			diffs = append(diffs, fmt.Sprintf("expected error but CalculateSMA and CalculateEMA both succeeded"))
		}
		return map[string]interface{}{
			"sma_error": errStr(smaErr),
			"ema_error": errStr(emaErr),
			"sma":       smaRes,
			"ema":       emaRes,
		}, diffs, nil
	}

	smaRes, smaErr := ma.CalculateSMA(inp.Closes, inp.Period)
	emaRes, emaErr := ma.CalculateEMA(inp.Closes, inp.Period)

	var diffs []string
	if smaErr != nil {
		diffs = append(diffs, fmt.Sprintf("CalculateSMA error: %v", smaErr))
	}
	if emaErr != nil {
		diffs = append(diffs, fmt.Sprintf("CalculateEMA error: %v", emaErr))
	}

	actual := map[string]interface{}{
		"sma":    smaRes,
		"ema":    emaRes,
		"length": len(smaRes),
	}

	if exp.Length > 0 && smaErr == nil {
		diffLen("sma", len(smaRes), exp.Length, &diffs)
	}
	if exp.SMA != nil && smaErr == nil {
		for i, v := range exp.SMA {
			if i < len(smaRes) {
				diffFloat(fmt.Sprintf("sma[%d]", i), smaRes[i], v, tol, &diffs)
			} else {
				diffs = append(diffs, fmt.Sprintf("sma[%d] missing", i))
			}
		}
	}
	if exp.EMA != nil && emaErr == nil {
		for i, v := range exp.EMA {
			if i < len(emaRes) {
				diffFloat(fmt.Sprintf("ema[%d]", i), emaRes[i], v, tol, &diffs)
			} else {
				diffs = append(diffs, fmt.Sprintf("ema[%d] missing", i))
			}
		}
	}

	return actual, diffs, nil
}
