// Package infrastructure — SQLiteOHLCVRepository: reads full OHLCV bars
// (open + high + low + close) from market.db for volatility computations.
// Uses the same modernc.org/sqlite pure-Go driver as SQLitePriceRepository.
package infrastructure

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"

	// Pure-Go SQLite driver (already registered by SQLitePriceRepository's import).
	_ "modernc.org/sqlite"
)

// SQLiteOHLCVRepository implements the domain.OHLCVRepository port.
// Reads full OHLCV bars (date, open, high, low, close) from daily_ohlcv in market.db.
type SQLiteOHLCVRepository struct {
	dbPath string
}

// NewSQLiteOHLCVRepository constructs the OHLCV repository.
// Reads DB_PATH env var; defaults to ./data/market.db (same as SQLitePriceRepository).
func NewSQLiteOHLCVRepository() *SQLiteOHLCVRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/market.db"
	}
	return &SQLiteOHLCVRepository{dbPath: dbPath}
}

// GetOHLCV returns up to limit full OHLCV bars for symbol, ordered oldest→newest.
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: inner subquery fetches the LATEST `limit`
// rows (ORDER BY date DESC LIMIT ?); outer query re-orders oldest→newest.
// This ensures volatility calculations use the most recent bars, not stale old bars.
// When limit <= 0 it defaults to 300 (enough for drawdown + GK + RV60d history).
func (r *SQLiteOHLCVRepository) GetOHLCV(symbol string, limit int) ([]domain.OHLCVBar, error) {
	if limit <= 0 {
		limit = 300
	}

	db, err := sql.Open("sqlite", r.dbPath)
	if err != nil {
		return nil, fmt.Errorf("SQLiteOHLCVRepository: open %s: %w", r.dbPath, err)
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT date, open, high, low, close
		   FROM (SELECT date, open, high, low, close
		           FROM daily_ohlcv
		          WHERE code = ?
		          ORDER BY date DESC
		          LIMIT ?)
		  ORDER BY date ASC`,
		symbol, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("SQLiteOHLCVRepository: query %s: %w", symbol, err)
	}
	defer rows.Close()

	var bars []domain.OHLCVBar
	for rows.Next() {
		var b domain.OHLCVBar
		var open, high, low sql.NullFloat64
		if err := rows.Scan(&b.Date, &open, &high, &low, &b.Close); err != nil {
			return nil, fmt.Errorf("SQLiteOHLCVRepository: scan: %w", err)
		}
		// Substitute zero for NULL OHLCV fields (data quality guard).
		if open.Valid {
			b.Open = open.Float64
		}
		if high.Valid {
			b.High = high.Float64
		}
		if low.Valid {
			b.Low = low.Float64
		}
		bars = append(bars, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("SQLiteOHLCVRepository: iterate: %w", err)
	}
	return bars, nil
}
