// Package infrastructure — adapter implementations for domain ports.
//
// P2-X3: HTTPCommodityFetcher implemented in fixture mode for sandbox determinism.
// Fixture mode loads from a static map rather than making live HTTP calls.
// This satisfies the R-1 guard (no randomness) and the sandbox security contract
// (zero API keys, zero network calls from sandbox process).
//
// The SBVRateRepository is also provided as a fixture stub — it returns fixed
// VND rates used by the composition root for completeness.
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"net/http"
)

// ---------------------------------------------------------------------------
// HTTPCommodityFetcher — fixture mode (P2-X3)
// ---------------------------------------------------------------------------

// HTTPCommodityFetcher implements domain.CommodityFetcherPort.
// In fixture mode it returns a pre-loaded price map instead of making HTTP calls.
// This keeps the sandbox deterministic and satisfies the security contract
// (no API keys required, no network dependency).
type HTTPCommodityFetcher struct {
	client   *http.Client
	baseURL  string
	fixtures map[string]float64
}

// NewHTTPCommodityFetcher creates a commodity fetcher in fixture mode.
// The fixture map provides deterministic commodity prices for the sandbox.
// baseURL is retained for future live-mode extension (post-pilot).
func NewHTTPCommodityFetcher(baseURL string) *HTTPCommodityFetcher {
	return &HTTPCommodityFetcher{
		client:  &http.Client{},
		baseURL: baseURL,
		// Fixture prices: plausible VN macro indicator values (2026 Q2 range).
		// OIL: Brent crude USD/barrel (NEUTRAL band: $60–$100).
		// GOLD: XAU/USD (BULLISH: >$2200).
		// USDVND: USDVND spot (NEUTRAL band: 23000–25000).
		fixtures: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": 24500.0,
		},
	}
}

// FetchPrices returns fixture commodity prices for the requested symbols.
// Unknown symbols are omitted from the result (caller uses its own defaults).
// No HTTP calls are made — sandbox security contract upheld.
func (hf *HTTPCommodityFetcher) FetchPrices(
	_ context.Context,
	symbols []string,
) (map[string]float64, error) {
	result := make(map[string]float64, len(symbols))
	for _, sym := range symbols {
		if v, ok := hf.fixtures[sym]; ok {
			result[sym] = v
		}
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// SBVRateRepository — fixture stub (P2-X3)
// ---------------------------------------------------------------------------

// SBVRateRepository implements domain.SBVRatePort via a fixture map.
// Returns fixed SBV exchange rates for the composition root.
// Live SBV XML feed adapter is post-pilot scope.
type SBVRateRepository struct {
	fixtures map[string]float64
}

// NewSBVRateRepository creates a SBV rate repository in fixture mode.
func NewSBVRateRepository() *SBVRateRepository {
	return &SBVRateRepository{
		fixtures: map[string]float64{
			"USD/VND": 24500.0,
		},
	}
}

// GetRate returns the fixture exchange rate for the given currency pair.
// Returns 0 if the pair is not in the fixture map (caller uses its own default).
func (r *SBVRateRepository) GetRate(
	_ context.Context,
	from, to string,
) (float64, error) {
	key := from + "/" + to
	return r.fixtures[key], nil
}
