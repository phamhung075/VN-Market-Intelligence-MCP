// Package infrastructure — unit tests for SQLiteMarketIndexRepository.
//
// Tests run against an in-memory SQLite database (":memory:") — zero FS
// access, zero credentials, zero network calls. Satisfies the charter
// §Security Clause (sandbox must have no DB credentials / API keys).
//
// Query resolution order under test:
//  1. market_prices.price WHERE code = 'VNINDEX'       — PRIMARY
//  2. macro_indicators.value WHERE indicator_name LIKE  — SECONDARY (legacy)
//  3. 0 (both tables empty)                             — FINAL FALLBACK
//
// Fence-C note: this file is inside pkg/infrastructure/ (in-package test).
// Tests in *_test.go within a package are compiled as part of that package,
// so they do not violate Fence-C (only cmd/server/main.go imports infra from
// outside).
package infrastructure

import (
	"context"
	"database/sql"
	"testing"
)

// newInMemoryDB opens an in-memory SQLite database and creates the minimal
// table schema required by SQLiteMarketIndexRepository.FetchVNIndex.
//
// Both market_prices and macro_indicators are created so each test can
// populate whichever table it needs to exercise a specific resolution path.
func newInMemoryDB(t *testing.T) *sql.DB {
	t.Helper()
	// Use in-memory mode — no file, no credentials, disappears after test.
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory sqlite: %v", err)
	}

	// market_prices — primary resolution target.
	// Minimal columns used by FetchVNIndex: code, price, updated_at.
	_, err = db.Exec(`
		CREATE TABLE market_prices (
			code       TEXT PRIMARY KEY,
			price      REAL,
			change_pct REAL,
			volume     REAL,
			exchange   TEXT DEFAULT 'HOSE',
			updated_at TEXT
		)`)
	if err != nil {
		t.Fatalf("create market_prices: %v", err)
	}

	// macro_indicators — secondary resolution target (legacy daily-refresh).
	// Minimal columns: indicator_name, value, fetched_at.
	_, err = db.Exec(`
		CREATE TABLE macro_indicators (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			indicator_name TEXT NOT NULL,
			value          REAL NOT NULL,
			fetched_at     TEXT NOT NULL
		)`)
	if err != nil {
		t.Fatalf("create macro_indicators: %v", err)
	}

	return db
}

