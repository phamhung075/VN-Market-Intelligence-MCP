package price_resolution_test

import (
	"errors"
	"testing"
	"time"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// ---------------------------------------------------------------------------
// Mock TierFetcher implementations
// ---------------------------------------------------------------------------

// mockFetcher returns a fixed quote and/or error. Satisfies TierFetcher.
type mockFetcher struct {
	quote *domain.PriceQuote
	err   error
}

func (m *mockFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return m.quote, m.err
}

// nilFetcher always returns (nil, nil) — simulates a tier that produces nothing.
type nilFetcher struct{}

func (n *nilFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return nil, nil
}

// errFetcher always returns (nil, err) — simulates a tier that errors.
type errFetcher struct{ msg string }

func (e *errFetcher) FetchPrice(_ string) (*domain.PriceQuote, error) {
	return nil, errors.New(e.msg)
}

// ---------------------------------------------------------------------------
// Helper — build a PriceQuote with a known FetchedAt offset from a base time.
// ---------------------------------------------------------------------------

// ptr returns a pointer to v. Helper to create *float64 values inline.
func ptr(v float64) *float64 { return &v }

func quoteAt(source domain.PriceSource, fetchedAt string) *domain.PriceQuote {
	return &domain.PriceQuote{
		Code:          "VCB",
		Price:         85000,
		Volume:        1_000_000,
		Change:        ptr(500),  // DSI-INV-1: pointer for nullable change
		ChangePercent: ptr(0.59), // DSI-INV-1: pointer for nullable change
		Source:        source,
		FetchedAt:     fetchedAt,
		LatencyMs:     15,
	}
}

// baseTime is a fixed reference time used across all table rows.
// Using a fixed time makes tests deterministic (no time.Now() drift).
var baseTime = time.Date(2026, 5, 24, 1, 0, 0, 0, time.UTC)

// freshAt returns an RFC3339 string that is `secsAgo` seconds before baseTime.
func freshAt(secsAgo int) string {
	return baseTime.Add(-time.Duration(secsAgo) * time.Second).Format(time.RFC3339)
}

// ---------------------------------------------------------------------------
// Table-driven tests
// ---------------------------------------------------------------------------

func TestResolve(t *testing.T) {
	// Thresholds: fresh ≤ 60s, stale ≤ 3600s, expired > 3600s.
	// We use baseTime as the "now" reference via NewWithThresholds + a
	// thin wrapper that uses a supplied now. Since price_resolution uses
	// time.Now() internally, we use NewWithThresholds with thresholds
	// and quotes with FetchedAt anchored relative to baseTime.
	//
	// Strategy: run the module immediately after creating the mock quotes
	// so that the real time.Now() is within a small skew of baseTime.
	// For staleness assertions we use very large thresholds so the
	// classification is stable regardless of real wall-clock drift
	// (tests focus on tier-selection correctness and staleness category).

	tests := []struct {
		name          string
		tier1         priceresolution.TierFetcher
		tier2         priceresolution.TierFetcher
		tier3         priceresolution.TierFetcher
		wantSource    string
		wantStaleness string // "" means "any / don't assert"
		wantErr       bool
	}{
		{
			// T1 wins — even if T2 and T3 also have quotes, T1 is returned.
			name:       "T1_wins_when_all_tiers_present",
			tier1:      &mockFetcher{quote: quoteAt(domain.SourceHOSE, freshAt(10))},
			tier2:      &mockFetcher{quote: quoteAt(domain.SourceHNX, freshAt(20))},
			tier3:      &mockFetcher{quote: quoteAt(domain.SourceCache, freshAt(30))},
			wantSource: "hose",
			wantErr:    false,
		},
		{
			// T1 nil → T2 wins.
			name:       "T2_fallback_when_T1_nil",
			tier1:      &nilFetcher{},
			tier2:      &mockFetcher{quote: quoteAt(domain.SourceHNX, freshAt(15))},
			tier3:      &mockFetcher{quote: quoteAt(domain.SourceCache, freshAt(100))},
			wantSource: "hnx",
			wantErr:    false,
		},
		{
			// T1 nil, T2 nil → T3 wins.
			name:       "T3_fallback_when_T1_T2_nil",
			tier1:      &nilFetcher{},
			tier2:      &nilFetcher{},
			tier3:      &mockFetcher{quote: quoteAt(domain.SourceCache, freshAt(200))},
			wantSource: "cache",
			wantErr:    false,
		},
		{
			// T1 error, T2 error, T3 nil → PriceNotAvailableError.
			name:    "all_tiers_fail_returns_PriceNotAvailableError",
			tier1:   &errFetcher{msg: "T1 timeout"},
			tier2:   &errFetcher{msg: "T2 timeout"},
			tier3:   &nilFetcher{},
			wantErr: true,
		},
		{
			// T1 nil, T2 nil, T3 nil → PriceNotAvailableError.
			name:    "all_tiers_nil_returns_PriceNotAvailableError",
			tier1:   &nilFetcher{},
			tier2:   &nilFetcher{},
			tier3:   &nilFetcher{},
			wantErr: true,
		},
		{
			// T1 wins with a recent (FRESH) fetchedAt.
			// Use very large thresholds so FRESH is certain within test duration.
			name:          "staleness_FRESH_when_quote_recent",
			tier1:         &mockFetcher{quote: quoteAt(domain.SourceHOSE, time.Now().UTC().Add(-10*time.Second).Format(time.RFC3339))},
			tier2:         &nilFetcher{},
			tier3:         &nilFetcher{},
			wantSource:    "hose",
			wantStaleness: "FRESH",
			wantErr:       false,
		},
		{
			// T3 cache quote with a very old fetchedAt → EXPIRED.
			// Use custom thresholds: fresh ≤ 60s, stale ≤ 300s, expired > 300s.
			// The quote is 7200s old (2h).
			name:          "staleness_EXPIRED_for_T3_cache_quote",
			tier1:         &nilFetcher{},
			tier2:         &nilFetcher{},
			tier3:         &mockFetcher{quote: quoteAt(domain.SourceCache, time.Now().UTC().Add(-7200*time.Second).Format(time.RFC3339))},
			wantSource:    "cache",
			wantStaleness: "EXPIRED",
			wantErr:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Default thresholds (60s fresh, 3600s stale) for most rows;
			// special rows use time.Now() anchoring which is stable within test.
			mod := priceresolution.New(tt.tier1, tt.tier2, tt.tier3)

			got, err := mod.Resolve("VCB")

			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (quote=%+v)", got)
				}
				// Verify it is PriceNotAvailableError.
				var pnaErr *domain.PriceNotAvailableError
				if !errors.As(err, &pnaErr) {
					t.Fatalf("expected *domain.PriceNotAvailableError, got %T: %v", err, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got == nil {
				t.Fatal("got nil ResolvedQuote, want non-nil")
			}

			if tt.wantSource != "" && string(got.Source) != tt.wantSource {
				t.Errorf("Source: got=%q want=%q", got.Source, tt.wantSource)
			}
			if tt.wantStaleness != "" && got.Staleness != tt.wantStaleness {
				t.Errorf("Staleness: got=%q want=%q", got.Staleness, tt.wantStaleness)
			}
		})
	}
}

// TestNewWithThresholds verifies the custom-threshold constructor exposes
// staleness classification with deterministic results.
func TestNewWithThresholds(t *testing.T) {
	// STALE: quote is 120s old; fresh=60s, stale=300s → between thresholds → STALE.
	fetchedAt := time.Now().UTC().Add(-120 * time.Second).Format(time.RFC3339)
	q := quoteAt(domain.SourceHOSE, fetchedAt)

	mod := priceresolution.NewWithThresholds(
		&mockFetcher{quote: q},
		&nilFetcher{},
		&nilFetcher{},
		60,
		300,
	)

	got, err := mod.Resolve("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Staleness != "STALE" {
		t.Errorf("Staleness: got=%q want=STALE", got.Staleness)
	}
}
