// DEPRECATED — superseded by pkg/module/price_resolution (G5a, P2-F).
// Kept for history; excluded from compilation via build constraint.
// Do NOT import or instantiate. Archive only.
//
//go:build ignore

// Package domain — ResolvePriceService: 3-tier concurrent waterfall.
package domain

import "sync"

// ResolvePriceService runs 3 tiers concurrently and returns the first
// non-nil result in tier order (T1 > T2 > T3). If all tiers fail or
// return nil, PriceNotAvailableError is returned.
// Mirrors TS Promise.allSettled semantics: a tier panic/error does not
// abort the others.
type ResolvePriceService struct {
	tier1   PriceFetcherPort
	tier2   PriceFetcherPort
	tier3   PriceFetcherPort
	history PriceHistoryPort
}

// NewResolvePriceService constructs the service with injected ports.
func NewResolvePriceService(
	tier1, tier2, tier3 PriceFetcherPort,
	history PriceHistoryPort,
) *ResolvePriceService {
	return &ResolvePriceService{
		tier1:   tier1,
		tier2:   tier2,
		tier3:   tier3,
		history: history,
	}
}

type tierResult struct {
	quote *PriceQuote
	err   error
}

// FetchPrice runs all 3 tiers concurrently, returns first non-nil result
// in order T1→T2→T3. SaveQuote is called fire-and-forget on success.
func (s *ResolvePriceService) FetchPrice(code string) (*PriceQuote, error) {
	tiers := []PriceFetcherPort{s.tier1, s.tier2, s.tier3}
	results := make([]tierResult, 3)

	var wg sync.WaitGroup
	wg.Add(3)
	for i, t := range tiers {
		i, t := i, t
		go func() {
			defer wg.Done()
			q, err := t.FetchPrice(code)
			results[i] = tierResult{quote: q, err: err}
		}()
	}
	wg.Wait()

	for _, r := range results {
		if r.err == nil && r.quote != nil {
			quote := r.quote
			// fire-and-forget SaveQuote; write failure must not fail the request
			go func() {
				_ = s.history.SaveQuote(quote)
			}()
			return quote, nil
		}
	}

	return nil, &PriceNotAvailableError{Code: code}
}
