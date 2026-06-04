// Package pricequotenormalizer maps raw exchange payload fields to a
// canonical domain.PriceQuote.
//
// Fence-A: imports ONLY stdlib and the domain package.
// Strictly no: SQLite driver, higher DDD layers, network calls, or time.Now() side-effects.
// fetchedAt and latencyMs are injected by the caller (measured at the infra boundary).
//
// Build constraint: zero native extensions. Builds under CGO_ENABLED=0.
package pricequotenormalizer

import (
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// NormalizeQuote maps raw exchange response fields to a canonical domain.PriceQuote.
//
// Parameters:
//   - rawPrice     — close / matchPrice / price field from the exchange response
//   - rawVolume    — volume / totalVolume field
//   - rawChange    — pointer to change / priceChange field (nil = unavailable)
//   - rawChangePct — pointer to pctChange / pctPriceChange field (nil = unavailable)
//   - code         — ticker symbol (e.g. "VCB", "FPT"); empty string is passed through
//   - source       — domain.PriceSource (SourceHOSE, SourceHNX, SourceUPCOM, SourceCache)
//   - fetchedAt    — RFC3339 timestamp captured by the caller (no time.Now() here)
//   - latencyMs    — round-trip milliseconds measured by the caller
//
// DSI-INV-1: Change/ChangePercent are pointers. nil = unavailable (serializes as JSON null),
// distinguishable from a genuine 0 (flat day).
//
// Returns a value (not pointer) — PriceQuote is a plain value object.
func NormalizeQuote(
	rawPrice, rawVolume float64,
	rawChange, rawChangePct *float64,
	code string,
	source domain.PriceSource,
	fetchedAt string,
	latencyMs int64,
) domain.PriceQuote {
	return domain.PriceQuote{
		Code:          code,
		Price:         rawPrice,
		Volume:        rawVolume,
		Change:        rawChange,
		ChangePercent: rawChangePct,
		Source:        source,
		FetchedAt:     fetchedAt,
		LatencyMs:     latencyMs,
	}
}
