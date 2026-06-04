// Package http — HTTP interface layer for the macro-indicators service.
//
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE (Option B consolidation): the standalone
// /carry-trade-signal and /yield-spread-signal endpoints served hardcoded fixture
// consts (fed=5.33, deposit=4.7, earningYield=8.2) with no DI — a DSI-INV-1
// violation. They are RETIRED. TS MCP tools now call POST /snapshot and project
// signals.carry / signals.yield (the only live path). handlers_carry.go and
// handlers_yield.go are deleted.
//
// /macro-calendar remains fixture-based (per OQ-10 resolution).
// FE-RR-MACRO-EXTERNAL: GET /external added — serves cached MacroData from SQLite.
//
// Routes:
//   GET  /health               — 200 ok + service JSON (unchanged from P2-B1)
//   POST /snapshot             — real ComputeMacroUseCase.Execute() (AC-2, canonical carry/yield source)
//   GET  /macro-calendar       — fixture response (OQ-10 deferred)
//   GET  /external             — cached macro snapshot → MacroData shape (FE-RR-MACRO-EXTERNAL)
package http

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
)

// NewRouter creates a new chi router with all HTTP handlers registered.
// useCase and logger are wired by the composition root (cmd/server/main.go).
func NewRouter(useCase *application.ComputeMacroUseCase, logger *slog.Logger) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", handleHealth())
	r.Post("/snapshot", handleSnapshot(useCase, logger))
	r.Get("/macro-calendar", handleMacroCalendar())
	r.Get("/external", handleExternal(useCase, logger))

	return r
}

// ---------------------------------------------------------------------------
// /health — unchanged from P2-B1 (AC-1)
// ---------------------------------------------------------------------------

func handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"macro-indicators","port":5004}`))
	}
}

// ---------------------------------------------------------------------------
// /snapshot — real handler (P2-X3, AC-2)
// ---------------------------------------------------------------------------

func handleSnapshot(useCase *application.ComputeMacroUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		resp, err := useCase.Execute(ctx, application.MacroSnapshotRequest{})
		if err != nil {
			logger.Error("snapshot use case failed", slog.Any("error", err))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"snapshot computation failed"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			logger.Error("snapshot encode failed", slog.Any("error", err))
		}
	}
}
