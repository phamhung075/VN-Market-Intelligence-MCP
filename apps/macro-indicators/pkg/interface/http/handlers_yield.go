// Package http — HTTP interface layer for the macro-indicators service.
// handlers_yield.go: GET /yield-spread-signal — real handler (P2-X3, AC-4).
//
// Calls macro_yield_spread_signal.Compute() with fixture inputs (sandbox-deterministic).
// ComputedAt is injected as a fixed string — R-1 compliant (no time.Now() in primitive).
package http

import (
	"encoding/json"
	"net/http"

	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
)

// Fixture inputs for the yield-spread-signal endpoint (R-1 deterministic).
// These match the defaults used by the ComputeMacroUseCase (fixture mode).
const (
	yieldFixtureEarningYield = 8.2
	yieldFixtureDepositRate  = 4.7
	yieldFixtureComputedAt   = "2026-05-23T00:00:00Z"
)

// handleYieldSpreadSignal returns the yield-spread signal computed from
// fixture rate inputs by calling the real macro_yield_spread_signal.Compute() primitive.
// Shape matches the domain YieldSpreadOutput type (AC-4 required fields).
func handleYieldSpreadSignal() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		out := yld.Compute(yld.YieldSpreadInput{
			EarningYield: yieldFixtureEarningYield,
			DepositRate:  yieldFixtureDepositRate,
			ComputedAt:   yieldFixtureComputedAt,
		})

		resp := map[string]interface{}{
			"label":        out.Label,
			"spread":       out.Spread,
			"earningYield": out.EarningYield,
			"depositRate":  out.DepositRate,
			"computedAt":   out.ComputedAt,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
