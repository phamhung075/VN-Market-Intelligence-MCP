// Package application — ComputeMoneyFlowUseCase orchestrates MONEY-RADAR-P0-T1-OSCILLATORS.
// Reads the watchlist (WATCHLIST_TICKERS env / DB watchlist table, resolved at
// composition root); fetches multi-ticker close+volume bars; delegates to domain service.
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// MoneyFlowSvc is the port for Phase-0 money-flow oscillator calculation.
type MoneyFlowSvc interface {
	ComputeCrossSection(allBars map[string][]domain.OHLCVBar, tickers []string) domain.MoneyFlowCrossSection
}

// moneyFlowBarLimit bounds the per-ticker bar fetch. OBV is depth-independent
// (uses everything returned) and the windowed metrics need only 21 bars, so this
// simply caps the fetch comfortably above the live ~76-bar depth (money-radar
// brief §2, C1) without over-fetching.
const moneyFlowBarLimit = 100

// ComputeMoneyFlowUseCase orchestrates the full money-flow oscillator computation.
type ComputeMoneyFlowUseCase struct {
	repo      MultiTickerRepo // reuses the MultiTickerRepo port (see momentum_usecase.go)
	svc       MoneyFlowSvc
	watchlist []string
}

// NewComputeMoneyFlowUseCase constructs the use case.
// watchlist is loaded from WATCHLIST_TICKERS env (or the DB watchlist table
// fallback) at composition root startup.
func NewComputeMoneyFlowUseCase(repo MultiTickerRepo, svc MoneyFlowSvc, watchlist []string) *ComputeMoneyFlowUseCase {
	return &ComputeMoneyFlowUseCase{repo: repo, svc: svc, watchlist: watchlist}
}

// Execute computes Phase-0 money-flow oscillators for all watchlist tickers
// (or req.Tickers when supplied as an override).
func (uc *ComputeMoneyFlowUseCase) Execute(_ context.Context, req MoneyFlowRequest) (MoneyFlowResponse, error) {
	tickers := req.Tickers
	if len(tickers) == 0 {
		tickers = uc.watchlist
	}

	allBars, err := uc.repo.GetMultiTickerCandles(tickers, moneyFlowBarLimit)
	if err != nil {
		return MoneyFlowResponse{}, fmt.Errorf("GetMultiTickerCandles: %w", err)
	}

	domainResult := uc.svc.ComputeCrossSection(allBars, tickers)
	return mapMoneyFlowResponse(domainResult), nil
}

// mapMoneyFlowResponse maps domain MoneyFlowCrossSection to application DTO.
func mapMoneyFlowResponse(r domain.MoneyFlowCrossSection) MoneyFlowResponse {
	tickerDTOs := make([]MoneyFlowPerTickerDTO, len(r.Tickers))
	for i, t := range r.Tickers {
		tickerDTOs[i] = MoneyFlowPerTickerDTO{
			Code:           t.Code,
			OBV:            t.OBV,
			RelVolZ20:      t.RelVolZ20,
			UpDownVolRatio: t.UpDownVolRatio,
			DegradedVWAP:   t.DegradedVWAP,
			IsProxy:        t.IsProxy,
			BarsUsed:       t.BarsUsed,
			NullReason:     t.NullReason,
		}
	}
	return MoneyFlowResponse{Tickers: tickerDTOs}
}
