package tierfallbackselector_test

import (
	"errors"
	"testing"

	tierfallbackselector "github.com/vn-market-intelligence/stock-price/pkg/primitive/tier-fallback-selector"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

func ptrQ(q domain.PriceQuote) *domain.PriceQuote { return &q }
func ptrF(v float64) *float64                     { return &v }

func TestSelectWinningTier(t *testing.T) {
	t.Parallel()

	// DSI-INV-1: Change/ChangePercent are now *float64
	vcbHOSE := domain.PriceQuote{
		Code: "VCB", Price: 85000, Volume: 1000000, Change: ptrF(500),
		ChangePercent: ptrF(0.59), Source: domain.SourceHOSE,
		FetchedAt: "2026-05-24T00:53:00Z", LatencyMs: 42,
	}
	vcbHNX := domain.PriceQuote{
		Code: "VCB", Price: 85100, Volume: 950000, Change: ptrF(600),
		ChangePercent: ptrF(0.71), Source: domain.SourceHNX,
		FetchedAt: "2026-05-24T00:52:00Z", LatencyMs: 78,
	}
	vcbCache := domain.PriceQuote{
		Code: "VCB", Price: 84900, Volume: 0, Change: nil, // DSI-INV-1: nil = unavailable
		ChangePercent: nil, Source: domain.SourceCache,
		FetchedAt: "2026-05-23T00:00:00Z", LatencyMs: 0,
	}

	tests := []struct {
		name        string
		results     []tierfallbackselector.TierResult
		wantQuote   *domain.PriceQuote
		wantErrType *domain.PriceNotAvailableError
	}{
		{
			// AC-2 row 1: T1 wins - T1 non-nil, T2 and T3 also non-nil -> T1 returned
			name: "T1 wins when all tiers return a quote",
			results: []tierfallbackselector.TierResult{
				{Quote: ptrQ(vcbHOSE), Err: nil},
				{Quote: ptrQ(vcbHNX), Err: nil},
				{Quote: ptrQ(vcbCache), Err: nil},
			},
			wantQuote: ptrQ(vcbHOSE),
		},
		{
			// AC-2 row 2: T2 fallback - T1 nil, T2 non-nil -> T2 returned
			name: "T2 fallback when T1 fails",
			results: []tierfallbackselector.TierResult{
				{Quote: nil, Err: errors.New("connection timeout")},
				{Quote: ptrQ(vcbHNX), Err: nil},
				{Quote: nil, Err: errors.New("not evaluated")},
			},
			wantQuote: ptrQ(vcbHNX),
		},
		{
			// AC-2 row 3: T3 fallback - T1 nil, T2 nil, T3 non-nil -> T3 returned
			name: "T3 fallback when T1 and T2 both fail",
			results: []tierfallbackselector.TierResult{
				{Quote: nil, Err: errors.New("T1 timeout")},
				{Quote: nil, Err: errors.New("T2 rate limit")},
				{Quote: ptrQ(vcbCache), Err: nil},
			},
			wantQuote: ptrQ(vcbCache),
		},
		{
			// AC-2 row 4: All nil - all three tiers return nil quote (Err=nil) -> PriceNotAvailableError
			name: "all nil quotes with no errors returns PriceNotAvailableError",
			results: []tierfallbackselector.TierResult{
				{Quote: nil, Err: nil},
				{Quote: nil, Err: nil},
				{Quote: nil, Err: nil},
			},
			wantErrType: &domain.PriceNotAvailableError{},
		},
		{
			// AC-2 row 5: All errored - all three tiers return error (Err!=nil) -> PriceNotAvailableError
			name: "all errored returns PriceNotAvailableError",
			results: []tierfallbackselector.TierResult{
				{Quote: nil, Err: errors.New("T1 connection timeout")},
				{Quote: nil, Err: errors.New("T2 API rate limit")},
				{Quote: nil, Err: errors.New("T3 cache miss")},
			},
			wantErrType: &domain.PriceNotAvailableError{},
		},
		{
			// AC-2 row 6: Mixed nil + error - T1 nil+error, T2 nil, T3 non-nil -> T3 wins
			name: "T3 wins when T1 has error and T2 has nil quote with no error",
			results: []tierfallbackselector.TierResult{
				{Quote: nil, Err: errors.New("T1 error")},
				{Quote: nil, Err: nil},
				{Quote: ptrQ(vcbCache), Err: nil},
			},
			wantQuote: ptrQ(vcbCache),
		},
	}

	for _, tt := range tests {
		tt := tt // capture range variable
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotQuote, gotErr := tierfallbackselector.SelectWinningTier(tt.results)

			if tt.wantErrType != nil {
				// Expect a PriceNotAvailableError and nil quote.
				if gotQuote != nil {
					t.Errorf("SelectWinningTier() quote = %+v, want nil", gotQuote)
				}
				var pnaErr *domain.PriceNotAvailableError
				if !errors.As(gotErr, &pnaErr) {
					t.Errorf("SelectWinningTier() err = %v, want *domain.PriceNotAvailableError", gotErr)
				}
				return
			}

			// Expect a non-nil quote and nil error.
			if gotErr != nil {
				t.Errorf("SelectWinningTier() unexpected error: %v", gotErr)
			}
			if gotQuote == nil {
				t.Fatal("SelectWinningTier() returned nil quote, want non-nil")
			}
			// Compare fields individually since pointer fields need special handling
			if gotQuote.Code != tt.wantQuote.Code ||
				gotQuote.Price != tt.wantQuote.Price ||
				gotQuote.Volume != tt.wantQuote.Volume ||
				gotQuote.Source != tt.wantQuote.Source ||
				gotQuote.FetchedAt != tt.wantQuote.FetchedAt ||
				gotQuote.LatencyMs != tt.wantQuote.LatencyMs ||
				!floatPtrEqual(gotQuote.Change, tt.wantQuote.Change) ||
				!floatPtrEqual(gotQuote.ChangePercent, tt.wantQuote.ChangePercent) {
				t.Errorf("SelectWinningTier() =\n  got:  %+v\n  want: %+v", *gotQuote, *tt.wantQuote)
			}
		})
	}
}

// floatPtrEqual compares two *float64 - both nil or both non-nil with equal values.
func floatPtrEqual(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
