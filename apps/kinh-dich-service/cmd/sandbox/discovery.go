// discovery.go — Directory discovery and git hash functions for sandbox runner.
// Extracted from main.go per FACTORY-KINHDICH-split-sandbox.
package main

import (
	"os"
	"path/filepath"
	"strings"
)

// getCommitHash returns the current git commit hash (short form)
func getCommitHash() string {
	// Try to read from git
	cwd, _ := os.Getwd()
	dir := cwd
	for i := 0; i < 10; i++ {
		gitDir := filepath.Join(dir, ".git")
		if _, err := os.Stat(gitDir); err == nil {
			// Found .git, try to read HEAD
			headPath := filepath.Join(gitDir, "HEAD")
			headBytes, err := os.ReadFile(headPath)
			if err == nil {
				head := strings.TrimSpace(string(headBytes))
				// If it's a ref, resolve it
				if strings.HasPrefix(head, "ref: ") {
					refPath := filepath.Join(gitDir, strings.TrimPrefix(head, "ref: "))
					refBytes, err := os.ReadFile(refPath)
					if err == nil {
						hash := strings.TrimSpace(string(refBytes))
						if len(hash) >= 8 {
							return hash[:8]
						}
					}
				} else if len(head) >= 8 {
					return head[:8]
				}
			}
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "unknown"
}

// findDashboardDir finds the dashboard directory relative to cwd
func findDashboardDir() string {
	cwd, _ := os.Getwd()

	// Walk up to find apps/kinh-dich-service/dashboard
	dir := cwd
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "apps", "kinh-dich-service", "dashboard")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		// Also check if we're already in kinh-dich-service
		candidate = filepath.Join(dir, "dashboard")
		if _, err := os.Stat(candidate); err == nil {
			// Verify it's the right dashboard by checking for index.html
			if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
				return candidate
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// findScenarioDir finds the scenario directory relative to cwd
func findScenarioDir() string {
	// Get the directory of the current working directory
	cwd, _ := os.Getwd()

	// Walk up the directory tree to find docs/scenarios/kinh-dich
	dir := cwd
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "docs", "scenarios", "kinh-dich")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	// Try relative paths from typical run locations
	candidates := []string{
		"docs/scenarios/kinh-dich",
		"../../docs/scenarios/kinh-dich",
		"../../../docs/scenarios/kinh-dich",
	}
	for _, c := range candidates {
		abs := filepath.Join(cwd, c)
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	return ""
}
