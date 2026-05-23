// Package http — HTTP interface layer for the macro-indicators service.
// handlers_yield.go: GET /yield-spread-signal stub handler.
// TODO(P2-X3): upgrade to call real macro_yield_spread_signal.Compute() primitive.
package http

import (
	"encoding/json"
	"net/http"
)

// handleYieldSpreadSignal returns a fixture yield-spread signal response.
// Shape matches the domain YieldSpreadSignal type for forward-compatibility.
func handleYieldSpreadSignal() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		// TODO(P2-X3): call real macro_yield_spread_signal.Compute() here
		resp := map[string]interface{}{
			"label":        "VN_ATTRACTIVE",
			"spread":       3.45,
			"earningYield": 8.2,
			"depositRate":  4.75,
			"computedAt":   "2026-05-23T18:52:00Z",
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
