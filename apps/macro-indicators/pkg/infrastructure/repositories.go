// Package infrastructure — adapter implementations for domain ports.
// HTTPCommodityFetcher implements domain.CommodityFetcherPort via HTTP.
// Stub: no live calls yet. Implementation lands in P1-B1.
package infrastructure

import (
	"context"
	"net/http"
)

// HTTPCommodityFetcher implements domain.CommodityFetcherPort via HTTP.
// Wraps a standard net/http.Client with a configurable base URL.
// TODO(P1-B1): implement FRED/commodity API HTTP calls in FetchPrices.
type HTTPCommodityFetcher struct {
	client  *http.Client
	baseURL string
}

// NewHTTPCommodityFetcher creates a new HTTP commodity fetcher.
// baseURL is the upstream commodity/FX API base (e.g. FRED API endpoint).
// Convention locked per OQ-2: caller provides baseURL; no env reads inside constructor.
func NewHTTPCommodityFetcher(baseURL string) *HTTPCommodityFetcher {
	return &HTTPCommodityFetcher{
		client:  &http.Client{},
		baseURL: baseURL,
	}
}

// FetchPrices fetches commodity spot prices for the given symbols.
// Stub — returns empty map, nil error until P1-B1 implements the HTTP call.
// TODO(P1-B1): implement HTTP call to FRED or commodity API using hf.client + hf.baseURL.
func (hf *HTTPCommodityFetcher) FetchPrices(
	ctx context.Context,
	symbols []string,
) (map[string]float64, error) {
	// TODO(P1-B1): implement HTTP call to FRED or commodity API.
	_ = ctx
	_ = symbols
	return make(map[string]float64), nil
}
