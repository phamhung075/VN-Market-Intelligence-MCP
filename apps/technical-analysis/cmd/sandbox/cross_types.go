package main

import "encoding/json"

// ---------------------------------------------------------------------------
// DetectCross runner — scenario JSON shapes
// ---------------------------------------------------------------------------

type crossInput struct {
	FastLine []interface{}   `json:"fastLine"` // may contain "NaN" strings
	SlowLine []interface{}   `json:"slowLine"`
	Cases    json.RawMessage `json:"cases"`
}

type crossEvent struct {
	Index     int    `json:"index"`
	Direction string `json:"direction"`
}

type crossExpectedCase struct {
	Name       string       `json:"name"`
	Events     []crossEvent `json:"events"`
	EventCount *int         `json:"eventCount"`
}

type crossExpected struct {
	Events     []crossEvent        `json:"events"`
	EventCount *int                `json:"eventCount"`
	Error      *string             `json:"error"`
	Errors     []string            `json:"errors"`
	Cases      []crossExpectedCase `json:"cases"` // per-case expected (edge scenario)
}
