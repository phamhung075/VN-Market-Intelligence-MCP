// Package infrastructure — SQLite repository for sbv_omo_daily (P0-3-OMO-CURVE).
//
// SQLiteOMODailyRepository opens and owns macro_indicators.db (zone-owned SQLite,
// separate from the shared market.db). It implements application.OMODailyRepository.
//
// DB location: MACRO_DB_PATH env var (default /app/data/macro_indicators.db).
// Per ARCH-RATIFY-OMO-1 (R-B2 ruling): zone-local SQLite, not shared market.db.
//
// WAL mode is enabled on first open for write-concurrent safety.
// Connection is closed via Close() which is called from the graceful shutdown handler
// in cmd/server/main.go (RISK-MACRO-DUAL-DB-LIFECYCLE mitigation).
//
// Fence-C: only cmd/server/main.go imports this package.
package infrastructure

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	_ "modernc.org/sqlite" // register "sqlite" driver
)

// macroDBDefaultPath is the default path for macro_indicators.db when MACRO_DB_PATH is unset.
const macroDBDefaultPath = "/app/data/macro_indicators.db"

// sbvOMODailyDDL is the CREATE TABLE statement for sbv_omo_daily.
// ON CONFLICT REPLACE on auction_date ensures idempotent re-fetches (NFR-P03-3).
const sbvOMODailyDDL = `
CREATE TABLE IF NOT EXISTS sbv_omo_daily (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_date            TEXT    NOT NULL UNIQUE,
  add_bn_vnd              REAL    NOT NULL,
  absorb_bn_vnd           REAL    NOT NULL,
  net_outstanding_bn_vnd  REAL    NOT NULL,
  weighted_avg_rate_pct   REAL,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_omo_daily_date ON sbv_omo_daily(auction_date DESC);
`

// SQLiteOMODailyRepository implements application.OMODailyRepository using modernc.org/sqlite.
// Zone-owned: reads/writes only macro_indicators.db (never market.db).
type SQLiteOMODailyRepository struct {
	db *sql.DB
}

// NewSQLiteOMODailyRepository opens (or creates) macro_indicators.db at the given path,
// enables WAL mode, and runs CREATE TABLE IF NOT EXISTS sbv_omo_daily.
//
// Returns an error when the DB cannot be opened or the schema migration fails.
// path should be envStr("MACRO_DB_PATH", macroDBDefaultPath) from the composition root.
func NewSQLiteOMODailyRepository(path string) (*SQLiteOMODailyRepository, error) {
	if path == "" {
		path = macroDBDefaultPath
	}

	// Ensure the parent directory exists (Docker volume may create the dir lazily).
	if dir := dirOf(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("omo_daily_repo: mkdir %q: %w", dir, err)
		}
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("omo_daily_repo: open %q: %w", path, err)
	}

	// Single writer — serialise through one connection to avoid WAL conflicts.
	db.SetMaxOpenConns(1)

	// Enable WAL mode for safer concurrent access (RISK-MACRO-DUAL-DB-LIFECYCLE).
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("omo_daily_repo: WAL mode: %w", err)
	}

	// Run schema DDL (idempotent: CREATE TABLE IF NOT EXISTS).
	for _, stmt := range splitDDL(sbvOMODailyDDL) {
		if _, err := db.Exec(stmt); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("omo_daily_repo: schema DDL %q: %w", stmt[:min(len(stmt), 60)], err)
		}
	}

	return &SQLiteOMODailyRepository{db: db}, nil
}

// Persist writes one auction-date OMO summary row to sbv_omo_daily.
// Idempotent: ON CONFLICT(auction_date) DO UPDATE replaces all columns
// so re-fetching the same HTML for the same auction_date is a no-op in effect
// (same values overwrite same values — NFR-P03-3).
func (r *SQLiteOMODailyRepository) Persist(ctx context.Context, row application.OMODailyRow) error {
	const q = `
INSERT INTO sbv_omo_daily
  (auction_date, add_bn_vnd, absorb_bn_vnd, net_outstanding_bn_vnd, weighted_avg_rate_pct)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(auction_date) DO UPDATE SET
  add_bn_vnd             = excluded.add_bn_vnd,
  absorb_bn_vnd          = excluded.absorb_bn_vnd,
  net_outstanding_bn_vnd = excluded.net_outstanding_bn_vnd,
  weighted_avg_rate_pct  = excluded.weighted_avg_rate_pct,
  created_at             = datetime('now')
`
	_, err := r.db.ExecContext(ctx, q,
		row.AuctionDate,
		row.AddBnVND,
		row.AbsorbBnVND,
		row.NetOutstandingBnVND,
		row.WeightedAvgRatePct, // nil → SQL NULL
	)
	if err != nil {
		return fmt.Errorf("omo_daily_repo: persist %q: %w", row.AuctionDate, err)
	}
	return nil
}

