// Package main — technical-analysis composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No logic.
//
// Sandbox security (charter §Security Clause):
// reads ZERO secrets — only PORT (default 5003) and LOG_LEVEL (default "INFO").
// No DB credentials, no API keys, no tokens in this process environment.
//
// Volatility use case additionally reads:
//   WATCHLIST_TICKERS — comma-separated list of active ticker symbols for ATR%
//   computation (e.g. "VNM,FPT,VCB,HPG,..."). When absent, ATR computation
//   returns an empty list (non-fatal). Production: set from system-map.json
//   .project.watchlist by the ops team in docker-compose environment.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
	"github.com/vn-market-intelligence/technical-analysis/pkg/infrastructure"
	httpinterface "github.com/vn-market-intelligence/technical-analysis/pkg/interface/http"
)

func main() {
	port := envStr("PORT", "5003")
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	// --- TA indicators wiring (existing) ---
	calculator := infrastructure.NewTACalculator()
	priceRepo := infrastructure.NewSQLitePriceRepository()
	_ = domain.NewCalculateTAService(priceRepo, calculator) // domain service wired (unused HTTP path)
	useCase := application.NewComputeTAUseCase(calculator, priceRepo)

	// --- P0-1 Volatility wiring ---
	ohlcvRepo := infrastructure.NewSQLiteOHLCVRepository()
	volSvc := domain.NewVolatilityService()
	watchlist := parseWatchlist(envStr("WATCHLIST_TICKERS", ""))
	if len(watchlist) == 0 {
		slog.Warn("WATCHLIST_TICKERS not set — ATR% computation will return empty list; set env to enable")
	}
	volUseCase := application.NewComputeVolatilityUseCase(ohlcvRepo, volSvc, watchlist)

	router := httpinterface.NewRouter(useCase, volUseCase, logger)

	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	idleConnsClosed := make(chan struct{})
	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
		sig := <-quit
		slog.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("HTTP server shutdown error", "error", err)
		}
		close(idleConnsClosed)
	}()

	slog.Info("technical-analysis starting", "port", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("HTTP server error", "error", err)
		os.Exit(1)
	}
	<-idleConnsClosed
	slog.Info("technical-analysis stopped")
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// parseWatchlist splits a comma-separated ticker string into a trimmed slice.
// Returns nil when input is empty (not an error — ATR computation is non-fatal).
func parseWatchlist(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	tickers := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			tickers = append(tickers, t)
		}
	}
	return tickers
}
