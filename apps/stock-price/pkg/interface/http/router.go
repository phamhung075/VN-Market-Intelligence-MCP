// Package http — HTTP handlers for the stock-price service.
// Routes match TS Hono handlers + actual call sites in mcp-server clients.ts.
//
// R-SPEC-1 VERIFIED: PriceSnapshot.timestamp field is declared in clients.ts
// but never read by callers — only snap.price is used. Go returns fetchedAt.
// AC-3 passes as-is.
//
// R-SPEC-2 VERIFIED: clients.ts calls GET /price/history?code=X&days=N (query
// params). This router implements query-param route, not /:code path param.
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// Handler holds all use cases and serves as the net/http handler collection.
type Handler struct {
	fetchUC        *application.FetchPriceUseCase
	historyUC      *application.PriceHistoryUseCase
	foreignAccumUC *application.ForeignAccumUseCase
}

// NewHandler constructs the Handler.
func NewHandler(
	fetchUC *application.FetchPriceUseCase,
	historyUC *application.PriceHistoryUseCase,
	foreignAccumUC *application.ForeignAccumUseCase,
) *Handler {
	return &Handler{fetchUC: fetchUC, historyUC: historyUC, foreignAccumUC: foreignAccumUC}
}

// RegisterRoutes attaches all routes to the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("POST /price/fetch", h.pricesFetch)
	// R-SPEC-2: query-param route used by clients.ts — GET /price/history?code=X&days=N
	mux.HandleFunc("GET /price/history", h.priceHistory)
	// Also support path-param route from TS handlers.ts for backward compat
	mux.HandleFunc("GET /price/history/", h.priceHistoryPathParam)
	// IND-P1-FOREIGN-ACCUM-RANK: Foreign accumulation momentum rank
	mux.HandleFunc("POST /price/foreign-accum-rank", h.foreignAccumRank)
}

// ── health ────────────────────────────────────────────────────────────────────

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "stock-price",
		"port":    5000,
	})
}

// ── POST /price/fetch ─────────────────────────────────────────────────────────

func (h *Handler) pricesFetch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON body"})
		return
	}
	code := strings.TrimSpace(body.Code)
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}

	result, err := h.fetchUC.Execute(application.FetchPriceRequest{Code: code})
	if err != nil {
		var notAvail *domain.PriceNotAvailableError
		if isNotAvailable(err, &notAvail) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": notAvail.Error()})
			return
		}
		slog.Error("price/fetch internal error", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── GET /price/history?code=X&days=N ─────────────────────────────────────────

func (h *Handler) priceHistory(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}

	daysStr := r.URL.Query().Get("days")
	days := 30
	if daysStr != "" {
		d, err := strconv.Atoi(daysStr)
		if err != nil || d < 1 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "days must be positive"})
			return
		}
		days = d
	}

	result, err := h.historyUC.Execute(application.PriceHistoryRequest{Code: code, Days: days})
	if err != nil {
		slog.Error("price/history internal error", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── GET /price/history/:code?days=N (backward compat with TS handlers.ts) ────

func (h *Handler) priceHistoryPathParam(w http.ResponseWriter, r *http.Request) {
	// Strip "/price/history/" prefix to get the code
	code := strings.TrimPrefix(r.URL.Path, "/price/history/")
	code = strings.TrimSpace(code)
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}

	daysStr := r.URL.Query().Get("days")
	days := 30
	if daysStr != "" {
		d, err := strconv.Atoi(daysStr)
		if err != nil || d < 1 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "days must be positive"})
			return
		}
		days = d
	}

	result, err := h.historyUC.Execute(application.PriceHistoryRequest{Code: code, Days: days})
	if err != nil {
		slog.Error("price/history internal error", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ── POST /price/foreign-accum-rank ────────────────────────────────────────────

func (h *Handler) foreignAccumRank(w http.ResponseWriter, r *http.Request) {
	if h.foreignAccumUC == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "foreign-accum-rank not configured"})
		return
	}
	handler := NewForeignAccumHandler(h.foreignAccumUC)
	handler.HandleForeignAccumRank(w, r)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON encode error", "error", err)
	}
}

// isNotAvailable checks if err wraps *domain.PriceNotAvailableError.
func isNotAvailable(err error, target **domain.PriceNotAvailableError) bool {
	e, ok := err.(*domain.PriceNotAvailableError)
	if ok {
		*target = e
	}
	return ok
}
