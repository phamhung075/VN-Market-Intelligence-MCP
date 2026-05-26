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
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"

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
// Query strategy mirrors the deprecated TS SQLiteMacroRepository.fetchVnIndex():
// SELECT value FROM macro_indicators WHERE indicator_name LIKE '%VN-Index%' OR
// indicator_name LIKE '%VNINDEX%' ORDER BY fetched_at DESC LIMIT 1.
//
// Returns (0, nil) when the DB is not present or has no matching rows; the
// application layer treats 0 as "no data" and falls back to the fixture default.
// This ensures safe degradation in environments where market.db is not mounted.
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
// Returns (0, nil) on missing DB, no rows, or query error (safe degradation).
func (repo *SQLiteMarketIndexRepository) FetchVNIndex(ctx context.Context) (float64, error) {
	// Open read-only to respect the charter security clause and DB_READONLY=true.
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?mode=ro", repo.dbPath))
	if err != nil {
		// DB not present or not openable — degrade gracefully.
		return 0, nil //nolint:nilerr // intentional: caller uses fixture fallback
	}
	defer db.Close()

	const query = `
		SELECT value FROM macro_indicators
		WHERE indicator_name LIKE '%VN-Index%' OR indicator_name LIKE '%VNINDEX%'
		ORDER BY fetched_at DESC LIMIT 1`

	var value float64
	err = db.QueryRowContext(ctx, query).Scan(&value)
	if err != nil {
		// No rows or scan error — degrade gracefully.
		return 0, nil //nolint:nilerr // intentional: caller uses fixture fallback
	}
	return value, nil
}
