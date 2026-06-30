// Package application — Foreign Accumulation Rank use case.
package application

import (
	"os"
	"strings"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// ForeignAccumUseCase orchestrates foreign accumulation rank computation.
type ForeignAccumUseCase struct {
	service *domain.ForeignAccumService
}

// NewForeignAccumUseCase constructs the use case.
func NewForeignAccumUseCase(service *domain.ForeignAccumService) *ForeignAccumUseCase {
	return &ForeignAccumUseCase{service: service}
}

// Execute computes foreign accumulation rank.
// If req.Codes is empty, reads from WATCHLIST_TICKERS env var.
func (uc *ForeignAccumUseCase) Execute(req ForeignAccumRequest) (*ForeignAccumResponse, error) {
	codes := req.Codes
	if len(codes) == 0 {
		// Read from WATCHLIST_TICKERS env var
		watchlist := os.Getenv("WATCHLIST_TICKERS")
		if watchlist != "" {
			codes = strings.Split(watchlist, ",")
			for i := range codes {
				codes[i] = strings.TrimSpace(codes[i])
			}
		}
	}

	if len(codes) == 0 {
		// No codes to process — return empty result
		return &ForeignAccumResponse{
			Tickers:  []ForeignAccumTickerDTO{},
			ADTVUnit: "shares",
		}, nil
	}

	// Uppercase all codes for consistency
	for i := range codes {
		codes[i] = strings.ToUpper(codes[i])
	}

	result, err := uc.service.ComputeRank(codes)
	if err != nil {
		return nil, err
	}

	// Map domain result to DTO
	tickers := make([]ForeignAccumTickerDTO, 0, len(result.Tickers))
	for _, t := range result.Tickers {
		dto := ForeignAccumTickerDTO{
			Code:                    t.Code,
			NetFlow5dRaw:            t.NetFlow5dRaw,
			NetFlow20dRaw:           t.NetFlow20dRaw,
			CumNetFlow5dNormalized:  t.CumNetFlow5dNormalized,
			CumNetFlow20dNormalized: t.CumNetFlow20dNormalized,
			ZScore5d:                t.ZScore5d,
			Rank:                    t.Rank,
			Label:                   t.Label,
			RoomExhaustion:          t.RoomExhaustion,
			NullReason:              t.NullReason,
			NullReason20d:           t.NullReason20d,
			NullReasonRoom:          t.NullReasonRoom,
			NullReasonZScore:        t.NullReasonZScore,
			NullReasonNormalize:     t.NullReasonNormalize,
		}
		tickers = append(tickers, dto)
	}

	return &ForeignAccumResponse{
		Tickers:             tickers,
		ADTVUnit:            result.ADTVUnit,
		ComputedAsOf:        result.ComputedAsOf,
		ForeignAccumZMarket: result.ForeignAccumZMarket,
	}, nil
}
