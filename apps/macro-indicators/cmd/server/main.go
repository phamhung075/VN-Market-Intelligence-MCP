// Package main — macro-indicators composition root.
//
// Responsibility: wire infrastructure adapters to domain ports, start HTTP server.
// Rules (G3): only imports, DI constructor calls, server startup. No business logic.
//
// P2-X3: DI wiring complete — infrastructure adapters injected into use case,
// use case injected into router. All routes live, 501 stubs resolved.
//
// VMT-2 (BOP): BOPUseCase wired with VpsFetchAdapter + BOP parser + URL builder.
// Route POST /bop added to RouterConfig. No excelize dep (pure JSON API, PROBE-2).
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
	// DPI-2b: inject CarryYieldInputsSQLiteAdapter — reads live deposit/fed/earningYield
	// from market.db so carry/yield regimes recompute from real data, not frozen fixtures.
	carryYieldRepo := infrastructure.NewCarryYieldInputsSQLiteAdapter()
	useCase := application.NewComputeMacroUseCase(commodityFetcher, sbvRateRepo, marketIndexRepo, carryYieldRepo)

	// VMT-2: BOP use case wiring.
	// Fence-C: only this file imports pkg/infrastructure.
	// Adapter closures bridge the application-layer interfaces (BOPParser, BOPURLBuilder) to
	// the concrete infrastructure functions without pkg/infrastructure importing pkg/application.
	// All adapter types are defined here (composition root) to respect DDD layer isolation.
	vpsFetchAdapter := infrastructure.NewVpsFetchAdapter(logger)
	bopParser := &bopParserAdapter{}
	bopURLBuilder := &bopURLBuilderAdapter{}
	bopUseCase := application.NewBOPUseCase(vpsFetchAdapter, bopParser, bopURLBuilder)

	router := iface.NewRouter(iface.RouterConfig{
		Snapshot: useCase,
		BOP:      bopUseCase,
		Logger:   logger,
	})

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

// ---------------------------------------------------------------------------
// VMT-2 composition-root adapters
//
// These types bridge the application-layer interfaces (BOPParser, BOPURLBuilder)
// to the concrete infrastructure functions WITHOUT pkg/infrastructure importing
// pkg/application (which would be a DDD Fence-B violation).
//
// They live here — the composition root (cmd/server/main.go) is the only file
// allowed to import BOTH pkg/application AND pkg/infrastructure (Fence-C).
// ---------------------------------------------------------------------------

// bopParserAdapter implements application.BOPParser using infrastructure.ParseBOPResponse.
// Composition-root type: lives in cmd/server/main.go (Fence-C compliant).
type bopParserAdapter struct{}

// Parse delegates to infrastructure.ParseBOPResponse.
// Returns domain.BOPRecord — satisfies the application.BOPParser interface.
func (a *bopParserAdapter) Parse(body []byte) (domain.BOPRecord, error) {
	return infrastructure.ParseBOPResponse(body)
}

// bopURLBuilderAdapter implements application.BOPURLBuilder using infrastructure helpers.
// Composition-root type: lives in cmd/server/main.go (Fence-C compliant).
type bopURLBuilderAdapter struct{}

// BuildURL delegates to infrastructure.BuildBOPFetchURL.
func (b *bopURLBuilderAdapter) BuildURL(start, end string) string {
	return infrastructure.BuildBOPFetchURL(start, end)
}

// QuarterWindow delegates to infrastructure.CurrentQuarterWindow.
func (b *bopURLBuilderAdapter) QuarterWindow(t time.Time) (string, string) {
	return infrastructure.CurrentQuarterWindow(t)
}

// PrevQuarterWindow delegates to infrastructure.PrevQuarterWindow.
func (b *bopURLBuilderAdapter) PrevQuarterWindow(t time.Time) (string, string) {
	return infrastructure.PrevQuarterWindow(t)
}
