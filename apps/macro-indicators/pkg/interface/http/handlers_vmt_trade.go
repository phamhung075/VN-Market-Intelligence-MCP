// Package http — trade-balance handler for VMT-1a + VMT-1b (POST /trade-balance).
//
// Thin HTTP adapter: decode request → call TradeBalanceUseCase → encode response.
// No domain logic. All computation happens in the application and domain layers.
//
// Route: POST /trade-balance
// Request body: { "period": "YYYY-MM" } (optional — defaults to most recent month)
// Response: TradeBalanceResponse JSON shape (see pkg/application/dtos_vmt_trade.go).
//
// VMT-1a fields (is_estimate=false): trade totals + HS sector breakdown.
// VMT-1b fields (is_estimate=true PERMANENT): bloc_split FDI vs domestic share.
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

// handleTradeBalance returns a chi-compatible http.HandlerFunc for POST /trade-balance.
// Decodes the optional TradeBalanceRequest body, calls the use case, and JSON-encodes
// the response. Returns HTTP 200 on success; HTTP 500 on use-case failure.
func handleTradeBalance(uc *application.TradeBalanceUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		// Decode optional request body; empty body or no body is valid.
		var req application.TradeBalanceRequest
		if r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				if logger != nil {
					logger.Warn("trade-balance handler: decode request body", slog.Any("error", err))
				}
				// Non-fatal: proceed with zero-value request (default: most recent month).
			}
		}

		resp, err := uc.Execute(ctx, req)
		if err != nil {
			if logger != nil {
				logger.Error("trade-balance use case failed", slog.Any("error", err))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
				logger.Error("trade-balance handler: encode error response", slog.Any("error", encErr))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
			logger.Error("trade-balance handler: encode response", slog.Any("error", encErr))
		}
	}
}
