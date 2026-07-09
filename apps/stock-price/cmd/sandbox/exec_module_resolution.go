// Package main — stock-price sandbox scenario runner (price_resolution module executor).
package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// priceResolutionTierInput is the JSON shape for one tier input (nullable).
type priceResolutionTierInput struct {
	Price     float64  `json:"price"`
	Volume    float64  `json:"volume"`
	Change    *float64 `json:"change"`
	ChangePct *float64 `json:"change_pct"`
	Source    string   `json:"source"`
	FetchedAt string   `json:"fetched_at"`
	LatencyMs int64    `json:"latency_ms"`
}

// priceResolutionScenario is the full JSON shape for price_resolution module scenarios.
type priceResolutionScenario struct {
	Module      string `json:"module"`
	Scenario    string `json:"scenario"`
	Description string `json:"description"`
	Inputs      struct {
		Code                  string                    `json:"code"`
		Now                   string                    `json:"now"`
		FreshThresholdSeconds int                       `json:"fresh_threshold_seconds"`
		StaleThresholdSeconds int                       `json:"stale_threshold_seconds"`
		Tier1                 *priceResolutionTierInput `json:"tier_1"`
		Tier2                 *priceResolutionTierInput `json:"tier_2"`
		Tier3                 *priceResolutionTierInput `json:"tier_3"`
	} `json:"inputs"`
	Expected struct {
		Code      string  `json:"code"`
		Price     float64 `json:"price"`
		Source    string  `json:"source"`
		Staleness string  `json:"staleness"`
	} `json:"expected"`
}

// staticTierFetcher is a sandbox mock that implements priceresolution.TierFetcher.
type staticTierFetcher struct {
	quote *domain.PriceQuote
}

func (s *staticTierFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return s.quote, nil
}

// buildStaticFetcher converts a nullable priceResolutionTierInput into a staticTierFetcher.
func buildStaticFetcher(code string, inp *priceResolutionTierInput) *staticTierFetcher {
	if inp == nil {
		return &staticTierFetcher{quote: nil}
	}
	return &staticTierFetcher{
		quote: &domain.PriceQuote{
			Code:          code,
			Price:         inp.Price,
			Volume:        inp.Volume,
			Change:        inp.Change,
			ChangePercent: inp.ChangePct,
			Source:        domain.PriceSource(inp.Source),
			FetchedAt:     inp.FetchedAt,
			LatencyMs:     inp.LatencyMs,
		},
	}
}

// executePriceResolution runs a price_resolution module scenario.
func executePriceResolution(data []byte) (bool, error) {
	var s priceResolutionScenario
	if err := json.Unmarshal(data, &s); err != nil {
		return false, fmt.Errorf("unmarshal price_resolution scenario: %w", err)
	}

	now, err := time.Parse(time.RFC3339, s.Inputs.Now)
	if err != nil {
		return false, fmt.Errorf("scenario=%q: parse inputs.now %q: %w", s.Scenario, s.Inputs.Now, err)
	}
	freshSec := s.Inputs.FreshThresholdSeconds
	staleSec := s.Inputs.StaleThresholdSeconds
	if freshSec == 0 {
		freshSec = priceresolution.DefaultFreshThresholdSeconds
	}
	if staleSec == 0 {
		staleSec = priceresolution.DefaultStaleThresholdSeconds
	}

	// Rebind FetchedAt to wall-clock time for deterministic staleness classification.
	code := s.Inputs.Code

	tier1 := buildStaticFetcher(code, s.Inputs.Tier1)
	tier2 := buildStaticFetcher(code, s.Inputs.Tier2)
	tier3 := buildStaticFetcher(code, s.Inputs.Tier3)

	for _, pair := range []struct {
		fetcher *staticTierFetcher
		inp     *priceResolutionTierInput
	}{
		{tier1, s.Inputs.Tier1},
		{tier2, s.Inputs.Tier2},
		{tier3, s.Inputs.Tier3},
	} {
		if pair.fetcher.quote == nil || pair.inp == nil {
			continue
		}
		scenarioFetchedAt, parseErr := time.Parse(time.RFC3339, pair.inp.FetchedAt)
		if parseErr != nil {
			continue
		}
		ageAtNow := now.Sub(scenarioFetchedAt)
		pair.fetcher.quote.FetchedAt = time.Now().UTC().Add(-ageAtNow).Format(time.RFC3339)
	}

	mod := priceresolution.NewWithThresholds(tier1, tier2, tier3, freshSec, staleSec)
	got, resolveErr := mod.Resolve(code)

	if s.Expected.Code == "" && resolveErr != nil {
		return true, nil // error path expected
	}
	if resolveErr != nil {
		return false, fmt.Errorf("scenario=%q: unexpected error: %v", s.Scenario, resolveErr)
	}
	if got == nil {
		return false, fmt.Errorf("scenario=%q: got nil ResolvedQuote", s.Scenario)
	}

	var failures []string
	if s.Expected.Code != "" && got.Code != s.Expected.Code {
		failures = append(failures, fmt.Sprintf("Code: got=%q want=%q", got.Code, s.Expected.Code))
	}
	if s.Expected.Price != 0 && got.Price != s.Expected.Price {
		failures = append(failures, fmt.Sprintf("Price: got=%v want=%v", got.Price, s.Expected.Price))
	}
	if s.Expected.Source != "" && string(got.Source) != s.Expected.Source {
		failures = append(failures, fmt.Sprintf("Source: got=%q want=%q", got.Source, s.Expected.Source))
	}
	if s.Expected.Staleness != "" && got.Staleness != s.Expected.Staleness {
		failures = append(failures, fmt.Sprintf("Staleness: got=%q want=%q", got.Staleness, s.Expected.Staleness))
	}
	if len(failures) > 0 {
		return false, fmt.Errorf("scenario=%q field mismatches: %v", s.Scenario, failures)
	}
	return true, nil
}
