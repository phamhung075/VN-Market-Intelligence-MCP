// Package infrastructure — integration tests for SQLiteMultiTickerOHLCVRepository.
// Uses an in-memory SQLite database to verify multi-ticker IN-clause parameterization.
// No external DB required.
package infrastructure_test

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/vn-market-intelligence/technical-analysis/pkg/infrastructure"
)

// createTestDB creates a temporary SQLite file with a minimal daily_ohlcv table
// seeded with the given codes (each with nBars rows).
func createTestDB(t *testing.T, codes []string, nBars int) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market_test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open test DB: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS daily_ohlcv (
			code TEXT NOT NULL,
			date TEXT NOT NULL,
			open REAL,
			high REAL,
			low  REAL,
			close REAL NOT NULL,
			volume INTEGER,
			PRIMARY KEY (code, date)
		)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}

	for _, code := range codes {
		for i := 0; i < nBars; i++ {
			date := fmt.Sprintf("2026-%02d-%02d", 1+i/28, 1+i%28)
			closeVal := 1000.0 + float64(i)*1.0
			_, err := db.Exec(
				`INSERT INTO daily_ohlcv (code, date, open, high, low, close) VALUES (?, ?, ?, ?, ?, ?)`,
				code, date, closeVal*0.99, closeVal*1.01, closeVal*0.98, closeVal,
			)
			if err != nil {
				t.Fatalf("insert %s date %s: %v", code, date, err)
			}
		}
	}
	return dbPath
}

// ---------------------------------------------------------------------------
// Core: multi-ticker fetch returns correct bar counts per code
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_Basic(t *testing.T) {
	codes := []string{"AAA", "BBB", "CCC"}
	nBars := 50
	dbPath := createTestDB(t, codes, nBars)

	// Temporarily set DB_PATH env to point to test DB.
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}

	for _, code := range codes {
		bars, ok := result[code]
		if !ok {
			t.Errorf("code %s missing from result", code)
			continue
		}
		if len(bars) != nBars {
			t.Errorf("code %s: want %d bars, got %d", code, nBars, len(bars))
		}
	}
}

// ---------------------------------------------------------------------------
// VNINDEX present in result
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_VNINDEX(t *testing.T) {
	codes := []string{"VNINDEX", "VCB", "FPT"}
	dbPath := createTestDB(t, codes, 55)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}

	if _, ok := result["VNINDEX"]; !ok {
		t.Error("VNINDEX missing from result (RS-1 critical: VNINDEX must be in daily_ohlcv)")
	}
}

// ---------------------------------------------------------------------------
// Per-code limit: trim to latest N bars when DB has more
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_LimitPerCode(t *testing.T) {
	codes := []string{"X"}
	dbPath := createTestDB(t, codes, 100) // 100 bars in DB
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, 50) // limit=50
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}

	bars := result["X"]
	if len(bars) > 50 {
		t.Errorf("want <=50 bars per code when limit=50, got %d", len(bars))
	}
}

// ---------------------------------------------------------------------------
// Empty codes → empty result (not an error)
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_EmptyCodes(t *testing.T) {
	// No DB needed — empty codes must return immediately.
	t.Setenv("DB_PATH", "/nonexistent/path.db")

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles([]string{}, 100)
	if err != nil {
		t.Fatalf("empty codes should not error, got: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("want empty map for empty codes, got %d entries", len(result))
	}
}

// ---------------------------------------------------------------------------
// Missing code → absent from map (not an error)
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_MissingCode(t *testing.T) {
	codes := []string{"AAA"}
	dbPath := createTestDB(t, codes, 10)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	// Request AAA + nonexistent ZZZZZ.
	result, err := repo.GetMultiTickerCandles([]string{"AAA", "ZZZZZ"}, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}
	if _, ok := result["ZZZZZ"]; ok {
		t.Error("ZZZZZ should be absent from result (not in DB)")
	}
	if _, ok := result["AAA"]; !ok {
		t.Error("AAA should be present in result")
	}

	// Avoid unused import.
	_ = os.Getenv("DB_PATH")
}

// ---------------------------------------------------------------------------
// Bars ordered oldest→newest
// ---------------------------------------------------------------------------

func TestSQLiteMultiTickerOHLCVRepository_GetMultiTickerCandles_OrderedAsc(t *testing.T) {
	codes := []string{"ORD"}
	dbPath := createTestDB(t, codes, 30)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}
	bars := result["ORD"]
	for i := 1; i < len(bars); i++ {
		if bars[i].Date < bars[i-1].Date {
			t.Errorf("bars not ordered asc: bars[%d].Date=%s < bars[%d].Date=%s", i, bars[i].Date, i-1, bars[i-1].Date)
		}
	}
}
