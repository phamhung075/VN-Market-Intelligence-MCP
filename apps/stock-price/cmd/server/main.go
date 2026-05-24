// Stock Price Microservice — Go entry point.
//
// DDD wiring: Config → Infrastructure → Domain → Application → Interface → Listen
//
// Tier3 requires CGO (mattn/go-sqlite3). Build with CGO_ENABLED=1.
// Port: 5000 (configurable via $PORT env var).
// DSN docs: file:path?mode=ro for market.db (readonly), WAL for stock_price.db (write).
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	_ "github.com/mattn/go-sqlite3" // CGO driver — registered once at composition root (Fence-C)

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/infrastructure"
	httphandler "github.com/vn-market-intelligence/stock-price/pkg/interface/http"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

func main() {
	// ── Config ───────────────────────────────────────────────────────────────
	port := envInt("PORT", 5000)
	marketDBPath := envStr("DB_PATH", "./data/market.db")
	ownDBPath := envStr("STOCK_PRICE_DB_PATH", "./data/stock_price.db")

	slog.Info("stock-price starting",
		"port", port,
		"market_db", marketDBPath,
		"own_db", ownDBPath,
	)

	// ── Infrastructure ───────────────────────────────────────────────────────
	tier1 := infrastructure.NewTier1Fetcher()
	tier2 := infrastructure.NewTier2Fetcher()
	tier3 := infrastructure.NewTier3Fetcher(marketDBPath)
	historyRepo := infrastructure.NewSQLitePriceHistoryRepository(marketDBPath, ownDBPath)

	// ── Module (price_resolution) — replaces deprecated domain.ResolvePriceService (G5a) ──
	priceModule := priceresolution.New(tier1, tier2, tier3)

	// ── Application ──────────────────────────────────────────────────────────
	fetchUC := application.NewFetchPriceUseCase(priceModule)
	historyUC := application.NewPriceHistoryUseCase(historyRepo)

	// ── Interface ────────────────────────────────────────────────────────────
	handler := httphandler.NewHandler(fetchUC, historyUC)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	addr := fmt.Sprintf(":%d", port)
	slog.Info("stock-price listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return fallback
}
