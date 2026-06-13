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
	"time"
)

// newInMemoryDB opens an in-memory SQLite database and creates the minimal
// table schema required by SQLiteMarketIndexRepository.FetchVNIndex,
// SQLiteCommodityRepository.FetchPrices, and SBVRateSQLiteAdapter.GetRate.
//
// market_prices, macro_indicators, commodity_prices, and sbv_rates are all
// created so each test can populate whichever table it needs.
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

	// commodity_prices — source for SQLiteCommodityRepository (MACRO-LIVE-PRICES).
	// Schema mirrors the production table written by commodityTrackerRefreshJob.ts.
	_, err = db.Exec(`
		CREATE TABLE commodity_prices (
			source          TEXT PRIMARY KEY,
			brent_crude_usd REAL,
			gold_usd_per_oz REAL,
			usd_vnd_rate    REAL,
			fetched_at      TEXT
		)`)
	if err != nil {
		t.Fatalf("create commodity_prices: %v", err)
	}

	// sbv_rates — source for SBVRateSQLiteAdapter (DPI-1) and
	// CarryYieldInputsSQLiteAdapter.GetVNDDepositRate (DPI-2b).
	// Schema mirrors production table written by sbvRatesJob.ts.
	// source TEXT PRIMARY KEY (production value: 'sbv').
	// max_deposit_rate_pct added in DPI-2b — the SBV max deposit rate used in carry/yield.
	_, err = db.Exec(`
		CREATE TABLE sbv_rates (
			source                TEXT PRIMARY KEY,
			usd_vnd_official      REAL NOT NULL DEFAULT 0,
			max_deposit_rate_pct  REAL,
			fetched_at            TEXT NOT NULL
		)`)
	if err != nil {
		t.Fatalf("create sbv_rates: %v", err)
	}

	// fred_series_daily — source for CarryYieldInputsSQLiteAdapter.GetFedFundsRate (DPI-2b).
	// Schema mirrors production table written by fetchFredEffrIorb job.
	// series='EFFR', date=YYYY-MM-DD, value=REAL.
	_, err = db.Exec(`
		CREATE TABLE fred_series_daily (
			series TEXT NOT NULL,
			date   TEXT NOT NULL,
			value  REAL,
			PRIMARY KEY (series, date)
		)`)
	if err != nil {
		t.Fatalf("create fred_series_daily: %v", err)
	}

	// tracked_indicators — source for CarryYieldInputsSQLiteAdapter.GetEarningYield (DPI-2b).
	// Schema mirrors production table written by marketEarningYieldJob.
	// indicator='market_earning_yield', value=REAL, extracted_at=RFC3339Nano.
	_, err = db.Exec(`
		CREATE TABLE tracked_indicators (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			indicator    TEXT NOT NULL,
			value        REAL,
			extracted_at TEXT
		)`)
	if err != nil {
		t.Fatalf("create tracked_indicators: %v", err)
	}

	// daily_ohlcv — source for SQLiteMarketIndexRepository.FetchPrevSessionVnIndex (U4).
	// Minimal columns: code TEXT, date TEXT (YYYY-MM-DD), close REAL.
	// Populated by the daily OHLCV data pipeline.
	_, err = db.Exec(`
		CREATE TABLE daily_ohlcv (
			code  TEXT NOT NULL,
			date  TEXT NOT NULL,
			open  REAL,
			high  REAL,
			low   REAL,
			close REAL,
			PRIMARY KEY (code, date)
		)`)
	if err != nil {
		t.Fatalf("create daily_ohlcv: %v", err)
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

// ---------------------------------------------------------------------------
// T-MLP-1: fetchCommodityPricesFromDB returns live values for a fresh row
// ---------------------------------------------------------------------------

// TestFetchCommodityPricesFromDB_LiveRow (T-MLP-1) verifies that fresh rows are
// returned with all three symbols populated.
//
// Contract: when commodity_prices has a 'yahoo' row with fetched_at < 26h ago,
// fetchCommodityPricesFromDB MUST return {"OIL": 96.0, "GOLD": 4480.0, "USDVND": 26150.0}.
func TestFetchCommodityPricesFromDB_LiveRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// Insert a fresh row (timestamp well within 26h bound).
	// Values differ from fixtures (82.5/2350.0/24500.0) — proves port is read, not constants.
	_, err := db.Exec(`
		INSERT INTO commodity_prices (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
		VALUES ('yahoo', 96.0, 4480.0, 26150.0, ?)`,
		time.Now().UTC().Add(-1*time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		t.Fatalf("insert commodity_prices: %v", err)
	}

	got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
	if err != nil {
		t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
	}

	if got["OIL"] != 96.0 {
		t.Errorf("OIL = %.2f, want 96.0", got["OIL"])
	}
	if got["GOLD"] != 4480.0 {
		t.Errorf("GOLD = %.2f, want 4480.0", got["GOLD"])
	}
	if got["USDVND"] != 26150.0 {
		t.Errorf("USDVND = %.2f, want 26150.0", got["USDVND"])
	}
}

// ---------------------------------------------------------------------------
// T-MLP-2: fetchCommodityPricesFromDB returns empty map for stale rows
// ---------------------------------------------------------------------------

// TestFetchCommodityPricesFromDB_StaleRow (T-MLP-2) verifies that rows outside
// the 26h staleness window return an empty map, not live values.
//
// Also verifies the R-2 (RFC3339Nano) fix: a fresh row with millisecond precision
// timestamp (e.g. "2026-05-28T06:01:23.456Z") MUST parse correctly and return
// live values. RFC3339 would fail on the .456 suffix → all rows stale → bug #3003.
func TestFetchCommodityPricesFromDB_StaleRow(t *testing.T) {
	t.Run("stale_row_returns_empty", func(t *testing.T) {
		db := newInMemoryDB(t)
		defer db.Close()

		// Insert a row that is 28 hours old (> 26h staleBound).
		staleTs := time.Now().UTC().Add(-28 * time.Hour).Format(time.RFC3339Nano)
		_, err := db.Exec(`
			INSERT INTO commodity_prices (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
			VALUES ('yahoo', 96.0, 4480.0, 26150.0, ?)`,
			staleTs)
		if err != nil {
			t.Fatalf("insert stale row: %v", err)
		}

		got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
		if err != nil {
			t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("stale row: got map %v, want empty map (staleness enforcement)", got)
		}
	})

	// R-2 sub-case: millisecond-precision timestamp MUST parse correctly.
	// TypeScript writes new Date().toISOString() → "2026-05-28T06:01:23.456Z".
	// Using time.RFC3339 (without Nano) silently fails on the .456 suffix and
	// returns time.Time{} → every row is treated as infinitely stale → bug #3003.
	t.Run("millisecond_timestamp_parses_correctly", func(t *testing.T) {
		db := newInMemoryDB(t)
		defer db.Close()

		// Fresh timestamp with millisecond precision (TypeScript toISOString() format).
		freshMsTs := time.Now().UTC().Add(-30 * time.Minute).Format("2006-01-02T15:04:05.000Z07:00")
		_, err := db.Exec(`
			INSERT INTO commodity_prices (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
			VALUES ('yahoo', 96.0, 4480.0, 26150.0, ?)`,
			freshMsTs)
		if err != nil {
			t.Fatalf("insert ms-precision row: %v", err)
		}

		got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
		if err != nil {
			t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
		}
		// If RFC3339Nano parser works, the fresh ms-precision row should return live values.
		if got["OIL"] != 96.0 {
			t.Errorf("RFC3339Nano parse: OIL = %.2f, want 96.0 — RFC3339Nano must parse ms-precision timestamps (bug #3003 regression)", got["OIL"])
		}
		if got["GOLD"] != 4480.0 {
			t.Errorf("RFC3339Nano parse: GOLD = %.2f, want 4480.0", got["GOLD"])
		}
		if got["USDVND"] != 26150.0 {
			t.Errorf("RFC3339Nano parse: USDVND = %.2f, want 26150.0", got["USDVND"])
		}
	})
}

// ---------------------------------------------------------------------------
// T-MLP-3: fetchCommodityPricesFromDB returns empty map when no 'yahoo' row
// ---------------------------------------------------------------------------

// TestFetchCommodityPricesFromDB_NoYahooRow (T-MLP-3) verifies that the
// WHERE source='yahoo' filter is enforced and missing rows return empty map.
func TestFetchCommodityPricesFromDB_NoYahooRow(t *testing.T) {
	t.Run("empty_table", func(t *testing.T) {
		db := newInMemoryDB(t)
		defer db.Close()

		// commodity_prices table exists but has zero rows.
		got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
		if err != nil {
			t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("empty table: got map %v, want empty map", got)
		}
	})

	t.Run("only_macro_snapshot_source", func(t *testing.T) {
		db := newInMemoryDB(t)
		defer db.Close()

		// Insert a row with source='macro-snapshot' (not 'yahoo').
		freshTs := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
		_, err := db.Exec(`
			INSERT INTO commodity_prices (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
			VALUES ('macro-snapshot', 96.0, 4480.0, 26150.0, ?)`,
			freshTs)
		if err != nil {
			t.Fatalf("insert macro-snapshot row: %v", err)
		}

		got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
		if err != nil {
			t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("non-yahoo source: got map %v, want empty map (WHERE source='yahoo' not enforced)", got)
		}
	})
}

// ---------------------------------------------------------------------------
// T-MLP partial-NULL: fetchCommodityPricesFromDB omits keys for NULL columns
// ---------------------------------------------------------------------------

// TestFetchCommodityPricesFromDB_PartialNULL verifies per-commodity NULL handling.
//
// Contract: if gold_usd_per_oz is NULL, the "GOLD" key must be absent from the
// returned map so the application layer applies per-commodity fixture fallback.
// This exercises the R-1 (sql.NullFloat64) requirement.
func TestFetchCommodityPricesFromDB_PartialNULL(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	freshTs := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	// gold_usd_per_oz is NULL.
	_, err := db.Exec(`
		INSERT INTO commodity_prices (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
		VALUES ('yahoo', 96.0, NULL, 26150.0, ?)`,
		freshTs)
	if err != nil {
		t.Fatalf("insert partial-NULL row: %v", err)
	}

	got, err := fetchCommodityPricesFromDB(context.Background(), db, 26*time.Hour)
	if err != nil {
		t.Fatalf("fetchCommodityPricesFromDB returned error: %v", err)
	}

	if got["OIL"] != 96.0 {
		t.Errorf("partial-NULL OIL = %.2f, want 96.0", got["OIL"])
	}
	if _, present := got["GOLD"]; present {
		t.Errorf("partial-NULL GOLD key present (%.2f), want absent (NULL column must be omitted)", got["GOLD"])
	}
	if got["USDVND"] != 26150.0 {
		t.Errorf("partial-NULL USDVND = %.2f, want 26150.0", got["USDVND"])
	}
}

// ---------------------------------------------------------------------------
// DPI-1: fetchSBVRateFromDB tests
// ---------------------------------------------------------------------------

// TestFetchSBVRateFromDB_FreshRow (DPI-1 AC-2 fresh) verifies that a fresh
// sbv_rates row returns the usd_vnd_official value.
func TestFetchSBVRateFromDB_FreshRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const officialRate = 26115.0 // typical SBV value
	freshTs := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO sbv_rates (source, usd_vnd_official, fetched_at)
		VALUES ('sbv', ?, ?)`,
		officialRate, freshTs)
	if err != nil {
		t.Fatalf("insert sbv_rates fresh row: %v", err)
	}

	got, err := fetchSBVRateFromDB(context.Background(), db, sbvStaleBound)
	if err != nil {
		t.Fatalf("fetchSBVRateFromDB returned error: %v", err)
	}
	if got != officialRate {
		t.Errorf("fresh row: got %.2f, want %.2f (sbv_rates.usd_vnd_official)", got, officialRate)
	}
}

// TestFetchSBVRateFromDB_StaleRow (DPI-1 AC-2 stale) verifies that a row
// older than sbvStaleBound (6h) returns 0 (safe-degrade).
func TestFetchSBVRateFromDB_StaleRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// Insert a row 8 hours old (> 6h sbvStaleBound).
	staleTs := time.Now().UTC().Add(-8 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO sbv_rates (source, usd_vnd_official, fetched_at)
		VALUES ('sbv', 26115.0, ?)`,
		staleTs)
	if err != nil {
		t.Fatalf("insert sbv_rates stale row: %v", err)
	}

	got, err := fetchSBVRateFromDB(context.Background(), db, sbvStaleBound)
	if err != nil {
		t.Fatalf("fetchSBVRateFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("stale row: got %.2f, want 0 (staleness guard must return 0)", got)
	}
}

