// Package price_resolution — PriceResolutionModule: composition of 3 primitives.
//
// Fence-B: imports ONLY pkg/primitive/* and stdlib.
// No SQLite driver, no infrastructure layer, no native extensions.
// Builds under CGO_ENABLED=0.
package price_resolution

import (
	"sync"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	pricestalenessclassifier "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-staleness-classifier"
	tierfallbackselector "github.com/vn-market-intelligence/stock-price/pkg/primitive/tier-fallback-selector"
)

// DefaultFreshThresholdSeconds is the default staleness freshness cutoff (60s).
const DefaultFreshThresholdSeconds = 60

// DefaultStaleThresholdSeconds is the default staleness expiry cutoff (3600s = 1h).
const DefaultStaleThresholdSeconds = 3600

// PriceResolutionModule composes the 3 extracted primitives.
//
// tier1, tier2, tier3 are injected TierFetcher ports; the module never
// imports their concrete implementations (Fence-B).
//
// Resolve() orchestration:
//  1. Call tier1.FetchPrice, tier2.FetchPrice, tier3.FetchPrice concurrently.
//  2. Build []TierResult.
//  3. Call tier-fallback-selector.SelectWinningTier() to pick the winner
//     (T1 wins if non-nil, else T2, else T3).
//  4. Call price-staleness-classifier.ClassifyStaleness() on the winning
//     quote's FetchedAt to annotate staleness (pure annotation — does not
//     affect tier-selection order).
//  5. Return a copy of the winning PriceQuote with the Staleness field set.
type PriceResolutionModule struct {
	tier1 TierFetcher
	tier2 TierFetcher
	tier3 TierFetcher

	// Staleness thresholds — configurable; zero means use defaults.
	freshThresholdSeconds int
	staleThresholdSeconds int
}

// New creates a new PriceResolutionModule with 3 injected TierFetchers and
// default staleness thresholds (60s fresh, 3600s stale→expired boundary).
func New(tier1, tier2, tier3 TierFetcher) *PriceResolutionModule {
	return &PriceResolutionModule{
		tier1:                 tier1,
		tier2:                 tier2,
		tier3:                 tier3,
		freshThresholdSeconds: DefaultFreshThresholdSeconds,
		staleThresholdSeconds: DefaultStaleThresholdSeconds,
	}
}

// NewWithThresholds creates a PriceResolutionModule with custom staleness thresholds.
// Useful for tests that want deterministic staleness classification without
// relying on wall-clock absolute timestamps.
func NewWithThresholds(tier1, tier2, tier3 TierFetcher, freshSeconds, staleSeconds int) *PriceResolutionModule {
	return &PriceResolutionModule{
		tier1:                 tier1,
		tier2:                 tier2,
		tier3:                 tier3,
		freshThresholdSeconds: freshSeconds,
		staleThresholdSeconds: staleSeconds,
	}
}

// ResolvedQuote is a domain.PriceQuote extended with a staleness annotation.
// It is returned by Resolve() and consumed by sandbox scenario assertions.
type ResolvedQuote struct {
	domain.PriceQuote
	Staleness string // "FRESH" | "STALE" | "EXPIRED" | "" (parse error — quote still returned)
}

// Resolve implements the 3-tier fallback with staleness annotation.
//
// It fires all 3 tier fetches concurrently (mirroring domain.ResolvePriceService),
// selects the winning tier via tier-fallback-selector, and annotates the winning
// quote with a staleness label via price-staleness-classifier.
//
// Staleness annotation is best-effort: if the winning quote's FetchedAt is
// unparseable, Staleness is set to "" and the quote is still returned (no error).
func (m *PriceResolutionModule) Resolve(code string) (*ResolvedQuote, error) {
	tiers := []TierFetcher{m.tier1, m.tier2, m.tier3}
	fetched := make([]tierfallbackselector.TierResult, 3)

	var wg sync.WaitGroup
	wg.Add(3)
	for i, t := range tiers {
		i, t := i, t
		go func() {
			defer wg.Done()
			q, err := t.FetchPrice(code)
			fetched[i] = tierfallbackselector.TierResult{Quote: q, Err: err}
		}()
	}
	wg.Wait()

	// Tier-selection via primitive: T1 wins if non-nil, else T2, else T3.
	winner, err := tierfallbackselector.SelectWinningTier(fetched)
	if err != nil {
		// All tiers failed — propagate the PriceNotAvailableError.
		return nil, err
	}

	// Make a copy of the winner so we don't mutate the pointer returned by infra.
	rq := &ResolvedQuote{PriceQuote: *winner}

	// Staleness annotation via primitive — best-effort (annotation only).
	label, classifyErr := pricestalenessclassifier.ClassifyStaleness(
		winner.FetchedAt,
		time.Now(),
		m.freshThresholdSeconds,
		m.staleThresholdSeconds,
	)
	if classifyErr == nil {
		rq.Staleness = string(label)
	}
	// classifyErr ignored: unparseable FetchedAt → Staleness stays "" (not a fatal error).

	return rq, nil
}
