// Package http — HTTP interface layer for the technical-analysis service.
// Routes: GET /health, POST /ta/indicators (501 stubs until P1-B tasks land).
package http

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
)

// NewRouter creates and returns a chi router with all routes registered.
// useCase and logger are wired by the composition root (cmd/server/main.go).
func NewRouter(useCase *application.ComputeTAUseCase, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", handleHealth())
	r.Post("/ta/indicators", handleIndicators(useCase, logger))

	return r
}

func handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"technical-analysis","port":5003}`))
	}
}

func handleIndicators(_ *application.ComputeTAUseCase, _ *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "not implemented yet", http.StatusNotImplemented)
	}
}