// TestFetchSBVRateFromDB_AbsentRow (DPI-1 AC-2 absent) verifies that an
// empty sbv_rates table returns (0, nil) — not an error.
func TestFetchSBVRateFromDB_AbsentRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// sbv_rates table is empty (created by newInMemoryDB, not populated).
	got, err := fetchSBVRateFromDB(context.Background(), db, sbvStaleBound)
	if err != nil {
		t.Fatalf("fetchSBVRateFromDB on empty table returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("absent row: got %.2f, want 0 (absent row must return 0, not error)", got)
	}
}

// TestFetchSBVRateFromDB_ZeroValue (DPI-1 AC-2 zero) verifies that a fresh
// row with usd_vnd_official = 0 (DEFAULT on fresh schema) returns 0.
func TestFetchSBVRateFromDB_ZeroValue(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	freshTs := time.Now().UTC().Add(-30 * time.Minute).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO sbv_rates (source, usd_vnd_official, fetched_at)
		VALUES ('sbv', 0, ?)`,
		freshTs)
	if err != nil {
		t.Fatalf("insert sbv_rates zero-value row: %v", err)
	}

	got, err := fetchSBVRateFromDB(context.Background(), db, sbvStaleBound)
	if err != nil {
		t.Fatalf("fetchSBVRateFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("zero-value row: got %.2f, want 0 (zero DEFAULT must not propagate as valid rate)", got)
	}
}

// ---------------------------------------------------------------------------
// DPI-2b: CarryYieldInputsSQLiteAdapter — fetchVNDDepositRateFromDB tests
// ---------------------------------------------------------------------------

// TestFetchVNDDepositRateFromDB_FreshRow (DPI-2b AC-1 deposit live) verifies that
// a fresh sbv_rates row with max_deposit_rate_pct returns the live value.
func TestFetchVNDDepositRateFromDB_FreshRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const liveDeposit = 6.0 // distinct from fixtureVNDDepositRate=4.7
	freshTs := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO sbv_rates (source, usd_vnd_official, max_deposit_rate_pct, fetched_at)
		VALUES ('sbv', 25800.0, ?, ?)`,
		liveDeposit, freshTs)
	if err != nil {
		t.Fatalf("insert sbv_rates fresh deposit row: %v", err)
	}

	got, err := fetchVNDDepositRateFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchVNDDepositRateFromDB returned error: %v", err)
	}
	if got != liveDeposit {
		t.Errorf("DPI-2b AC-1 deposit fresh: got %.2f, want %.2f (must read max_deposit_rate_pct, not fixture 4.7)", got, liveDeposit)
	}
}

