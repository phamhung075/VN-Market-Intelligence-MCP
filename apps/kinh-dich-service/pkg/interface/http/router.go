// Package http contains the HTTP interface layer.
package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/application"
)

// NewRouter creates a new chi router with all routes configured.
func NewRouter(uc *application.ReadingUseCase) http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.SetHeader("Content-Type", "application/json"))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "kinh-dich-service",
		})
	})

	// Placeholder routes - return 501 Not Implemented
	// Real handlers will be wired in Phase 2 after primitives are complete

	// GET /reading/{code} - Get reading for a stock
	r.Get("/reading/{code}", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Not implemented - pending B-bucket primitive wiring",
		})
	})

	// GET /market - Get market reading (VNINDEX)
	r.Get("/market", func(w http.ResponseWriter, req *http.Request) {
		resp, err := uc.MarketReading()
		if err != nil {
			if err == application.ErrInsufficientData {
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{
					"error": err.Error(),
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{
				"error": err.Error(),
			})
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	})

	// GET /readings/{code}/history - Get reading history
	r.Get("/readings/{code}/history", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Not implemented - pending B-bucket primitive wiring",
		})
	})

	// GET /hexagram/{number}/transitions - Get hexagram transitions
	r.Get("/hexagram/{number}/transitions", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Not implemented - pending B-bucket primitive wiring",
		})
	})

	// GET /backtest/{code} - Get backtest results
	r.Get("/backtest/{code}", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Not implemented - pending B-bucket primitive wiring",
		})
	})

	// GET /hexagram/{number}/explain - Get hexagram explanation
	r.Get("/hexagram/{number}/explain", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Not implemented - pending B-bucket primitive wiring",
		})
	})

	return r
}
