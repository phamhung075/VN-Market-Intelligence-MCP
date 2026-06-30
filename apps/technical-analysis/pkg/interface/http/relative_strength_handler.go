// Package http — POST /ta/relative-strength handler.
// IND-P1-RELATIVE-STRENGTH: wraps ComputeRelativeStrengthUseCase for HTTP delivery.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// handleRelativeStrength handles POST /ta/relative-strength.
//
// Request body (all optional):
//   - tickers: []string — watchlist override (VNINDEX always prepended internally)
//
// On success: 200 + RSResponse JSON.
func handleRelativeStrength(uc *application.ComputeRelativeStrengthUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req application.RSRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
		}

		resp, err := uc.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("relative-strength Execute failed", "err", err)
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}
