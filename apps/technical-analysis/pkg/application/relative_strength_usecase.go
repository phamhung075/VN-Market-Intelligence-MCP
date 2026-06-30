// Package application — ComputeRelativeStrengthUseCase orchestrates IND-P1-RELATIVE-STRENGTH.
// Prepends VNINDEX to the codes fetched so the domain service has index bars.
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// RSService is the port for cross-sectional relative strength calculation.
type RSService interface {
	ComputeCrossSection(allBars map[string][]domain.OHLCVBar, tickers []string) domain.RelativeStrengthCrossSection
}

// vnIndexFetchCode is the code used to fetch VNINDEX bars from daily_ohlcv (ARCH-RATIFY-RS-1).
const vnIndexFetchCode = "VNINDEX"

// ComputeRelativeStrengthUseCase orchestrates the full relative strength computation.
type ComputeRelativeStrengthUseCase struct {
	repo      MultiTickerRepo // reuses the same MultiTickerRepo port from momentum
	svc       RSService
	watchlist []string
}

// NewComputeRelativeStrengthUseCase constructs the use case.
func NewComputeRelativeStrengthUseCase(repo MultiTickerRepo, svc RSService, watchlist []string) *ComputeRelativeStrengthUseCase {
	return &ComputeRelativeStrengthUseCase{repo: repo, svc: svc, watchlist: watchlist}
}

// Execute computes cross-sectional RS for all watchlist tickers vs VNINDEX.
// VNINDEX is always prepended to the fetch list so the domain service has index bars.
// Limit = 260 bars per ticker (>= horizonBars252=252).
func (uc *ComputeRelativeStrengthUseCase) Execute(_ context.Context, req RSRequest) (RSResponse, error) {
	tickers := req.Tickers
	if len(tickers) == 0 {
		tickers = uc.watchlist
	}

	// Prepend VNINDEX to ensure it is always fetched (domain RS-1 contract).
	fetchCodes := prependVNINDEX(tickers)

	allBars, err := uc.repo.GetMultiTickerCandles(fetchCodes, 260)
	if err != nil {
		return RSResponse{}, fmt.Errorf("GetMultiTickerCandles: %w", err)
	}

	// Domain service uses tickers (without VNINDEX) as the cross-section population.
	domainResult := uc.svc.ComputeCrossSection(allBars, tickers)
	return mapRSResponse(domainResult), nil
}

// prependVNINDEX returns a new slice with VNINDEX prepended (deduplicates if already present).
func prependVNINDEX(tickers []string) []string {
	for _, t := range tickers {
		if t == vnIndexFetchCode {
			return tickers // already present
		}
	}
	result := make([]string, 0, len(tickers)+1)
	result = append(result, vnIndexFetchCode)
	result = append(result, tickers...)
	return result
}

// mapRSResponse maps domain RelativeStrengthCrossSection to application DTO.
func mapRSResponse(r domain.RelativeStrengthCrossSection) RSResponse {
	tickerDTOs := make([]RSPerTickerDTO, len(r.Tickers))
	for i, t := range r.Tickers {
		tickerDTOs[i] = RSPerTickerDTO{
			Code:           t.Code,
			H63:            mapHorizonDTO(t.H63),
			H126:           mapHorizonDTO(t.H126),
			H252:           mapHorizonDTO(t.H252),
			CompositeScore: t.CompositeScore,
			CompositeLabel: labelPtr(t.CompositeLabel),
			NullReason:     t.NullReason,
		}
	}
	return RSResponse{
		Tickers:           tickerDTOs,
		MarketRSComposite: r.MarketRSComposite,
		LowSampleWarning:  r.LowSampleWarning,
		NullReason:        r.NullReason,
	}
}

func mapHorizonDTO(h domain.RSHorizonResult) RSHorizonDTO {
	var lbl *string
	if h.Label != nil {
		s := string(*h.Label)
		lbl = &s
	}
	return RSHorizonDTO{
		Horizon:    h.Horizon,
		RS:         h.RS,
		Percentile: h.Percentile,
		Label:      lbl,
		NullReason: h.NullReason,
	}
}

// labelPtr converts a *RSCompositeLabel to *string.
func labelPtr(l *domain.RSCompositeLabel) *string {
	if l == nil {
		return nil
	}
	s := string(*l)
	return &s
}
