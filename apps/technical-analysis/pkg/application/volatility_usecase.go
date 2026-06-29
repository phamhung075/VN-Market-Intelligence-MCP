// Package application — ComputeVolatilityUseCase orchestrates all P0-1 volatility
// computations across the VN-Index series (FR-1..FR-5 + gauge scalar) and per-stock
// ATR% (FR-3). No DB or I/O logic — those live in infrastructure via ports.
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// OHLCVRepo is the port for fetching full OHLCV bars from market.db.
type OHLCVRepo interface {
	GetOHLCV(symbol string, limit int) ([]domain.OHLCVBar, error)
}

// VolatilitySvc is the port for all volatility calculation functions.
type VolatilitySvc interface {
	ComputeRV(closes []float64, n int) *float64
	ComputeGarmanKlass(bars []domain.OHLCVBar) *float64
	ComputeATRPct(bars []domain.OHLCVBar) *float64
	ComputePercentileRank(series []float64, value float64) *float64
	ComputeRegime(rvHistory []float64, currentRV float64) (domain.VolatilityRegime, float64, int)
	ComputeDrawdown252d(closes []float64) *float64
	BuildRVHistory(closes []float64) []float64
}

// ComputeVolatilityUseCase orchestrates all volatility indicator computations.
type ComputeVolatilityUseCase struct {
	ohlcvRepo OHLCVRepo
	volSvc    VolatilitySvc
	// watchlist is the ordered list of active ticker symbols for ATR% computation.
	// Loaded from system-map.json .project.watchlist at composition-root startup.
	watchlist []string
}

const (
	vnIndexSymbol  = "VNINDEX"
	maxBarsHistory = 300 // enough for: RV60d history + 252d drawdown + GK + ATR
)

// NewComputeVolatilityUseCase constructs the use case with the given adapters.
// watchlist is the list of active tickers (from system-map.json .project.watchlist).
func NewComputeVolatilityUseCase(repo OHLCVRepo, svc VolatilitySvc, watchlist []string) *ComputeVolatilityUseCase {
	return &ComputeVolatilityUseCase{
		ohlcvRepo: repo,
		volSvc:    svc,
		watchlist: watchlist,
	}
}

// Execute computes all P0-1 volatility indicators for a single request cycle.
//
// Two data paths:
//   - Production: VNIndexBars/TickerBars in req are nil → fetch from market.db via ohlcvRepo.
//   - Test/sandbox: VNIndexBars/TickerBars are pre-populated → use directly (no DB call).
//
// ATR ticker list priority:
//  1. req.Tickers (per-request override)
//  2. uc.watchlist (from WATCHLIST_TICKERS env at startup)
//  3. empty list (ATR block returns empty StockATRs, non-fatal)
func (uc *ComputeVolatilityUseCase) Execute(_ context.Context, req ComputeVolatilityRequest) (ComputeVolatilityResponse, error) {
	// --- Step 1: Resolve VN-Index OHLCV bars ---
	var vnBars []domain.OHLCVBar
	if len(req.VNIndexBars) > 0 {
		vnBars = barDTOsToDomain(req.VNIndexBars)
	} else {
		bars, err := uc.ohlcvRepo.GetOHLCV(vnIndexSymbol, maxBarsHistory)
		if err != nil {
			return ComputeVolatilityResponse{}, fmt.Errorf("GetOHLCV(%s): %w", vnIndexSymbol, err)
		}
		vnBars = bars
	}

	closes := domain.ExtractCloses(vnBars)

	// --- Step 2: FR-1 Realized Volatility ---
	rv10 := uc.volSvc.ComputeRV(closes, 10)
	rv20 := uc.volSvc.ComputeRV(closes, 20)
	rv60 := uc.volSvc.ComputeRV(closes, 60)

	// --- Step 2b: Build RV20 history for regime + gauge percentile ---
	rvHistory := uc.volSvc.BuildRVHistory(closes)

	var rv20Percentile *float64
	if rv20 != nil {
		rv20Percentile = uc.volSvc.ComputePercentileRank(rvHistory, *rv20)
	}

	// --- Step 3: FR-2 Garman-Klass ---
	gkVol := uc.volSvc.ComputeGarmanKlass(vnBars)

	// --- Step 4: FR-4 Regime Band ---
	var regime domain.VolatilityRegime
	var regimePct float64
	var historySessions int

	if rv20 != nil && len(rvHistory) > 0 {
		regime, regimePct, historySessions = uc.volSvc.ComputeRegime(rvHistory, *rv20)
	} else {
		// Not enough data for RV20 yet; default to NORMAL with honest session count.
		regime = domain.RegimeNormal
		regimePct = 0.5
		historySessions = len(rvHistory)
	}

	// --- Step 5: FR-5 Drawdown (returns nil when <252 bars) ---
	drawdown := uc.volSvc.ComputeDrawdown252d(closes)

	// --- Step 6: FR-3 Per-stock ATR% ---
	tickers := req.Tickers
	if len(tickers) == 0 {
		tickers = uc.watchlist
	}

	stockATRs := make([]StockATRResponse, 0, len(tickers))
	for _, ticker := range tickers {
		var bars []domain.OHLCVBar
		if injected, ok := req.TickerBars[ticker]; ok {
			bars = barDTOsToDomain(injected)
		} else if uc.ohlcvRepo != nil {
			fetched, err := uc.ohlcvRepo.GetOHLCV(ticker, 20) // 15 bars minimum for ATR(14)
			if err != nil {
				// Non-fatal: return null ATR for this ticker.
				stockATRs = append(stockATRs, StockATRResponse{Ticker: ticker, ATRPct: nil})
				continue
			}
			bars = fetched
		}
		atrPct := uc.volSvc.ComputeATRPct(bars)
		stockATRs = append(stockATRs, StockATRResponse{Ticker: ticker, ATRPct: atrPct})
	}

	return ComputeVolatilityResponse{
		RV10dPct:        rv10,
		RV20dPct:        rv20,
		RV60dPct:        rv60,
		RV20dPercentile: rv20Percentile,
		GKVol20dPct:     gkVol,
		StockATRs:       stockATRs,
		VolRegime:       string(regime),
		VolRegimePct:    regimePct,
		HistorySessions: historySessions,
		Drawdown252dPct: drawdown,
	}, nil
}

// barDTOsToDomain converts OHLCVBarDTO slice to domain OHLCVBar slice.
func barDTOsToDomain(dtos []OHLCVBarDTO) []domain.OHLCVBar {
	bars := make([]domain.OHLCVBar, len(dtos))
	for i, d := range dtos {
		bars[i] = domain.OHLCVBar{
			Date:  d.Date,
			Open:  d.Open,
			High:  d.High,
			Low:   d.Low,
			Close: d.Close,
		}
	}
	return bars
}
