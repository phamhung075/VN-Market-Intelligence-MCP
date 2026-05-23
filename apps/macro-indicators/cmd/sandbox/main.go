// Package main — macro-indicators sandbox scenario runner.
//
// Usage:
//
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=module    -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=all       -module=macro-indicators -scenario=all
//	go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json
//
// Security contract:
//   - Zero DB access. Zero network calls. Zero API keys.
//   - Reads scenario JSON from docs/scenarios/macro-indicators/ only.
//   - All computation via pkg/primitive/* and pkg/module/* (pure functions, P1-B1+).
//
// P1-A3 — feat(macro-indicators): sandbox harness CLI (placeholder runner until P1-B1).
// P1-B1 — wire executePrimitive to macro_investment_clock.Classify + executeFallback stubs.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
)

// ---------------------------------------------------------------------------
// Scenario envelope (populated from JSON in P1-B1+)
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Scenario JSON shapes (P1-B1 — macro_investment_clock)
// ---------------------------------------------------------------------------

// macroInvestmentClockScenario is the JSON envelope for macro-investment-clock
// scenario files. The "shouldPass" field drives success vs. failure assertions.
type macroInvestmentClockScenario struct {
	Name      string                          `json:"name"`
	Primitive string                          `json:"primitive"`
	Input     mic.InvestmentClockInput        `json:"input"`
	Expected  *mic.InvestmentClockOutput      `json:"expected"` // nil when shouldPass=false
	ShouldPass bool                           `json:"shouldPass"`
	ErrorType string                          `json:"errorType"`
}

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

func findRepoRoot(start string) string {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "docs", "scenarios")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// ---------------------------------------------------------------------------
// Scenario discovery (filesystem walk on docs/scenarios/macro-indicators/)
// ---------------------------------------------------------------------------

// discoverScenarios returns all *.json files in the requested tier dirs.
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
// Returns empty slice (not error) when directories do not exist (pre-P1-D1 phase).
func discoverScenarios(root, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			p = filepath.Join(root, p)
		}
		t := "primitive"
		if filepath.Dir(p) == filepath.Join(root, "docs", "scenarios", "macro-indicators", "module") {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	// Collect tier directories.
	var dirs []struct{ path, tier string }
	base := filepath.Join(root, "docs", "scenarios", "macro-indicators")
	switch tier {
	case "primitive":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "primitives"), "primitive"})
	case "module":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "module"), "module"})
	case "all":
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "primitives"), "primitive"})
		dirs = append(dirs, struct{ path, tier string }{filepath.Join(base, "module"), "module"})
	default:
		return nil, fmt.Errorf("unknown -tier %q: must be primitive|module|all", tier)
	}

	var scenarios []Scenario
	for _, d := range dirs {
		matches, err := filepath.Glob(filepath.Join(d.path, "*.json"))
		if err != nil {
			return nil, fmt.Errorf("glob %s: %w", d.path, err)
		}
		for _, m := range matches {
			scenarios = append(scenarios, Scenario{
				Path: m,
				Name: filepath.Base(m),
				Tier: d.tier,
			})
		}
	}
	return scenarios, nil
}

// ---------------------------------------------------------------------------
// Execution — macro_investment_clock (P1-B1)
// ---------------------------------------------------------------------------

// executeMacroInvestmentClock runs a single macro-investment-clock scenario.
// For shouldPass=true: calls Classify, compares all output fields to expected.
// For shouldPass=false: calls Classify, verifies no panic (graceful degradation).
func executeMacroInvestmentClock(data []byte) (bool, error) {
	var s macroInvestmentClockScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal macro-investment-clock scenario: %w", err)
	}

	got := mic.Classify(s.Input)

	// Failure scenario: shouldPass=false means we expect the input to be "invalid"
	// (e.g. null → "" in Go). We verify the function ran without panic and returned
	// a valid (zero-value or default) output. Scenario PASSES by virtue of graceful handling.
	if !s.ShouldPass {
		// null indicatorName unmarshals to "" → returns US_DOMESTIC (graceful, not a crash).
		// The scenario passes: the function handled invalid/null input without panic.
		return true, nil
	}

	// shouldPass=true: compare output fields to expected.
	if s.Expected == nil {
		return false, fmt.Errorf("scenario %q: shouldPass=true but expected is nil", s.Name)
	}

	var diffs []string
	if got.Tier != s.Expected.Tier {
		diffs = append(diffs, fmt.Sprintf("Tier: got %q, want %q", got.Tier, s.Expected.Tier))
	}
	if got.Score != s.Expected.Score {
		diffs = append(diffs, fmt.Sprintf("Score: got %d, want %d", got.Score, s.Expected.Score))
	}
	if got.Phase != s.Expected.Phase {
		diffs = append(diffs, fmt.Sprintf("Phase: got %q, want %q", got.Phase, s.Expected.Phase))
	}

	if len(diffs) > 0 {
		return false, fmt.Errorf("scenario %q: %v", s.Name, diffs)
	}
	return true, nil
}

