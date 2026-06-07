// Package domain — port interfaces for external adapters.
// Ported from src/domain/repositories.ts (core ports only).
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

import (
	"context"
	"time"
)

// CommodityFetcherPort is the port for commodity price retrieval (oil, gold, etc.).
// Implemented in pkg/infrastructure; never referenced from pkg/domain implementation code.
type CommodityFetcherPort interface {
	// FetchPrices retrieves spot prices for the given commodity symbols (e.g. "OIL", "GOLD").
	// Returns a map[symbol]price or an error if the source is unreachable.
	// TODO(P1-B1): extend symbol set when FRED/commodity HTTP adapter is implemented.
	FetchPrices(ctx context.Context, symbols []string) (map[string]float64, error)
}

// SBVRatePort is the port for State Bank of Vietnam (SBV) exchange rate queries.
// Implemented in pkg/infrastructure; never referenced from pkg/domain implementation code.
type SBVRatePort interface {
	// GetRate returns the spot exchange rate from → to (e.g. "USD" → "VND").
	// TODO(P1-B1): implement SBV XML feed adapter in infrastructure layer.
	GetRate(ctx context.Context, from, to string) (float64, error)
}

// MarketIndexPort is the port for VN stock market index retrieval.
// Returns the most recent VN-Index value from the local market data store.
// Implemented in pkg/infrastructure; only cmd/server/main.go imports that package.
type MarketIndexPort interface {
	// FetchVNIndex returns the most recent VN-Index level (e.g. 1880.89).
	// Returns 0, nil when no data is available (caller falls back to fixture).
	FetchVNIndex(ctx context.Context) (float64, error)

	// FetchPrevSessionVnIndex returns the second-most-recent close from daily_ohlcv
	// WHERE code='VNINDEX' ORDER BY date DESC OFFSET 1 LIMIT 1.
	// Returns nil when fewer than 2 rows exist (first trading day safe-degrade).
	// U4: used by Execute() to compute VnIndex prev_session_delta + direction.
	FetchPrevSessionVnIndex(ctx context.Context) (*float64, error)
}

// CarryYieldInputsPort supplies the live regime INPUTS for the carry-trade and
// yield-spread primitives, read from the shared market.db. All methods return
// (0, nil) on absent/zero/stale rows (safe-degrade — caller keeps fixture).
//
// Implemented in pkg/infrastructure (CarryYieldInputsSQLiteAdapter).
// Only cmd/server/main.go imports pkg/infrastructure (Fence-C preserved).
// DPI-2b: replaces frozen fixture constants in usecases.go Execute() with live DB reads.
//
// DSI-INV-1: GetFedFundsSourceDate is added so the application layer can stamp
// the true FRED source date on the carry DTO (never time.Now() on fallback path).
type CarryYieldInputsPort interface {
	// GetVNDDepositRate returns the latest SBV max deposit rate (%) from
	// sbv_rates.max_deposit_rate_pct WHERE source='sbv'. Returns (0, nil) on absent/stale.
	GetVNDDepositRate(ctx context.Context) (float64, error)

	// GetFedFundsRate returns the latest Fed Funds effective rate (%) from
	// fred_series_daily WHERE series='EFFR' ORDER BY date DESC LIMIT 1.
	// Returns (0, nil) on absent/stale (staleness bound: 96h — FRED business-day lag).
	GetFedFundsRate(ctx context.Context) (float64, error)

	// GetFedFundsSourceDate returns the FRED source date (YYYY-MM-DD parsed as
	// midnight UTC) for the most recent EFFR row regardless of staleness.
	// Returns nil if the table is absent, the row has no date, or the date is
	// unparseable. Used by Execute() to stamp fetched_at on the carry DTO
	// (DSI-INV-1: never use time.Now() as the fallback source date).
	GetFedFundsSourceDate(ctx context.Context) (*time.Time, error)

	// GetEarningYield returns the latest VN equity earnings yield (%) from
	// tracked_indicators WHERE indicator='market_earning_yield' ORDER BY extracted_at DESC LIMIT 1.
	// Returns (0, nil) on absent/stale.
	GetEarningYield(ctx context.Context) (float64, error)
}
