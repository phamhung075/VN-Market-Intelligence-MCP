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
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// ---------------------------------------------------------------------------
// Scenario envelope (populated from JSON in P1-B1+)
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
// JSON unmarshaling and execution wired in P1-B1.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
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
// Execution (placeholder — wired in P1-B1)
// ---------------------------------------------------------------------------

// executePrimitive runs a primitive scenario against pkg/primitive/* (wired in P1-B1).
// TODO(P1-B1): unmarshal scenario JSON, dispatch to primitive function, compare to expected.
func executePrimitive(_ Scenario) (bool, error) {
	return false, fmt.Errorf("scenario not yet runnable: pkg/ not implemented (wired in P1-B1)")
}

// executeModule runs a module scenario against pkg/module/* (wired in P1-B1).
// TODO(P1-B1): unmarshal scenario JSON, dispatch to module function, compare to expected.
func executeModule(_ Scenario) (bool, error) {
	return false, fmt.Errorf("scenario not yet runnable: pkg/ not implemented (wired in P1-B1)")
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
		switch s.Tier {
		case "primitive":
			ok, err = executePrimitive(s)
		case "module":
			ok, err = executeModule(s)
		default:
			err = fmt.Errorf("unknown tier %q", s.Tier)
		}
		if err != nil || !ok {
			logger.Info("FAIL", slog.String("scenario", s.Name), slog.Any("reason", err))
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
