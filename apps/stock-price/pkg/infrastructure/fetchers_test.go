// Package infrastructure — tests for Tier3 cache fetcher + SQLite repository.
// Uses real SQLite (no mocks) per AC-8 + Task spec.
package infrastructure_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	"github.com/vn-market-intelligence/stock-price/pkg/infrastructure"
)

// ── helpers ──────────────────────────────────────────────────────────────────

// createTempDB creates a temp SQLite file with market_prices and daily_ohlcv tables seeded.
func createTempMarketDB(t *testing.T) (path string, cleanup func()) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market.db")

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		t.Fatalf("open temp market.db: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE market_prices (
		code       TEXT,
		price      REAL,
		volume     REAL,
		fetched_at TEXT
	)`)
	if err != nil {
		db.Close()
		t.Fatalf("create market_prices table: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE daily_ohlcv (
		code       TEXT    NOT NULL,
		date       TEXT    NOT NULL,
		open       REAL    NOT NULL,
		high       REAL    NOT NULL,
		low        REAL    NOT NULL,
		close      REAL    NOT NULL,
		volume     REAL    NOT NULL DEFAULT 0,
		updated_at TEXT    NOT NULL,
		PRIMARY KEY (code, date)
	)`)
	if err != nil {
		db.Close()
		t.Fatalf("create daily_ohlcv table: %v", err)
	}
	// Seed VCB current price in market_prices (for Tier3 cache fetcher tests)
	_, err = db.Exec(
		`INSERT INTO market_prices (code, price, volume, fetched_at) VALUES (?, ?, ?, ?)`,
		"VCB", 88000.0, 2000000.0, time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		db.Close()
		t.Fatalf("seed VCB market_prices: %v", err)
	}
	db.Close()

	return dbPath, func() { os.Remove(dbPath) }
}

// createTempOwnDB creates an empty temp SQLite file for stock_price.db writes.
func createTempOwnDB(t *testing.T) (path string, cleanup func()) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "stock_price.db")
	return dbPath, func() { os.Remove(dbPath) }
}

// ── Tier3CacheFetcher tests ───────────────────────────────────────────────────

func TestTier3Fetcher_CacheHit(t *testing.T) {
	marketDB, cleanup := createTempMarketDB(t)
	defer cleanup()

	fetcher := infrastructure.NewTier3Fetcher(marketDB)
	quote, err := fetcher.FetchPrice("VCB")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if quote == nil {
		t.Fatal("expected quote, got nil")
	}
	if quote.Code != "VCB" {
		t.Errorf("code: want VCB, got %s", quote.Code)
	}
	if quote.Price != 88000.0 {
		t.Errorf("price: want 88000, got %f", quote.Price)
	}
	if quote.Source != domain.SourceCache {
		t.Errorf("source: want cache, got %s", quote.Source)
	}
}

func TestTier3Fetcher_CacheMiss(t *testing.T) {
	marketDB, cleanup := createTempMarketDB(t)
	defer cleanup()

	fetcher := infrastructure.NewTier3Fetcher(marketDB)
	quote, err := fetcher.FetchPrice("UNKNOWN_TICKER_XYZ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if quote != nil {
		t.Errorf("expected nil for cache miss, got %+v", quote)
	}
}

func TestTier3Fetcher_DBNotExist_ReturnsNil(t *testing.T) {
	fetcher := infrastructure.NewTier3Fetcher("/nonexistent/path/market.db")
	quote, err := fetcher.FetchPrice("VCB")
	// Must return nil, nil — not crash — for fail-safe waterfall
	if err != nil {
		t.Fatalf("expected nil error on missing DB, got: %v", err)
	}
	if quote != nil {
		t.Errorf("expected nil quote on missing DB, got: %+v", quote)
	}
}

// ── SQLitePriceHistoryRepository tests ────────────────────────────────────────

