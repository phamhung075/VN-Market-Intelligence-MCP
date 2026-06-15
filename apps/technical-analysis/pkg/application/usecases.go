// Package application — use-case orchestrators (application layer).
package application

import (
	"context"
	"fmt"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// TACalculator is the port the use case depends on (matches domain.TAIndicatorCalculator).
type TACalculator interface {
	Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error)
}

// PriceRepo is the port for reading historical candles from market.db.
type PriceRepo interface {
	GetCandles(symbol string, limit int) ([]domain.CandleStick, error)
}

// ComputeTAUseCase orchestrates the domain service for a single HTTP request.
type ComputeTAUseCase struct {
	calculator TACalculator
	priceRepo  PriceRepo
}

// NewComputeTAUseCase constructs the use case with the given calculator and price repository.
// priceRepo is used for the DB-backed path (symbol-only request, no closes provided).
func NewComputeTAUseCase(calculator TACalculator, priceRepo PriceRepo) *ComputeTAUseCase {
	return &ComputeTAUseCase{calculator: calculator, priceRepo: priceRepo}
}

// Execute processes a ComputeTARequest and returns a ComputeTAResponse.
//
// Two paths:
//  1. Pure-compute: req.Closes is non-empty → calculate directly (no DB lookup).
//  2. DB-backed: req.Symbol is set and Closes is empty → fetch candles from market.db
//     via GetCandles(symbol, 60), extract closes, then calculate.
//
// The DB-backed path mirrors the mcp-server defaultComputeTa query exactly:
//
//	SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT 60
func (uc *ComputeTAUseCase) Execute(_ context.Context, req ComputeTARequest) (ComputeTAResponse, error) {
	closes := req.Closes
	period := req.Period
	if period <= 0 {
		period = 14 // sensible default
	}

	if len(closes) == 0 {
		// DB-backed path: fetch candles from market.db.
		if req.Symbol == "" {
			return ComputeTAResponse{}, fmt.Errorf("closes or symbol required")
		}
		candles, err := uc.priceRepo.GetCandles(req.Symbol, 60)
		if err != nil {
			return ComputeTAResponse{Symbol: req.Symbol}, fmt.Errorf("GetCandles(%s): %w", req.Symbol, err)
		}
		closes = make([]float64, len(candles))
		for i, c := range candles {
			closes[i] = c.Close
		}
	}

	indicators, err := uc.calculator.Calculate(closes, period)
	if err != nil {
		return ComputeTAResponse{Symbol: req.Symbol}, err
	}

	return ComputeTAResponse{
		Symbol:          req.Symbol,
		RSI:             indicators.RSI,
		MACDLine:        indicators.MACDLine,
		SignalLine:      indicators.SignalLine,
		Histogram:       indicators.Histogram,
		BollingerUpper:  indicators.BollingerUpper,
		BollingerMiddle: indicators.BollingerMiddle,
		BollingerLower:  indicators.BollingerLower,
		SMA:             indicators.SMA,
		EMA:             indicators.EMA,
	}, nil
}
