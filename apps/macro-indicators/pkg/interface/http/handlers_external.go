// Package http — HTTP interface layer for the macro-indicators service.
// handlers_external.go: GET /external — cached macro snapshot mapped to MacroData shape.
//
// Design decisions:
//
//  1. ROUTE: The api-gateway strips the leading /:service segment
//     (proxy-path-resolver.ResolveProxyPath). Incoming GET /macro/external
//     arrives here as GET /external. Mirror: POST /macro/snapshot → POST /snapshot.
//
//  2. DATA PATH — no live scraper calls:
//     The external scrapers (World Bank, IMF, FRED, TradingEconomics, etc.)
//     take 8–90 s and must NOT run synchronously on every page load.
//     Instead this handler reuses ComputeMacroUseCase.Execute(), which reads
//     commodity prices, SBV rates, and VN-Index from the shared market.db
//     SQLite DB (read-only, staleness-guarded, fixture-fallback on miss).
//     The result is real cached data from the DB, never fabricated numbers.
//
//  3. RESPONSE SHAPE — MacroData (frontend domain/market.ts):
//     { fetchedAt, sources, summary, indicators, status }
//     sources: keyed by data-source name → { status, data }
//     summary: { ok, failed, totalLatencyMs }
//     indicators: flat key → value map (convenience for dashboard display)
//     status: "ok" | "unavailable"
//
//  4. HONEST UNAVAILABLE: if Execute() fails (should not happen; useCase is nil
//     in tests), the handler returns HTTP 503 with { status: "unavailable" }.
//     The frontend client.ts fetchMacroExternal() handles null/unavailable shape.
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// handleExternal implements GET /external.
// Returns a MacroData-shaped JSON body built from the most recent cached
// macro snapshot (ComputeMacroUseCase.Execute + SQLite adapters).
// Never calls live external scrapers — safe to call on every page load.
func handleExternal(useCase *application.ComputeMacroUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if useCase == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable","detail":"use case not wired"}`))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		resp, err := useCase.Execute(ctx, application.MacroSnapshotRequest{})
		if err != nil {
			if logger != nil {
				logger.Error("external handler: snapshot failed", slog.Any("error", err))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable","detail":"snapshot computation failed"}`))
			return
		}

		// Map snapshot to MacroData shape expected by the frontend.
		// sources: each named data origin → { status, data }
		// indicators: flat convenience map for dashboard key-value display
		sources := map[string]map[string]interface{}{
			"vn-market": {
				"status": "ok",
				"data": map[string]interface{}{
					"vnIndex":    resp.VNIndex,
					"dataSource": resp.DataSource,
				},
			},
			"commodity-prices": {
				"status": "ok",
				"data": map[string]interface{}{
					"oilUsd":  resp.OilUSD,
					"goldUsd": resp.GoldUSD,
					"usdVnd":  resp.USDVnd,
				},
			},
			"macro-signals": {
				"status": "ok",
				"data":   resp.Signals,
			},
		}

		indicators := map[string]interface{}{
			"vnIndex":    resp.VNIndex,
			"oilUsd":     resp.OilUSD,
			"goldUsd":    resp.GoldUSD,
			"usdVnd":     resp.USDVnd,
			"dataSource": resp.DataSource,
		}

		body := map[string]interface{}{
			"status":     "ok",
			"fetchedAt":  resp.FetchedAt.Format(time.RFC3339),
			"sources":    sources,
			"summary":    map[string]interface{}{"ok": 3, "failed": 0, "totalLatencyMs": 0},
			"indicators": indicators,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(body); err != nil {
			if logger != nil {
				logger.Error("external handler: encode failed", slog.Any("error", err))
			}
		}
	}
}
