// Package main — macro-indicators composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No logic.
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

	// Pre-scaffold: pkg/ packages (router, use cases, infrastructure) do not exist yet.
	// DI wiring is commented below — will be uncommented in P1-A4 when pkg/ stubs compile.
	// Importing chi and modernc-sqlite directly here so tools.go anchor can be removed.
	_ "github.com/go-chi/chi/v5"
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

	// Pre-scaffold DI wiring (P1-A4 will uncomment when pkg/ stubs exist):
	//
	// commodityFetcher := infrastructure.NewHTTPCommodityFetcher()
	// sbvRateRepo      := infrastructure.NewSBVRateRepository()
	// useCase          := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, logger)
	// router           := router.NewRouter(useCase, logger)
	//
	// For now, serve a minimal mux so the binary compiles and the server starts.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"macro-indicators","port":5004}`))
	})

	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
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
