// Package infrastructure — adapter implementations for domain ports.
//
// P2-X3: HTTPCommodityFetcher implemented in fixture mode for sandbox determinism.
// Fixture mode loads from a static map rather than making live HTTP calls.
// This satisfies the R-1 guard (no randomness) and the sandbox security contract
// (zero API keys, zero network calls from sandbox process).
//
// The SBVRateRepository is also provided as a fixture stub — it returns fixed
// VND rates used by the composition root for completeness.
//
// MACRO-SEED-WIRING: SQLiteMarketIndexRepository added — reads VN-Index from
// market.db (readonly) at /app/data/market.db (env DB_PATH). Satisfies the
// MarketIndexPort so the live VN-Index level is surfaced in /snapshot responses
// instead of the seed/fixture constant.
//
// MACRO-LIVE-PRICES: SQLiteCommodityRepository added — reads commodity prices
// (oil/gold/usdvnd) from market.db commodity_prices table (source='yahoo').
// Activated by COMMODITY_LIVE_MODE=true env gate (composition root). Fixture
// mode (HTTPCommodityFetcher) remains the default when gate is unset.
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"time"

	_ "modernc.org/sqlite" // register "sqlite" driver
)

// ---------------------------------------------------------------------------
// HTTPCommodityFetcher — fixture mode (P2-X3)
// ---------------------------------------------------------------------------

// HTTPCommodityFetcher implements domain.CommodityFetcherPort.
// In fixture mode it returns a pre-loaded price map instead of making HTTP calls.
// This keeps the sandbox deterministic and satisfies the security contract
// (no API keys required, no network dependency).
type HTTPCommodityFetcher struct {
	client   *http.Client
	baseURL  string
	fixtures map[string]float64
}

// NewHTTPCommodityFetcher creates a commodity fetcher in fixture mode.
// The fixture map provides deterministic commodity prices for the sandbox.
// baseURL is retained for future live-mode extension (post-pilot).
func NewHTTPCommodityFetcher(baseURL string) *HTTPCommodityFetcher {
	return &HTTPCommodityFetcher{
		client:  &http.Client{},
		baseURL: baseURL,
		// Fixture prices: plausible VN macro indicator values (2026 Q2 range).
		// OIL: Brent crude USD/barrel (NEUTRAL band: $60–$100).
		// GOLD: XAU/USD (BULLISH: >$2200).
		// USDVND: USDVND spot (NEUTRAL band: 23000–25000).
		fixtures: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": 24500.0,
		},
	}
}

// FetchPrices returns fixture commodity prices for the requested symbols.
// Unknown symbols are omitted from the result (caller uses its own defaults).
// No HTTP calls are made — sandbox security contract upheld.
func (hf *HTTPCommodityFetcher) FetchPrices(
	_ context.Context,
	symbols []string,
) (map[string]float64, error) {
	result := make(map[string]float64, len(symbols))
	for _, sym := range symbols {
		if v, ok := hf.fixtures[sym]; ok {
			result[sym] = v
		}
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// SBVRateRepository — fixture stub (P2-X3)
// ---------------------------------------------------------------------------

// SBVRateRepository implements domain.SBVRatePort via a fixture map.
// Returns fixed SBV exchange rates for the composition root.
// Live SBV XML feed adapter is post-pilot scope.
type SBVRateRepository struct {
	fixtures map[string]float64
}

// NewSBVRateRepository creates a SBV rate repository in fixture mode.
func NewSBVRateRepository() *SBVRateRepository {
	return &SBVRateRepository{
		fixtures: map[string]float64{
			"USD/VND": 24500.0,
		},
	}
}

// GetRate returns the fixture exchange rate for the given currency pair.
// Returns 0 if the pair is not in the fixture map (caller uses its own default).
func (r *SBVRateRepository) GetRate(
	_ context.Context,
	from, to string,
) (float64, error) {
	key := from + "/" + to
	return r.fixtures[key], nil
}

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
func (repo *SQLiteMarketIndexRepository) FetchVNIndex(ctx context.Context) (float64, error) {
	// Open read-only to respect the charter security clause and DB_READONLY=true.
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", repo.dbPath))
	if err != nil {
		// DB not present or not openable — degrade gracefully.
		return 0, nil //nolint:nilerr // intentional: caller uses fixture fallback
	}
	defer db.Close()

	// --- PRIMARY: market_prices table (vnIndexRefreshJob, live, ~5 min cadence) ---
	// This is the same data source as get_market_snapshot (VnDirect vnmarket_prices API).
	const primaryQuery = `
		SELECT price FROM market_prices
		WHERE code = 'VNINDEX' AND price IS NOT NULL AND price > 0
		ORDER BY updated_at DESC LIMIT 1`

	var value float64
	err = db.QueryRowContext(ctx, primaryQuery).Scan(&value)
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
	// Open read-only to respect the charter security clause and DB_READONLY=true.
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", r.dbPath))
	if err != nil {
		// DB not present or not openable — degrade gracefully.
		return nil, nil //nolint:nilerr // intentional: caller uses fixture fallback
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