// NetInjection5d queries the last 5 auction dates in sbv_omo_daily and returns
// their sum of net_outstanding_bn_vnd plus the actual row count (DaysInWindow).
//
// Row ordering is by auction_date DESC (lexicographic — relies on YYYY-MM-DD ISO date
// canonical order). SBV dates in the DB are stored in the DD/MM/YYYY format as parsed
// from HTML; this is handled via the subquery date conversion.
//
// Note: The auction_date field in sbv_omo_daily stores the date in DD/MM/YYYY format
// (as received from SBV HTML). For ORDER BY to work correctly by date we use
// substr() to derive YYYY-MM-DD from DD/MM/YYYY.
func (r *SQLiteOMODailyRepository) NetInjection5d(ctx context.Context) (application.OMONetInjection5dResult, error) {
	const q = `
SELECT
  SUM(net_outstanding_bn_vnd) AS net_sum,
  COUNT(*)                    AS day_count
FROM (
  SELECT net_outstanding_bn_vnd, auction_date
  FROM sbv_omo_daily
  ORDER BY
    substr(auction_date, 7, 4) || substr(auction_date, 4, 2) || substr(auction_date, 1, 2) DESC
  LIMIT 5
)
`
	var netSum sql.NullFloat64
	var dayCount int
	if err := r.db.QueryRowContext(ctx, q).Scan(&netSum, &dayCount); err != nil {
		return application.OMONetInjection5dResult{}, fmt.Errorf("omo_daily_repo: net_injection_5d: %w", err)
	}

	result := application.OMONetInjection5dResult{DaysInWindow: dayCount}
	if netSum.Valid && dayCount > 0 {
		v := netSum.Float64
		result.NetInjection5dBnVND = &v
	}
	return result, nil
}

// PrevWeightedAvgRate returns the weighted_avg_rate_pct from the most-recent
// sbv_omo_daily row whose auction_date is strictly before beforeDate.
// beforeDate is in DD/MM/YYYY format (same as stored in the DB).
// Returns nil when no prior row exists.
func (r *SQLiteOMODailyRepository) PrevWeightedAvgRate(ctx context.Context, beforeDate string) (*float64, error) {
	if beforeDate == "" {
		return nil, nil
	}
	// Convert DD/MM/YYYY to YYYYMMDD for correct lexicographic ordering.
	beforeISO := toISO(beforeDate)
	if beforeISO == "" {
		return nil, nil
	}

	const q = `
SELECT weighted_avg_rate_pct
FROM sbv_omo_daily
WHERE substr(auction_date, 7, 4) || substr(auction_date, 4, 2) || substr(auction_date, 1, 2) < ?
ORDER BY substr(auction_date, 7, 4) || substr(auction_date, 4, 2) || substr(auction_date, 1, 2) DESC
LIMIT 1
`
	var rate sql.NullFloat64
	if err := r.db.QueryRowContext(ctx, q, beforeISO).Scan(&rate); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("omo_daily_repo: prev_rate before %q: %w", beforeDate, err)
	}
	if !rate.Valid {
		return nil, nil
	}
	v := rate.Float64
	return &v, nil
}

// Close releases the database connection.
// Should be called from the graceful shutdown handler in cmd/server/main.go.
func (r *SQLiteOMODailyRepository) Close() error {
	if r.db != nil {
		return r.db.Close()
	}
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// dirOf returns the directory part of a file path.
// Returns "" when path contains no directory separator.
func dirOf(path string) string {
	// Use manual split rather than path/filepath to avoid import cost.
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[:i]
		}
	}
	return ""
}

// splitDDL splits a multi-statement DDL string on ";" into individual statements,
// trimming whitespace and skipping empties.
func splitDDL(ddl string) []string {
	raw := strings.Split(ddl, ";")
	out := make([]string, 0, len(raw))
	for _, s := range raw {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// toISO converts a DD/MM/YYYY date string to YYYYMMDD for lexicographic ordering.
// Returns "" on invalid input.
func toISO(ddmmyyyy string) string {
	if len(ddmmyyyy) != 10 || ddmmyyyy[2] != '/' || ddmmyyyy[5] != '/' {
		return ""
	}
	// YYYYMMDD = [6:10] + [3:5] + [0:2]
	return ddmmyyyy[6:10] + ddmmyyyy[3:5] + ddmmyyyy[0:2]
}

// min returns the smaller of a and b.
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
