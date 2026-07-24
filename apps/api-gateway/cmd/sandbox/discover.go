// discover.go — scenario discovery: repo/service root resolution, scenario-file
// enumeration, and envelope peeking used to route each scenario to its executor.
// Extracted from main.go per FACTORY-APIGW-split-sandbox.
//
// size-justification: ~165L — repo-root/service-root walk, the primitive+module
// scenario walker (discoverScenarios), and the envelope peek/verdict classifier
// are one cohesive "which scenario is this and where do I find it" concern; the
// alternative (splitting into several ~30L files) would fragment discovery state
// without reducing complexity.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ---------------------------------------------------------------------------
// Scenario discovery types
// ---------------------------------------------------------------------------

// Scenario holds metadata discovered during filesystem walk.
type Scenario struct {
	Path string
	Name string
	Tier string // "primitive" | "module"
}

// ---------------------------------------------------------------------------
// Repo root + scenario discovery
// ---------------------------------------------------------------------------

// findRepoRoot walks up from start looking for docs/scenarios OR go.work OR .git.
func findRepoRoot(start string) string {
	dir := start
	for {
		// api-gateway uses in-package scenarios; look for the monorepo .git root.
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
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

// findServiceRoot walks up from start looking for the api-gateway service root (go.mod).
func findServiceRoot(start string) string {
	dir := start
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
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

// discoverScenarios returns scenario paths for the requested tier.
// Scenarios live in-package:
//   - primitive: apps/api-gateway/pkg/primitive/*/scenarios/*.json
//   - module:    apps/api-gateway/pkg/module/gateway/scenarios/*.json
//
// When -scenario=<filepath>, returns only that one path (resolved against repo root).
func discoverScenarios(serviceRoot, tier, scenarioArg string) ([]Scenario, error) {
	// Single-file mode.
	if scenarioArg != "all" && scenarioArg != "" {
		p := scenarioArg
		if !filepath.IsAbs(p) {
			repoRoot := findRepoRoot(serviceRoot)
			if repoRoot != "" {
				p = filepath.Join(repoRoot, p)
			}
		}
		t := "primitive"
		if filepath.Base(filepath.Dir(filepath.Dir(p))) == "gateway" {
			t = "module"
		}
		return []Scenario{{Path: p, Name: filepath.Base(p), Tier: t}}, nil
	}

	var scenarios []Scenario

	collectPrimitive := func() error {
		primBase := filepath.Join(serviceRoot, "pkg", "primitive")
		entries, err := os.ReadDir(primBase)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return fmt.Errorf("readdir primitives: %w", err)
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			scenDir := filepath.Join(primBase, e.Name(), "scenarios")
			matches, err := filepath.Glob(filepath.Join(scenDir, "*.json"))
			if err != nil {
				return fmt.Errorf("glob %s: %w", scenDir, err)
			}
			for _, m := range matches {
				scenarios = append(scenarios, Scenario{
					Path: m,
					Name: filepath.Base(m),
					Tier: "primitive",
				})
			}
		}
		return nil
	}

	collectModule := func() error {
		moduleScenDir := filepath.Join(serviceRoot, "pkg", "module", "gateway", "scenarios")
		matches, err := filepath.Glob(filepath.Join(moduleScenDir, "*.json"))
		if err != nil {
			return fmt.Errorf("glob %s: %w", moduleScenDir, err)
		}
		for _, m := range matches {
			scenarios = append(scenarios, Scenario{
				Path: m,
				Name: filepath.Base(m),
				Tier: "module",
			})
		}
		return nil
	}

	switch tier {
	case "primitive":
		if err := collectPrimitive(); err != nil {
			return nil, err
		}
	case "module":
		if err := collectModule(); err != nil {
			return nil, err
		}
	case "all":
		if err := collectPrimitive(); err != nil {
			return nil, err
		}
		if err := collectModule(); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unknown -tier %q: must be primitive|module|all", tier)
	}

	return scenarios, nil
}

// ---------------------------------------------------------------------------
// Scenario JSON envelope peek
// ---------------------------------------------------------------------------

type scenarioEnvelope struct {
	Primitive string `json:"primitive"`
	Module    string `json:"module"`
	Verdict   string `json:"verdict"`
}

func peekEnvelope(data []byte) (scenarioEnvelope, error) {
	var e scenarioEnvelope
	if err := json.Unmarshal(data, &e); err != nil {
		return e, fmt.Errorf("peek envelope: %w", err)
	}
	return e, nil
}

// isIntentionalFixture returns true for scenarios that document intentional
// failure / injection behaviour. Against the correct implementation these
// scenarios still PASS (the expected output matches correct behaviour), but
// they are annotated in the trace for QA clarity.
func isIntentionalFixture(verdict string) bool {
	switch verdict {
	case "FAILURE_SCENARIO", "G11_CANARY", "CASCADE_PROOF":
		return true
	}
	return false
}
