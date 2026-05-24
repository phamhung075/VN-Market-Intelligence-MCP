// Stock Price Microservice — composition root.
//
// Fence-C: pkg/infrastructure and mattn/go-sqlite3 (CGO) are imported HERE ONLY.
// No other non-test file in the codebase may import them.
//
// This file:
//   1. Reads config from env vars
//   2. Constructs infrastructure adapters (Tier1/Tier2/Tier3 fetchers, history repo)
//   3. Delegates remaining DDD wiring to buildHandler() in wire.go
//   4. Starts the HTTP listener
//
// Build with CGO_ENABLED=1.
// Port: 5000 internal (configurable via $PORT); 5010 external per system-map.json.
package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"

	_ "github.com/mattn/go-sqlite3" // CGO SQLite driver — Fence-C: registered at composition root only

	"github.com/vn-market-intelligence/stock-price/pkg/infrastructure"
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

	// ── Infrastructure (Fence-C: only here) ──────────────────────────────────
	tier1 := infrastructure.NewTier1Fetcher()
	tier2 := infrastructure.NewTier2Fetcher()
	tier3 := infrastructure.NewTier3Fetcher(marketDBPath)
	historyRepo := infrastructure.NewSQLitePriceHistoryRepository(marketDBPath, ownDBPath)

	// ── Delegate DDD wiring to wire.go ───────────────────────────────────────
	mux := buildHandler(tier1, tier2, tier3, historyRepo)

	// ── Listen ───────────────────────────────────────────────────────────────
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
