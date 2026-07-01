// Package http — POST /ta/money-flow-oscillators handler.
// MONEY-RADAR-P0-T1-OSCILLATORS: wraps ComputeMoneyFlowUseCase for HTTP delivery.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// handleMoneyFlowOscillators handles POST /ta/money-flow-oscillators.
//
// Request body (all optional):
//   - tickers: []string — watchlist override
//
// On success: 200 + MoneyFlowResponse JSON.
func handleMoneyFlowOscillators(uc *application.ComputeMoneyFlowUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req application.MoneyFlowRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
		}

		resp, err := uc.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("money-flow-oscillators Execute failed", "err", err)
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}