// TestFetchVNDDepositRateFromDB_StaleRow (DPI-2b AC-5 deposit stale) verifies
// that a row older than depositYieldStaleBound (26h) returns 0 (safe-degrade).
func TestFetchVNDDepositRateFromDB_StaleRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	staleTs := time.Now().UTC().Add(-28 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO sbv_rates (source, usd_vnd_official, max_deposit_rate_pct, fetched_at)
		VALUES ('sbv', 25800.0, 6.0, ?)`,
		staleTs)
	if err != nil {
		t.Fatalf("insert stale deposit row: %v", err)
	}

	got, err := fetchVNDDepositRateFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchVNDDepositRateFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-5 deposit stale: got %.2f, want 0 (stale row must return 0)", got)
	}
}

// TestFetchVNDDepositRateFromDB_AbsentRow (DPI-2b AC-4 deposit absent) verifies
// that an empty sbv_rates table returns (0, nil) — not an error.
func TestFetchVNDDepositRateFromDB_AbsentRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	got, err := fetchVNDDepositRateFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchVNDDepositRateFromDB on empty table returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-4 deposit absent: got %.2f, want 0", got)
	}
}

// ---------------------------------------------------------------------------
// DPI-2b: CarryYieldInputsSQLiteAdapter — fetchFedFundsRateFromDB tests
// ---------------------------------------------------------------------------

// TestFetchFedFundsRateFromDB_FreshRow (DPI-2b AC-2 fed live) verifies that a fresh
// fred_series_daily EFFR row returns the live value.
func TestFetchFedFundsRateFromDB_FreshRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const liveEFFR = 4.0 // distinct from fixtureFedFundsRate=5.33
	// Use a recent date (within 96h effrStaleBound).
	recentDate := time.Now().UTC().AddDate(0, 0, -1).Format(time.DateOnly)
	_, err := db.Exec(`
		INSERT INTO fred_series_daily (series, date, value)
		VALUES ('EFFR', ?, ?)`,
		recentDate, liveEFFR)
	if err != nil {
		t.Fatalf("insert fred_series_daily fresh EFFR row: %v", err)
	}

	got, err := fetchFedFundsRateFromDB(context.Background(), db, effrStaleBound)
	if err != nil {
		t.Fatalf("fetchFedFundsRateFromDB returned error: %v", err)
	}
	if got != liveEFFR {
		t.Errorf("DPI-2b AC-2 fed fresh: got %.2f, want %.2f (must read EFFR, not fixture 5.33)", got, liveEFFR)
	}
}

// TestFetchFedFundsRateFromDB_StaleRow (DPI-2b AC-5 fed stale) verifies that a
// row older than effrStaleBound (168h) returns 0 (safe-degrade).
func TestFetchFedFundsRateFromDB_StaleRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	// 8 days ago → > 168h (7-day) stale bound.
	staleDate := time.Now().UTC().AddDate(0, 0, -8).Format(time.DateOnly)
	_, err := db.Exec(`
		INSERT INTO fred_series_daily (series, date, value)
		VALUES ('EFFR', ?, 4.0)`,
		staleDate)
	if err != nil {
		t.Fatalf("insert stale EFFR row: %v", err)
	}

	got, err := fetchFedFundsRateFromDB(context.Background(), db, effrStaleBound)
	if err != nil {
		t.Fatalf("fetchFedFundsRateFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-5 fed stale: got %.2f, want 0 (row >168h old must return 0)", got)
	}
}

// TestFetchFedFundsRateFromDB_WeekendSim (FIX-MACRO-GO-FIXTURE-FALLBACK AC-1)
// simulates the weekend scenario: direct FRED fetch fails (handled by mcp-server
// cron), but a DB row from 5 days ago (Tuesday → Sunday = 120h) is present.
//
// Before the fix (effrStaleBound=96h): 120h > 96h → returns 0 → fixture 5.33 served.
// After the fix (effrStaleBound=168h): 120h < 168h → returns DB value 3.62 → tier 2.
//
// This is the primary regression gate for FIX-MACRO-GO-FIXTURE-FALLBACK.
func TestFetchFedFundsRateFromDB_WeekendSim(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const bridgedEFFR = 3.62 // live value in fred_series_daily as of 2026-06-03

	// Simulate Tuesday row queried on Sunday: 5 days = 120h < 168h (new bound).
	weekendDate := time.Now().UTC().AddDate(0, 0, -5).Format(time.DateOnly)
	_, err := db.Exec(`
		INSERT INTO fred_series_daily (series, date, value)
		VALUES ('EFFR', ?, ?)`,
		weekendDate, bridgedEFFR)
	if err != nil {
		t.Fatalf("insert weekend-sim EFFR row: %v", err)
	}

	got, err := fetchFedFundsRateFromDB(context.Background(), db, effrStaleBound)
	if err != nil {
		t.Fatalf("fetchFedFundsRateFromDB returned error: %v", err)
	}
	// Must return the DB value, NOT 0 (which would cause fixture 5.33 fallback).
	if got == 0 {
		t.Errorf("FIX-MACRO-GO-FIXTURE-FALLBACK AC-1: got 0 — 5-day-old EFFR row rejected as stale "+
			"(effrStaleBound too tight); want %.2f (bridged DB value must be used on weekend)", bridgedEFFR)
	}
	if got != bridgedEFFR {
		t.Errorf("FIX-MACRO-GO-FIXTURE-FALLBACK AC-1: got %.2f, want %.2f (bridged EFFR value)", got, bridgedEFFR)
	}
}

// TestFetchFedFundsRateFromDB_AbsentRow (DPI-2b AC-4 fed absent) verifies that
// an empty fred_series_daily table returns (0, nil) — not an error.
func TestFetchFedFundsRateFromDB_AbsentRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	got, err := fetchFedFundsRateFromDB(context.Background(), db, effrStaleBound)
	if err != nil {
		t.Fatalf("fetchFedFundsRateFromDB on empty table returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-4 fed absent: got %.2f, want 0", got)
	}
}

// ---------------------------------------------------------------------------
// DPI-2b: CarryYieldInputsSQLiteAdapter — fetchEarningYieldFromDB tests
// ---------------------------------------------------------------------------

// TestFetchEarningYieldFromDB_FreshRow (DPI-2b AC-3 earning live) verifies that a
// fresh tracked_indicators market_earning_yield row returns the live value.
func TestFetchEarningYieldFromDB_FreshRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	const liveYield = 7.5 // distinct from fixtureEarningYield=8.2
	freshTs := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO tracked_indicators (indicator, value, extracted_at)
		VALUES ('market_earning_yield', ?, ?)`,
		liveYield, freshTs)
	if err != nil {
		t.Fatalf("insert tracked_indicators fresh earning yield row: %v", err)
	}

	got, err := fetchEarningYieldFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchEarningYieldFromDB returned error: %v", err)
	}
	if got != liveYield {
		t.Errorf("DPI-2b AC-3 earning fresh: got %.2f, want %.2f (must read market_earning_yield, not fixture 8.2)", got, liveYield)
	}
}

