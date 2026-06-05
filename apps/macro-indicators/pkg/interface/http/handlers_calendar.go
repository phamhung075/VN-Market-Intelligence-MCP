// Package http — HTTP interface layer for the macro-indicators service.
// handlers_calendar.go: GET /macro-calendar handler.
// FDA-4: no live macro-calendar source is wired. Returns honest-unavailable response
// (empty events, status:"unavailable", source_tier:4, is_estimate:true) so consumers
// can distinguish "no data yet" from live data. fetchedAt is omitted — stamping now()
// on empty data repeats the DSI fixture-as-live anti-pattern.
package http

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// handleMacroCalendar returns an honest-unavailable macro calendar response.
// Accepts optional ?days=N query parameter (default 60).
// Shape matches the domain MacroCalendarResult for forward-compatibility.
// events is always empty until a real macro-calendar source is wired.
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
			"events":        []map[string]interface{}{},
			"daysRequested": days,
			"status":        "unavailable",
			"is_estimate":   true,
			"source_tier":   4,
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			http.Error(w, `{"error":"encode failed"}`, http.StatusInternalServerError)
		}
	}
}
