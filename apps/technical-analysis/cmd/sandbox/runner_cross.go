package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	dc "github.com/vn-market-intelligence/technical-analysis/pkg/primitive/detect_cross"
)

// ---------------------------------------------------------------------------
// DetectCross runner
// ---------------------------------------------------------------------------

func runDetectCross(s *RawScenario) (interface{}, []string, error) {
	var inp crossInput
	if err := json.Unmarshal(s.Input, &inp); err != nil {
		return nil, nil, fmt.Errorf("cross input parse: %w", err)
	}
	var exp crossExpected
	if err := json.Unmarshal(s.Expected, &exp); err != nil {
		return nil, nil, fmt.Errorf("cross expected parse: %w", err)
	}

	// Multi-case scenario (either success cases or failure cases).
	if inp.Cases != nil {
		return runCrossMultiCase(inp.Cases, &exp)
	}

	fast, err := parseCrossLine(inp.FastLine)
	if err != nil {
		return nil, nil, fmt.Errorf("cross fastLine: %w", err)
	}
	slow, err := parseCrossLine(inp.SlowLine)
	if err != nil {
		return nil, nil, fmt.Errorf("cross slowLine: %w", err)
	}

	events, calcErr := dc.DetectCross(fast, slow)

	var diffs []string

	// Expect an error.
	if exp.Error != nil {
		if calcErr == nil {
			diffs = append(diffs, fmt.Sprintf("expected error but got none"))
		}
		return map[string]interface{}{"error": errStr(calcErr), "events": events}, diffs, nil
	}

	if calcErr != nil {
		diffs = append(diffs, fmt.Sprintf("unexpected error: %v", calcErr))
		return map[string]interface{}{"error": calcErr.Error()}, diffs, nil
	}

	actual := map[string]interface{}{
		"eventCount": len(events),
		"events":     events,
	}

	if exp.EventCount != nil {
		if len(events) != *exp.EventCount {
			diffs = append(diffs, fmt.Sprintf("eventCount: got %d, want %d", len(events), *exp.EventCount))
		}
	}
	if exp.Events != nil {
		if len(events) != len(exp.Events) {
			diffs = append(diffs, fmt.Sprintf("events length: got %d, want %d", len(events), len(exp.Events)))
		} else {
			for i, e := range exp.Events {
				if events[i].Index != e.Index {
					diffs = append(diffs, fmt.Sprintf("events[%d].index: got %d, want %d", i, events[i].Index, e.Index))
				}
				if events[i].Direction != e.Direction {
					diffs = append(diffs, fmt.Sprintf("events[%d].direction: got %q, want %q", i, events[i].Direction, e.Direction))
				}
			}
		}
	}

	return actual, diffs, nil
}

func parseCrossLine(raw []interface{}) ([]float64, error) {
	out := make([]float64, len(raw))
	for i, v := range raw {
		switch t := v.(type) {
		case float64:
			out[i] = t
		case string:
			if strings.ToLower(t) == "nan" {
				out[i] = math.NaN()
			} else {
				return nil, fmt.Errorf("index %d: unexpected string %q", i, t)
			}
		case nil:
			out[i] = math.NaN()
		default:
			return nil, fmt.Errorf("index %d: unexpected type %T", i, v)
		}
	}
	return out, nil
}