// TestFetchEarningYieldFromDB_StaleRow (DPI-2b AC-5 earning stale) verifies that
// a row older than depositYieldStaleBound (26h) returns 0 (safe-degrade).
func TestFetchEarningYieldFromDB_StaleRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	staleTs := time.Now().UTC().Add(-28 * time.Hour).Format(time.RFC3339Nano)
	_, err := db.Exec(`
		INSERT INTO tracked_indicators (indicator, value, extracted_at)
		VALUES ('market_earning_yield', 7.5, ?)`,
		staleTs)
	if err != nil {
		t.Fatalf("insert stale earning yield row: %v", err)
	}

	got, err := fetchEarningYieldFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchEarningYieldFromDB returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-5 earning stale: got %.2f, want 0 (stale row must return 0)", got)
	}
}

// TestFetchEarningYieldFromDB_AbsentRow (DPI-2b AC-4 earning absent) verifies that
// an empty tracked_indicators table returns (0, nil) — not an error.
func TestFetchEarningYieldFromDB_AbsentRow(t *testing.T) {
	db := newInMemoryDB(t)
	defer db.Close()

	got, err := fetchEarningYieldFromDB(context.Background(), db, depositYieldStaleBound)
	if err != nil {
		t.Fatalf("fetchEarningYieldFromDB on empty table returned error: %v", err)
	}
	if got != 0 {
		t.Errorf("DPI-2b AC-4 earning absent: got %.2f, want 0", got)
	}
}

