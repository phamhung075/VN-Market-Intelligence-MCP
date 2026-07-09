// Package main — stock-price sandbox scenario runner (discovery).
package main

import (
	"fmt"
	"path/filepath"
)

// ---------------------------------------------------------------------------
// Scenario envelope
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Scenario discovery
// ---------------------------------------------------------------------------

// discoverScenarios returns all *.json files in the requested tier dirs.
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
// Returns empty slice (not error) when directories do not exist (pre-P1-B1 phase).
func discoverScenarios(root, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			p = filepath.Join(root, p)
		}
		t := "primitive"
		if filepath.Dir(p) == filepath.Join(root, "docs", "scenarios", "stock-price", "module") {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	// Collect tier directories.
	var dirs []struct{ path, tier string }
	base := filepath.Join(root, "docs", "scenarios", "stock-price")
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
