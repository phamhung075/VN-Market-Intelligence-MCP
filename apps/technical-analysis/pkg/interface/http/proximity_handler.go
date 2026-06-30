// Package http — POST /ta/52w-proximity handler.
// IND-P1-52W-HIGH-PROXIMITY: wraps Compute52WProximityUseCase for HTTP delivery.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// handle52WProximity handles POST /ta/52w-proximity.
//
// Request body (all optional):
//   - tickers: []string — watchlist override
//
// On success: 200 + ProximityResponse JSON.
func handle52WProximity(uc *application.Compute52WProximityUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req application.ProximityRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
		}

		resp, err := uc.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("52w-proximity Execute failed", "err", err)
			}
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// writeJSON is a shared helper used by all 3 new handlers (and exposed for reuse).
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
