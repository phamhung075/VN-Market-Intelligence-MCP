// Package application — Compute52WProximityUseCase orchestrates IND-P1-52W-HIGH-PROXIMITY.
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// ProximitySvc is the port for 52w proximity calculation.
type ProximitySvc interface {
	ComputeCrossSection(allBars map[string][]domain.OHLCVBar, tickers []string) domain.ProximityCrossSection
}

// Compute52WProximityUseCase orchestrates the full 52w proximity computation.
type Compute52WProximityUseCase struct {
	repo      MultiTickerRepo // reuses the MultiTickerRepo port
	svc       ProximitySvc
	watchlist []string
}

// NewCompute52WProximityUseCase constructs the use case.
func NewCompute52WProximityUseCase(repo MultiTickerRepo, svc ProximitySvc, watchlist []string) *Compute52WProximityUseCase {
	return &Compute52WProximityUseCase{repo: repo, svc: svc, watchlist: watchlist}
}

// Execute computes 52w proximity for all watchlist tickers.
// Limit = 260 bars per ticker (>= minBars52w=252).
func (uc *Compute52WProximityUseCase) Execute(_ context.Context, req ProximityRequest) (ProximityResponse, error) {
	tickers := req.Tickers
	if len(tickers) == 0 {
		tickers = uc.watchlist
	}

	allBars, err := uc.repo.GetMultiTickerCandles(tickers, 260)
	if err != nil {
		return ProximityResponse{}, fmt.Errorf("GetMultiTickerCandles: %w", err)
	}

	domainResult := uc.svc.ComputeCrossSection(allBars, tickers)
	return mapProximityResponse(domainResult), nil
}

// mapProximityResponse maps domain ProximityCrossSection to application DTO.
func mapProximityResponse(r domain.ProximityCrossSection) ProximityResponse {
	tickerDTOs := make([]ProximityPerTickerDTO, len(r.Tickers))
	for i, t := range r.Tickers {
		var lbl *string
		if t.ProximityLabel != nil {
			s := string(*t.ProximityLabel)
			lbl = &s
		}
		tickerDTOs[i] = ProximityPerTickerDTO{
			Code:            t.Code,
			High52w:         t.High52w,
			Low52w:          t.Low52w,
			PctFromHigh:     t.PctFromHigh,
			PctFromLow:      t.PctFromLow,
			NewHighToday:    t.NewHighToday,
			AboveMA50:       t.AboveMA50,
			AboveMA200:      t.AboveMA200,
			ProximityLabel:  lbl,
			NullReason52w:   t.NullReason52w,
			NullReasonMA200: t.NullReasonMA200,
		}
	}

	agg := NetNewHighsAggregateDTO{
		NewHighsCount:    r.Aggregate.NewHighsCount,
		NewLowsCount:     r.Aggregate.NewLowsCount,
		NetNewHighs:      r.Aggregate.NetNewHighs,
		PctAboveMA50:     r.Aggregate.PctAboveMA50,
		PctAboveMA200:    r.Aggregate.PctAboveMA200,
		DenominatorMA200: r.Aggregate.DenominatorMA200,
	}

	return ProximityResponse{
		Tickers:     tickerDTOs,
		Aggregate:   agg,
		NetNewHighs: r.NetNewHighs,
	}
}