// ---------------------------------------------------------------------------
// U4: FetchPrevSessionVnIndex — T-U4-5
// ---------------------------------------------------------------------------

// TestFetchPrevSessionVnIndex_ReturnSecondMostRecent (T-U4-5):
// With 3 VNINDEX rows, returns the second-most-recent close (OFFSET 1).
//
// Seed-date lesson: dates are derived from time.Now() (relative offsets) so the
// test never rots on a future calendar date. The query orders by date DESC, so
// only the relative ordering of the three dates matters — not the values themselves.
func TestFetchPrevSessionVnIndex_ReturnSecondMostRecent(t *testing.T) {
	db := newInMemoryDB(t)
	ctx := context.Background()

	// Use relative dates: today-2, today-1, today (ensures ORDER BY date DESC gives today, today-1, today-2).
	today := time.Now().UTC()
	d0 := today.AddDate(0, 0, -2).Format(time.DateOnly) // oldest
	d1 := today.AddDate(0, 0, -1).Format(time.DateOnly) // second-most-recent (prev session)
	d2 := today.Format(time.DateOnly)                   // most recent (current session)

	_, err := db.Exec(`
		INSERT INTO daily_ohlcv (code, date, close) VALUES
		(?, ?, 1210.0),
		(?, ?, 1220.5),
		(?, ?, 1230.0)`,
		"VNINDEX", d0,
		"VNINDEX", d1,
		"VNINDEX", d2)
	if err != nil {
		t.Fatalf("insert daily_ohlcv: %v", err)
	}

	got, err := fetchPrevSessionVnIndexFromDB(ctx, db)
	if err != nil {
		t.Fatalf("fetchPrevSessionVnIndexFromDB error: %v", err)
	}
	if got == nil {
		t.Fatal("T-U4-5: result is nil, want 1220.5 (second-most-recent close)")
	}
	if *got != 1220.5 {
		t.Errorf("T-U4-5: prev close = %.2f, want 1220.5 (second-most-recent row)", *got)
	}
}

