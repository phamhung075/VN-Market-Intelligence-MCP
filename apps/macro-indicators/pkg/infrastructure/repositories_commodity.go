// Package infrastructure — live commodity price readers (MACRO-LIVE-PRICES, S2-DATA-HONESTY).
//
// MACRO-LIVE-PRICES: SQLiteCommodityRepository reads commodity prices
// (oil/gold/usdvnd) from market.db commodity_prices table (source='yahoo').
// Activated by COMMODITY_LIVE_MODE=true env gate (composition root). Fixture
// mode (HTTPCommodityFetcher, repositories_fixture.go) remains the default
// when the gate is unset.
//
// S2-DATA-HONESTY: SQLiteCommodityHistoryRepository reads the prior-session
// commodity snapshot from commodity_prices_history so callers can compute a
// signed prev-close delta instead of serving an unsigned live-only value.
//
// Split from repositories.go (FACTORY-MACRO-split-repositories, 2026-07-09) —
// see repositories_fixture.go's package doc comment for the full 5-file map.
// The "open ro -> defer Close -> fetch" shape below calls the shared
// openReadOnly(dbPath) helper defined in repositories_carry_yield.go.
//
// size-justification: ~250L — both adapters read the same commodity_prices*
// domain (current row vs. prior-session row), share the identical
// partial-zero-guard + RFC3339Nano-staleness pattern (R-2/RISK-1 regression
// guards for bug #3003), and the task spec's 5-file split names exactly one
// "repositories_commodity.go" file for the commodity domain — splitting the
// history variant into its own file would fragment that shared staleness
// commentary for zero reuse benefit (each adapter's pure-query helper is
// still tests-injectable on its own, same as before the split).
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
// SQLiteCommodityRepository — live commodity price reader (MACRO-LIVE-PRICES)
// ---------------------------------------------------------------------------

// commodityStaleBound is the maximum age of a commodity_prices row before it
// is treated as stale and the application layer falls back to fixture defaults.
// 26h = 24h producer cadence (commodityTrackerRefreshJob, daily 06:00 UTC) +
// 2h cron drift tolerance.
const commodityStaleBound = 26 * time.Hour

// SQLiteCommodityRepository implements domain.CommodityFetcherPort.
// Reads the most recent commodity prices from the shared market.db SQLite
// database (mounted at DB_PATH env var, readonly).
//
// Resolution: commodity_prices WHERE source='yahoo' ORDER BY fetched_at DESC LIMIT 1.
// Staleness bound: 26 hours (24h producer cadence + 2h cron drift tolerance).
// Returns (nil, nil) — treated as empty map by application layer — when:
//   - DB file is missing or unreadable
//   - commodity_prices table has no 'yahoo' row
//   - fetched_at is NULL or older than 26 hours
//   - all three columns are NULL or <= 0
type SQLiteCommodityRepository struct {
	dbPath string
}

// NewSQLiteCommodityRepository creates a commodity repository.
// dbPath is read from the DB_PATH env var; falls back to /app/data/market.db.
// No error handling in constructor — errors are deferred to FetchPrices().
func NewSQLiteCommodityRepository() *SQLiteCommodityRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &SQLiteCommodityRepository{dbPath: dbPath}
}

// FetchPrices returns commodity prices for the requested symbols.
// Symbols recognised: "OIL" → brent_crude_usd, "GOLD" → gold_usd_per_oz,
// "USDVND" → usd_vnd_rate. Unknown symbols are silently omitted.
// Returns an empty (or nil) map — NOT an error — when data is absent or stale;
// caller treats zero-valued symbol as "no data" and applies fixture fallback.
func (r *SQLiteCommodityRepository) FetchPrices(
	ctx context.Context,
	_ []string,
) (map[string]float64, error) {
	db, _ := openReadOnly(r.dbPath)
	if db == nil {
		// DB not present or not openable — degrade gracefully.
		return nil, nil
	}
	defer db.Close()

	return fetchCommodityPricesFromDB(ctx, db, commodityStaleBound)
}

