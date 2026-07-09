package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ---------------------------------------------------------------------------
// Service tier — request body construction
// ---------------------------------------------------------------------------

// buildServiceRequestBody resolves the io.Reader for a service-tier POST
// request body, decoding pattern-notation closes when the scenario supplies
// closes_count instead of a literal closes array. Returns a nil reader for
// GET requests or scenarios with no body, matching the http.NewRequest contract.
func buildServiceRequestBody(sc serviceScenario) (io.Reader, error) {
	if sc.Input.Method != http.MethodPost || sc.Input.Body == nil || string(sc.Input.Body) == "null" {
		return nil, nil
	}
	if sc.Input.Path == "/ta/volatility-indicators" {
		// Volatility endpoint: pass the body JSON through unchanged.
		// The body may contain vnindex_bars / ticker_bars for sandbox injection.
		return bytes.NewReader(sc.Input.Body), nil
	}
	// TA indicators endpoint: decode, resolve closes from pattern if needed.
	var inputBody serviceInputBody
	_ = json.Unmarshal(sc.Input.Body, &inputBody)
	if inputBody.Closes == nil && inputBody.ClosesCount != nil {
		inputBody.Closes = resolveServiceCloses(inputBody)
	}
	// Re-encode as the actual request body.
	encoded, encErr := json.Marshal(map[string]interface{}{
		"symbol": inputBody.Symbol,
		"period": inputBody.Period,
		"closes": inputBody.Closes,
	})
	if encErr != nil {
		return nil, fmt.Errorf("encode request body: %w", encErr)
	}
	return bytes.NewReader(encoded), nil
}

// resolveServiceCloses builds a closes slice for service scenarios that use pattern notation.
func resolveServiceCloses(inp serviceInputBody) []float64 {
	n := *inp.ClosesCount
	// ramp pattern: 10.0 + i*0.5
	if strings.Contains(inp.ClosesPattern, "ramp") {
		s := make([]float64, n)
		for i := range s {
			s[i] = 10.0 + float64(i)*0.5
		}
		return s
	}
	// default: linear ramp 10.0 + i
	s := make([]float64, n)
	for i := range s {
		s[i] = 10.0 + float64(i)
	}
	return s
}
