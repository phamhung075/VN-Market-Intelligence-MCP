// Package http — HTTP interface layer for the macro-indicators service.
// handlers_carry.go: GET /carry-trade-signal — real handler (P2-X3, AC-3).
//
// Calls macro_carry_trade_signal.Compute() with fixture inputs (sandbox-deterministic).
// ComputedAt is injected as a fixed string — R-1 compliant (no time.Now() in primitive).
package http

import (
	"encoding/json"
	"net/http"

	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
)

// Fixture inputs for the carry-trade-signal endpoint (R-1 deterministic).
// These match the defaults used by the ComputeMacroUseCase (fixture mode).
const (
	carryFixtureVNDDepositRate = 4.7
	carryFixtureFedFundsRate   = 5.33
	carryFixtureComputedAt     = "2026-05-23T00:00:00Z"
)

// handleCarryTradeSignal returns the carry-trade signal computed from
// fixture rate inputs by calling the real macro_carry_trade_signal.Compute() primitive.
// Shape matches the domain CarryTradeOutput type (AC-3 required fields).
func handleCarryTradeSignal() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		out := carry.Compute(carry.CarryTradeInput{
			VNDDepositRate: carryFixtureVNDDepositRate,
			FedFundsRate:   carryFixtureFedFundsRate,
			ComputedAt:     carryFixtureComputedAt,
		})

		resp := map[string]interface{}{
			"regime":         out.Regime,
			"carrySpread":    out.CarrySpread,
			"vndDepositRate": out.VNDDepositRate,
			"fedFundsRate":   out.FedFundsRate,
			"computedAt":     out.ComputedAt,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