// fetchCommodityPricesFromDB is the pure query logic extracted from FetchPrices
// so tests can inject a *sql.DB directly (in-memory :memory:) without
// touching the file-path constructor.
// Returns a map with only the non-zero, non-NULL, freshness-validated values.
// Symbols returned: "OIL", "GOLD", "USDVND" — only those with valid positive values.
func fetchCommodityPricesFromDB(
	ctx context.Context,
	db *sql.DB,
	staleBound time.Duration,
) (map[string]float64, error) {
	const query = `
		SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at
		FROM commodity_prices
		WHERE source = 'yahoo'
		ORDER BY fetched_at DESC
		LIMIT 1`

	var (
		oil       sql.NullFloat64
		gold      sql.NullFloat64
		usdVnd    sql.NullFloat64
		fetchedAt sql.NullString
	)

	err := db.QueryRowContext(ctx, query).Scan(&oil, &gold, &usdVnd, &fetchedAt)
	if err != nil {
		// No row (sql.ErrNoRows) or table absent — return empty map, not error.
		return map[string]float64{}, nil
	}

	// Staleness check: fetched_at must be present and within staleBound.
	// R-2 (CRITICAL): TypeScript writes new Date().toISOString() = millisecond
	// precision (e.g. "2026-05-28T06:01:23.456Z"). Must use RFC3339Nano, NOT
	// RFC3339 — RFC3339 silently fails on the ms suffix, treating every row as
	// unparseable and causing permanent fixture-mode (reproduces bug #3003).
	if !fetchedAt.Valid {
		return map[string]float64{}, nil
	}

	ts, err := time.Parse(time.RFC3339Nano, fetchedAt.String)
	if err != nil {
		// Unparseable timestamp — treat as infinitely stale.
		return map[string]float64{}, nil
	}

	if time.Since(ts) > staleBound {
		// Row is outside the staleness window — fixture fallback.
		return map[string]float64{}, nil
	}

	// Build result map: include only non-NULL, positive values.
	// Per R-1: use sql.NullFloat64 — a NULL column must not populate the key.
	result := make(map[string]float64, 3)
	if oil.Valid && oil.Float64 > 0 {
		result["OIL"] = oil.Float64
	}
	if gold.Valid && gold.Float64 > 0 {
		result["GOLD"] = gold.Float64
	}
	if usdVnd.Valid && usdVnd.Float64 > 0 {
		result["USDVND"] = usdVnd.Float64
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// SQLiteCommodityHistoryRepository — prev-session commodity close reader (S2-DATA-HONESTY)
// ---------------------------------------------------------------------------

// commodityHistoryLookbackH is the minimum age of a commodity_prices_history row
// for it to be considered a "prior session" baseline. 18h ensures the row is from
// a genuinely different market period regardless of when the request fires.
// Rationale: Brent CME Globex + London + NY run ~23h/day; 18h safely clears any
// single session. SBV sets USDVND daily at ~01:00 UTC; an 18h window from any
// daytime VN request reaches the prior business day.
const commodityHistoryLookbackH = 18 * time.Hour

// commodityHistoryStaleH is the maximum age of a qualifying prior-session row.
// If the row is older than 36h, it is treated as too stale for a signed delta
// (covers weekends — oil/gold trade weekdays only). Safe-degrade: nil map.
const commodityHistoryStaleH = 36 * time.Hour

// SQLiteCommodityHistoryRepository implements domain.CommodityHistoryPort.
// Reads the most recent commodity snapshot whose fetched_at is at least 18h ago
// (i.e. from a prior trading session) from the shared market.db (named volume,
// read-only). Pattern mirrors SQLiteCommodityRepository.
//
// Safe-degrade contract: returns (nil, "", nil) — not an error — when:
//   - DB file is missing or unreadable
//   - commodity_prices_history table is absent (pre-migration container)
//   - no row satisfies fetched_at <= now-18h (all rows too fresh)
//   - the best qualifying row is older than 36h (stale bound exceeded)
//   - all three commodity columns in the row are zero or NULL
type SQLiteCommodityHistoryRepository struct {
	dbPath string
}

// NewSQLiteCommodityHistoryRepository creates a commodity history repository.
// dbPath is read from the DB_PATH env var; falls back to /app/data/market.db.
func NewSQLiteCommodityHistoryRepository() *SQLiteCommodityHistoryRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/market.db"
	}
	return &SQLiteCommodityHistoryRepository{dbPath: dbPath}
}

