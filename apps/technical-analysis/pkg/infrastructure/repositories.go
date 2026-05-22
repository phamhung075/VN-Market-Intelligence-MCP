// Package infrastructure — SQLitePriceRepository implements PriceHistoryRepository.
// Stub: reads DB_PATH from env (OQ-2: no-arg constructor, locked convention).
package infrastructure

import (
	"errors"
	"os"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
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

// GetCandles is a stub that satisfies the PriceHistoryRepository port.
// Real SQL query added in P1-B tasks.
func (r *SQLitePriceRepository) GetCandles(_ string, _ int) ([]domain.CandleStick, error) {
	return nil, errors.New("not implemented yet")
}
