// Package http — HTTP interface layer for the macro-indicators service.
// handlers_calendar.go: GET /macro-calendar stub handler.
// Per OQ-10: fixture only — no live data source wired at this stage.
package http

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// handleMacroCalendar returns a fixture macro calendar response.
// Accepts optional ?days=N query parameter (default 60).
// Shape matches the domain MacroCalendarResult for forward-compatibility.
func handleMacroCalendar() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		daysStr := r.URL.Query().Get("days")
		days := 60
		if daysStr != "" {
			if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
				days = parsed
			}
		}

		resp := map[string]interface{}{
			"events": []map[string]interface{}{
				{"date": "2026-05-24", "event": "US Core PCE", "impact": "HIGH"},
				{"date": "2026-05-27", "event": "VN Industrial Output", "impact": "MEDIUM"},
			},
			"daysRequested": days,
			"fetchedAt":     "2026-05-23T18:52:00Z",
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
