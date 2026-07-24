// Package infrastructure — SJC gold + FX coupling SQLite adapter (VMT-5a).
//
// SJCGoldFXAdapter — reads SJC gold price + FX rates from EXISTING market.db tables.
// DB reads ONLY — NO new crawl, NO new VPS fetch (DD-7).
// Tables used:
//
//	commodity_prices (source='yahoo'): gold_usd_per_oz, usd_vnd_rate, dxy, cny_vnd_rate.
//	sbv_rates (source='sbv'): usd_vnd_official (center rate).
//
// SJC-specific price: currently not in market.db (no SJC crawler row).
// Fail-closed: missing SJC → SJCPriceMnVND = 0 (domain layer computes is_estimate=true).
//
// Split from this file (FACTORY-MACRO-split-or-justify-over-cap, 2026-07-24): the SBV
// policy-rates HTML parse/fetch/TLS logic (ParseSBVPolicyRatesHTML, FetchSBVPolicyRatesFromHTML,
// FetchSBVPolicyRatesFromDB, ParseVNRate, and their shared HTML-walking helpers) now lives in
// the sibling file parsers_vmt_sbv_policy_rates.go (same package — no import-graph change).
//
// size-justification: ~167L — one adapter (SJCGoldFXAdapter) with one port method
// (FetchInputs) plus its test-injectable pure-query helper (fetchSJCFXInputsFromDB) that
// reads two DB tables (commodity_prices + sbv_rates) into the single SJCFXInputs DTO —
// the table-layout doc comment above and the query/staleness logic it describes must
// stay directly beside each other; there is nothing left to extract into its own file
// after the SBV policy-rates split above.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"
)

// ---------------------------------------------------------------------------
// SJC + FX coupling DB adapter
// ---------------------------------------------------------------------------

// sjcFXStaleBound is the maximum age of a commodity_prices / sbv_rates row before
// it is treated as stale. Mirrors commodityStaleBound from repositories.go (26h).
const sjcFXStaleBound = 26 * time.Hour

// SJCFXInputs holds the raw DB values needed to compute the liquidity-state blocs.
// All values are zero on error (safe-degrade — domain layer handles is_estimate flag).
type SJCFXInputs struct {
	// GoldUSDPerOz is the world gold price in USD per troy ounce.
	// From commodity_prices WHERE source='yahoo'.
	GoldUSDPerOz float64

	// USDVNDRate is the USD/VND exchange rate (Yahoo market rate).
	// From commodity_prices WHERE source='yahoo'.
	USDVNDRate float64

	// DXY is the US Dollar Index value.
	// From commodity_prices.dxy WHERE source='yahoo'.
	DXY float64

	// CNYVNDRate is the CNY/VND exchange rate.
	// From commodity_prices.cny_vnd_rate WHERE source='yahoo'.
	CNYVNDRate float64

	// SBVCenterRate is the SBV official USD/VND central rate.
	// From sbv_rates.usd_vnd_official WHERE source='sbv'.
	SBVCenterRate float64

	// SBVFetchedAt is the timestamp of the sbv_rates row (for staleness check).
	SBVFetchedAt string

	// SJCPriceMnVND is the SJC domestic gold buy price in million VND per tael.
	// Currently 0 — no SJC crawler row in market.db (DD-7, no new crawl).
	// When the SJC crawler lands, this field will be populated.
	SJCPriceMnVND float64
}

// SJCGoldFXAdapter reads SJC gold + FX coupling inputs from the EXISTING market.db.
// No new HTTP fetch — purely a DB read adapter (DD-7 compliant).
type SJCGoldFXAdapter struct {
	dbPath string
}

// NewSJCGoldFXAdapter creates a new adapter backed by the shared market.db.
// dbPath is read from the DB_PATH env var; falls back to /app/data/market.db.
func NewSJCGoldFXAdapter() *SJCGoldFXAdapter {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &SJCGoldFXAdapter{dbPath: dbPath}
}

// FetchInputs reads commodity_prices and sbv_rates from market.db.
// Returns zero-value SJCFXInputs on any DB error (fail-closed, safe-degrade).
func (a *SJCGoldFXAdapter) FetchInputs(ctx context.Context) (SJCFXInputs, error) {
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", a.dbPath))
	if err != nil {
		// DB not present or not openable — degrade gracefully.
		return SJCFXInputs{}, nil //nolint:nilerr // intentional: caller uses zero-values
	}
	defer db.Close()

	return fetchSJCFXInputsFromDB(ctx, db, sjcFXStaleBound)
}

// fetchSJCFXInputsFromDB is the pure query logic extracted for testability.
// Returns partial (non-zero) values where rows are found; zero for absent/stale rows.
func fetchSJCFXInputsFromDB(ctx context.Context, db *sql.DB, staleBound time.Duration) (SJCFXInputs, error) {
	var inputs SJCFXInputs

	// --- commodity_prices (yahoo source) ---
	const commodityQuery = `
		SELECT gold_usd_per_oz, usd_vnd_rate, dxy, cny_vnd_rate, fetched_at
		FROM commodity_prices
		WHERE source = 'yahoo'
		ORDER BY fetched_at DESC
		LIMIT 1`

	var (
		goldUSD    sql.NullFloat64
		usdVND     sql.NullFloat64
		dxy        sql.NullFloat64
		cnyVND     sql.NullFloat64
		fetchedAt  sql.NullString
	)

	err := db.QueryRowContext(ctx, commodityQuery).Scan(&goldUSD, &usdVND, &dxy, &cnyVND, &fetchedAt)
	if err == nil && fetchedAt.Valid {
		// R-2 CRITICAL: TypeScript writes ms-precision ISO timestamps; use RFC3339Nano.
		ts, parseErr := time.Parse(time.RFC3339Nano, fetchedAt.String)
		if parseErr == nil && time.Since(ts) <= staleBound {
			if goldUSD.Valid && goldUSD.Float64 > 0 {
				inputs.GoldUSDPerOz = goldUSD.Float64
			}
			if usdVND.Valid && usdVND.Float64 > 0 {
				inputs.USDVNDRate = usdVND.Float64
			}
			if dxy.Valid && dxy.Float64 > 0 {
				inputs.DXY = dxy.Float64
			}
			if cnyVND.Valid && cnyVND.Float64 > 0 {
				inputs.CNYVNDRate = cnyVND.Float64
			}
		}
	}

	// --- sbv_rates (sbv source) for center rate ---
	const sbvQuery = `
		SELECT usd_vnd_official, fetched_at
		FROM sbv_rates
		WHERE source = 'sbv'
		LIMIT 1`

	var (
		sbvRate      sql.NullFloat64
		sbvFetchedAt sql.NullString
	)

	sbvErr := db.QueryRowContext(ctx, sbvQuery).Scan(&sbvRate, &sbvFetchedAt)
	if sbvErr == nil && sbvFetchedAt.Valid && sbvRate.Valid && sbvRate.Float64 > 0 {
		ts, parseErr := time.Parse(time.RFC3339Nano, sbvFetchedAt.String)
		if parseErr == nil && time.Since(ts) <= staleBound {
			inputs.SBVCenterRate = sbvRate.Float64
			inputs.SBVFetchedAt = sbvFetchedAt.String
		}
	}

	// SJCPriceMnVND: no SJC crawler row in market.db (DD-7 — no new crawl).
	// When SJC crawler lands, query: commodity_prices WHERE source='sjc', column sjc_price_mn_vnd.
	// For now: always 0 → domain.ComputeSJCGoldGap uses fail-closed path (is_estimate=true).
	inputs.SJCPriceMnVND = 0

	return inputs, nil
}

