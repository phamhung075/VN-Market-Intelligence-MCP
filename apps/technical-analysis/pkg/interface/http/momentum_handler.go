// Package http — POST /ta/roc-momentum handler.
// IND-P1-ROC-MOMENTUM: wraps ComputeROCMomentumUseCase for HTTP delivery.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// handleROCMomentum handles POST /ta/roc-momentum.
//
// Request body (all optional):
//   - tickers: []string — watchlist override
//
// On success: 200 + ROCMomentumResponse JSON.
// On decode error: 400 + {"error":"invalid request body"}.
// On internal error: 500 + {"error":"internal error"}.
func handleROCMomentum(uc *application.ComputeROCMomentumUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req application.ROCMomentumRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
		}

		resp, err := uc.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("roc-momentum Execute failed", "err", err)
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}
