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

		// FDA-3: derive per-source status + summary from per-field provenance (FDA-2).
		// A source whose primary value is a fixture fallback reports status "estimate"
		// rather than "ok". summary.failed counts sources not serving live data.
		//
		// Source grouping:
		//   "vn-market"       → VNIndex (VNIndexIsEstimate)
		//   "commodity-prices" → OIL+GOLD+USDVND (any of OilIsEstimate/GoldIsEstimate/USDVndIsEstimate)
		//   "macro-signals"   → carry/yield (resp.DataSource reflects all-input liveness)
		//
		// Rule: status="ok" only when ALL fields in the source group are live (!IsEstimate).
		//       status="estimate" when any field in the group is a fixture fallback.
		vnMarketStatus := "ok"
		if resp.VNIndexIsEstimate {
			vnMarketStatus = "estimate"
		}

		commodityEstimate := resp.OilIsEstimate || resp.GoldIsEstimate || resp.USDVndIsEstimate
		commodityStatus := "ok"
		if commodityEstimate {
			commodityStatus = "estimate"
		}

		// macro-signals status tracks carry/yield liveness via DataSource.
		// DataSource="live" → all five inputs live → signals are live.
		// DataSource="estimate" → at least one fixture input → signals degraded.
		signalsStatus := "ok"
		if resp.DataSource != "live" {
			signalsStatus = "estimate"
		}

		// Count failed (degraded) sources.
		failedCount := 0
		okCount := 0
		for _, st := range []string{vnMarketStatus, commodityStatus, signalsStatus} {
			if st == "ok" {
				okCount++
			} else {
				failedCount++
			}
		}

		// Map snapshot to MacroData shape expected by the frontend.
		// sources: each named data origin → { status, data }
		// indicators: flat convenience map for dashboard key-value display
		sources := map[string]map[string]interface{}{
			"vn-market": {
				"status": vnMarketStatus,
				"data": map[string]interface{}{
					"vnIndex":        resp.VNIndex,
					"dataSource":     resp.DataSource,
					"is_estimate":    resp.VNIndexIsEstimate,
					"source_tier":    resp.VNIndexSourceTier,
				},
			},
			"commodity-prices": {
				"status": commodityStatus,
				"data": map[string]interface{}{
					"oilUsd":           resp.OilUSD,
					"goldUsd":          resp.GoldUSD,
					"usdVnd":           resp.USDVnd,
					"oil_is_estimate":  resp.OilIsEstimate,
					"gold_is_estimate": resp.GoldIsEstimate,
					"usdVnd_is_estimate": resp.USDVndIsEstimate,
				},
			},
			"macro-signals": {
				"status": signalsStatus,
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

		// FDA-3: honest fetchedAt — use zero value when data is all-fixture (resp.FetchedAt.IsZero()).
		// Do NOT fresh-stamp fixture data as "just fetched".
		var fetchedAtStr string
		if !resp.FetchedAt.IsZero() {
			fetchedAtStr = resp.FetchedAt.Format(time.RFC3339)
		} else {
			// All-fixture path: emit an explicit empty string so the frontend
			// knows no live fetch occurred. The frontend must handle "" gracefully.
			fetchedAtStr = ""
		}

		body := map[string]interface{}{
			"status":     "ok",
			"fetchedAt":  fetchedAtStr,
			"sources":    sources,
			"summary":    map[string]interface{}{"ok": okCount, "failed": failedCount, "totalLatencyMs": 0},
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
