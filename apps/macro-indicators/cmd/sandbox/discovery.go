// discovery.go — repo-root resolution + scenario filesystem discovery.
//
// Split from cmd/sandbox/main.go (FACTORY-MACRO-split-sandbox, 2026-07-09) — see
// main.go's package doc comment for the full file map. Scenario is the metadata
// envelope populated by discoverScenarios/findRepoRoot's filesystem walk; consumed
// by main()'s dispatch loop and by primitives.go/module.go's os.ReadFile(s.Path) calls.
package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// findRepoRoot walks up from start until it finds a directory containing
// docs/scenarios, or returns "" if none is found.
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
