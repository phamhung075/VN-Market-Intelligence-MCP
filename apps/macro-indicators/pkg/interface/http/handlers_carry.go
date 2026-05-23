// Package http — HTTP interface layer for the macro-indicators service.
// handlers_carry.go: GET /carry-trade-signal stub handler.
// TODO(P2-X3): upgrade to call real macro_carry_trade_signal.Compute() primitive.
package http

import (
	"encoding/json"
	"net/http"
)

// handleCarryTradeSignal returns a fixture carry-trade signal response.
// Shape matches the domain CarryTradeSignal type for forward-compatibility.
func handleCarryTradeSignal() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		// TODO(P2-X3): call real macro_carry_trade_signal.Compute() here
		resp := map[string]interface{}{
			"regime":         "HOT_MONEY_INFLOW",
			"carrySpread":    2.8,
			"vndDepositRate": 4.2,
			"fedFundsRate":   5.33,
			"computedAt":     "2026-05-23T18:52:00Z",
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
