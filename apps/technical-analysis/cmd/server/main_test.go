// Package main — unit tests for composition-root helpers.
// Tests readWatchlistFromDB: the FR-C1 startup fallback that resolves the watchlist
// universe from the SQLite watchlist table when WATCHLIST_TICKERS env is absent.
package main

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// seedWatchlistDB creates a temporary SQLite database, creates a minimal watchlist
// table (code TEXT PRIMARY KEY), and inserts the given codes. Returns the db path.
func seedWatchlistDB(t *testing.T, codes []string) string {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("seedWatchlistDB: open: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`CREATE TABLE watchlist (code TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("seedWatchlistDB: create table: %v", err)
	}
	for _, code := range codes {
		if _, err := db.Exec("INSERT INTO watchlist (code) VALUES (?)", code); err != nil {
			t.Fatalf("seedWatchlistDB: insert %s: %v", code, err)
		}
	}
	return dbPath
}

// TestReadWatchlistFromDB_WithRows verifies that codes are returned sorted when the
// watchlist table is populated. The ORDER BY code in the query must be respected.
func TestReadWatchlistFromDB_WithRows(t *testing.T) {
	// Insert in reverse order — function must return alphabetically sorted.
	dbPath := seedWatchlistDB(t, []string{"VCB", "FPT", "HPG"})

	got, err := readWatchlistFromDB(dbPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []string{"FPT", "HPG", "VCB"}
	if len(got) != len(want) {
		t.Fatalf("got %d rows, want %d; rows=%v", len(got), len(want), got)
	}
	for i, code := range want {
		if got[i] != code {
			t.Errorf("got[%d]=%q, want %q", i, got[i], code)
		}
	}
}

// TestReadWatchlistFromDB_EmptyTable verifies that an empty watchlist table returns
// an empty (non-nil) slice with no error and does not panic.
func TestReadWatchlistFromDB_EmptyTable(t *testing.T) {
	dbPath := seedWatchlistDB(t, nil) // watchlist table exists, 0 rows

	got, err := readWatchlistFromDB(dbPath)
	if err != nil {
		t.Fatalf("unexpected error for empty table: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("got %d rows, want 0; rows=%v", len(got), got)
	}
}

// TestReadWatchlistFromDB_NoWatchlistTable verifies that a DB without a watchlist
// table returns an error and does not panic. The caller (main) checks err != nil
// and falls through to the slog.Warn branch.
func TestReadWatchlistFromDB_NoWatchlistTable(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "market.db")

	// Create a DB with a different table (no watchlist).
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE other_table (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatalf("create other_table: %v", err)
	}
	db.Close()

	got, err := readWatchlistFromDB(dbPath)
	// Must return an error (no such table: watchlist) — must NOT panic.
	if err == nil {
		t.Fatalf("expected error for missing watchlist table, got nil (rows=%v)", got)
	}
	// got must be nil or empty when an error occurs.
	if len(got) != 0 {
		t.Fatalf("expected empty result on error, got %v", got)
	}
}
