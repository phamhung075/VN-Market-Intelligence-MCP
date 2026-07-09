package main

import "fmt"

// ---------------------------------------------------------------------------
// Primitive dispatcher
// ---------------------------------------------------------------------------

// Runner computes and diffs a single primitive-tier scenario.
type Runner func(*RawScenario) (interface{}, []string, error)

var primitiveRunners = map[string]Runner{
	"CalculateRSI":            runRSI,
	"CalculateMACD":           runMACD,
	"CalculateBollingerBands": runBB,
	"CalculateMovingAverage":  runMA,
	"DetectCross":             runDetectCross,
}

func runPrimitive(s *RawScenario) (actual interface{}, diffs []string, err error) {
	runner, ok := primitiveRunners[s.Primitive]
	if !ok {
		return nil, nil, fmt.Errorf("unknown primitive %q", s.Primitive)
	}
	return runner(s)
}
