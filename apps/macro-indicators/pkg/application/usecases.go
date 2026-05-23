// Package application — use-case orchestrators (application layer).
// Stub: Execute returns zero-value response until P1-B primitive wiring lands.
package application

import (
	"context"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ComputeMacroUseCase orchestrates macro snapshot computation.
// Depends on domain ports; never imports infrastructure or interface packages directly.
type ComputeMacroUseCase struct {
	commodityFetcher domain.CommodityFetcherPort
	sbvRate          domain.SBVRatePort
}

// NewComputeMacroUseCase creates a new use case with injected ports.
// The composition root (cmd/server/main.go) is responsible for providing
// the concrete infrastructure adapters at startup.
func NewComputeMacroUseCase(
	cf domain.CommodityFetcherPort,
	sr domain.SBVRatePort,
) *ComputeMacroUseCase {
	return &ComputeMacroUseCase{
		commodityFetcher: cf,
		sbvRate:          sr,
	}
}

// Execute runs the macro snapshot computation.
// Stub — returns zero-value response with nil error until P1-B1 primitive lands.
// TODO(P1-B1): orchestrate macro-investment-clock primitive + SBV rate fetch.
func (uc *ComputeMacroUseCase) Execute(
	ctx context.Context,
	req MacroSnapshotRequest,
) (MacroSnapshotResponse, error) {
	// TODO(P1-B1): implement primitive orchestration (commodity fetch + SBV rate + investment clock).
	_ = ctx
	_ = req
	return MacroSnapshotResponse{}, nil
}
