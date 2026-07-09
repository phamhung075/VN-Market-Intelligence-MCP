// Package infrastructure — live carry/yield regime inputs reader (DPI-2b).
//
// DPI-2b: CarryYieldInputsSQLiteAdapter reads the three live carry/yield
// regime inputs (VND deposit rate, Fed funds rate/EFFR, VN equity earnings
// yield) from the shared market.db.
//
// This file also hosts the shared openReadOnly(dbPath) helper — originally a
// private method on CarryYieldInputsSQLiteAdapter, promoted to a
// package-level function during the repositories.go split (2026-07-09) so
// every live SQLite adapter in this package (market index, commodity,
// commodity history, SBV rate, carry/yield) reuses the same "open ro ->
// safe-degrade on error" shape instead of duplicating sql.Open inline.
//
// Split from repositories.go (FACTORY-MACRO-split-repositories, 2026-07-09) —
// see repositories_fixture.go's package doc comment for the full 5-file map.
//
// size-justification: ~300L — one adapter (CarryYieldInputsSQLiteAdapter) with
// 4 port methods (GetVNDDepositRate/GetFedFundsRate/GetFedFundsSourceDate/
// GetEarningYield), each with its own test-injectable pure-query helper
// (mirrors the existing per-method extraction pattern used throughout this
// package) plus the shared openReadOnly helper used package-wide. Splitting
// the 4 methods/helpers across separate files would fragment one adapter's
// single safe-degrade contract and duplicate the shared-helper placement
// question 4 times for no locality gain.
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "modernc.org/sqlite" // register "sqlite" driver
)

// openReadOnly opens the SQLite database at dbPath in read-only mode.
// Returns (nil, nil) — not an error — when the file is absent or unopenable
// (safe-degrade); callers check db == nil and apply their own fixture/fallback
// value. Shared across every live SQLite adapter in this package so the
// "open ro -> defer Close -> fetch" shape is not duplicated per-file.
func openReadOnly(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", dbPath))
	if err != nil {
		return nil, nil //nolint:nilerr // intentional: caller safe-degrades on nil db
	}
	return db, nil
}

// ---------------------------------------------------------------------------
// CarryYieldInputsSQLiteAdapter — live carry/yield regime inputs reader (DPI-2b)
// ---------------------------------------------------------------------------

// effrStaleBound is the maximum age of a fred_series_daily EFFR row before it
// is treated as stale and Execute() falls back to fixtureFedFundsRate.
//
// FIX-MACRO-GO-FIXTURE-FALLBACK: extended from 96h to 168h (7 days).
//
// Rationale: FRED publishes EFFR on business days only. The previous 96h bound
// was designed for the canonical Fri-close → Mon-open gap (~72h), but fails when
// the most recent FRED row is from mid-week (e.g. Tuesday) and the service is
// queried on a Sunday — a 5-day (120h) gap that falls outside 96h.
//
// 168h covers the worst-case FRED publication gap: Monday publication
// followed by a 4-day holiday weekend → the next business-day row arrives
// the following Monday (7 calendar days later). Using the bridged DB value
// (even if 5–6 days old) is always better than serving the hardcoded
// fixture 5.33 — the rate changes rarely and the DB value reflects the
// last known FRED publication.
//
// Fallback chain: direct FRED fetch (tier 1, handled by mcp-server cron)
// → this DB path (tier 2, within 168h) → fixture 5.33 (tier 4, NO row at all).
const effrStaleBound = 168 * time.Hour

// depositYieldStaleBound is the maximum age of sbv_rates.max_deposit_rate_pct
// and tracked_indicators.market_earning_yield rows before safe-degrade.
// 26h = daily producer cadence + 2h cron drift tolerance (mirrors commodityStaleBound).
const depositYieldStaleBound = 26 * time.Hour

// CarryYieldInputsSQLiteAdapter implements domain.CarryYieldInputsPort.
// Reads the three live carry/yield regime inputs from the shared market.db
// (mounted at DB_PATH env var, readonly). Pattern mirrors SBVRateSQLiteAdapter.
//
// Safe-degrade contract (per method): return (0, nil) — never an error — on:
//   - DB file missing or unreadable
//   - table absent or no matching row
//   - NULL or zero value
//   - unparseable or stale timestamp (fetched_at / extracted_at)
//
// (NOT a silent hardcode — fixture fallback happens explicitly in Execute().)
type CarryYieldInputsSQLiteAdapter struct {
	dbPath string
}

