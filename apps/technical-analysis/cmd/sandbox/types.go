package main

import "encoding/json"

// ---------------------------------------------------------------------------
// Result shape emitted to stdout
// ---------------------------------------------------------------------------

// RunResult is the JSON block emitted to stdout.
type RunResult struct {
	Scenario string      `json:"scenario"`
	Tier     string      `json:"tier"`
	Status   string      `json:"status"` // "green" | "red"
	Actual   interface{} `json:"actual"`
	Expected interface{} `json:"expected"`
	Diffs    []string    `json:"diffs"`
	RunMs    int64       `json:"runMs"`
	Note     string      `json:"note,omitempty"`
}

// ---------------------------------------------------------------------------
// Scenario JSON shapes
// ---------------------------------------------------------------------------

// RawScenario is the envelope for any scenario file.
type RawScenario struct {
	Primitive string          `json:"primitive"`
	Module    string          `json:"module"`
	Category  string          `json:"category"`
	Input     json.RawMessage `json:"input"`
	Expected  json.RawMessage `json:"expectedOutput"`
}
