package main

import (
	"encoding/json"
	"fmt"

	dc "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/detect_cross"
)

// ---------------------------------------------------------------------------
// DetectCross runner — multi-case scenarios
// ---------------------------------------------------------------------------

func runCrossMultiCase(casesRaw json.RawMessage, exp *crossExpected) (interface{}, []string, error) {
	var cases []struct {
		Name     string        `json:"name"`
		FastLine []interface{} `json:"fastLine"`
		SlowLine []interface{} `json:"slowLine"`
	}
	if err := json.Unmarshal(casesRaw, &cases); err != nil {
		return nil, nil, fmt.Errorf("cross multi-case parse: %w", err)
	}

	// If exp.Cases is present, this is a success scenario (edge cases with expected events).
	// If exp.Errors is present (or no Cases), this is a failure scenario.
	hasExpCases := len(exp.Cases) > 0

	var diffs []string
	results := make([]map[string]interface{}, len(cases))
	for i, c := range cases {
		fast, _ := parseCrossLine(c.FastLine)
		slow, _ := parseCrossLine(c.SlowLine)
		events, calcErr := dc.DetectCross(fast, slow)

		r := map[string]interface{}{"name": c.Name}

		if hasExpCases {
			// Success mode: find matching expected case and verify events.
			var expC *crossExpectedCase
			for j := range exp.Cases {
				if exp.Cases[j].Name == c.Name {
					expC = &exp.Cases[j]
					break
				}
			}
			if calcErr != nil {
				diffs = append(diffs, fmt.Sprintf("case %q: unexpected error: %v", c.Name, calcErr))
				r["error"] = calcErr.Error()
			} else {
				r["eventCount"] = len(events)
				r["events"] = events
				if expC != nil {
					if expC.EventCount != nil && len(events) != *expC.EventCount {
						diffs = append(diffs, fmt.Sprintf("case %q eventCount: got %d, want %d", c.Name, len(events), *expC.EventCount))
					}
					if expC.Events != nil {
						if len(events) != len(expC.Events) {
							diffs = append(diffs, fmt.Sprintf("case %q events length: got %d, want %d", c.Name, len(events), len(expC.Events)))
						} else {
							for k, e := range expC.Events {
								if events[k].Index != e.Index {
									diffs = append(diffs, fmt.Sprintf("case %q events[%d].index: got %d, want %d", c.Name, k, events[k].Index, e.Index))
								}
								if events[k].Direction != e.Direction {
									diffs = append(diffs, fmt.Sprintf("case %q events[%d].direction: got %q, want %q", c.Name, k, events[k].Direction, e.Direction))
								}
							}
						}
					}
				}
			}
		} else {
			// Failure mode: all cases must return an error.
			if calcErr == nil {
				diffs = append(diffs, fmt.Sprintf("case %q: expected error but got none", c.Name))
			}
			r["error"] = errStr(calcErr)
		}

		results[i] = r
	}
	return results, diffs, nil
}
