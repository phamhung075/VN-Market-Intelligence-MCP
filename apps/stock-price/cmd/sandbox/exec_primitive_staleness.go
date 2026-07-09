// Package main — stock-price sandbox scenario runner (price_staleness_classifier executor).
package main

import (
	"encoding/json"
	"fmt"
	"time"

	pricestalenessclassifier "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-staleness-classifier"
)

// ---------------------------------------------------------------------------
// Execution — price_staleness_classifier executor (P1-B3)
// ---------------------------------------------------------------------------

// priceStalenessClassifierScenario is the JSON shape for price_staleness_classifier scenarios.
type priceStalenessClassifierScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		FetchedAt             string `json:"fetchedAt"`
		Now                   string `json:"now"`
		FreshThresholdSeconds int    `json:"freshThresholdSeconds"`
		StaleThresholdSeconds int    `json:"staleThresholdSeconds"`
	} `json:"input"`
	Expected struct {
		Label *string `json:"label"`
		Err   *string `json:"err"`
	} `json:"expected"`
}

// executePriceStalenessClassifier runs a price_staleness_classifier scenario.
// It parses the now field, calls ClassifyStaleness, and validates against expected.
func executePriceStalenessClassifier(data []byte) (bool, error) {
	var s priceStalenessClassifierScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_staleness_classifier scenario: %w", err)
	}

	// Parse the "now" reference time from the scenario JSON.
	now, err := time.Parse(time.RFC3339, s.Input.Now)
	if err != nil {
		return false, fmt.Errorf("scenario=%q: parse input.now %q: %w", s.Scenario, s.Input.Now, err)
	}

	gotLabel, gotErr := pricestalenessclassifier.ClassifyStaleness(
		s.Input.FetchedAt,
		now,
		s.Input.FreshThresholdSeconds,
		s.Input.StaleThresholdSeconds,
	)

	wantErr := s.Expected.Err != nil

	if wantErr {
		// Scenario expects an error; label should be absent/null.
		if gotErr == nil {
			return false, fmt.Errorf("scenario=%q: got nil error, want parse error for fetchedAt=%q", s.Scenario, s.Input.FetchedAt)
		}
		// Success: got an error as expected.
		return true, nil
	}

	// Scenario expects a valid label and no error.
	if gotErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, gotErr)
	}
	if s.Expected.Label == nil {
		return false, fmt.Errorf("scenario=%q: expected.label is null but expected.err is also null — invalid fixture", s.Scenario)
	}
	wantLabel := pricestalenessclassifier.StalenessLabel(*s.Expected.Label)
	if gotLabel != wantLabel {
		return false, fmt.Errorf("scenario=%q: got label=%q, want label=%q", s.Scenario, gotLabel, wantLabel)
	}
	return true, nil
}