// NewCarryYieldInputsSQLiteAdapter creates a carry/yield inputs adapter backed
// by the shared market.db. dbPath is read from the DB_PATH env var; falls back
// to /app/data/market.db. No error in constructor — errors deferred to methods.
func NewCarryYieldInputsSQLiteAdapter() *CarryYieldInputsSQLiteAdapter {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &CarryYieldInputsSQLiteAdapter{dbPath: dbPath}
}

// GetVNDDepositRate returns the latest SBV max deposit rate (%) from
// sbv_rates.max_deposit_rate_pct WHERE source='sbv'. Returns (0, nil) on
// absent/stale rows (safe-degrade — Execute() keeps fixtureVNDDepositRate).
//
// Staleness bound: 26h (SBV daily cadence + 2h drift).
func (a *CarryYieldInputsSQLiteAdapter) GetVNDDepositRate(ctx context.Context) (float64, error) {
	db, _ := openReadOnly(a.dbPath)
	if db == nil {
		return 0, nil
	}
	defer db.Close()
	return fetchVNDDepositRateFromDB(ctx, db, depositYieldStaleBound)
}

// GetFedFundsRate returns the latest EFFR value (%) from fred_series_daily
// WHERE series='EFFR' ORDER BY date DESC LIMIT 1. Returns (0, nil) on
// absent/stale rows (safe-degrade — Execute() keeps fixtureFedFundsRate).
//
// Staleness bound: 96h (FRED business-day lag over weekends).
func (a *CarryYieldInputsSQLiteAdapter) GetFedFundsRate(ctx context.Context) (float64, error) {
	db, _ := openReadOnly(a.dbPath)
	if db == nil {
		return 0, nil
	}
	defer db.Close()
	return fetchFedFundsRateFromDB(ctx, db, effrStaleBound)
}

// GetFedFundsSourceDate returns the FRED source date for the most recent EFFR row,
// regardless of staleness. Returns nil when the table is absent, no rows exist,
// or the date string is unparseable.
//
// DSI-INV-1: callers use this to stamp carry DTO fetched_at with the true FRED
// date rather than time.Now() on the fallback path.
func (a *CarryYieldInputsSQLiteAdapter) GetFedFundsSourceDate(ctx context.Context) (*time.Time, error) {
	db, _ := openReadOnly(a.dbPath)
	if db == nil {
		return nil, nil
	}
	defer db.Close()
	return fetchFedFundsSourceDateFromDB(ctx, db)
}

// GetEarningYield returns the latest VN equity earnings yield (%) from
// tracked_indicators WHERE indicator='market_earning_yield' ORDER BY extracted_at DESC.
// Returns (0, nil) on absent/stale rows (safe-degrade — Execute() keeps fixtureEarningYield).
//
// Staleness bound: 26h (daily job cadence + 2h drift).
func (a *CarryYieldInputsSQLiteAdapter) GetEarningYield(ctx context.Context) (float64, error) {
	db, _ := openReadOnly(a.dbPath)
	if db == nil {
		return 0, nil
	}
	defer db.Close()
	return fetchEarningYieldFromDB(ctx, db, depositYieldStaleBound)
}

// ---------------------------------------------------------------------------
// Pure query helpers (test-injectable via *sql.DB)
// ---------------------------------------------------------------------------

// fetchVNDDepositRateFromDB reads sbv_rates.max_deposit_rate_pct WHERE source='sbv'.
// Extracted from GetVNDDepositRate so tests can inject a *sql.DB directly.
// Returns (0, nil) on missing row, zero value, or stale fetched_at.
func fetchVNDDepositRateFromDB(
	ctx context.Context,
	db *sql.DB,
	staleBound time.Duration,
) (float64, error) {
	const query = `
		SELECT max_deposit_rate_pct, fetched_at
		FROM sbv_rates
		WHERE source = 'sbv'
		LIMIT 1`

	var (
		rate      sql.NullFloat64
		fetchedAt sql.NullString
	)

	if err := db.QueryRowContext(ctx, query).Scan(&rate, &fetchedAt); err != nil {
		return 0, nil //nolint:nilerr // intentional: safe-degrade
	}

	if !rate.Valid || rate.Float64 <= 0 {
		return 0, nil
	}

	if !fetchedAt.Valid {
		return 0, nil
	}

	// R-2 CRITICAL: TypeScript writes ms-precision ISO timestamps; use RFC3339Nano.
	ts, err := time.Parse(time.RFC3339Nano, fetchedAt.String)
	if err != nil {
		return 0, nil
	}

	if time.Since(ts) > staleBound {
		return 0, nil
	}

	return rate.Float64, nil
}

