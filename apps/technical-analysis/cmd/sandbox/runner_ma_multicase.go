package main

import (
	"encoding/json"
	"fmt"
	"math"
)

// ---------------------------------------------------------------------------
// Moving Average runner — multi-case scenarios
// ---------------------------------------------------------------------------

func runMAMultiCase(inputCasesRaw json.RawMessage, expCases []maExpectedCase, tol float64) (interface{}, []string, error) {
	var inputCases []json.RawMessage
	if err := json.Unmarshal(inputCasesRaw, &inputCases); err != nil {
		return nil, nil, fmt.Errorf("ma multi-case raw parse: %w", err)
	}

	// Determine mode: if expCases is empty, it is a flat-error scenario
	// (all cases expected to produce errors). Otherwise, per-case matching.
	flatErrorMode := len(expCases) == 0

	var diffs []string
	results := make([]map[string]interface{}, 0, len(inputCases))

	for i, rawCase := range inputCases {
		var c struct {
			Name    string            `json:"name"`
			Closes  []maNullableFloat `json:"closes"`
			Period  int               `json:"period"`
			MAType  string            `json:"maType"`
			MATypes []string          `json:"maTypes"`
		}
		if err := json.Unmarshal(rawCase, &c); err != nil {
			return nil, nil, fmt.Errorf("ma case %d parse: %w", i, err)
		}

		// Convert nullable floats to float64 (null → NaN).
		closes := make([]float64, len(c.Closes))
		for j, nf := range c.Closes {
			if nf.Valid {
				closes[j] = nf.Val
			} else {
				closes[j] = math.NaN()
			}
		}

		if flatErrorMode {
			results = append(results, maFlatErrorCase(closes, c.Period, c.MAType, c.Name, &diffs))
			continue
		}

		if c.Name == "dispatcher-case-insensitive" {
			results = append(results, maDispatcherCase(closes, c.Period, c.MATypes, c.Name, &diffs))
			continue
		}

		var expC *maExpectedCase
		for j := range expCases {
			if expCases[j].Name == c.Name {
				expC = &expCases[j]
				break
			}
		}
		results = append(results, maExpectedValueCase(closes, c.Period, c.Name, expC, tol, &diffs))
	}

	return results, diffs, nil
}
