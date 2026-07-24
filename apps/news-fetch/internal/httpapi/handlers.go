package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/vn-market-intelligence/news-fetch/internal/store"
)

// healthResponse is the /health JSON shape — see apps/news-fetch/api/openapi.yaml
// (status/service/port, port: integer).
type healthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Port    int    `json:"port"`
}

// handleHealth serves GET /health → 200 {"status":"ok","service":"news-fetch","port":<port>}.
// port is the resolved listen port passed in from Router (env PORT via
// main.go's envStr) — never a hardcoded literal.
func handleHealth(port string) http.HandlerFunc {
	portNum, err := strconv.Atoi(port)
	if err != nil {
		slog.Warn("health: PORT is not numeric, reporting 0", "port", port, "error", err)
	}
	resp := healthResponse{Status: "ok", Service: "news-fetch", Port: portNum}
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, resp)
	}
}

// fetchResult is the JSON response shape for single-source fetch endpoints.
type fetchResult struct {
	Source    string `json:"source"`
	Inserted  int    `json:"inserted"`
	FetchedAt string `json:"fetched_at"`
	Error     string `json:"error,omitempty"`
}

// handleRSSFetch returns an HTTP handler that runs a single fetch source and
// persists the results to SQLite.
func handleRSSFetch(source string, fn FetchFunc, s *store.Store, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		items, err := fn(ctx)
		if err != nil {
			logger.Error("fetch error", "source", source, "error", err)
			writeJSON(w, http.StatusInternalServerError, fetchResult{
				Source:    source,
				FetchedAt: time.Now().UTC().Format(time.RFC3339),
				Error:     err.Error(),
			})
			return
		}

		inserted := 0
		for _, it := range items {
			ni := store.NewsItem{
				ID:          it.ID,
				SourceURL:   it.URL,
				SourceTitle: it.Title,
				SourceType:  it.Source,
				PublishedAt: it.PublishedAt,
				CreatedAt:   it.FetchedAt,
			}
			if dbErr := s.UpsertNewsItem(ni); dbErr != nil {
				logger.Warn("store insert failed", "source", source, "id", it.ID, "error", dbErr)
				continue
			}
			inserted++
		}

		writeJSON(w, http.StatusOK, fetchResult{
			Source:    source,
			Inserted:  inserted,
			FetchedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// handleFetchAll runs all four fetch sources sequentially and returns a summary.
func handleFetchAll(fetchers Fetchers, s *store.Store, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()

		sources := []struct {
			name string
			fn   FetchFunc
		}{
			{"vneconomy", fetchers.VnEconomy},
			{"vnexpress", fetchers.VnExpress},
			{"newsapi", fetchers.NewsAPI},
			{"vps_proxy", fetchers.VPSProxy},
		}

		type summary struct {
			Source   string `json:"source"`
			Inserted int    `json:"inserted"`
			Error    string `json:"error,omitempty"`
		}
		results := make([]summary, 0, len(sources))

		for _, src := range sources {
			items, err := src.fn(ctx)
			if err != nil {
				logger.Error("fetch/all: source error", "source", src.name, "error", err)
				results = append(results, summary{Source: src.name, Error: err.Error()})
				continue
			}
			ins := 0
			for _, it := range items {
				ni := store.NewsItem{
					ID:          it.ID,
					SourceURL:   it.URL,
					SourceTitle: it.Title,
					SourceType:  it.Source,
					PublishedAt: it.PublishedAt,
					CreatedAt:   it.FetchedAt,
				}
				if dbErr := s.UpsertNewsItem(ni); dbErr != nil {
					logger.Warn("fetch/all: store error", "source", src.name, "id", it.ID, "error", dbErr)
					continue
				}
				ins++
			}
			results = append(results, summary{Source: src.name, Inserted: ins})
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"fetched_at": time.Now().UTC().Format(time.RFC3339),
			"sources":    results,
		})
	}
}

// writeJSON writes a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("writeJSON encode failed", "error", err)
	}
}
