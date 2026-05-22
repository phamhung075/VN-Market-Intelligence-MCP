// Package main — technical-analysis composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No logic.
//
// Sandbox security (charter §Security Clause):
// reads ZERO secrets — only PORT (default 5003) and LOG_LEVEL (default "INFO").
// No DB credentials, no API keys, no tokens in this process environment.
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

	calculator := infrastructure.NewTACalculator()
	priceRepo := infrastructure.NewSQLitePriceRepository()
	taService := domain.NewCalculateTAService(priceRepo, calculator)
	useCase := application.NewComputeTAUseCase(taService)
	router := httpinterface.NewRouter(useCase, logger)

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
