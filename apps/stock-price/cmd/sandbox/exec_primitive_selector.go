// Package main — stock-price sandbox scenario runner (tier_fallback_selector executor).
package main

import (
	"encoding/json"
	"fmt"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	tierfallbackselector "github.com/vn-market-intelligence/stock-price/pkg/primitive/tier-fallback-selector"
)

// tierFallbackSelectorQuote is the JSON shape of a quote (DSI-INV-1: nullable pointers).
type tierFallbackSelectorQuote struct {
	Code          string   `json:"code"`
	Price         float64  `json:"price"`
	Volume        float64  `json:"volume"`
	Change        *float64 `json:"change"`
	ChangePercent *float64 `json:"changePercent"`
	Source        string   `json:"source"`
	FetchedAt     string   `json:"fetchedAt"`
	LatencyMs     int64    `json:"latencyMs"`
}

// tierFallbackSelectorResult is one entry in the input results array (quote may be null).
type tierFallbackSelectorResult struct {
	Quote *tierFallbackSelectorQuote `json:"quote"`
	Err   *string                    `json:"err"`
}

// tierFallbackSelectorScenario is the full JSON shape for tier_fallback_selector scenarios.
type tierFallbackSelectorScenario struct {
	Primitive string `json:"primitive"`
	Scenario  string `json:"scenario"`
	Input     struct {
		Results []tierFallbackSelectorResult `json:"results"`
	} `json:"input"`
	Expected struct {
		Quote *tierFallbackSelectorQuote `json:"quote"`
		Err   *string                    `json:"err"`
	} `json:"expected"`
}

// executeTierFallbackSelector runs a tier_fallback_selector scenario.
func executeTierFallbackSelector(data []byte) (bool, error) {
	var s tierFallbackSelectorScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal tier_fallback_selector scenario: %w", err)
	}

	results := make([]tierfallbackselector.TierResult, len(s.Input.Results))
	for i, r := range s.Input.Results {
		var tr tierfallbackselector.TierResult
		if r.Quote != nil {
			q := domain.PriceQuote{
				Code:          r.Quote.Code,
				Price:         r.Quote.Price,
				Volume:        r.Quote.Volume,
				Change:        r.Quote.Change,
				ChangePercent: r.Quote.ChangePercent,
				Source:        domain.PriceSource(r.Quote.Source),
				FetchedAt:     r.Quote.FetchedAt,
				LatencyMs:     r.Quote.LatencyMs,
			}
			tr.Quote = &q
		}
		if r.Err != nil {
			tr.Err = fmt.Errorf("%s", *r.Err)
		}
		results[i] = tr
	}

	gotQuote, gotErr := tierfallbackselector.SelectWinningTier(results)

	wantErr := s.Expected.Err != nil && *s.Expected.Err == "PriceNotAvailableError"
	if wantErr {
		if gotQuote != nil {
			return false, fmt.Errorf("scenario=%q: got non-nil quote %+v, want nil (all tiers failed)", s.Scenario, gotQuote)
		}
		if gotErr == nil {
			return false, fmt.Errorf("scenario=%q: got nil error, want PriceNotAvailableError", s.Scenario)
		}
		if _, isPNA := gotErr.(*domain.PriceNotAvailableError); !isPNA {
			return false, fmt.Errorf("scenario=%q: got error %v, want *PriceNotAvailableError", s.Scenario, gotErr)
		}
		return true, nil
	}
	if gotErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, gotErr)
	}
	if gotQuote == nil {
		return false, fmt.Errorf("scenario=%q: got nil quote, want non-nil", s.Scenario)
	}
	exp := s.Expected.Quote
	var failures []string
	if gotQuote.Code != exp.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", gotQuote.Code, exp.Code))
	}
	if gotQuote.Price != exp.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", gotQuote.Price, exp.Price))
	}
	if gotQuote.Volume != exp.Volume {
		failures = append(failures, fmt.Sprintf("Volume: got=%v want=%v", gotQuote.Volume, exp.Volume))
	}
	if !floatPtrEqual(gotQuote.Change, exp.Change) {
		failures = append(failures, fmt.Sprintf("Change: got=%v want=%v", ptrVal(gotQuote.Change), ptrVal(exp.Change)))
	}
	if !floatPtrEqual(gotQuote.ChangePercent, exp.ChangePercent) {
		failures = append(failures, fmt.Sprintf("ChangePercent: got=%v want=%v", ptrVal(gotQuote.ChangePercent), ptrVal(exp.ChangePercent)))
	}
	if string(gotQuote.Source) != exp.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", gotQuote.Source, exp.Source))
	}
	if gotQuote.FetchedAt != exp.FetchedAt {
		failures = append(failures, fmt.Sprintf("FetchedAt: got=%q want=%q", gotQuote.FetchedAt, exp.FetchedAt))
	}
	if gotQuote.LatencyMs != exp.LatencyMs {
		failures = append(failures, fmt.Sprintf("LatencyMs: got=%v want=%v", gotQuote.LatencyMs, exp.LatencyMs))
	}
	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}
