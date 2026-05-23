// Package tierfallbackselector implements the tier-selection decision for the
// 3-tier price waterfall.
//
// Given an ordered slice of TierResult values (T1 at index 0, T2 at index 1,
// T3 at index 2), SelectWinningTier returns the first non-nil quote in T1→T2→T3
// order. If no tier produces a non-nil quote, it returns a PriceNotAvailableError.
//
// Extracted from domain/services.go L53–65 (the result-walk loop in
// ResolvePriceService.FetchPrice).
//
// Fence-A: imports ONLY the domain package and stdlib.
// Strictly no: SQLite driver, higher DDD layers, network calls.
// Builds under CGO_ENABLED=0.
package tierfallbackselector

import (
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// TierResult holds the outcome of a single tier fetch attempt.
// Quote is non-nil when the tier succeeded; Err is non-nil when the tier failed.
// Both may be non-nil (tier returned an error but the caller also captured a
// partial quote — rare; selector only inspects Quote for nil-ness).
type TierResult struct {
	Quote *domain.PriceQuote
	Err   error
}

// SelectWinningTier returns the first non-nil Quote from results in index order
// (index 0 = T1 primary, index 1 = T2, index 2 = T3).
//
// Decision rule: a tier "wins" when its Quote is non-nil — the Err field is not
// considered for winner selection (mirrors the original domain/services.go loop
// which only checked r.err == nil && r.quote != nil).
//
// Returns (*domain.PriceQuote, nil) when a winner is found.
// Returns (nil, *domain.PriceNotAvailableError{}) when all tiers have a nil Quote.
func SelectWinningTier(results []TierResult) (*domain.PriceQuote, error) {
	for _, r := range results {
		if r.Quote != nil {
			return r.Quote, nil
		}
	}
	return nil, &domain.PriceNotAvailableError{}
}
