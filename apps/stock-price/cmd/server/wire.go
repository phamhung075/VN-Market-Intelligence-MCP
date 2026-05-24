// Package main — DDD wiring helper (module + application + interface layers).
//
// buildHandler receives infrastructure ports (injected from main.go, Fence-C)
// and wires the remaining DDD layers:
//   Module (price_resolution) → Application (use cases) → Interface/HTTP (handler)
//
// This file does NOT import pkg/infrastructure or mattn/go-sqlite3.
// Those CGO dependencies are confined to main.go (Fence-C).
package main

import (
	"net/http"

	"github.com/vn-market-intelligence/stock-price/pkg/application"
	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	httphandler "github.com/vn-market-intelligence/stock-price/pkg/interface/http"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// buildHandler wires Module → Application → Interface/HTTP layers and returns
// a fully-configured net/http ServeMux. Infrastructure adapters are received
// as port interfaces so this file remains CGO-free.
//
// Layer wiring order:
//  1. Module      — price_resolution.New(tier1, tier2, tier3)
//  2. Application — FetchPriceUseCase + PriceHistoryUseCase
//  3. HTTP        — Handler.RegisterRoutes(mux)
func buildHandler(
	tier1, tier2, tier3 priceresolution.TierFetcher,
	historyRepo domain.PriceHistoryPort,
) *http.ServeMux {
	// ── Module ───────────────────────────────────────────────────────────────
	priceModule := priceresolution.New(tier1, tier2, tier3)

	// ── Application ──────────────────────────────────────────────────────────
	fetchUC := application.NewFetchPriceUseCase(priceModule)
	historyUC := application.NewPriceHistoryUseCase(historyRepo)

	// ── Interface/HTTP ────────────────────────────────────────────────────────
	handler := httphandler.NewHandler(fetchUC, historyUC)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	return mux
}
