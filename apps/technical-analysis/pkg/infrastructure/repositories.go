// Package infrastructure — SQLitePriceRepository implements PriceHistoryRepository.
// Reads daily_ohlcv from market.db (DB_PATH env, default ./data/market.db).
// Uses modernc.org/sqlite (pure-Go, no CGO required).
package infrastructure

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"

	// Register modernc pure-Go SQLite driver under the "sqlite" name.
	_ "modernc.org/sqlite"
)

// SQLitePriceRepository is the infrastructure adapter for the market.db SQLite file.
type SQLitePriceRepository struct {
	dbPath string
}

// NewSQLitePriceRepository constructs the repository.
// DB_PATH env var is read internally (no arg — per architect spec §3 OQ-2).
// Default path: ./data/market.db
func NewSQLitePriceRepository() *SQLitePriceRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/market.db"
	}
	return &SQLitePriceRepository{dbPath: dbPath}
}

// GetCandles returns up to `limit` daily candles for `symbol` ordered oldest→newest.
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: the inner subquery fetches the LATEST `limit`
// rows (ORDER BY date DESC LIMIT ?) and the outer query re-orders them oldest→newest
// so callers always receive the most recent bars, not the oldest.
//
//	Before fix: ORDER BY date ASC LIMIT ? → returned oldest N bars (stale 2023 data)
//	After fix:  subquery DESC LIMIT then outer ASC → returns latest N bars
//
// When limit <= 0 it defaults to 60.
func (r *SQLitePriceRepository) GetCandles(symbol string, limit int) ([]domain.CandleStick, error) {
	if limit <= 0 {
		limit = 60
	}

	db, err := sql.Open("sqlite", r.dbPath)
	if err != nil {
		return nil, fmt.Errorf("SQLitePriceRepository: open %s: %w", r.dbPath, err)
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT date, close
		   FROM (SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date DESC LIMIT ?)
		  ORDER BY date ASC`,
		symbol, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("SQLitePriceRepository: query candles for %s: %w", symbol, err)
	}
	defer rows.Close()

	var candles []domain.CandleStick
	for rows.Next() {
		var c domain.CandleStick
		if err := rows.Scan(&c.Date, &c.Close); err != nil {
			return nil, fmt.Errorf("SQLitePriceRepository: scan row: %w", err)
		}
		c.Symbol = symbol
		candles = append(candles, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("SQLitePriceRepository: iterate rows: %w", err)
	}
	return candles, nil
}
