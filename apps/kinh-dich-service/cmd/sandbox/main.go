// Package main provides the sandbox runner for kinh-dich-service scenario verification.
// size-justification: 179L — entry point + shared types (ScenarioTrace, TraceOutput) +
// tier loop + summary; types must stay here (shared by emit.go via package main namespace);
// tier loop is the core orchestration logic that cannot be meaningfully split without
// fragmenting the pass/fail accumulation state.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=kinh-dich -scenario=<file|all>
//	go run ./cmd/sandbox -tier=module -module=kinh-dich -scenario=<file|all>
//
// The sandbox runner executes scenario JSON files against Go primitives/modules
// and verifies outputs match expected values.
//
// Security clause: This sandbox runs with ZERO DB credentials, ZERO API keys.
// CGO_ENABLED=0 enforced. Pure JSON-in -> trace-JSON-out.
//
// File layout (FACTORY-KINHDICH-split-sandbox):
//   - main.go     — flags, types, tier loop, summary (this file)
//   - runners.go  — dispatch + the 5 runXxxScenario decoders
//   - emit.go     — emitTracesFile / emitReferenceFile + dashboard emission
//   - discovery.go — findScenarioDir / findDashboardDir / getCommitHash
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	tier          = flag.String("tier", "primitive", "Tier to test: primitive, module, or all")
	module        = flag.String("module", "kinh-dich", "Module name (kinh-dich)")
	scenario      = flag.String("scenario", "all", "Scenario file name or 'all'")
	emitTraces    = flag.Bool("emit-traces", false, "Emit JSON traces to dashboard/sandbox-traces.js for dashboard loading")
	emitReference = flag.Bool("emit-reference", false, "Emit 64-que reference data to dashboard/que-reference.js")
)

// ScenarioTrace holds the result of a single scenario execution for dashboard rendering.
type ScenarioTrace struct {
	Scenario string `json:"scenario"`
	Tier     string `json:"tier"`
	Status   string `json:"status"` // "pass" or "fail"
	Error    string `json:"error,omitempty"`
}

// TraceOutput is the full trace artifact written for dashboard consumption.
type TraceOutput struct {
	GeneratedAt string          `json:"generatedAt"`
	CommitHash  string          `json:"commitHash"`
	Primitives  []ScenarioTrace `json:"primitives"`
	Modules     []ScenarioTrace `json:"modules"`
	Summary     struct {
		Total  int `json:"total"`
		Passed int `json:"passed"`
		Failed int `json:"failed"`
	} `json:"summary"`
}

func main() {
	flag.Parse()

	// Handle -emit-reference flag (generate que-reference.js)
	if *emitReference {
		if err := emitReferenceFile(); err != nil {
			fmt.Printf("ERROR: Failed to emit reference: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Find scenario directory relative to project root
	scenarioDir := findScenarioDir()
	if scenarioDir == "" {
		fmt.Println("ERROR: Could not find scenarios directory")
		os.Exit(1)
	}

	// Determine which tiers to run
	var tiersToRun []string
	switch *tier {
	case "primitive":
		tiersToRun = []string{"primitive"}
	case "module":
		tiersToRun = []string{"module"}
	case "all":
		tiersToRun = []string{"primitive", "module"}
	default:
		fmt.Printf("ERROR: Unknown tier %q (use primitive, module, or all)\n", *tier)
		os.Exit(1)
	}

	totalPassed := 0
	totalFailed := 0
	var allFailures []string
	var primitiveTraces []ScenarioTrace
	var moduleTraces []ScenarioTrace

	for _, currentTier := range tiersToRun {
		var subDir string
		if currentTier == "primitive" {
			subDir = "primitives"
		} else {
			subDir = "module"
		}

		scenarioPath := filepath.Join(scenarioDir, subDir)

		var files []string
		if *scenario == "all" {
			entries, err := os.ReadDir(scenarioPath)
			if err != nil {
				fmt.Printf("ERROR: Cannot read scenario directory: %v\n", err)
				os.Exit(1)
			}
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), ".json") {
					files = append(files, filepath.Join(scenarioPath, e.Name()))
				}
			}
		} else {
			files = []string{filepath.Join(scenarioPath, *scenario)}
		}

		for _, f := range files {
			name := filepath.Base(f)
			scenarioName := strings.TrimSuffix(name, ".json")
			result, err := runScenario(f)

			trace := ScenarioTrace{
				Scenario: scenarioName,
				Tier:     currentTier,
			}

			if err != nil {
				fmt.Printf("  [RED]  %s: %v\n", name, err)
				totalFailed++
				allFailures = append(allFailures, name)
				trace.Status = "fail"
				trace.Error = err.Error()
			} else if result {
				fmt.Printf("  [GREEN] %s\n", name)
				totalPassed++
				trace.Status = "pass"
			} else {
				fmt.Printf("  [RED]  %s: output mismatch\n", name)
				totalFailed++
				allFailures = append(allFailures, name)
				trace.Status = "fail"
				trace.Error = "output mismatch"
			}

			if currentTier == "primitive" {
				primitiveTraces = append(primitiveTraces, trace)
			} else {
				moduleTraces = append(moduleTraces, trace)
			}
		}
	}

	fmt.Printf("\n=== SANDBOX SUMMARY ===\n")
	fmt.Printf("Tier: %s\n", *tier)
	fmt.Printf("Passed: %d/%d\n", totalPassed, totalPassed+totalFailed)
	if totalFailed > 0 {
		fmt.Printf("Failed: %v\n", allFailures)
	} else {
		fmt.Println("All scenarios GREEN")
	}

	// Emit traces if requested
	if *emitTraces {
		if err := emitTracesFile(primitiveTraces, moduleTraces, totalPassed, totalFailed); err != nil {
			fmt.Printf("ERROR: Failed to emit traces: %v\n", err)
			os.Exit(1)
		}
	}

	if totalFailed > 0 {
		os.Exit(1)
	}
}
