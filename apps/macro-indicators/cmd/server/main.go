// Package main — macro-indicators composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No business logic.
//
// P2-X3: DI wiring complete — infrastructure adapters injected into use case,
// use case injected into router. All routes live, 501 stubs resolved.
//
// Sandbox security (charter §Security Clause macro-specific addition):
// reads ZERO secrets — only PORT (default 5004) and LOG_LEVEL (default "INFO").
// No DB credentials, no API keys, no external service credentials in this process env.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
	"github.com/vn-market-intelligence/macro-indicators/pkg/infrastructure"
	iface "github.com/vn-market-intelligence/macro-indicators/pkg/interface/http"

	_ "modernc.org/sqlite"
)

func main() {
	port := envStr("PORT", "5004")
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	// DI wiring: select commodity adapter based on COMMODITY_LIVE_MODE env gate.
	// Fence-C: only this file (cmd/server/main.go) imports pkg/infrastructure.
	// COMMODITY_LIVE_MODE unset/false → HTTPCommodityFetcher (fixture, sandbox-safe DEFAULT).
	// COMMODITY_LIVE_MODE=true → SQLiteCommodityRepository (reads live market.db).
	var commodityFetcher domain.CommodityFetcherPort
	if os.Getenv("COMMODITY_LIVE_MODE") == "true" {
		commodityFetcher = infrastructure.NewSQLiteCommodityRepository()
	} else {
		commodityFetcher = infrastructure.NewHTTPCommodityFetcher("")
	}
	sbvRateRepo := infrastructure.NewSBVRateSQLiteAdapter()
	marketIndexRepo := infrastructure.NewSQLiteMarketIndexRepository()
	useCase := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, marketIndexRepo)
	router := iface.NewRouter(useCase, logger)

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

	slog.Info("macro-indicators starting", "port", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("HTTP server error", "error", err)
		os.Exit(1)
	}
	<-idleConnsClosed
	slog.Info("macro-indicators stopped")
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