// FetchPrevClose returns (prevPrices, prevFetchedAt, nil) when a qualifying row exists.
// Returns (nil, "", nil) on any safe-degrade condition (no row / stale / error).
func (r *SQLiteCommodityHistoryRepository) FetchPrevClose(ctx context.Context) (map[string]float64, string, error) {
	db, _ := openReadOnly(r.dbPath)
	if db == nil {
		return nil, "", nil
	}
	defer db.Close()
	return fetchCommodityPrevCloseFromDB(ctx, db, commodityHistoryLookbackH, commodityHistoryStaleH)
}

// fetchCommodityPrevCloseFromDB is the pure query logic extracted from FetchPrevClose
// so tests can inject a *sql.DB (in-memory :memory:) directly. Pattern mirrors
// fetchCommodityPricesFromDB.
//
// Query: SELECT the most recent row whose fetched_at <= cutoff (now - lookback).
// Cutoff is formatted as RFC3339Nano — same precision as TypeScript writer
// (new Date().toISOString() → "2026-05-28T06:01:23.456Z"). SQLite lexicographic
// string comparison works correctly on ISO8601 timestamps of identical format
// (RISK-1 guard from bug #3003 class).
//
// Staleness check: after finding the qualifying row, reject it if it is older than
// staleBound (> 36h). This handles sparse history: a row at now-40h satisfies
// fetched_at<=cutoff but is rejected as stale → nil map.
//
// Partial-zero guard: only include non-NULL, positive values in the result map.
// Keys: "OIL", "GOLD", "USDVND" (same as CommodityFetcherPort).
func fetchCommodityPrevCloseFromDB(
	ctx context.Context,
	db *sql.DB,
	lookback, staleBound time.Duration,
) (map[string]float64, string, error) {
	cutoff := time.Now().UTC().Add(-lookback).Format(time.RFC3339Nano)
	const query = `
		SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at
		FROM commodity_prices_history
		WHERE fetched_at <= ?
		  AND brent_crude_usd > 0
		ORDER BY fetched_at DESC
		LIMIT 1`

	var oil, gold, usdVnd sql.NullFloat64
	var fetchedAt sql.NullString
	err := db.QueryRowContext(ctx, query, cutoff).Scan(&oil, &gold, &usdVnd, &fetchedAt)
	if err != nil {
		// sql.ErrNoRows (no qualifying row) or table absent — safe-degrade.
		return nil, "", nil //nolint:nilerr // intentional: safe-degrade
	}
	if !fetchedAt.Valid {
		return nil, "", nil
	}

	// RISK-1 (RFC3339Nano): TypeScript writer uses new Date().toISOString() which
	// emits ms-precision timestamps (e.g. "2026-05-28T06:01:23.456Z"). Must use
	// time.RFC3339Nano — using time.RFC3339 silently fails on the .456 suffix and
	// treats every row as infinitely stale (reproduces bug #3003).
	ts, err := time.Parse(time.RFC3339Nano, fetchedAt.String)
	if err != nil {
		// Unparseable timestamp — treat as infinitely stale (safe-degrade).
		return nil, "", nil
	}

	// Staleness upper bound: if the qualifying row is > 36h old, nil-degrade.
	// Handles sparse history: row at now-40h passes the lookback WHERE clause
	// (fetched_at <= cutoff) but is rejected here as too stale for a valid delta.
	if time.Since(ts) > staleBound {
		return nil, "", nil
	}

	// Build result map: include only non-NULL, positive values (partial-zero guard).
	// A zero column means the data source had no value for that commodity on that row.
	result := make(map[string]float64, 3)
	if oil.Valid && oil.Float64 > 0 {
		result["OIL"] = oil.Float64
	}
	if gold.Valid && gold.Float64 > 0 {
		result["GOLD"] = gold.Float64
	}
	if usdVnd.Valid && usdVnd.Float64 > 0 {
		result["USDVND"] = usdVnd.Float64
	}

	return result, fetchedAt.String, nil
}