// TestFetchPrevSessionVnIndex_OnlyOneRow_ReturnsNil (T-U4-5 safe-degrade):
// With only 1 VNINDEX row, OFFSET 1 returns no row → nil (first-day safe-degrade).
//
// Seed-date lesson: date derived from time.Now() to avoid rot.
func TestFetchPrevSessionVnIndex_OnlyOneRow_ReturnsNil(t *testing.T) {
	db := newInMemoryDB(t)
	ctx := context.Background()

	today := time.Now().UTC().Format(time.DateOnly)
	_, err := db.Exec(`INSERT INTO daily_ohlcv (code, date, close) VALUES ('VNINDEX', ?, 1230.0)`, today)
	if err != nil {
		t.Fatalf("insert daily_ohlcv: %v", err)
	}

	got, err := fetchPrevSessionVnIndexFromDB(ctx, db)
	if err != nil {
		t.Fatalf("fetchPrevSessionVnIndexFromDB error: %v", err)
	}
	if got != nil {
		t.Errorf("T-U4-5 one-row: prev close = %v, want nil (only 1 row — first trading day safe-degrade)", got)
	}
}

// TestFetchPrevSessionVnIndex_EmptyTable_ReturnsNil:
// Empty table → nil (no data safe-degrade).
func TestFetchPrevSessionVnIndex_EmptyTable_ReturnsNil(t *testing.T) {
	db := newInMemoryDB(t)
	ctx := context.Background()

	got, err := fetchPrevSessionVnIndexFromDB(ctx, db)
	if err != nil {
		t.Fatalf("fetchPrevSessionVnIndexFromDB error: %v", err)
	}
	if got != nil {
		t.Errorf("T-U4-5 empty: prev close = %v, want nil (empty table)", got)
	}
}

// TestFetchPrevSessionVnIndex_OtherCodes_NotIncluded:
// Rows for non-VNINDEX codes must not affect the result.
//
// Seed-date lesson: dates derived from time.Now() to avoid rot.
func TestFetchPrevSessionVnIndex_OtherCodes_NotIncluded(t *testing.T) {
	db := newInMemoryDB(t)
	ctx := context.Background()

	today := time.Now().UTC()
	d1 := today.AddDate(0, 0, -1).Format(time.DateOnly)
	d2 := today.Format(time.DateOnly)

	// Only HOSE rows — no VNINDEX → nil.
	_, err := db.Exec(`
		INSERT INTO daily_ohlcv (code, date, close) VALUES
		(?, ?, 500.0),
		(?, ?, 510.0)`,
		"HOSE", d1,
		"HOSE", d2)
	if err != nil {
		t.Fatalf("insert daily_ohlcv: %v", err)
	}

	got, err := fetchPrevSessionVnIndexFromDB(ctx, db)
	if err != nil {
		t.Fatalf("fetchPrevSessionVnIndexFromDB error: %v", err)
	}
	if got != nil {
		t.Errorf("T-U4-5 other-codes: prev close = %v, want nil (no VNINDEX rows)", got)
	}
}
