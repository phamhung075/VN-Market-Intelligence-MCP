// Package infrastructure — live SBV official FX reader (DPI-1).
//
// DPI-1: SBVRateSQLiteAdapter reads usd_vnd_official from market.db sbv_rates
// table (source='sbv'). Replaces the fixture SBVRateRepository
// (repositories_fixture.go) for live deployments. Returns (0, nil) on
// absent/stale rows (safe-degrade).
//
// Split from repositories.go (FACTORY-MACRO-split-repositories, 2026-07-09) —
// see repositories_fixture.go's package doc comment for the full 5-file map.
// The "open ro -> defer Close -> fetch" shape below calls the shared
// openReadOnly(dbPath) helper defined in repositories_carry_yield.go.
//
// size-justification: ~133L — one adapter, one port method (GetRate) plus its
// test-injectable pure-query helper (fetchSBVRateFromDB) — the doc comment's
// safe-degrade contract bullet list and the query/staleness logic it describes
// must stay directly beside each other; there is nothing left to extract into
// a second file without splitting one method from its own helper.
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"os"
	"time"
)

// ---------------------------------------------------------------------------
// SBVRateSQLiteAdapter — live SBV official FX reader (DPI-1)
// ---------------------------------------------------------------------------

// sbvStaleBound is the maximum age of an sbv_rates row before it is treated as
// stale and the application layer falls back to the commodity price (Yahoo).
// 6h = SBV refresh cadence (~4h) + 2h cron drift tolerance.
const sbvStaleBound = 6 * time.Hour

// SBVRateSQLiteAdapter implements domain.SBVRatePort.
// Reads usd_vnd_official from the shared market.db SQLite database
// (mounted at DB_PATH env var, readonly). Pattern mirrors SQLiteCommodityRepository.
//
// Safe-degrade contract: returns (0, nil) — not an error — when:
//   - DB file is missing or unreadable
//   - sbv_rates table has no row for source='sbv'
//   - usd_vnd_official is 0 (DEFAULT 0 on fresh schema before SBV cron fires)
//   - fetched_at is older than 6 hours (staleness window exceeded)
//
// R-3 note: on the first request post-rebuild, sbv_rates may be empty (SBV cron
// has not yet fired). GetRate returns (0, nil) → Execute() keeps Yahoo USDVND as
// fallback. This is correct safe-degrade; next SBV cron fire (every 4h) fills it.
type SBVRateSQLiteAdapter struct {
	dbPath string
}

// NewSBVRateSQLiteAdapter creates an SBV rate adapter backed by the shared market.db.
// dbPath is read from the DB_PATH env var; falls back to /app/data/market.db.
// No error in constructor — errors are deferred to GetRate().
func NewSBVRateSQLiteAdapter() *SBVRateSQLiteAdapter {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &SBVRateSQLiteAdapter{dbPath: dbPath}
}

// GetRate returns the SBV official exchange rate for the given currency pair.
// Only "USD"→"VND" is supported (reads sbv_rates.usd_vnd_official WHERE source='sbv').
// Returns (0, nil) — not an error — when the pair is not supported, DB is absent,
// row is missing, value is 0, or the row is older than 6 hours.
func (a *SBVRateSQLiteAdapter) GetRate(
	ctx context.Context,
	from, to string,
) (float64, error) {
	if from != "USD" || to != "VND" {
		// Only USD→VND is stored in sbv_rates; unsupported pair → safe degrade.
		return 0, nil
	}

	db, _ := openReadOnly(a.dbPath)
	if db == nil {
		// DB not present or not openable — degrade gracefully.
		return 0, nil
	}
	defer db.Close()

	return fetchSBVRateFromDB(ctx, db, sbvStaleBound)
}

// fetchSBVRateFromDB is the pure query logic extracted from GetRate so tests
// can inject a *sql.DB directly (in-memory :memory:) without touching the
// file-path constructor. Pattern mirrors fetchCommodityPricesFromDB.
// Returns (0, nil) on missing row, zero value, or stale row (safe-degrade).
func fetchSBVRateFromDB(
	ctx context.Context,
	db *sql.DB,
	staleBound time.Duration,
) (float64, error) {
	const query = `
		SELECT usd_vnd_official, fetched_at
		FROM sbv_rates
		WHERE source = 'sbv'
		LIMIT 1`

	var (
		rate      sql.NullFloat64
		fetchedAt sql.NullString
	)

	err := db.QueryRowContext(ctx, query).Scan(&rate, &fetchedAt)
	if err != nil {
		// No row (sql.ErrNoRows) or table absent — return 0, not error.
		return 0, nil //nolint:nilerr // intentional: caller uses commodity fallback
	}

	// Zero value: sbv_rates has a row but usd_vnd_official is still 0 (fresh
	// schema before SBV cron fires, or DEFAULT 0). Return 0 to trigger fallback.
	if !rate.Valid || rate.Float64 <= 0 {
		return 0, nil
	}

	// Staleness check: fetched_at must be within sbvStaleBound.
	// TypeScript writes new Date().toISOString() = ms precision; use RFC3339Nano.
	if !fetchedAt.Valid {
		return 0, nil
	}

	ts, err := time.Parse(time.RFC3339Nano, fetchedAt.String)
	if err != nil {
		// Unparseable timestamp — treat as infinitely stale.
		return 0, nil
	}

	if time.Since(ts) > staleBound {
		// Row is outside the staleness window — commodity fallback.
		return 0, nil
	}

	return rate.Float64, nil
}
