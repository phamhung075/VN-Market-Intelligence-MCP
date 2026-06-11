// Package http contains the HTTP interface layer.
package http

import (
	"encoding/json"
	"net/http"
	"strconv"

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
		code := chi.URLParam(req, "code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "stock code cannot be empty",
			})
			return
		}

		resp, err := uc.StockReading(code)
		if err != nil {
			if err == application.ErrInvalidCode {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{
					"error": err.Error(),
				})
				return
			}
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
		code := chi.URLParam(req, "code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "stock code cannot be empty",
			})
			return
		}

		// Parse optional days query param (default 30)
		days := 30
		if daysStr := req.URL.Query().Get("days"); daysStr != "" {
			if d, err := strconv.Atoi(daysStr); err == nil && d > 0 {
				days = d
			}
		}

		resp, err := uc.ReadingHistory(code, days)
		if err != nil {
			if err == application.ErrInvalidCode {
				w.WriteHeader(http.StatusBadRequest)
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

	// GET /hexagram/{number}/transitions - Get hexagram transitions
	r.Get("/hexagram/{number}/transitions", func(w http.ResponseWriter, req *http.Request) {
		numberStr := chi.URLParam(req, "number")
		number, err := strconv.Atoi(numberStr)
		if err != nil || number < 1 || number > 64 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "hexagram number must be between 1 and 64",
			})
			return
		}

		// Parse optional stock and topN query params
		stockCode := req.URL.Query().Get("stock")
		if stockCode == "" {
			stockCode = "VNINDEX"
		}
		topN := 10
		if topNStr := req.URL.Query().Get("topN"); topNStr != "" {
			if n, err := strconv.Atoi(topNStr); err == nil && n > 0 {
				topN = n
			}
		}

		resp, err := uc.HexagramTransitions(number, stockCode, topN)
		if err != nil {
			if err == application.ErrInvalidHexagram {
				w.WriteHeader(http.StatusBadRequest)
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

	// GET /backtest/{code} - Get backtest results
	r.Get("/backtest/{code}", func(w http.ResponseWriter, req *http.Request) {
		code := chi.URLParam(req, "code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "stock code cannot be empty",
			})
			return
		}

		// Parse optional days query param (default 30)
		days := 30
		if daysStr := req.URL.Query().Get("days"); daysStr != "" {
			if d, err := strconv.Atoi(daysStr); err == nil && d > 0 {
				days = d
			}
		}

		resp, err := uc.Backtest(code, days)
		if err != nil {
			if err == application.ErrInvalidCode {
				w.WriteHeader(http.StatusBadRequest)
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

	// GET /hexagram/{number}/explain - Get hexagram explanation
	r.Get("/hexagram/{number}/explain", func(w http.ResponseWriter, req *http.Request) {
		numberStr := chi.URLParam(req, "number")
		number, err := strconv.Atoi(numberStr)
		if err != nil || number < 1 || number > 64 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "hexagram number must be between 1 and 64",
			})
			return
		}

		resp, err := uc.HexagramExplain(number)
		if err != nil {
			if err == application.ErrInvalidHexagram {
				w.WriteHeader(http.StatusBadRequest)
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

	return r
}
