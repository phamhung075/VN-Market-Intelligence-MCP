// trace.go — sandbox trace-result type + file writer.
// Extracted from main.go per FACTORY-APIGW-split-sandbox.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ---------------------------------------------------------------------------
// Trace output
// ---------------------------------------------------------------------------

// TraceResult is the per-scenario trace emitted to sandbox/traces/.
type TraceResult struct {
	Scenario               string      `json:"scenario"`
	ScenarioFile           string      `json:"scenario_file"`
	Tier                   string      `json:"tier"`
	Primitive              string      `json:"primitive,omitempty"`
	Module                 string      `json:"module,omitempty"`
	Status                 string      `json:"status"` // "PASS" | "FAIL"
	IntentionalFailFixture bool        `json:"intentional_failure_fixture"`
	DocOnly                bool        `json:"doc_only,omitempty"` // true when scenario has no executable assertions (documentation artefact)
	Inputs                 interface{} `json:"inputs"`
	Expected               interface{} `json:"expected"`
	Actual                 interface{} `json:"actual"`
	ErrorMsg               string      `json:"error,omitempty"`
	RunAt                  string      `json:"run_at"`
}

func writeTrace(traceDir string, t TraceResult) {
	name := filepath.Base(t.ScenarioFile)
	ext := filepath.Ext(name)
	base := name[:len(name)-len(ext)]

	// Qualify with primitive or module name to avoid filename collisions when
	// two primitives share a scenario name (e.g. g11-canary-cascade.json).
	qualifier := t.Primitive
	if qualifier == "" {
		qualifier = t.Module
	}
	if qualifier != "" {
		base = qualifier + "-" + base
	}

	outPath := filepath.Join(traceDir, base+"-trace.json")
	data, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(outPath, data, 0o644)
}
