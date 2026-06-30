// Package http — Foreign Accumulation Rank HTTP handler.
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
)

// ForeignAccumHandler handles the foreign accumulation rank endpoint.
type ForeignAccumHandler struct {
	useCase *application.ForeignAccumUseCase
}

// NewForeignAccumHandler constructs the handler.
func NewForeignAccumHandler(uc *application.ForeignAccumUseCase) *ForeignAccumHandler {
	return &ForeignAccumHandler{useCase: uc}
}

// HandleForeignAccumRank handles POST /price/foreign-accum-rank.
func (h *ForeignAccumHandler) HandleForeignAccumRank(w http.ResponseWriter, r *http.Request) {
	var req application.ForeignAccumRequest

	// Optional body — if empty or invalid, use WATCHLIST_TICKERS env var
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			// Ignore decode errors — use default (env var)
			slog.Debug("foreign-accum-rank: body decode fallback to env", "error", err)
		}
	}

	result, err := h.useCase.Execute(req)
	if err != nil {
		slog.Error("foreign-accum-rank internal error", "error", err)
		h.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.writeJSON(w, http.StatusOK, result)
}

func (h *ForeignAccumHandler) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON encode error", "error", err)
	}
}
