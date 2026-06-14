// Package http — BOP handler for VMT-2 (POST /bop).
//
// Thin HTTP adapter: decode request → call BOPUseCase → encode response.
// No domain logic. All computation happens in the application and domain layers.
//
// Route: POST /bop
// Request body: { "quarter_start": "YYYY-MM-DD", "quarter_end": "YYYY-MM-DD" }
//   Both fields are optional. Empty body {} → defaults to most recent quarter.
// Response: BOPResponse JSON shape (see pkg/application/dtos_vmt_bop.go).
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

// handleBOP returns a chi-compatible http.HandlerFunc for POST /bop.
// Decodes the optional BOPRequest body, calls the BOP use case, and JSON-encodes
// the response. Returns HTTP 200 on success; HTTP 500 on use-case failure.
func handleBOP(uc *application.BOPUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		// Decode optional request body; empty body or no body is valid.
		var req application.BOPRequest
		if r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				if logger != nil {
					logger.Warn("bop handler: decode request body", slog.Any("error", err))
				}
				// Non-fatal: proceed with zero-value request (default quarter window).
			}
		}

		resp, err := uc.Execute(ctx, req)
		if err != nil {
			if logger != nil {
				logger.Error("bop use case failed", slog.Any("error", err))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
				logger.Error("bop handler: encode error response", slog.Any("error", encErr))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if encErr := json.NewEncoder(w).Encode(resp); encErr != nil && logger != nil {
			logger.Error("bop handler: encode response", slog.Any("error", encErr))
		}
	}
}
