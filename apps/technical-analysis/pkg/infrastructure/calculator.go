// Package infrastructure — TACalculator implements the TAIndicatorCalculator port.
// P1-C1g: thin mapper — delegates composition to pkg/module, maps result to domain.
package infrastructure

import (
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	"github.com/vn-market-intelligence/technical-analysis/pkg/module"
)

// TACalculator is the infrastructure adapter for technical-indicator math.
type TACalculator struct{}

// NewTACalculator constructs a TACalculator.
func NewTACalculator() *TACalculator {
	return &TACalculator{}
}

// Calculate computes technical indicators by delegating to the module layer.
// The period argument drives RSI and MA periods; all other params use defaults.
func (c *TACalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	params := module.ComputeParams{
		RSIPeriod: period,
		MAPeriod:  period,
	}
	res, err := module.Compute(closes, params)
	if err != nil {
		return nil, err
	}

	var crossSignals []domain.CrossSignal
	for _, e := range res.CrossSignals {
		crossSignals = append(crossSignals, domain.CrossSignal{
			Index:     e.Index,
			Direction: e.Direction,
		})
	}

	return &domain.TechnicalIndicators{
		RSI:             res.RSI,
		MACDLine:        res.MACDLine,
		SignalLine:      res.SignalLine,
		Histogram:       res.Histogram,
		BollingerUpper:  res.BBUpper,
		BollingerMiddle: res.BBMiddle,
		BollingerLower:  res.BBLower,
		SMA:             res.SMA,
		EMA:             res.EMA,
		CrossSignals:    crossSignals,
		MA5:             res.MA5,
		MA20:            res.MA20,
		MA50:            res.MA50,
	}, nil
}
