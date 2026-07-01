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

// ---------------------------------------------------------------------------
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: all codes get latest bars (global-limit bug)
// ---------------------------------------------------------------------------

// TestGetMultiTickerCandles_AllCodesGetLatestBars is the regression gate for the
// global-LIMIT bug that caused later-alphabetical codes (e.g. VCB, VHM) to receive
// zero bars when early-alphabetical codes consumed the single global LIMIT.
// With 10 codes × 500 bars and limit=300, totalLimit was 3000 — after consuming
// FPT (739) + HPG (750) + MBB (750) ≈ 2239 rows, only 761 rows remained for
// MSN..VHM, leaving VCB and later codes with 0 bars.
// The fix uses per-code subqueries (latest N per code) so every code gets data.
func TestGetMultiTickerCandles_AllCodesGetLatestBars(t *testing.T) {
	// Use alphabetically-spread codes to expose the cutoff for late-alphabet codes.
	codes := []string{"AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH", "III", "JJJ"}
	const nBars = 500 // >> limit to exercise the per-code trim
	const limit = 300

	dbPath := createTestDB(t, codes, nBars)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, limit)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}

	for _, code := range codes {
		bars, ok := result[code]
		if !ok {
			t.Errorf("code %s missing from result — global-limit bug: late-alphabet codes starved", code)
			continue
		}
		if len(bars) == 0 {
			t.Errorf("code %s has 0 bars — global-limit bug not fixed", code)
		}
		if len(bars) != limit {
			t.Errorf("code %s: want exactly %d bars (latest), got %d", code, limit, len(bars))
		}
	}
}

// TestGetMultiTickerCandles_ReturnsLatestBarsPerCode verifies that the repository
// returns the LATEST N bars per code (not the oldest N), ordered oldest→newest.
// Regression gate: old code returned oldest rows first due to ORDER BY date ASC
// applied before the global LIMIT, so per-code trim selected "last N of the oldest M"
// which still missed the most recent bars when global limit was hit early.
func TestGetMultiTickerCandles_ReturnsLatestBarsPerCode(t *testing.T) {
	const code = "VCB"
	const limit = 50

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market_test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`CREATE TABLE daily_ohlcv (
		code TEXT NOT NULL, date TEXT NOT NULL,
		open REAL, high REAL, low REAL, close REAL NOT NULL, volume REAL,
		PRIMARY KEY (code, date)
	)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}

	// Seed 50 OLD bars (2023) with close=1000 (stale / wrong-unit price).
	for i := 0; i < 50; i++ {
		date := fmt.Sprintf("2023-01-%02d", 1+i%28)
		if i >= 28 {
			date = fmt.Sprintf("2023-02-%02d", 1+(i-28))
		}
		if _, err := db.Exec(
			`INSERT INTO daily_ohlcv (code, date, open, high, low, close) VALUES (?, ?, ?, ?, ?, ?)`,
			code, date, 1000, 1010, 990, 1000,
		); err != nil {
			t.Fatalf("insert old row %d: %v", i, err)
		}
	}
	// Seed 50 NEW bars (2026) with close=62000 (correct recent price).
	for i := 0; i < 50; i++ {
		date := fmt.Sprintf("2026-01-%02d", 1+i%28)
		if i >= 28 {
			date = fmt.Sprintf("2026-02-%02d", 1+(i-28))
		}
		if _, err := db.Exec(
			`INSERT INTO daily_ohlcv (code, date, open, high, low, close) VALUES (?, ?, ?, ?, ?, ?)`,
			code, date, 62000, 62500, 61500, 62000,
		); err != nil {
			t.Fatalf("insert new row %d: %v", i, err)
		}
	}

	t.Setenv("DB_PATH", dbPath)
	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()

	// Request 50 bars — should get the LATEST 50 (all 2026, close=62000).
	result, err := repo.GetMultiTickerCandles([]string{code}, limit)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}
	bars, ok := result[code]
	if !ok {
		t.Fatalf("code %s missing from result", code)
	}
	if len(bars) != limit {
		t.Fatalf("want %d bars, got %d", limit, len(bars))
	}
	// All returned bars should be from 2026 (recent, close=62000).
	for i, b := range bars {
		if b.Close < 50000 {
			t.Errorf("bar[%d] close=%.0f is stale (2023 data); want recent 2026 bars (close≈62000)", i, b.Close)
			break
		}
	}
}

// ---------------------------------------------------------------------------
// MONEY-RADAR-P0-T1-OSCILLATORS: Volume column is scanned correctly.
// ---------------------------------------------------------------------------

// TestGetMultiTickerCandles_VolumePopulated verifies that OHLCVBar.Volume is
// scanned from the daily_ohlcv.volume column (added for money-flow oscillators;
// previously only date/open/high/low/close were selected).
func TestGetMultiTickerCandles_VolumePopulated(t *testing.T) {
	const code = "VOLT"

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market_test.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`CREATE TABLE daily_ohlcv (
		code TEXT NOT NULL, date TEXT NOT NULL,
		open REAL, high REAL, low REAL, close REAL NOT NULL, volume REAL,
		PRIMARY KEY (code, date)
	)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}

	wantVolumes := []float64{1_000_000, 1_500_000, 2_000_000}
	for i, vol := range wantVolumes {
		date := fmt.Sprintf("2026-01-%02d", i+1)
		if _, err := db.Exec(
			`INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			code, date, 60000.0, 60500.0, 59500.0, 60000.0+float64(i), vol,
		); err != nil {
			t.Fatalf("insert row %d: %v", i, err)
		}
	}

	t.Setenv("DB_PATH", dbPath)
	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles([]string{code}, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}
	bars, ok := result[code]
	if !ok {
		t.Fatalf("code %s missing from result", code)
	}
	if len(bars) != len(wantVolumes) {
		t.Fatalf("want %d bars, got %d", len(wantVolumes), len(bars))
	}
	for i, want := range wantVolumes {
		if bars[i].Volume != want {
			t.Errorf("bar[%d].Volume: got %.0f, want %.0f", i, bars[i].Volume, want)
		}
	}
}

// TestGetMultiTickerCandles_NullVolumeDefaultsToZero verifies the NullFloat64
// defensive-scan pattern (matching open/high/low): a NULL volume column value
// yields Volume=0, not a scan error, for legacy rows without volume data.
func TestGetMultiTickerCandles_NullVolumeDefaultsToZero(t *testing.T) {
	codes := []string{"NOVOL"}
	// createTestDB's INSERT never sets volume — column value is NULL.
	dbPath := createTestDB(t, codes, 5)
	t.Setenv("DB_PATH", dbPath)

	repo := infrastructure.NewSQLiteMultiTickerOHLCVRepository()
	result, err := repo.GetMultiTickerCandles(codes, 100)
	if err != nil {
		t.Fatalf("GetMultiTickerCandles: %v", err)
	}
	bars := result["NOVOL"]
	for i, b := range bars {
		if b.Volume != 0 {
			t.Errorf("bar[%d].Volume: got %.0f, want 0 (NULL volume defaults to zero)", i, b.Volume)
		}
	}
}
