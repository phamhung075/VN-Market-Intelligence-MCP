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
// The query mirrors the mcp-server defaultComputeTa path exactly:
//
//	SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT <limit>
//
// When limit <= 0 it defaults to 60 (matching the TS report path default).
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
		`SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT ?`,
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
