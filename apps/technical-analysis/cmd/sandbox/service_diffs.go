package main

import "fmt"

// ---------------------------------------------------------------------------
// Service tier — response assertions
// ---------------------------------------------------------------------------

// applyServiceDiffs compares a decoded service-tier HTTP response against the
// scenario's expectedOutput block and returns the mismatch diffs.
func applyServiceDiffs(exp serviceExpected, statusCode int, respBody map[string]interface{}) []string {
	var diffs []string

	if statusCode != exp.StatusCode {
		diffs = append(diffs, fmt.Sprintf("statusCode: got %d, want %d", statusCode, exp.StatusCode))
	}

	// health-ok body match.
	if exp.Body != nil {
		for k, expVal := range exp.Body {
			gotVal, ok := respBody[k]
			if !ok {
				diffs = append(diffs, fmt.Sprintf("body.%s: missing in response", k))
				continue
			}
			// Loose comparison via JSON round-trip.
			expStr := fmt.Sprintf("%v", expVal)
			gotStr := fmt.Sprintf("%v", gotVal)
			if expStr != gotStr {
				diffs = append(diffs, fmt.Sprintf("body.%s: got %v, want %v", k, gotVal, expVal))
			}
		}
	}

	// indicators-happy-path assertions.
	if exp.RSIPopulated != nil {
		rsiArr, _ := respBody["rsi"].([]interface{})
		populated := len(rsiArr) > 0
		if populated != *exp.RSIPopulated {
			diffs = append(diffs, fmt.Sprintf("rsi_populated: got %v, want %v", populated, *exp.RSIPopulated))
		}
		if exp.RSILengthMin != nil && len(rsiArr) < *exp.RSILengthMin {
			diffs = append(diffs, fmt.Sprintf("rsi_length_min: got %d, want >= %d", len(rsiArr), *exp.RSILengthMin))
		}
	}
	if exp.MACDLinePopulated != nil {
		macdArr, _ := respBody["macdLine"].([]interface{})
		populated := len(macdArr) > 0
		if populated != *exp.MACDLinePopulated {
			diffs = append(diffs, fmt.Sprintf("macdLine_populated: got %v, want %v", populated, *exp.MACDLinePopulated))
		}
	}
	if exp.BBUpperPopulated != nil {
		bbArr, _ := respBody["bollingerUpper"].([]interface{})
		populated := len(bbArr) > 0
		if populated != *exp.BBUpperPopulated {
			diffs = append(diffs, fmt.Sprintf("bollingerUpper_populated: got %v, want %v", populated, *exp.BBUpperPopulated))
		}
	}
	if exp.SMAPopulated != nil {
		smaArr, _ := respBody["sma"].([]interface{})
		populated := len(smaArr) > 0
		if populated != *exp.SMAPopulated {
			diffs = append(diffs, fmt.Sprintf("sma_populated: got %v, want %v", populated, *exp.SMAPopulated))
		}
	}
	if exp.EMAPopulated != nil {
		emaArr, _ := respBody["ema"].([]interface{})
		populated := len(emaArr) > 0
		if populated != *exp.EMAPopulated {
			diffs = append(diffs, fmt.Sprintf("ema_populated: got %v, want %v", populated, *exp.EMAPopulated))
		}
	}

	// indicators-bad-request: check error present.
	if exp.ErrorPresent != nil {
		_, hasError := respBody["error"]
		if hasError != *exp.ErrorPresent {
			diffs = append(diffs, fmt.Sprintf("error_present: got %v, want %v", hasError, *exp.ErrorPresent))
		}
	}

	// P0-1 volatility assertions.
	checkNullField := func(fieldName string, wantNull *bool) {
		if wantNull == nil {
			return
		}
		val, exists := respBody[fieldName]
		isNull := !exists || val == nil
		if isNull != *wantNull {
			diffs = append(diffs, fmt.Sprintf("%s null: got %v, want %v", fieldName, isNull, *wantNull))
		}
	}
	checkNullField("rv_10d_pct", exp.RV10dPctNull)
	checkNullField("rv_20d_pct", exp.RV20dPctNull)
	checkNullField("rv_60d_pct", exp.RV60dPctNull)
	checkNullField("rv_20d_percentile", exp.RV20dPercentileNull)
	checkNullField("drawdown_252d_pct", exp.Drawdown252dPctNull)
	checkNullField("gk_vol_20d_pct", exp.GKVolNull)
	if exp.VolRegimePresent != nil {
		_, hasRegime := respBody["vol_regime"]
		if hasRegime != *exp.VolRegimePresent {
			diffs = append(diffs, fmt.Sprintf("vol_regime_present: got %v, want %v", hasRegime, *exp.VolRegimePresent))
		}
	}

	return diffs
}
