// Package application — use-case orchestrators (application layer).
package application

import (
	"context"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// TACalculator is the port the use case depends on (matches domain.TAIndicatorCalculator).
type TACalculator interface {
	Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error)
}

// ComputeTAUseCase orchestrates the domain service for a single HTTP request.
type ComputeTAUseCase struct {
	calculator TACalculator
}

// NewComputeTAUseCase constructs the use case with the given calculator.
// The calculator provides the pure-compute path (no DB credentials required).
func NewComputeTAUseCase(calculator TACalculator) *ComputeTAUseCase {
	return &ComputeTAUseCase{calculator: calculator}
}

// Execute processes a ComputeTARequest and returns a ComputeTAResponse.
// When req.Closes is non-empty the credential-free pure-compute path is used.
// When req.Symbol is set (and Closes is empty) the DB-backed path is used (stub).
func (uc *ComputeTAUseCase) Execute(_ context.Context, req ComputeTARequest) (ComputeTAResponse, error) {
	closes := req.Closes
	period := req.Period
	if period <= 0 {
		period = 14 // sensible default
	}

	if len(closes) == 0 {
		// DB-backed path: not yet implemented; return empty response.
		return ComputeTAResponse{Symbol: req.Symbol}, nil
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
