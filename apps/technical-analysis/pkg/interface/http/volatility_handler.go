// Package http — POST /ta/volatility-indicators handler.
// P0-1-VOLATILITY-INDICATORS: wraps ComputeVolatilityUseCase for HTTP delivery.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// handleVolatilityIndicators handles POST /ta/volatility-indicators.
//
// Request body (all optional):
//   - tickers: []string — watchlist override for ATR computation
//   - vnindex_bars: []OHLCVBarDTO — sandbox injection; bypasses DB lookup
//   - ticker_bars: map[string][]OHLCVBarDTO — sandbox ATR injection per ticker
//
// On success: 200 + ComputeVolatilityResponse JSON.
// On failure: 500 + {"error": "internal error"} (never panics per NFR-P01-1).
func handleVolatilityIndicators(useCase *application.ComputeVolatilityUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Decode optional request body. An empty body is valid — returns full
		// VNINDEX series + all watchlist tickers from construction-time config.
		var req application.ComputeVolatilityRequest
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"invalid request body"}`))
				return
			}
		}

		resp, err := useCase.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("volatility useCase.Execute failed", "err", err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"internal error"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}