func TestSQLiteRepo_GetHistory_HitsMarketDB(t *testing.T) {
	marketDB, mCleanup := createTempMarketDB(t)
	defer mCleanup()
	ownDB, oCleanup := createTempOwnDB(t)
	defer oCleanup()

	// Seed 3 days of OHLCV history into daily_ohlcv (source of truth for history)
	db, _ := sql.Open("sqlite3", marketDB+"?_journal_mode=WAL")
	now := time.Now().UTC()
	for i := 1; i <= 3; i++ {
		day := now.Add(-time.Duration(i) * 24 * time.Hour).Format("2006-01-02")
		db.Exec(
			`INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			"VCB", day, 87900.0, 88500.0, 87500.0, 88000.0+float64(i)*100, 1000000.0, now.Format(time.RFC3339),
		)
	}
	db.Close()

	repo := infrastructure.NewSQLitePriceHistoryRepository(marketDB, ownDB)
	history, err := repo.GetHistory("VCB", 7)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(history) == 0 {
		t.Error("expected non-empty history")
	}
	if len(history) != 3 {
		t.Errorf("expected 3 rows, got %d", len(history))
	}
}

func TestSQLiteRepo_GetHistory_EmptyForUnknown(t *testing.T) {
	marketDB, mCleanup := createTempMarketDB(t)
	defer mCleanup()
	ownDB, oCleanup := createTempOwnDB(t)
	defer oCleanup()

	repo := infrastructure.NewSQLitePriceHistoryRepository(marketDB, ownDB)
	history, err := repo.GetHistory("UNKNOWN_XYZ", 30)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(history) != 0 {
		t.Errorf("expected empty history, got %d rows", len(history))
	}
}

func TestSQLiteRepo_SaveQuote_Writes(t *testing.T) {
	marketDB, mCleanup := createTempMarketDB(t)
	defer mCleanup()
	ownDB, oCleanup := createTempOwnDB(t)
	defer oCleanup()

	repo := infrastructure.NewSQLitePriceHistoryRepository(marketDB, ownDB)
	q := &domain.PriceQuote{
		Code:      "HPG",
		Price:     55000,
		Volume:    3000000,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}
	err := repo.SaveQuote(q)
	if err != nil {
		t.Fatalf("SaveQuote error: %v", err)
	}

	// Verify the row is readable from own DB
	db, _ := sql.Open("sqlite3", ownDB)
	defer db.Close()
	var code string
	var price float64
	row := db.QueryRow(`SELECT code, price FROM market_prices_cache WHERE code = ?`, "HPG")
	if scanErr := row.Scan(&code, &price); scanErr != nil {
		t.Fatalf("row not found after SaveQuote: %v", scanErr)
	}
	if code != "HPG" || price != 55000 {
		t.Errorf("unexpected row: code=%s price=%f", code, price)
	}
}

// ── AC-3 Regression: SELECT/Scan field-order parity (1971-STOCKPRICE-SCAN-ORDER-MISMATCH) ──

// TestSQLiteRepo_GetHistory_OHLCFieldParity seeds one row with fully asymmetric
// OHLC values so any column transposition causes at least one assertion to fail.
// Values chosen: open=10, high=40, low=5, close=20, volume=1000 — all distinct,
// none can be confused with another if Scan order is wrong.
func TestSQLiteRepo_GetHistory_OHLCFieldParity(t *testing.T) {
	marketDB, mCleanup := createTempMarketDB(t)
	defer mCleanup()
	ownDB, oCleanup := createTempOwnDB(t)
	defer oCleanup()

	// Seed one row with asymmetric OHLCV values directly into daily_ohlcv.
	// Derive seedDate relative to now so it always lands inside GetHistory's
	// date >= date('now','-7 days') window. Yesterday is safe: within [now-7d, now].
	db, err := sql.Open("sqlite3", marketDB+"?_journal_mode=WAL")
	if err != nil {
		t.Fatalf("open market.db for seeding: %v", err)
	}
	now := time.Now().UTC()
	seedDate := now.AddDate(0, 0, -1).Format("2006-01-02")         // yesterday
	seedUpdatedAt := now.AddDate(0, 0, -1).Format(time.RFC3339)    // same instant for updated_at
	const (
		seedOpen   = 10.0
		seedHigh   = 40.0
		seedLow    = 5.0
		seedClose  = 20.0
		seedVolume = 1000.0
	)
	_, err = db.Exec(
		`INSERT OR REPLACE INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		"FPT", seedDate, seedOpen, seedHigh, seedLow, seedClose, seedVolume,
		seedUpdatedAt,
	)
	db.Close()
	if err != nil {
		t.Fatalf("seed daily_ohlcv: %v", err)
	}

	repo := infrastructure.NewSQLitePriceHistoryRepository(marketDB, ownDB)
	history, err := repo.GetHistory("FPT", 7)
	if err != nil {
		t.Fatalf("GetHistory error: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 row, got %d", len(history))
	}
	row := history[0]

	// Assert all 6 fields individually — any Scan transposition fails loudly.
	if row.Date != seedDate {
		t.Errorf("Date: want %s, got %s", seedDate, row.Date)
	}
	if row.Open != seedOpen {
		t.Errorf("Open: want %.1f, got %.1f", seedOpen, row.Open)
	}
	if row.High != seedHigh {
		t.Errorf("High: want %.1f, got %.1f", seedHigh, row.High)
	}
	if row.Low != seedLow {
		t.Errorf("Low: want %.1f, got %.1f", seedLow, row.Low)
	}
	if row.Close != seedClose {
		t.Errorf("Close: want %.1f, got %.1f", seedClose, row.Close)
	}
	if row.Volume != seedVolume {
		t.Errorf("Volume: want %.1f, got %.1f", seedVolume, row.Volume)
	}
}

// ── AC-8: Concurrent R/W safety — 100-iteration WAL test ─────────────────────

func TestTier3Fetcher_ConcurrentReadWrite_NoLock(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping concurrent test in short mode")
	}

	marketDB, cleanup := createTempMarketDB(t)
	defer cleanup()

	// Writer: opens marketDB with full access (simulates mcp-server writes)
	const iterations = 100
	var writeErrors, readErrors int
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Goroutine 1: concurrent writer on marketDB
	wg.Add(1)
	go func() {
		defer wg.Done()
		db, err := sql.Open("sqlite3", marketDB+"?_journal_mode=WAL&_busy_timeout=5000")
		if err != nil {
			mu.Lock()
			writeErrors++
			mu.Unlock()
			return
		}
		defer db.Close()
		for i := 0; i < iterations; i++ {
			_, err := db.Exec(
				`INSERT INTO market_prices (code, price, volume, fetched_at) VALUES (?, ?, ?, ?)`,
				"VCB", 88000.0+float64(i), 2000000.0, time.Now().UTC().Format(time.RFC3339),
			)
			if err != nil {
				mu.Lock()
				writeErrors++
				mu.Unlock()
			}
			time.Sleep(time.Millisecond) // slight spread
		}
	}()

	// Goroutine 2: concurrent reader via Tier3Fetcher (readonly DSN)
	wg.Add(1)
	go func() {
		defer wg.Done()
		fetcher := infrastructure.NewTier3Fetcher(marketDB)
		for i := 0; i < iterations; i++ {
			_, err := fetcher.FetchPrice("VCB")
			if err != nil {
				mu.Lock()
				readErrors++
				mu.Unlock()
			}
			time.Sleep(time.Millisecond)
		}
	}()

	wg.Wait()

	if readErrors > 0 {
		t.Errorf("AC-8: got %d read errors during concurrent R/W — expected 0", readErrors)
	}
}
