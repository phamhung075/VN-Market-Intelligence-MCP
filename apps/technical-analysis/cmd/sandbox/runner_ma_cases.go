package main

import (
	"fmt"

	ma "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/moving_average"
)

// ---------------------------------------------------------------------------
// Moving Average runner — per-case handlers used by runMAMultiCase
// ---------------------------------------------------------------------------

// maFlatErrorCase handles a single case in flat-error mode: the dispatcher
// (or SMA fallback) must return an error for every case.
func maFlatErrorCase(closes []float64, period int, maType, name string, diffs *[]string) map[string]interface{} {
	r := map[string]interface{}{"name": name}
	_, dispErr := ma.CalculateMovingAverage(closes, period, maType)
	if dispErr == nil {
		_, smaErr := ma.CalculateSMA(closes, period)
		if smaErr == nil {
			*diffs = append(*diffs, fmt.Sprintf("case %q: expected error but got none", name))
		} else {
			dispErr = smaErr
		}
	}
	r["error"] = errStr(dispErr)
	return r
}

// maDispatcherCase verifies the maType dispatcher routes case-insensitively
// for every type in types (or the default SMA/EMA set when empty).
func maDispatcherCase(closes []float64, period int, types []string, name string, diffs *[]string) map[string]interface{} {
	r := map[string]interface{}{"name": name}
	if len(types) == 0 {
		types = []string{"SMA", "sma", "EMA", "ema"}
	}
	anyErr := false
	for _, t := range types {
		if _, err := ma.CalculateMovingAverage(closes, period, t); err != nil {
			*diffs = append(*diffs, fmt.Sprintf("dispatcher %q error: %v", t, err))
			anyErr = true
		}
	}
	r["allRoute"] = !anyErr
	return r
}

// maExpectedValueCase handles a per-case scenario with expected SMA/EMA
// values (when expC.SMA is present) or an expected-error case otherwise.
func maExpectedValueCase(closes []float64, period int, name string, expC *maExpectedCase, tol float64, diffs *[]string) map[string]interface{} {
	r := map[string]interface{}{"name": name}
	if expC != nil && expC.SMA != nil {
		smaRes, smaErr := ma.CalculateSMA(closes, period)
		emaRes, emaErr := ma.CalculateEMA(closes, period)
		if smaErr != nil {
			*diffs = append(*diffs, fmt.Sprintf("case %q CalculateSMA: %v", name, smaErr))
		} else {
			for j, v := range expC.SMA {
				if j < len(smaRes) {
					diffFloat(fmt.Sprintf("case %q sma[%d]", name, j), smaRes[j], v, tol, diffs)
				}
			}
		}
		if emaErr != nil {
			*diffs = append(*diffs, fmt.Sprintf("case %q CalculateEMA: %v", name, emaErr))
		} else if expC.EMA != nil {
			for j, v := range expC.EMA {
				if j < len(emaRes) {
					diffFloat(fmt.Sprintf("case %q ema[%d]", name, j), emaRes[j], v, tol, diffs)
				}
			}
		}
		r["sma"] = smaRes
		r["ema"] = emaRes
		return r
	}
	_, smaErr := ma.CalculateSMA(closes, period)
	if smaErr == nil {
		*diffs = append(*diffs, fmt.Sprintf("case %q: expected error but got none", name))
	}
	r["error"] = errStr(smaErr)
	return r
}
