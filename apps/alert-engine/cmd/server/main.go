// cmd/server — alert-engine composition root.
// Port 5006 (NFR-4). Graceful shutdown on SIGINT/SIGTERM (NFR-6).
// CGO required (mattn/go-sqlite3). Fence-C: only this file may import
// pkg/infrastructure or mattn/go-sqlite3.
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

	"github.com/vn-market-intelligence/alert-engine/pkg/application"
	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	"github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"
	httphandler "github.com/vn-market-intelligence/alert-engine/pkg/interface/http"
	alertpipeline "github.com/vn-market-intelligence/alert-engine/pkg/module/alert_pipeline"
)

func main() {
	// AC-14: structured JSON logging
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	cfg := infrastructure.LoadConfig()

	slog.Info("alert-engine starting",
		"port", cfg.Port,
		"db_path", cfg.OwnDBPath,
	)

	// Open alert_engine.db — WAL mode, single writer (NFR-2)
	db, err := infrastructure.OpenAlertDB(cfg.OwnDBPath)
	if err != nil {
		slog.Error("failed to open alert DB", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// Run idempotent DDL migrations
	if err := infrastructure.InitAlertTables(db); err != nil {
		slog.Error("failed to init alert tables", "error", err)
		os.Exit(1)
	}

	// Wire infra adapters — Fence-C: only the composition root injects these.
	alertRepo := infrastructure.NewSQLiteAlertRepository(db)
	muteRepo := infrastructure.NewSQLiteMuteRepository(db)
	telegram := infrastructure.NewTelegramClient(cfg)

	// Wire alert_pipeline module — G3: primary orchestrator, injected ports.
	_ = alertpipeline.New(alertRepo, muteRepo, telegram, domain.DefaultCooldownConfig)

	// Wire use case (HTTP handler delegates here; shares infra adapters).
	uc := application.NewEvaluateAlertUseCase(alertRepo, muteRepo, telegram)

	// Build HTTP router
	router := httphandler.NewRouter(uc)

	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown (NFR-6)
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

	slog.Info("alert-engine listening", "addr", addr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		slog.Error("HTTP server error", "error", err)
		os.Exit(1)
	}

	<-idleConnsClosed
	slog.Info("alert-engine stopped")
}
