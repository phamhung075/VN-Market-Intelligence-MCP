// Package http — GSO/IIP handler for VMT-3b (POST /macro-indicators).
//
// Thin HTTP adapter: decode request → call MacroIndicatorsGSOUseCase → encode response.
// No domain logic. All computation happens in the application and domain layers.
//
// Route: POST /macro-indicators
// Request body: { "period": "YYYY-MM" } (optional — defaults to most recent month)
// Response: MacroIndicatorsGSOResponse JSON shape (see pkg/application/dtos_vmt_macro.go).
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

// handleMacroIndicators returns a chi-compatible http.HandlerFunc for POST /macro-indicators.
// Decodes the optional MacroIndicatorsGSORequest body, calls the use case, and JSON-encodes
// the response. Returns HTTP 200 on success; HTTP 500 on use-case failure.
func handleMacroIndicators(uc *application.MacroIndicatorsGSOUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		// Decode optional request body; empty body or no body is valid.
		var req application.MacroIndicatorsGSORequest
		if r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				if logger != nil {
					logger.Warn("macro-indicators handler: decode request body", slog.Any("error", err))
				}
				// Non-fatal: proceed with zero-value request (default: most recent month).
			}
		}

		resp, err := uc.Execute(ctx, req)
		if err != nil {
			if logger != nil {
				logger.Error("macro-indicators use case failed", slog.Any("error", err))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
				logger.Error("macro-indicators handler: encode error response", slog.Any("error", encErr))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
			logger.Error("macro-indicators handler: encode response", slog.Any("error", encErr))
		}
	}
}
