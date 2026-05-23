// Package domain — port interfaces for external adapters.
// Ported from src/domain/repositories.ts (core ports only).
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

import "context"

// CommodityFetcherPort is the port for commodity price retrieval (oil, gold, etc.).
// Implemented in pkg/infrastructure; never referenced from pkg/domain implementation code.
type CommodityFetcherPort interface {
	// FetchPrices retrieves spot prices for the given commodity symbols (e.g. "OIL", "GOLD").
	// Returns a map[symbol]price or an error if the source is unreachable.
	// TODO(P1-B1): extend symbol set when FRED/commodity HTTP adapter is implemented.
	FetchPrices(ctx context.Context, symbols []string) (map[string]float64, error)
}

// SBVRatePort is the port for State Bank of Vietnam (SBV) exchange rate queries.
// Implemented in pkg/infrastructure; never referenced from pkg/domain implementation code.
type SBVRatePort interface {
	// GetRate returns the spot exchange rate from → to (e.g. "USD" → "VND").
	// TODO(P1-B1): implement SBV XML feed adapter in infrastructure layer.
	GetRate(ctx context.Context, from, to string) (float64, error)
}
