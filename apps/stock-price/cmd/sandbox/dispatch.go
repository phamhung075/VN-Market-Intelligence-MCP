// Package main — stock-price sandbox scenario runner (dispatchers).
package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// ---------------------------------------------------------------------------
// Execution — primitive dispatcher (P1-A framework; executors wired P1-B1+)
// ---------------------------------------------------------------------------

// executePrimitive dispatches a primitive scenario to the correct handler
// based on the "primitive" field in the scenario JSON.
// P1-B1+: case blocks are added per primitive as they are extracted.
func executePrimitive(s Scenario) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	// Peek at the "primitive" field to dispatch.
	var envelope struct {
		Primitive string `json:"primitive"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek primitive field in %s: %w", s.Name, err)
	}

	switch envelope.Primitive {
	case "price_quote_normalizer": // P1-B1
		return executePriceQuoteNormalizer(data)
	case "tier_fallback_selector": // P1-B2
		return executeTierFallbackSelector(data)
	case "price_staleness_classifier": // P1-B3
		return executePriceStalenessClassifier(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'primitive' field", s.Name)
	default:
		return false, fmt.Errorf("primitive %q in %s not yet wired (add executor in P1-C+)", envelope.Primitive, s.Name)
	}
}

// ---------------------------------------------------------------------------
// Execution — module dispatcher (P1-A framework; executors wired P1-C+)
// ---------------------------------------------------------------------------

// executeModule dispatches a module scenario to the correct handler
// based on the "module" field in the scenario JSON.
// P1-A: no modules exist yet — unknown module returns graceful warning (not panic).
// P1-C+: case blocks are added per module as they are implemented.
func executeModule(s Scenario) (bool, error) {
	data, err := os.ReadFile(s.Path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", s.Path, err)
	}

	// Peek at the "module" field to dispatch.
	var envelope struct {
		Module string `json:"module"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return false, fmt.Errorf("peek module field in %s: %w", s.Name, err)
	}

	switch envelope.Module {
	case "price_resolution": // P1-C
		return executePriceResolution(data)
	case "":
		return false, fmt.Errorf("scenario %q: missing 'module' field", s.Name)
	default:
		return false, fmt.Errorf("module %q in %s not yet wired (add executor in P1-C+)", envelope.Module, s.Name)
	}
}
