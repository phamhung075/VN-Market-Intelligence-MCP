// Package main — news-fetch composition root (Go port).
//
// Ports the Node/Bun news-fetch service RSS/API paths to Go.
// Out of scope: Playwright/chromium scraping (stays in mcp-server).
//
// HTTP server on port 5008 (matches existing Node service port mapping).
// SQLite via modernc.org/sqlite (CGO_ENABLED=0, pure-Go).
//
// Endpoints:
//   GET /health               → 200 {"status":"ok"}
//   POST /vneconomy/fetch     → fetch + store vneconomy RSS articles
//   POST /vnexpress/fetch     → fetch + store vnexpress RSS articles
//   POST /newsapi/fetch       → fetch + store newsapi articles (stub when no key)
//   POST /vps/fetch           → fetch + store VPS proxy articles (stub when no host)
//   POST /fetch/all           → run all four sources in sequence
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
	"github.com/vn-market-intelligence/news-fetch/internal/store"
)

func main() {
	port := envStr("PORT", "5008")
	dbPath := envStr("DB_PATH", "/app/data/market.db")
	vpsHost := envStr("VPS_HOST", "")
	newsAPIKey := envStr("NEWSAPI_KEY", "")
	newsAPIEnabled := newsAPIKey != ""

	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	// ── SQLite store ─────────────────────────────────────────────────────────
	s, err := store.Open(dbPath)
	if err != nil {
		slog.Error("failed to open SQLite store", "error", err, "path", dbPath)
		os.Exit(1)
	}
	defer s.Close()

	// ── Fetchers ─────────────────────────────────────────────────────────────
	vnEconomyFetcher := fetcher.NewVnEconomyFetcher(nil, 20)
	vnExpressFetcher := fetcher.NewVnExpressFetcher(nil, 20)
	newsAPIFetcher := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{
		APIKey:  newsAPIKey,
		Enabled: newsAPIEnabled,
	}, nil)
	vpsProxyFetcher := fetcher.NewVPSProxyFetcher(vpsHost, nil)

	// ── Router ───────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/health", handleHealth())
	r.Post("/vneconomy/fetch", handleRSSFetch("vneconomy", vnEconomyFetcher.Fetch, s, logger))
	r.Post("/vnexpress/fetch", handleRSSFetch("vnexpress", vnExpressFetcher.Fetch, s, logger))
	r.Post("/newsapi/fetch", handleRSSFetch("newsapi", newsAPIFetcher.Fetch, s, logger))
	r.Post("/vps/fetch", handleRSSFetch("vps_proxy", vpsProxyFetcher.Fetch, s, logger))
	r.Post("/fetch/all", handleFetchAll(
		vnEconomyFetcher.Fetch,
		vnExpressFetcher.Fetch,
		newsAPIFetcher.Fetch,
		vpsProxyFetcher.Fetch,
		s, logger,
	))

	// ── HTTP server ───────────────────────────────────────────────────────────
	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	idleConnsClosed := make(chan struct{})
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		sig := <-quit
		slog.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("HTTP server shutdown error", "error", err)
		}
		close(idleConnsClosed)
	}()

	slog.Info("news-fetch starting", "port", port, "db", dbPath)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("HTTP server error", "error", err)
		os.Exit(1)
	}
	<-idleConnsClosed
	slog.Info("news-fetch stopped")
}

// handleHealth serves GET /health → 200 {"status":"ok"}.
func handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"news-fetch","port":5008}`))
	}
}

// fetchFunc is the signature shared by all fetcher.Fetch methods.
type fetchFunc func(ctx context.Context) ([]fetcher.RssItem, error)

// fetchResult is the JSON response shape for fetch endpoints.
type fetchResult struct {
	Source    string `json:"source"`
	Inserted  int    `json:"inserted"`
	FetchedAt string `json:"fetched_at"`
	Error     string `json:"error,omitempty"`
}

// handleRSSFetch returns an HTTP handler that runs a single fetch source and
// persists the results to SQLite.
func handleRSSFetch(source string, fn fetchFunc, s *store.Store, logger *slog.Logger) http.HandlerFunc {
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
func handleFetchAll(
	vnEconomy, vnExpress, newsAPI, vpsProxy fetchFunc,
	s *store.Store, logger *slog.Logger,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()

		sources := []struct {
			name string
			fn   fetchFunc
		}{
			{"vneconomy", vnEconomy},
			{"vnexpress", vnExpress},
			{"newsapi", newsAPI},
			{"vps_proxy", vpsProxy},
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

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
