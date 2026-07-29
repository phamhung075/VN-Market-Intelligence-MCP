// Package module — ToDomainIndicators maps a Compute Result into the
// domain.TechnicalIndicators value type consumed by every composition root.
//
// FACTORY-TECHANALYSIS-dedup-calculator: this mapping used to be duplicated
// in both pkg/infrastructure.TACalculator.Calculate (the real shipped
// service) and cmd/sandbox's sandboxCalculator.Calculate (the dev-tooling
// oracle). The sandbox copy had drifted — it omitted MA5/MA20/MA50 — because
// there was no single source of truth for the mapping. Both callers now
// delegate here.
//
// Import-edge note: Fence-B (apps/technical-analysis/.golangci.yml) only
// denies module -> application and module -> interface; module -> domain is
// unrestricted, so this file's domain import is architecturally clean.
package module

import (
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// ToDomainIndicators converts a Result into a *domain.TechnicalIndicators.
// Symbol is intentionally left unset — callers that need it (e.g. the
// domain-level CalculateTAService) populate that field themselves.
func ToDomainIndicators(res Result) *domain.TechnicalIndicators {
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
	}
}
