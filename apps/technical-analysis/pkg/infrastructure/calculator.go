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
// Result -> domain mapping is shared with cmd/sandbox's sandboxCalculator via
// module.ToDomainIndicators (FACTORY-TECHANALYSIS-dedup-calculator).
func (c *TACalculator) Calculate(closes []float64, period int) (*domain.TechnicalIndicators, error) {
	params := module.ComputeParams{
		RSIPeriod: period,
		MAPeriod:  period,
	}
	res, err := module.Compute(closes, params)
	if err != nil {
		return nil, err
	}

	return module.ToDomainIndicators(res), nil
}