// fetchFedFundsRateFromDB reads fred_series_daily WHERE series='EFFR' latest by date.
// Extracted from GetFedFundsRate so tests can inject a *sql.DB directly.
// Returns (0, nil) on missing row, zero value, or stale date.
//
// The fred_series_daily table stores the date column as TEXT (YYYY-MM-DD).
// Staleness is measured against the date column parsed as a day boundary
// (time.DateOnly), not an RFC3339Nano timestamp — FRED rows are day-granular.
func fetchFedFundsRateFromDB(
	ctx context.Context,
	db *sql.DB,
	staleBound time.Duration,
) (float64, error) {
	const query = `
		SELECT value, date
		FROM fred_series_daily
		WHERE series = 'EFFR' AND value IS NOT NULL AND value > 0
		ORDER BY date DESC
		LIMIT 1`

	var (
		value sql.NullFloat64
		date  sql.NullString
	)

	if err := db.QueryRowContext(ctx, query).Scan(&value, &date); err != nil {
		return 0, nil //nolint:nilerr // intentional: safe-degrade
	}

	if !value.Valid || value.Float64 <= 0 {
		return 0, nil
	}

	if !date.Valid {
		return 0, nil
	}

	// FRED date column is YYYY-MM-DD; parse as date-only and treat as midnight UTC.
	ts, err := time.Parse(time.DateOnly, date.String)
	if err != nil {
		return 0, nil
	}

	if time.Since(ts) > staleBound {
		return 0, nil
	}

	return value.Float64, nil
}

// fetchFedFundsSourceDateFromDB returns the FRED date for the most recent EFFR row.
// It does NOT apply the staleness gate — it returns the raw date so the caller
// can stamp fetched_at on the carry DTO without using time.Now().
// Returns nil on missing table, no rows, or unparseable date.
func fetchFedFundsSourceDateFromDB(ctx context.Context, db *sql.DB) (*time.Time, error) {
	const query = `
		SELECT date
		FROM fred_series_daily
		WHERE series = 'EFFR' AND date IS NOT NULL
		ORDER BY date DESC
		LIMIT 1`

	var dateStr sql.NullString
	if err := db.QueryRowContext(ctx, query).Scan(&dateStr); err != nil {
		return nil, nil //nolint:nilerr // intentional: caller stamps nil
	}
	if !dateStr.Valid {
		return nil, nil
	}

	// FRED date is YYYY-MM-DD; parse as midnight UTC so it is a meaningful timestamp.
	ts, err := time.Parse(time.DateOnly, dateStr.String)
	if err != nil {
		return nil, nil
	}
	tsUTC := ts.UTC()
	return &tsUTC, nil
}

// fetchEarningYieldFromDB reads tracked_indicators WHERE indicator='market_earning_yield'
// ORDER BY extracted_at DESC LIMIT 1. Extracted from GetEarningYield so tests
// can inject a *sql.DB directly.
// Returns (0, nil) on missing row, zero value, or stale extracted_at.
func fetchEarningYieldFromDB(
	ctx context.Context,
	db *sql.DB,
	staleBound time.Duration,
) (float64, error) {
	const query = `
		SELECT value, extracted_at
		FROM tracked_indicators
		WHERE indicator = 'market_earning_yield' AND value IS NOT NULL AND value > 0
		ORDER BY extracted_at DESC
		LIMIT 1`

	var (
		val         sql.NullFloat64
		extractedAt sql.NullString
	)

	if err := db.QueryRowContext(ctx, query).Scan(&val, &extractedAt); err != nil {
		return 0, nil //nolint:nilerr // intentional: safe-degrade
	}

	if !val.Valid || val.Float64 <= 0 {
		return 0, nil
	}

	if !extractedAt.Valid {
		return 0, nil
	}

	// R-2 CRITICAL: TypeScript writes ms-precision ISO timestamps; use RFC3339Nano.
	ts, err := time.Parse(time.RFC3339Nano, extractedAt.String)
	if err != nil {
		return 0, nil
	}

	if time.Since(ts) > staleBound {
		return 0, nil
	}

	return val.Float64, nil
}
