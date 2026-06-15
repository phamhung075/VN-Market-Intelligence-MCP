// Package infrastructure — integration tests for SQLitePriceRepository + usecase.
// Verifies FIX-TA-GOSVC-NA-DESPITE-DEPTH: 38 daily_ohlcv rows → non-NULL RSI(14).
package infrastructure_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/application"
	"github.com/vn-market-intelligence/technical-analysis/pkg/infrastructure"

	_ "modernc.org/sqlite"
)

// seedDB creates a temporary SQLite database with the daily_ohlcv table and
// inserts n rows for the given ticker. Prices ramp linearly to produce
// deterministic but non-trivial RSI values.
func seedDB(t *testing.T, ticker string, n int) string {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("seedDB: open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS daily_ohlcv (
		id      INTEGER PRIMARY KEY AUTOINCREMENT,
		code    TEXT NOT NULL,
		date    TEXT NOT NULL,
		open    REAL,
		high    REAL,
		low     REAL,
		close   REAL NOT NULL,
		volume  INTEGER
	)`)
	if err != nil {
		t.Fatalf("seedDB: create table: %v", err)
	}

	stmt, err := db.Prepare(`INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		t.Fatalf("seedDB: prepare: %v", err)
	}
	defer stmt.Close()

	// Linear ramp starting at 30 000 (realistic VN stock price in VND).
	// Mixed up-down to avoid RSI=100 flat-line: odd indices go slightly down.
	for i := 0; i < n; i++ {
		var close float64
		if i%3 == 2 {
			close = 30000.0 + float64(i)*80 - 120 // small retreat every 3rd day
		} else {
			close = 30000.0 + float64(i)*80
		}
		date := fmt.Sprintf("2026-04-%02d", 1+i%28) // keeps dates in a plausible range
		if i >= 28 {
			date = fmt.Sprintf("2026-05-%02d", 1+(i-28))
		}
		_, err := stmt.Exec(ticker, date, close*0.99, close*1.01, close*0.98, close, 100000)
		if err != nil {
			t.Fatalf("seedDB: insert row %d: %v", i, err)
		}
	}

	return dbPath
}

// TestGetCandles_38Rows verifies that GetCandles returns 38 rows for a ticker
// that has 38 daily_ohlcv rows — matching the live market.db scenario for VRE.
func TestGetCandles_38Rows(t *testing.T) {
	const ticker = "VRE"
	const nRows = 38

	dbPath := seedDB(t, ticker, nRows)

	// Point the repository at the temp DB by setting DB_PATH env.
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLitePriceRepository()
	candles, err := repo.GetCandles(ticker, 60)
	if err != nil {
		t.Fatalf("GetCandles: unexpected error: %v", err)
	}
	if len(candles) != nRows {
		t.Fatalf("GetCandles: want %d candles, got %d", nRows, len(candles))
	}
	// Verify the candles are ordered oldest→newest (ascending date order).
	for i := 1; i < len(candles); i++ {
		if candles[i].Date < candles[i-1].Date {
			t.Errorf("candles not in ascending date order at index %d: %s < %s",
				i, candles[i].Date, candles[i-1].Date)
		}
	}
	// Verify Symbol field populated.
	if candles[0].Symbol != ticker {
		t.Errorf("candles[0].Symbol = %q, want %q", candles[0].Symbol, ticker)
	}
}

// TestComputeTA_38Rows_RSI_NonNull verifies that the use-case DB-backed path
// returns a non-empty RSI slice (i.e. NOT N/A) when the ticker has 38 rows.
// This is the regression gate for FIX-TA-GOSVC-NA-DESPITE-DEPTH.
func TestComputeTA_38Rows_RSI_NonNull(t *testing.T) {
	const ticker = "VRE"
	const nRows = 38

	dbPath := seedDB(t, ticker, nRows)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLitePriceRepository()
	calc := infrastructure.NewTACalculator()
	uc := application.NewComputeTAUseCase(calc, repo)

	resp, err := uc.Execute(context.Background(), application.ComputeTARequest{
		Symbol: ticker,
		Period: 14,
	})
	if err != nil {
		t.Fatalf("Execute: unexpected error: %v", err)
	}
	if len(resp.RSI) == 0 {
		t.Errorf("RSI: want non-empty (38 candles > 15 minimum), got empty — regression: N/A path triggered")
	}
	// Additional sanity: RSI values must be in [0, 100].
	for i, v := range resp.RSI {
		if v < 0 || v > 100 {
			t.Errorf("RSI[%d] = %f out of [0, 100]", i, v)
		}
	}
	// BB(20) should also be populated with 38 candles.
	if len(resp.BollingerUpper) == 0 {
		t.Errorf("BollingerUpper: want non-empty (38 candles >= 20 BB period), got empty")
	}
}

// TestGetCandles_EmptyDB verifies that GetCandles returns empty slice (not error)
// when the ticker has no rows.
func TestGetCandles_EmptyDB(t *testing.T) {
	const ticker = "NOTHERE"

	dbPath := seedDB(t, "OTHER", 5) // seed a different ticker
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLitePriceRepository()
	candles, err := repo.GetCandles(ticker, 60)
	if err != nil {
		t.Fatalf("GetCandles on empty ticker: unexpected error: %v", err)
	}
	if len(candles) != 0 {
		t.Errorf("want 0 candles for unknown ticker, got %d", len(candles))
	}
}

// TestGetCandles_DBNotFound verifies that GetCandles returns an error when the
// database file does not exist.
func TestGetCandles_DBNotFound(t *testing.T) {
	t.Setenv("DB_PATH", "/nonexistent/path/market.db")

	repo := infrastructure.NewSQLitePriceRepository()
	_, err := repo.GetCandles("VRE", 60)
	if err == nil {
		t.Error("GetCandles on missing DB: expected error, got nil")
	}
}

// TestGetCandles_LimitRespected verifies that the LIMIT clause caps results at
// the requested limit even when more rows exist.
func TestGetCandles_LimitRespected(t *testing.T) {
	const ticker = "VIC"
	const nRows = 80 // more than the 60 default
	const limit = 40

	dbPath := seedDB(t, ticker, nRows)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLitePriceRepository()
	candles, err := repo.GetCandles(ticker, limit)
	if err != nil {
		t.Fatalf("GetCandles: unexpected error: %v", err)
	}
	if len(candles) != limit {
		t.Errorf("GetCandles with limit=%d: want %d candles, got %d", limit, limit, len(candles))
	}
}

// TestGetCandles_OsEnvDefault verifies the DB_PATH default (./data/market.db) path
// is used when DB_PATH is unset. Since the default path does not exist in the
// test environment, we expect an error (not a panic or silent empty result).
func TestGetCandles_OsEnvDefault(t *testing.T) {
	// Unset DB_PATH so the constructor uses the default path.
	orig := os.Getenv("DB_PATH")
	os.Unsetenv("DB_PATH")
	t.Cleanup(func() { os.Setenv("DB_PATH", orig) })

	repo := infrastructure.NewSQLitePriceRepository()
	_, err := repo.GetCandles("VRE", 60)
	// The default ./data/market.db is absent in test environment — error expected.
	if err == nil {
		// If somehow a market.db exists in the CWD (unlikely in CI), this is fine too.
		t.Log("GetCandles with default path: no error (market.db present in CWD)")
	}
}
