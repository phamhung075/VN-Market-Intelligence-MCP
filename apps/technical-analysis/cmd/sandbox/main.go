package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	tierFlag := flag.String("tier", "primitive", "primitive | module | service")
	scenarioFlag := flag.String("scenario", "", "path or name of the scenario JSON (relative to docs/scenarios/technical-analysis/{primitives|module}/)")
	auditFlag := flag.Bool("audit", false, "run env audit gate and exit")
	flag.Parse()

	if *auditFlag {
		runAuditGate()
		return
	}

	if *scenarioFlag == "" {
		fmt.Fprintf(os.Stderr, "usage: go run ./cmd/sandbox -tier=<primitive|module> -scenario=<file>\n")
		os.Exit(2)
	}

	start := time.Now()

	// Resolve scenario file path.
	scenarioPath, err := resolveScenarioPath(*tierFlag, *scenarioFlag)
	if err != nil {
		emitError(*scenarioFlag, *tierFlag, err, start)
		os.Exit(1)
	}

	// Read scenario JSON.
	data, err := os.ReadFile(scenarioPath)
	if err != nil {
		emitError(*scenarioFlag, *tierFlag, fmt.Errorf("read scenario: %w", err), start)
		os.Exit(1)
	}

	var raw RawScenario
	if err := json.Unmarshal(data, &raw); err != nil {
		emitError(*scenarioFlag, *tierFlag, fmt.Errorf("parse scenario JSON: %w", err), start)
		os.Exit(1)
	}

	// Dispatch.
	var actual interface{}
	var diffs []string

	switch *tierFlag {
	case "primitive":
		actual, diffs, err = runPrimitive(&raw)
	case "module":
		actual, diffs, err = runModuleScenario(&raw)
	case "service":
		// Service tier uses httptest.NewServer — bypass raw RawScenario parsing above.
		// Re-dispatch directly with the full path.
		actual, diffs, err = runServiceScenario(scenarioPath)
	default:
		emitError(*scenarioFlag, *tierFlag, fmt.Errorf("unknown tier %q", *tierFlag), start)
		os.Exit(2)
	}

	if err != nil {
		emitError(*scenarioFlag, *tierFlag, err, start)
		os.Exit(1)
	}

	status := "green"
	if len(diffs) > 0 {
		status = "red"
	}

	// Parse expected for result block.
	var expectedRaw interface{}
	_ = json.Unmarshal(raw.Expected, &expectedRaw)

	res := RunResult{
		Scenario: *scenarioFlag,
		Tier:     *tierFlag,
		Status:   status,
		Actual:   actual,
		Expected: expectedRaw,
		Diffs:    diffs,
		RunMs:    time.Since(start).Milliseconds(),
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if encErr := enc.Encode(res); encErr != nil {
		fmt.Fprintf(os.Stderr, "encode error: %v\n", encErr)
		os.Exit(1)
	}

	if status == "red" {
		os.Exit(1)
	}
}

func emitError(scenario, tier string, err error, start time.Time) {
	res := RunResult{
		Scenario: scenario,
		Tier:     tier,
		Status:   "red",
		Diffs:    []string{err.Error()},
		RunMs:    time.Since(start).Milliseconds(),
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(res)
}
