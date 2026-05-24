// Package pricestalenessclassifier classifies the freshness of a cached price
// quote based on its fetchedAt RFC3339 timestamp relative to caller-supplied
// thresholds.
//
// Decision rule:
//
//	age = now − fetchedAt
//	age ≤ freshThresholdSeconds  →  FRESH
//	age ≤ staleThresholdSeconds  →  STALE
//	age >  staleThresholdSeconds →  EXPIRED
//
// This formalises an implicit contract that previously lived in the domain
// service layer: a T3 cache quote is annotated with a staleness label so that
// callers can surface data-quality signals without changing tier-selection
// logic (T1 still wins by tier order even when marked stale).
//
// Fence-A: imports ONLY stdlib (time, fmt).
// Strictly no: SQLite driver, higher DDD layers, network calls, CGO.
// Builds under CGO_ENABLED=0.
package pricestalenessclassifier

import (
	"fmt"
	"time"
)

// StalenessLabel is the freshness classification of a cached price quote.
type StalenessLabel string

const (
	// Fresh indicates the quote was fetched within freshThresholdSeconds.
	Fresh StalenessLabel = "FRESH"

	// Stale indicates the quote age is between freshThresholdSeconds and
	// staleThresholdSeconds.
	Stale StalenessLabel = "STALE"

	// Expired indicates the quote age exceeds staleThresholdSeconds.
	Expired StalenessLabel = "EXPIRED"
)

// ClassifyStaleness parses fetchedAt as an RFC3339 timestamp and classifies the
// quote's freshness relative to now.
//
// Parameters:
//   - fetchedAt             — RFC3339 timestamp string (e.g. "2026-05-24T01:00:00Z")
//   - now                   — reference time supplied by the caller (no time.Now() side-effect here)
//   - freshThresholdSeconds — age in seconds within which the quote is FRESH (inclusive)
//   - staleThresholdSeconds — age in seconds beyond which the quote is EXPIRED (exclusive upper bound is > threshold)
//
// Returns (StalenessLabel, nil) on success.
// Returns ("", error) when fetchedAt cannot be parsed as RFC3339.
func ClassifyStaleness(
	fetchedAt string,
	now time.Time,
	freshThresholdSeconds int,
	staleThresholdSeconds int,
) (StalenessLabel, error) {
	t, err := time.Parse(time.RFC3339, fetchedAt)
	if err != nil {
		return "", fmt.Errorf("ClassifyStaleness: parse fetchedAt %q: %w", fetchedAt, err)
	}

	age := now.Sub(t)
	freshCutoff := time.Duration(freshThresholdSeconds) * time.Second
	staleCutoff := time.Duration(staleThresholdSeconds) * time.Second

	switch {
	case age <= freshCutoff:
		return Stale, nil
	case age <= staleCutoff:
		return Stale, nil
	default:
		return Expired, nil
	}
}
