// Package http — liquidity-state handler for VMT-5a (POST /liquidity-state).
//
// Thin HTTP adapter: call LiquidityStateUseCase → encode response.
// No domain logic. All computation happens in the application and domain layers.
//
// Route: POST /liquidity-state
// Request body: empty {} (no params required)
// Response: LiquidityStateResponse JSON shape (see pkg/application/dtos_vmt_liquidity.go).
//
// Three blocs in response:
//   - policy_rates: refi + discount + lombard from SBV HTML (is_estimate=true on fallback).
//   - sjc_gold_gap: SJC domestic vs world gold gap from market.db reads.
//   - fx_coupling: USD/VND center + band + CNY/DXY from market.db reads.
//   - irs: is_estimate=true PERMANENT (DD-6 — HNX OTC IRS not machine-readable).
//
// Fence-C: this file is in pkg/interface/http — imports pkg/application only.
// Never imports pkg/infrastructure.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// handleLiquidityState returns a chi-compatible http.HandlerFunc for POST /liquidity-state.
// Calls the LiquidityStateUseCase and JSON-encodes the response.
// Returns HTTP 200 on success; HTTP 500 on use-case failure.
func handleLiquidityState(uc *application.LiquidityStateUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		resp, err := uc.Execute(ctx, application.LiquidityStateRequest{})
		if err != nil {
			if logger != nil {
				logger.Error("liquidity-state use case failed", slog.Any("error", err))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
				logger.Error("liquidity-state handler: encode error response", slog.Any("error", encErr))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
			logger.Error("liquidity-state handler: encode response", slog.Any("error", encErr))
		}
	}
}
