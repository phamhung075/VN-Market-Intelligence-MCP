package infrastructure_test

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vn-market-intelligence/stock-price/pkg/infrastructure"
)

func TestSQLiteForeignFlowRepository_GetForeignFlow(t *testing.T) {
	// Create temp DB
	f, err := os.CreateTemp("", "test_foreign_flow_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := f.Name()
	f.Close()
	defer os.Remove(dbPath)

	// Setup schema and data
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE daily_ohlcv (
			code TEXT NOT NULL,
			date TEXT NOT NULL,
			open REAL NOT NULL DEFAULT 0,
			high REAL NOT NULL DEFAULT 0,
			low REAL NOT NULL DEFAULT 0,
			close REAL NOT NULL,
			volume REAL NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL DEFAULT '',
			foreign_buy_vol REAL,
			foreign_sell_vol REAL,
			foreign_net_vol REAL,
			PRIMARY KEY (code, date)
		)
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// Insert test data: VNM with 10 days, FPT with 5 days
	for i := 0; i < 10; i++ {
		date := "2026-06-" + string(rune('0'+3-i/10)) + string(rune('0'-i%10))
		if i < 10 {
			date = "2026-06-" + string(rune('0'+(30-i)/10)) + string(rune('0'+(30-i)%10))
		}
		_, err = db.Exec(`
			INSERT INTO daily_ohlcv (code, date, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
			VALUES (?, ?, 100, 10000, 1000, 500, 500)
		`, "VNM", date)
		if err != nil {
			t.Fatalf("failed to insert VNM row %d: %v", i, err)
		}
	}

	for i := 0; i < 5; i++ {
		date := "2026-06-" + string(rune('0'+(30-i)/10)) + string(rune('0'+(30-i)%10))
		_, err = db.Exec(`
			INSERT INTO daily_ohlcv (code, date, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
			VALUES (?, ?, 50, 5000, 200, 100, 100)
		`, "FPT", date)
		if err != nil {
			t.Fatalf("failed to insert FPT row %d: %v", i, err)
		}
	}

	// Insert a row with NULL foreign columns (pre-migration)
	_, err = db.Exec(`
		INSERT INTO daily_ohlcv (code, date, close, volume)
		VALUES ('VIC', '2026-06-30', 80, 8000)
	`)
	if err != nil {
		t.Fatalf("failed to insert VIC row: %v", err)
	}

	// Test repository
	repo := infrastructure.NewSQLiteForeignFlowRepository(dbPath)
	result, err := repo.GetForeignFlow([]string{"VNM", "FPT", "VIC"}, 20)
	if err != nil {
		t.Fatalf("GetForeignFlow failed: %v", err)
	}

	// Check VNM: should have 10 bars
	if len(result["VNM"]) != 10 {
		t.Errorf("expected 10 VNM bars, got %d", len(result["VNM"]))
	}

	// Check FPT: should have 5 bars
	if len(result["FPT"]) != 5 {
		t.Errorf("expected 5 FPT bars, got %d", len(result["FPT"]))
	}

	// Check VIC: should have 1 bar with NULL foreign columns
	if len(result["VIC"]) != 1 {
		t.Errorf("expected 1 VIC bar, got %d", len(result["VIC"]))
	}
	if result["VIC"][0].ForeignBuyVol != nil {
		t.Error("VIC foreign_buy_vol should be nil")
	}

	// Check VNM data values
	if result["VNM"][0].ForeignBuyVol == nil || *result["VNM"][0].ForeignBuyVol != 1000 {
		t.Errorf("expected VNM foreign_buy_vol=1000, got %v", result["VNM"][0].ForeignBuyVol)
	}
}

func TestSQLiteForeignFlowRepository_LimitPerCode(t *testing.T) {
	// Create temp DB
	f, err := os.CreateTemp("", "test_foreign_flow_limit_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	dbPath := f.Name()
	f.Close()
	defer os.Remove(dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE daily_ohlcv (
			code TEXT NOT NULL,
			date TEXT NOT NULL,
			open REAL NOT NULL DEFAULT 0,
			high REAL NOT NULL DEFAULT 0,
			low REAL NOT NULL DEFAULT 0,
			close REAL NOT NULL,
			volume REAL NOT NULL DEFAULT 0,
			updated_at TEXT NOT NULL DEFAULT '',
			foreign_buy_vol REAL,
			foreign_sell_vol REAL,
			foreign_net_vol REAL,
			PRIMARY KEY (code, date)
		)
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// Insert 30 rows for VNM
	for i := 0; i < 30; i++ {
		day := 30 - i
		date := "2026-06-" + string(rune('0'+day/10)) + string(rune('0'+day%10))
		_, err = db.Exec(`
			INSERT INTO daily_ohlcv (code, date, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol)
			VALUES (?, ?, 100, 10000, 1000, 500, 500)
		`, "VNM", date)
		if err != nil {
			t.Fatalf("failed to insert row %d: %v", i, err)
		}
	}

	repo := infrastructure.NewSQLiteForeignFlowRepository(dbPath)

	// Request limit 20
	result, err := repo.GetForeignFlow([]string{"VNM"}, 20)
	if err != nil {
		t.Fatalf("GetForeignFlow failed: %v", err)
	}

	if len(result["VNM"]) != 20 {
		t.Errorf("expected 20 bars (limited), got %d", len(result["VNM"]))
	}
}

func TestSQLiteForeignFlowRepository_EmptyCodes(t *testing.T) {
	repo := infrastructure.NewSQLiteForeignFlowRepository("/nonexistent.db")

	result, err := repo.GetForeignFlow([]string{}, 20)
	if err != nil {
		t.Fatalf("GetForeignFlow with empty codes should not error: %v", err)
	}
	if len(result) != 0 {
		t.Error("expected empty result for empty codes")
	}
}
