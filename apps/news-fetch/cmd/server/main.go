// Package main — news-fetch composition root (Go port).
//
// Ports the Node/Bun news-fetch service RSS/API paths to Go.
// Out of scope: Playwright/chromium scraping (stays in mcp-server).
//
// HTTP server on port 5008 by default (matches existing Node service port
// mapping; override via env PORT — see envStr below).
// SQLite via modernc.org/sqlite (CGO_ENABLED=0, pure-Go).
//
// HTTP handlers live in internal/httpapi (httpapi.Router) — this file is a
// thin composition root: env reads, store.Open, fetcher construction,
// graceful shutdown. No handler/routing logic here.
//
// Endpoints (see internal/httpapi for handler implementations):
//
//	GET /health               → 200 {"status":"ok","service":"news-fetch","port":<port>}
//	POST /vneconomy/fetch     → fetch + store vneconomy RSS articles
//	POST /vnexpress/fetch     → fetch + store vnexpress RSS articles
//	POST /newsapi/fetch       → fetch + store newsapi articles (stub when no key)
//	POST /vps/fetch           → fetch + store VPS proxy articles (stub when no host)
//	POST /fetch/all           → run all four sources in sequence
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/vn-market-intelligence/news-fetch/internal/fetcher"
	"github.com/vn-market-intelligence/news-fetch/internal/httpapi"
	"github.com/vn-market-intelligence/news-fetch/internal/store"
)

// defaultRSSMaxItems is the fetch-limit fallback used when RSS_MAX_ITEMS is
// unset or invalid (matches the fetcher package's own internal default).
const defaultRSSMaxItems = 20

func main() {
	port := envStr("PORT", "5008")
	dbPath := envStr("DB_PATH", "/app/data/market.db")
	vpsHost := envStr("VPS_HOST", "")
	newsAPIKey := envStr("NEWSAPI_KEY", "")
	newsAPIEnabled := newsAPIKey != ""
	rssMaxItems := envInt("RSS_MAX_ITEMS", defaultRSSMaxItems)

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
	vnEconomyFetcher := fetcher.NewVnEconomyFetcher(nil, rssMaxItems)
	vnExpressFetcher := fetcher.NewVnExpressFetcher(nil, rssMaxItems)
	newsAPIFetcher := fetcher.NewNewsAPIFetcher(fetcher.NewsAPIConfig{
		APIKey:  newsAPIKey,
		Enabled: newsAPIEnabled,
	}, nil)
	vpsProxyFetcher := fetcher.NewVPSProxyFetcher(vpsHost, nil)

	// ── Router ───────────────────────────────────────────────────────────────
	r := httpapi.Router(httpapi.Fetchers{
		VnEconomy: vnEconomyFetcher.Fetch,
		VnExpress: vnExpressFetcher.Fetch,
		NewsAPI:   newsAPIFetcher.Fetch,
		VPSProxy:  vpsProxyFetcher.Fetch,
	}, s, logger, port)

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

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envInt resolves an integer env var, falling back to fallback when unset or
// unparsable. Used for RSS_MAX_ITEMS so the fetch-limit is no longer a bare
// literal at either fetcher construction call site.
func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		slog.Warn("invalid int env value, using fallback", "key", key, "value", v, "fallback", fallback)
		return fallback
	}
	return n
}
