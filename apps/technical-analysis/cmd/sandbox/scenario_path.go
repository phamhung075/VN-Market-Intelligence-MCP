package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ---------------------------------------------------------------------------
// Scenario path resolver
// ---------------------------------------------------------------------------

func resolveScenarioPath(tier, scenarioArg string) (string, error) {
	// If the caller passes an absolute path, return it as-is (no prefix doubling).
	if filepath.IsAbs(scenarioArg) {
		return scenarioArg, nil
	}

	// Find repo root (walk up from cwd to find docs/scenarios).
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	root := findRepoRoot(cwd)
	if root == "" {
		return "", fmt.Errorf("cannot locate repo root (docs/scenarios not found from %s)", cwd)
	}

	var base string
	switch tier {
	case "primitive":
		base = filepath.Join(root, "docs", "scenarios", "technical-analysis", "primitives")
	case "module":
		base = filepath.Join(root, "docs", "scenarios", "technical-analysis", "module")
	case "service":
		base = filepath.Join(root, "docs", "scenarios", "technical-analysis", "service")
	default:
		return "", fmt.Errorf("unknown tier %q: must be primitive, module, or service", tier)
	}

	// Allow "rsi/rsi-mid-range.json" (strip leading dir component if it matches tier).
	parts := strings.SplitN(scenarioArg, "/", 2)
	name := scenarioArg
	if len(parts) == 2 {
		name = parts[1]
	}
	// Ensure .json suffix.
	if !strings.HasSuffix(name, ".json") {
		name += ".json"
	}
	return filepath.Join(base, name), nil
}

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