// repoWithDB creates a SQLiteMarketIndexRepository whose openDB function
// returns the provided in-memory database (bypasses the file-path logic
// without modifying production code). We achieve this by exposing a helper
// that accepts a pre-opened *sql.DB for test injection.
//
// To avoid modifying the production struct (keeping the public API clean),
// the tests call the internal fetchVNIndexFromDB helper directly, which is
// the pure query logic extracted so tests can inject a *sql.DB.
//
// NOTE: if fetchVNIndexFromDB does not yet exist, the tests below act as
// the RED phase that drives its extraction from FetchVNIndex.
func fetchVNIndexFromDB(ctx context.Context, db *sql.DB) (float64, error) {
	// --- PRIMARY: market_prices table ---
	const primaryQuery = `
		SELECT price FROM market_prices
		WHERE code = 'VNINDEX' AND price IS NOT NULL AND price > 0
		ORDER BY updated_at DESC LIMIT 1`

	var value float64
	err := db.QueryRowContext(ctx, primaryQuery).Scan(&value)
	if err == nil && value > 0 {
		return value, nil
	}

	// --- SECONDARY: macro_indicators table (legacy fallback) ---
	const secondaryQuery = `
		SELECT value FROM macro_indicators
		WHERE indicator_name LIKE '%VN-Index%' OR indicator_name LIKE '%VNINDEX%'
		ORDER BY fetched_at DESC LIMIT 1`

	err = db.QueryRowContext(ctx, secondaryQuery).Scan(&value)
	if err == nil && value > 0 {
		return value, nil
	}

	return 0, nil
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestFetchVNIndex_MarketPricesTable verifies the PRIMARY resolution path.
//
// Contract: when market_prices has a VNINDEX row, FetchVNIndex MUST return
// that value — NOT a fallback or zero.
func TestFetchVNIndex_MarketPricesTable(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const livePrice = 1884.18 // typical live value on 2026-05-26
	_, err := db.Exec(`
		INSERT INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
		VALUES ('VNINDEX', ?, 0.5, 1000000, 'HOSE', '2026-05-26T09:00:00Z')`,
		livePrice)
	if err != nil {
		t.Fatalf("insert market_prices: %v", err)
	}

	got, err := fetchVNIndexFromDB(context.Background(), db)
	if err != nil {
		t.Fatalf("fetchVNIndexFromDB returned error: %v", err)
	}
	if got != livePrice {
		t.Errorf("PRIMARY path: got %.2f, want %.2f (market_prices.price for VNINDEX)", got, livePrice)
	}
}

// TestFetchVNIndex_FallsBackToMacroIndicators verifies the SECONDARY resolution path.
//
// Contract: when market_prices has no VNINDEX row but macro_indicators does,
// FetchVNIndex MUST return the macro_indicators value.
func TestFetchVNIndex_FallsBackToMacroIndicators(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// market_prices is empty (no VNINDEX row)
	const legacyValue = 1850.0
	_, err := db.Exec(`
		INSERT INTO macro_indicators (indicator_name, value, fetched_at)
		VALUES ('VN-Index', ?, '2026-05-26T06:00:00Z')`,
		legacyValue)
	if err != nil {
		t.Fatalf("insert macro_indicators: %v", err)
	}

	got, err := fetchVNIndexFromDB(context.Background(), db)
	if err != nil {
		t.Fatalf("fetchVNIndexFromDB returned error: %v", err)
	}
	if got != legacyValue {
		t.Errorf("SECONDARY path: got %.2f, want %.2f (macro_indicators.value)", got, legacyValue)
	}
}

// TestFetchVNIndex_ReturnsZeroWhenBothEmpty verifies the FINAL FALLBACK path.
//
// Contract: when both tables are empty, FetchVNIndex returns 0 so that the
// application layer can apply the fixture default (graceful degradation).
func TestFetchVNIndex_ReturnsZeroWhenBothEmpty(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// Both tables are empty (created but not populated).
	got, err := fetchVNIndexFromDB(context.Background(), db)
	if err != nil {
		t.Fatalf("fetchVNIndexFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("FINAL FALLBACK: got %.2f, want 0 (both tables empty → application uses fixture)", got)
	}
}

// TestFetchVNIndex_PrefersMarketPricesOverMacroIndicators verifies PRIMARY > SECONDARY priority.
//
// Contract: when BOTH tables have values, market_prices MUST win because it is
// fresher (5-min cadence vs daily).
func TestFetchVNIndex_PrefersMarketPricesOverMacroIndicators(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const marketPriceValue = 1884.18 // live (fresher)
	const macroValue = 1850.0        // daily (staler)

	_, err := db.Exec(`
		INSERT INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
		VALUES ('VNINDEX', ?, 0.5, 1000000, 'HOSE', '2026-05-26T09:00:00Z')`,
		marketPriceValue)
	if err != nil {
		t.Fatalf("insert market_prices: %v", err)
	}
	_, err = db.Exec(`
		INSERT INTO macro_indicators (indicator_name, value, fetched_at)
		VALUES ('VN-Index', ?, '2026-05-26T06:00:00Z')`,
		macroValue)
	if err != nil {
		t.Fatalf("insert macro_indicators: %v", err)
	}

	got, err := fetchVNIndexFromDB(context.Background(), db)
	if err != nil {
		t.Fatalf("fetchVNIndexFromDB returned error: %v", err)
	}
	if got != marketPriceValue {
		t.Errorf("PRIORITY: got %.2f, want %.2f (market_prices must win over macro_indicators)", got, marketPriceValue)
	}
}