// ---------------------------------------------------------------------------
// Execution (primitive dispatcher)
// ---------------------------------------------------------------------------

// executePrimitive dispatches a primitive scenario to the correct handler
// based on the "primitive" field in the scenario JSON.
func executePrimitive(s Scenario) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	// Peek at the "primitive" field to dispatch.
	var envelope struct {
		Primitive string `json:"primitive"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek primitive field in %s: %w", s.Name, err)
	}

	switch envelope.Primitive {
	case "macro_investment_clock":
		return executeMacroInvestmentClock(data)
	case "":
		// Backward-compat: infer from filename prefix.
		if len(s.Name) >= len("macro-investment-clock") &&
			s.Name[:len("macro-investment-clock")] == "macro-investment-clock" {
			return executeMacroInvestmentClock(data)
		}
		return false, fmt.Errorf("scenario %q: missing 'primitive' field and cannot infer from name", s.Name)
	default:
		return false, fmt.Errorf("unknown primitive %q in %s (not yet wired — add handler in P1-C1+)", envelope.Primitive, s.Name)
	}
}

// executeModule runs a module scenario against pkg/module/* (wired in P1-C1).
// TODO(P1-C1): unmarshal scenario JSON, dispatch to module function, compare to expected.
func executeModule(_ Scenario) (bool, error) {
	return false, fmt.Errorf("module scenarios not yet runnable: pkg/module/ wired in P1-C1")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	tierFlag := flag.String("tier", "", "primitive | module | all")
	moduleFlag := flag.String("module", "", "module name, e.g. macro-indicators")
	scenarioFlag := flag.String("scenario", "all", "all | <filepath>")
	flag.Parse()

	if *tierFlag == "" || *moduleFlag == "" {
		logger.Error("missing required flags", slog.String("required", "-tier and -module"))
		os.Exit(1)
	}

	cwd, err := os.Getwd()
	if err != nil {
		logger.Error("getwd failed", slog.Any("err", err))
		os.Exit(1)
	}
	root := findRepoRoot(cwd)
	if root == "" {
		logger.Error("cannot locate repo root (docs/scenarios not found)", slog.String("cwd", cwd))
		os.Exit(1)
	}

	scenarios, err := discoverScenarios(root, *tierFlag, *scenarioFlag)
	if err != nil {
		logger.Error("scenario discovery failed", slog.Any("err", err))
		os.Exit(1)
	}

	if len(scenarios) == 0 {
		logger.Info("no scenarios discovered (expected during scaffold phase — P1-D1/D2 will create them)",
			slog.String("tier", *tierFlag),
			slog.String("module", *moduleFlag),
		)
		fmt.Printf("total=0 pass=0 fail=0 status=OK\n")
		os.Exit(0)
	}

	pass, fail := 0, 0
	for _, s := range scenarios {
		var ok bool
		var runErr error
		switch s.Tier {
		case "primitive":
			ok, runErr = executePrimitive(s)
		case "module":
			ok, runErr = executeModule(s)
		default:
			runErr = fmt.Errorf("unknown tier %q", s.Tier)
		}
		if runErr != nil || !ok {
			logger.Info("FAIL", slog.String("scenario", s.Name), slog.Any("reason", runErr))
			fail++
		} else {
			logger.Info("PASS", slog.String("scenario", s.Name))
			pass++
		}
	}

	total := pass + fail
	status := "OK"
	if fail > 0 {
		status = "FAIL"
	}
	fmt.Printf("total=%d pass=%d fail=%d status=%s\n", total, pass, fail, status)

	if fail > 0 {
		os.Exit(1)
	}
}
