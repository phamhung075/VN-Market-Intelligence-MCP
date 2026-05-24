// Package http — HTTP interface layer for the technical-analysis service.
// Routes: GET /health, POST /ta/indicators.
package http

import (
	"context"
	"encoding/json"
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

func handleIndicators(useCase *application.ComputeTAUseCase, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req application.ComputeTARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid request body"}`))
			return
		}
		if len(req.Closes) == 0 && req.Symbol == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"closes or symbol required"}`))
			return
		}
		resp, err := useCase.Execute(context.Background(), req)
		if err != nil {
			if logger != nil {
				logger.Error("useCase.Execute failed", "err", err)
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
