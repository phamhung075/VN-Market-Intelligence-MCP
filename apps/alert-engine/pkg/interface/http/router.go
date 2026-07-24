// Package http — HTTP interface layer for alert-engine.
// Routes: GET /health, POST /evaluate.
// Mirrors TS createRouter (handlers.ts) exactly (AC-2, AC-3, AC-4, AC-5).
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/vn-market-intelligence/alert-engine/pkg/application"
	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// Handler holds the router and dependencies.
type Handler struct {
	router  http.Handler
	useCase *application.EvaluateAlertUseCase
}

// NewRouter creates and returns a chi router with all routes registered.
// AC-2: GET /health JSON (port reflects the real listening port, cfg.Port).
// AC-3: POST /evaluate request validation.
// AC-4: stock normalisation (trim+uppercase).
// AC-5: response shape.
func NewRouter(uc *application.EvaluateAlertUseCase, port int) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Recoverer)
	r.Use(requestLogger)

	r.Get("/health", handleHealth(port))
	r.Post("/evaluate", handleEvaluate(uc))

	return r
}

// handleHealth returns AC-2 JSON reflecting the real configured port.
func handleHealth(port int) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "ok",
			"service": "alert-engine",
			"port":    port,
		})
	}
}

// handleEvaluate processes POST /evaluate.
func handleEvaluate(uc *application.EvaluateAlertUseCase) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Decode JSON body (AC-3: malformed JSON → 400)
		var body application.EvaluateAlertRequest
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
			return
		}

		// AC-4: trim + uppercase stock
		stock := strings.TrimSpace(body.Stock)
		stock = strings.ToUpper(stock)

		// AC-3: validation
		if stock == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "stock is required"})
			return
		}
		if !domain.AlertSeverity(body.Severity).IsValid() {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "severity must be low|medium|high|critical"})
			return
		}
		if strings.TrimSpace(body.Message) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
			return
		}

		req := application.EvaluateAlertRequest{
			Stock:        stock,
			Severity:     body.Severity,
			Message:      body.Message,
			SignalTypes:  body.SignalTypes,
			ActionCode:   body.ActionCode,
			SendTelegram: body.SendTelegram,
		}

		result, err := uc.Execute(r.Context(), req)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, result)
	}
}

// writeJSON encodes v as JSON and writes to w with the given status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// requestLogger is a minimal slog-based request logger middleware.
func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("http request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}
