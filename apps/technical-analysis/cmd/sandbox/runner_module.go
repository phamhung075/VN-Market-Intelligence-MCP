package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/vn-market-intelligence/technical-analysis/pkg/module"
)

// ---------------------------------------------------------------------------
// Module runner
// ---------------------------------------------------------------------------

func runModuleScenario(s *RawScenario) (interface{}, []string, error) {
	var inp moduleInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("module input parse: %w", err)
	}
	var exp moduleExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("module expected parse: %w", err)
	}

	// Parse params.
	var p moduleParams
	if inp.Params != nil {
		_ = json.Unmarshal(inp.Params, &p)
	}

	// Generate closes.
	var closes []float64
	if inp.ClosesLength > 0 {
		// Detect pattern from description for the rsi-macd-crossover scenario:
		// "20-bar decline (50.0 down to 34.2, step -0.8) then 30-bar rally (step +0.9)"
		if strings.Contains(inp.Description, "decline") && strings.Contains(inp.Description, "rally") {
			closes = generateDeclineRally(inp.ClosesLength)
		} else {
			closes = generateRamp(inp.ClosesLength, 10.0, 1.0)
		}
	}

	params := module.ComputeParams{
		RSIPeriod:    p.RSIPeriod,
		MACDFast:     p.MACDFast,
		MACDSlow:     p.MACDSlow,
		MACDSignal:   p.MACDSignal,
		BBPeriod:     p.BBPeriod,
		BBMultiplier: p.BBMult,
		MAPeriod:     p.MAPeriod,
		MAType:       p.MAType,
	}

	result, calcErr := module.Compute(closes, params)

	var diffs []string
	if exp.Error != nil && *exp.Error != "null" {
		if calcErr == nil {
			diffs = append(diffs, fmt.Sprintf("expected error %q but got none", *exp.Error))
		}
	} else if calcErr != nil {
		diffs = append(diffs, fmt.Sprintf("unexpected error: %v", calcErr))
	}

	actual := map[string]interface{}{
		"RSI_length":   len(result.RSI),
		"MACD_length":  len(result.MACDLine),
		"SMA_length":   len(result.SMA),
		"EMA_length":   len(result.EMA),
		"cross_count":  len(result.CrossSignals),
		"RSI_nil":      result.RSI == nil,
		"MACDLine_nil": result.MACDLine == nil,
		"SMA_nil":      result.SMA == nil,
		"EMA_nil":      result.EMA == nil,
		"cross_nil":    result.CrossSignals == nil,
	}

	diffs = append(diffs, applyModuleDiffs(result, exp)...)

	return actual, diffs, nil
}
