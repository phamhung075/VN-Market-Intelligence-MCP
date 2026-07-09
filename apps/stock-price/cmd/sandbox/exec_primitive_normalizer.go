// Package main — stock-price sandbox scenario runner (price_quote_normalizer executor).
package main

import (
	"encoding/json"
	"fmt"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	pricequotenormalizer "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-quote-normalizer"
)

// ---------------------------------------------------------------------------
// Execution — price_quote_normalizer executor (P1-B1)
// ---------------------------------------------------------------------------

// priceQuoteNormalizerScenario is the JSON shape for price_quote_normalizer scenarios.
type priceQuoteNormalizerScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		RawPrice     float64 `json:"rawPrice"`
		RawVolume    float64 `json:"rawVolume"`
		RawChange    float64 `json:"rawChange"`
		RawChangePct float64 `json:"rawChangePct"`
		Code         string  `json:"code"`
		Source       string  `json:"source"`
		FetchedAt    string  `json:"fetchedAt"`
		LatencyMs    int64   `json:"latencyMs"`
	} `json:"input"`
	ExpectedOutput struct {
		Code          string   `json:"code"`
		Price         float64  `json:"price"`
		Volume        float64  `json:"volume"`
		Change        *float64 `json:"change"`        // DSI-INV-1: pointer for null-aware comparison
		ChangePercent *float64 `json:"changePercent"` // DSI-INV-1: pointer for null-aware comparison
		Source        string   `json:"source"`
		FetchedAt     string   `json:"fetchedAt"`
		LatencyMs     int64    `json:"latencyMs"`
	} `json:"expectedOutput"`
}

// executePriceQuoteNormalizer runs a price_quote_normalizer scenario.
// It calls the pure NormalizeQuote function and compares output field-by-field.
// DSI-INV-1: Change/ChangePercent are now pointers (nil = unavailable).
func executePriceQuoteNormalizer(data []byte) (bool, error) {
	var s priceQuoteNormalizerScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_quote_normalizer scenario: %w", err)
	}

	// DSI-INV-1: build pointers for change values from raw input
	rawChange := s.Input.RawChange
	rawChangePct := s.Input.RawChangePct
	got := pricequotenormalizer.NormalizeQuote(
		s.Input.RawPrice,
		s.Input.RawVolume,
		&rawChange,
		&rawChangePct,
		s.Input.Code,
		domain.PriceSource(s.Input.Source),
		s.Input.FetchedAt,
		s.Input.LatencyMs,
	)

	exp := s.ExpectedOutput
	var failures []string
	if got.Code != exp.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", got.Code, exp.Code))
	}
	if got.Price != exp.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", got.Price, exp.Price))
	}
	if got.Volume != exp.Volume {
		failures = append(failures, fmt.Sprintf("Volume: got=%v want=%v", got.Volume, exp.Volume))
	}
	// DSI-INV-1: compare pointers — both nil OR both non-nil with equal values
	if !floatPtrEqual(got.Change, exp.Change) {
		failures = append(failures, fmt.Sprintf("Change: got=%v want=%v", ptrVal(got.Change), ptrVal(exp.Change)))
	}
	if !floatPtrEqual(got.ChangePercent, exp.ChangePercent) {
		failures = append(failures, fmt.Sprintf("ChangePercent: got=%v want=%v", ptrVal(got.ChangePercent), ptrVal(exp.ChangePercent)))
	}
	if string(got.Source) != exp.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", got.Source, exp.Source))
	}
	if got.FetchedAt != exp.FetchedAt {
		failures = append(failures, fmt.Sprintf("FetchedAt: got=%q want=%q", got.FetchedAt, exp.FetchedAt))
	}
	if got.LatencyMs != exp.LatencyMs {
		failures = append(failures, fmt.Sprintf("LatencyMs: got=%v want=%v", got.LatencyMs, exp.LatencyMs))
	}

	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}
