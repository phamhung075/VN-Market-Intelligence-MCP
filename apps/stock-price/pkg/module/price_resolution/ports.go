// Package price_resolution composes the three extracted primitives
// (price-quote-normalizer, tier-fallback-selector, price-staleness-classifier)
// into a single Resolve() entry point.
//
// Fence-B: imports ONLY pkg/primitive/* and stdlib (and the domain package).
// No SQLite driver, no infrastructure layer, no native extensions.
// Builds under CGO_ENABLED=0.
package price_resolution

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// TierFetcher is the port the module depends on.
// Infrastructure (Tier1, Tier2, Tier3) implements this; injected at composition root.
//
// The module never imports the infrastructure implementations — it only depends
// on this interface, which satisfies Fence-B.
type TierFetcher interface {
	FetchPrice(code string) (*domain.PriceQuote, error)
}
