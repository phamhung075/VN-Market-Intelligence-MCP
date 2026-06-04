package pricequotenormalizer_test

import (
	"testing"

	pricequotenormalizer "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-quote-normalizer"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// ptr returns a pointer to v. Helper to create *float64 values inline.
func ptr(v float64) *float64 { return &v }

func TestNormalizeQuote(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		rawPrice     float64
		rawVolume    float64
		rawChange    *float64 // DSI-INV-1: pointer for null handling
		rawChangePct *float64 // DSI-INV-1: pointer for null handling
		code         string
		source       domain.PriceSource
		fetchedAt    string
		latencyMs    int64
		want         domain.PriceQuote
	}{
		{
			// AC-2 row 1: Happy path - VCB HOSE real quote
			name:         "VCB HOSE happy path",
			rawPrice:     85000,
			rawVolume:    1000000,
			rawChange:    ptr(500),
			rawChangePct: ptr(0.59),
			code:         "VCB",
			source:       domain.SourceHOSE,
			fetchedAt:    "2026-05-24T10:30:00Z",
			latencyMs:    150,
			want: domain.PriceQuote{
				Code:          "VCB",
				Price:         85000,
				Volume:        1000000,
				Change:        ptr(500),
				ChangePercent: ptr(0.59),
				Source:        domain.SourceHOSE,
				FetchedAt:     "2026-05-24T10:30:00Z",
				LatencyMs:     150,
			},
		},
		{
			// AC-2 row 2: HNX price with different field names (negative change)
			name:         "HNX price with negative change",
			rawPrice:     50000,
			rawVolume:    500000,
			rawChange:    ptr(-100),
			rawChangePct: ptr(-0.20),
			code:         "HNX_TICKER",
			source:       domain.SourceHNX,
			fetchedAt:    "2026-05-24T10:31:00Z",
			latencyMs:    200,
			want: domain.PriceQuote{
				Code:          "HNX_TICKER",
				Price:         50000,
				Volume:        500000,
				Change:        ptr(-100),
				ChangePercent: ptr(-0.20),
				Source:        domain.SourceHNX,
				FetchedAt:     "2026-05-24T10:31:00Z",
				LatencyMs:     200,
			},
		},
		{
			// AC-2 row 3: Cache price - nil change (unavailable) DSI-INV-1
			name:         "cache price nil change unavailable",
			rawPrice:     75000,
			rawVolume:    0,
			rawChange:    nil, // DSI-INV-1: unavailable from cache
			rawChangePct: nil, // DSI-INV-1: unavailable from cache
			code:         "ACB",
			source:       domain.SourceCache,
			fetchedAt:    "2026-05-24T09:00:00Z",
			latencyMs:    0,
			want: domain.PriceQuote{
				Code:          "ACB",
				Price:         75000,
				Volume:        0,
				Change:        nil,
				ChangePercent: nil,
				Source:        domain.SourceCache,
				FetchedAt:     "2026-05-24T09:00:00Z",
				LatencyMs:     0,
			},
		},
		{
			// AC-2 row 4: Zero volume edge case - quote has price + change but no volume
			name:         "zero volume edge case",
			rawPrice:     60000,
			rawVolume:    0,
			rawChange:    ptr(150),
			rawChangePct: ptr(0.25),
			code:         "BID",
			source:       domain.SourceHOSE,
			fetchedAt:    "2026-05-24T10:32:00Z",
			latencyMs:    300,
			want: domain.PriceQuote{
				Code:          "BID",
				Price:         60000,
				Volume:        0,
				Change:        ptr(150),
				ChangePercent: ptr(0.25),
				Source:        domain.SourceHOSE,
				FetchedAt:     "2026-05-24T10:32:00Z",
				LatencyMs:     300,
			},
		},
		{
			// AC-2 row 5: Empty code edge case - primitive passes it through (caller validates)
			name:         "empty code passes through",
			rawPrice:     70000,
			rawVolume:    1000,
			rawChange:    ptr(0), // genuine flat day
			rawChangePct: ptr(0), // genuine flat day
			code:         "",
			source:       domain.SourceHNX,
			fetchedAt:    "2026-05-24T10:15:00Z",
			latencyMs:    200,
			want: domain.PriceQuote{
				Code:          "",
				Price:         70000,
				Volume:        1000,
				Change:        ptr(0),
				ChangePercent: ptr(0),
				Source:        domain.SourceHNX,
				FetchedAt:     "2026-05-24T10:15:00Z",
				LatencyMs:     200,
			},
		},
		{
			// DSI-INV-1 AC-PRICE-4: Real zero preserved (genuine flat day)
			name:         "real zero preserved genuine flat day",
			rawPrice:     88000,
			rawVolume:    2000000,
			rawChange:    ptr(0.0), // genuine flat day - 0 is a valid value
			rawChangePct: ptr(0.0),
			code:         "VCB",
			source:       domain.SourceHOSE,
			fetchedAt:    "2026-05-24T10:30:00Z",
			latencyMs:    45,
			want: domain.PriceQuote{
				Code:          "VCB",
				Price:         88000,
				Volume:        2000000,
				Change:        ptr(0.0),
				ChangePercent: ptr(0.0),
				Source:        domain.SourceHOSE,
				FetchedAt:     "2026-05-24T10:30:00Z",
				LatencyMs:     45,
			},
		},
	}

	for _, tt := range tests {
		tt := tt // capture range variable
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := pricequotenormalizer.NormalizeQuote(
				tt.rawPrice, tt.rawVolume, tt.rawChange, tt.rawChangePct,
				tt.code,
				tt.source,
				tt.fetchedAt,
				tt.latencyMs,
			)
			// Compare non-pointer fields directly
			if got.Code != tt.want.Code {
				t.Errorf("Code: got=%q want=%q", got.Code, tt.want.Code)
			}
			if got.Price != tt.want.Price {
				t.Errorf("Price: got=%v want=%v", got.Price, tt.want.Price)
			}
			if got.Volume != tt.want.Volume {
				t.Errorf("Volume: got=%v want=%v", got.Volume, tt.want.Volume)
			}
			// DSI-INV-1: compare pointer fields
			if !floatPtrEqual(got.Change, tt.want.Change) {
				t.Errorf("Change: got=%v want=%v", ptrStr(got.Change), ptrStr(tt.want.Change))
			}
			if !floatPtrEqual(got.ChangePercent, tt.want.ChangePercent) {
				t.Errorf("ChangePercent: got=%v want=%v", ptrStr(got.ChangePercent), ptrStr(tt.want.ChangePercent))
			}
			if got.Source != tt.want.Source {
				t.Errorf("Source: got=%q want=%q", got.Source, tt.want.Source)
			}
			if got.FetchedAt != tt.want.FetchedAt {
				t.Errorf("FetchedAt: got=%q want=%q", got.FetchedAt, tt.want.FetchedAt)
			}
			if got.LatencyMs != tt.want.LatencyMs {
				t.Errorf("LatencyMs: got=%v want=%v", got.LatencyMs, tt.want.LatencyMs)
			}
		})
	}
}

// floatPtrEqual compares two *float64 pointers - both nil or both non-nil with equal values.
func floatPtrEqual(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// ptrStr formats a *float64 for error messages.
func ptrStr(p *float64) string {
	if p == nil {
		return "nil"
	}
	return string(rune(*p))
}
