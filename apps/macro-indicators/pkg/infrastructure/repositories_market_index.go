// Package infrastructure — live VN-Index reader (MACRO-SEED-WIRING).
//
// MACRO-SEED-WIRING: SQLiteMarketIndexRepository reads VN-Index from market.db
// (readonly) at /app/data/market.db (env DB_PATH). Satisfies the MarketIndexPort
// so the live VN-Index level is surfaced in /snapshot responses instead of the
// seed/fixture constant.
//
// Split from repositories.go (FACTORY-MACRO-split-repositories, 2026-07-09) —
// see repositories_fixture.go's package doc comment for the full 5-file map.
// The "open ro -> defer Close -> fetch" shape below calls the shared
// openReadOnly(dbPath) helper defined in repositories_carry_yield.go.
//
// size-justification: ~151L — one adapter with 2 port methods (FetchVNIndex's
// two-tier primary/secondary query + FetchPrevSessionVnIndex/its
// test-injectable helper) that share the same VN-Index domain and safe-degrade
// contract; the U4 prev-session method was deliberately added beside
// FetchVNIndex (not a separate file) because it exists to serve that same
// method's delta computation — splitting it out would separate two things
// that already reference each other in their doc comments.
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"os"
)

// ---------------------------------------------------------------------------
// SQLiteMarketIndexRepository — live VN-Index reader (MACRO-SEED-WIRING)
// ---------------------------------------------------------------------------

// SQLiteMarketIndexRepository implements domain.MarketIndexPort.
// Reads the most recent VN-Index level from the local market.db SQLite database
// (mounted at DB_PATH env var, default /app/data/market.db, readonly).
//
// Query strategy (two-tier, ordered by data freshness):
//
//  1. PRIMARY: market_prices WHERE code = 'VNINDEX'
//     Populated every 5 min by mcp-server's vnIndexRefreshJob (Task 1397) via
//     VnDirect vnmarket_prices API. This is the same source as get_market_snapshot
//     and is the authoritative live value. The column is `price` (REAL).
//
//  2. SECONDARY (fallback): macro_indicators WHERE indicator_name LIKE '%VN-Index%'
//     Populated by the macro indicator daily refresh job. Kept as a safety net
//     for deployments where the primary table is absent (schema not yet migrated).
//
// Returns (0, nil) when the DB is not present or both tables have no matching
// rows; the application layer treats 0 as "no data" and falls back to the
// fixture default. This ensures safe degradation.
type SQLiteMarketIndexRepository struct {
	dbPath string
}

// NewSQLiteMarketIndexRepository creates a market index repository.
// dbPath is read from the DB_PATH env var; falls back to /app/data/market.db.
func NewSQLiteMarketIndexRepository() *SQLiteMarketIndexRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &SQLiteMarketIndexRepository{dbPath: dbPath}
}

// FetchVNIndex returns the most recent VN-Index value from market.db.
//
// Resolution order:
//  1. market_prices.price WHERE code = 'VNINDEX' (live, updated by vnIndexRefreshJob every 5 min)
//  2. macro_indicators.value WHERE indicator_name LIKE '%VN-Index%' (daily, legacy fallback)
//
// Returns (0, nil) on missing DB, no rows, or query error (safe degradation).
//
// U4: FetchPrevSessionVnIndex() is added below to supply prev-session close for delta computation.
func (repo *SQLiteMarketIndexRepository) FetchVNIndex(ctx context.Context) (float64, error) {
	db, _ := openReadOnly(repo.dbPath)
	if db == nil {
		// DB not present or not openable — degrade gracefully.
		return 0, nil
	}
	defer db.Close()

	// --- PRIMARY: market_prices table (vnIndexRefreshJob, live, ~5 min cadence) ---
	// This is the same data source as get_market_snapshot (VnDirect vnmarket_prices API).
	const primaryQuery = `
		SELECT price FROM market_prices
		WHERE code = 'VNINDEX' AND price IS NOT NULL AND price > 0
		ORDER BY updated_at DESC LIMIT 1`

	var value float64
	err := db.QueryRowContext(ctx, primaryQuery).Scan(&value)
	if err == nil && value > 0 {
		return value, nil
	}

	// --- SECONDARY: macro_indicators table (legacy daily-refresh fallback) ---
	// Kept as a safety net when market_prices.VNINDEX is absent (schema not yet migrated).
	const secondaryQuery = `
		SELECT value FROM macro_indicators
		WHERE indicator_name LIKE '%VN-Index%' OR indicator_name LIKE '%VNINDEX%'
		ORDER BY fetched_at DESC LIMIT 1`

	err = db.QueryRowContext(ctx, secondaryQuery).Scan(&value)
	if err == nil && value > 0 {
		return value, nil
	}

	// Both tables empty or unavailable — return 0 for graceful fixture fallback.
	return 0, nil
}

// FetchPrevSessionVnIndex returns the second-most-recent close from daily_ohlcv
// WHERE code='VNINDEX', ORDER BY date DESC, OFFSET 1 LIMIT 1.
//
// U4: used by Execute() to compute prev_session_delta + direction for the VN-Index
// headline value. Oil/gold/usdVnd have no prev-session history (single-row tables)
// so this method is VN-Index specific.
//
// Returns nil when:
//   - DB file is missing or unreadable
//   - daily_ohlcv has fewer than 2 VNINDEX rows (first trading day safe-degrade)
//   - query errors for any reason
//
// Never returns an error to the caller — all errors become nil (safe-degrade).
func (repo *SQLiteMarketIndexRepository) FetchPrevSessionVnIndex(ctx context.Context) (*float64, error) {
	db, _ := openReadOnly(repo.dbPath)
	if db == nil {
		// DB not present or not openable — nil = "no prev session" (safe-degrade).
		return nil, nil
	}
	defer db.Close()

	return fetchPrevSessionVnIndexFromDB(ctx, db)
}

// fetchPrevSessionVnIndexFromDB is the pure query logic extracted from
// FetchPrevSessionVnIndex so tests can inject a *sql.DB directly.
// Returns nil on missing table, fewer than 2 rows, or any query error.
func fetchPrevSessionVnIndexFromDB(ctx context.Context, db *sql.DB) (*float64, error) {
	// daily_ohlcv schema: (code TEXT, date TEXT, close REAL, ...)
	// ORDER BY date DESC LIMIT 1 OFFSET 1 = second-most-recent row = prev session close.
	const query = `
		SELECT close FROM daily_ohlcv
		WHERE code = 'VNINDEX' AND close IS NOT NULL AND close > 0
		ORDER BY date DESC
		LIMIT 1 OFFSET 1`

	var prevClose sql.NullFloat64
	err := db.QueryRowContext(ctx, query).Scan(&prevClose)
	if err != nil {
		// sql.ErrNoRows or table absent — < 2 rows = first trading day safe-degrade.
		return nil, nil //nolint:nilerr // intentional: caller uses "unknown" direction
	}
	if !prevClose.Valid || prevClose.Float64 <= 0 {
		return nil, nil
	}
	v := prevClose.Float64
	return &v, nil
}
