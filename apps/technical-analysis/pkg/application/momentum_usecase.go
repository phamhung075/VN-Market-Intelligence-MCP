// Package application — ComputeROCMomentumUseCase orchestrates IND-P1-ROC-MOMENTUM.
// Reads WATCHLIST_TICKERS env var; fetches multi-ticker bars; delegates to domain service.
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// MultiTickerRepo is the port for fetching multi-ticker OHLCV bars.
type MultiTickerRepo interface {
	GetMultiTickerCandles(codes []string, limit int) (map[string][]domain.OHLCVBar, error)
}

// MomentumSvc is the port for cross-sectional ROC momentum calculation.
type MomentumSvc interface {
	ComputeCrossSection(allBars map[string][]domain.OHLCVBar, tickers []string) domain.CrossSectionalROCResult
}

// ComputeROCMomentumUseCase orchestrates the full ROC momentum computation.
type ComputeROCMomentumUseCase struct {
	repo      MultiTickerRepo
	svc       MomentumSvc
	watchlist []string
}

// NewComputeROCMomentumUseCase constructs the use case.
// watchlist is loaded from WATCHLIST_TICKERS env at composition root startup.
func NewComputeROCMomentumUseCase(repo MultiTickerRepo, svc MomentumSvc, watchlist []string) *ComputeROCMomentumUseCase {
	return &ComputeROCMomentumUseCase{repo: repo, svc: svc, watchlist: watchlist}
}

// Execute computes cross-sectional ROC momentum for all watchlist tickers.
// Limit = 300 bars per ticker (>= minBarsROC=273).
func (uc *ComputeROCMomentumUseCase) Execute(_ context.Context, req ROCMomentumRequest) (ROCMomentumResponse, error) {
	tickers := req.Tickers
	if len(tickers) == 0 {
		tickers = uc.watchlist
	}

	allBars, err := uc.repo.GetMultiTickerCandles(tickers, 300)
	if err != nil {
		return ROCMomentumResponse{}, fmt.Errorf("GetMultiTickerCandles: %w", err)
	}

	domainResult := uc.svc.ComputeCrossSection(allBars, tickers)
	return mapROCResponse(domainResult), nil
}

// mapROCResponse maps domain CrossSectionalROCResult to application DTO.
func mapROCResponse(r domain.CrossSectionalROCResult) ROCMomentumResponse {
	tickerDTOs := make([]ROCPerTickerDTO, len(r.Tickers))
	for i, t := range r.Tickers {
		var lbl *string
		if t.Label != nil {
			s := string(*t.Label)
			lbl = &s
		}
		tickerDTOs[i] = ROCPerTickerDTO{
			Code:       t.Code,
			ROC:        t.ROC,
			ZScore:     t.ZScore,
			Decile:     t.Decile,
			Label:      lbl,
			NullReason: t.NullReason,
		}
	}

	bucketDTOs := make([]FactorReturnBucketDTO, len(r.FactorReturnBuckets))
	for i, b := range r.FactorReturnBuckets {
		bucketDTOs[i] = FactorReturnBucketDTO{
			Decile:            b.Decile,
			AvgRealizedReturn: b.AvgRealizedReturn,
			TickerCount:       b.TickerCount,
		}
	}

	return ROCMomentumResponse{
		Tickers:             tickerDTOs,
		FactorReturnBuckets: bucketDTOs,
		MomentumFactorZ:     r.MomentumFactorZ,
		NullReason:          r.NullReason,
	}
}
