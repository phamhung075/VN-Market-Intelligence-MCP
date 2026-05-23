// Package http — HTTP interface layer for the macro-indicators service.
// Routes: GET /health (200 ok), POST /snapshot (501 stub until P1-B1 lands).
package http

import (
	"log/slog"
	"net/http"

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
	r.Get("/carry-trade-signal", handleCarryTradeSignal())
	r.Get("/yield-spread-signal", handleYieldSpreadSignal())
	r.Get("/macro-calendar", handleMacroCalendar())

	return r
}

func handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"macro-indicators","port":5004}`))
	}
}

func handleSnapshot(_ *application.ComputeMacroUseCase, _ *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		// TODO(P1-B1): implement snapshot handler using ComputeMacroUseCase.Execute.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		_, _ = w.Write([]byte(`{"error":"not implemented"}`))
	}
}
