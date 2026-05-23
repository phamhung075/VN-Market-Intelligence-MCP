package pricequotenormalizer_test

import (
	"testing"

	pricequotenormalizer "github.com/vn-market-intelligence/stock-price/pkg/primitive/price-quote-normalizer"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

func TestNormalizeQuote(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		rawPrice     float64
		rawVolume    float64
		rawChange    float64
		rawChangePct float64
		code         string
		source       domain.PriceSource
		fetchedAt    string
		latencyMs    int64
		want         domain.PriceQuote
	}{
		{
			// AC-2 row 1: Happy path — VCB HOSE real quote
			name:         "VCB HOSE happy path",
			rawPrice:     85000,
			rawVolume:    1000000,
			rawChange:    500,
			rawChangePct: 0.59,
			code:         "VCB",
			source:       domain.SourceHOSE,
			fetchedAt:    "2026-05-24T10:30:00Z",
			latencyMs:    150,
			want: domain.PriceQuote{
				Code:          "VCB",
				Price:         85000,
				Volume:        1000000,
				Change:        500,
				ChangePercent: 0.59,
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
			rawChange:    -100,
			rawChangePct: -0.20,
			code:         "HNX_TICKER",
			source:       domain.SourceHNX,
			fetchedAt:    "2026-05-24T10:31:00Z",
			latencyMs:    200,
			want: domain.PriceQuote{
				Code:          "HNX_TICKER",
				Price:         50000,
				Volume:        500000,
				Change:        -100,
				ChangePercent: -0.20,
				Source:        domain.SourceHNX,
				FetchedAt:     "2026-05-24T10:31:00Z",
				LatencyMs:     200,
			},
		},
		{
			// AC-2 row 3: Cache price — zero change / changePct
			name:         "cache price zero change",
			rawPrice:     75000,
			rawVolume:    0,
			rawChange:    0,
			rawChangePct: 0,
			code:         "ACB",
			source:       domain.SourceCache,
			fetchedAt:    "2026-05-24T09:00:00Z",
			latencyMs:    0,
			want: domain.PriceQuote{
				Code:          "ACB",
				Price:         75000,
				Volume:        0,
				Change:        0,
				ChangePercent: 0,
				Source:        domain.SourceCache,
				FetchedAt:     "2026-05-24T09:00:00Z",
				LatencyMs:     0,
			},
		},
		{
			// AC-2 row 4: Zero volume edge case — quote has price + change but no volume
			name:         "zero volume edge case",
			rawPrice:     60000,
			rawVolume:    0,
			rawChange:    150,
			rawChangePct: 0.25,
			code:         "BID",
			source:       domain.SourceHOSE,
			fetchedAt:    "2026-05-24T10:32:00Z",
			latencyMs:    300,
			want: domain.PriceQuote{
				Code:          "BID",
				Price:         60000,
				Volume:        0,
				Change:        150,
				ChangePercent: 0.25,
				Source:        domain.SourceHOSE,
				FetchedAt:     "2026-05-24T10:32:00Z",
				LatencyMs:     300,
			},
		},
		{
			// AC-2 row 5: Empty code edge case — primitive passes it through (caller validates)
			name:         "empty code passes through",
			rawPrice:     70000,
			rawVolume:    1000,
			rawChange:    0,
			rawChangePct: 0,
			code:         "",
			source:       domain.SourceHNX,
			fetchedAt:    "2026-05-24T10:15:00Z",
			latencyMs:    200,
			want: domain.PriceQuote{
				Code:          "",
				Price:         70000,
				Volume:        1000,
				Change:        0,
				ChangePercent: 0,
				Source:        domain.SourceHNX,
				FetchedAt:     "2026-05-24T10:15:00Z",
				LatencyMs:     200,
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
			if got != tt.want {
				t.Errorf("NormalizeQuote() =\n  got:  %+v\n  want: %+v", got, tt.want)
			}
		})
	}
}
