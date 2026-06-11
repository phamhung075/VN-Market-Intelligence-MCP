// Package infrastructure contains the infrastructure layer implementations.
package infrastructure

import (
	"os"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// SQLiteReadingRepository implements KinhDichRepositoryPort using modernc.org/sqlite.
type SQLiteReadingRepository struct {
	dbPath string
}

// NewSQLiteReadingRepository creates a new SQLiteReadingRepository.
// Reads DB_PATH from environment variable (no-arg constructor per OQ-2).
func NewSQLiteReadingRepository() *SQLiteReadingRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./market.db" // default for local dev
	}
	return &SQLiteReadingRepository{
		dbPath: dbPath,
	}
}

// GetLatestReading returns the most recent stored reading for a given stock code.
// Stub implementation - real DB access in Phase 2.
func (r *SQLiteReadingRepository) GetLatestReading(stockCode string) *domain.KinhDichStoredRow {
	// Stub: return nil (no stored reading)
	return nil
}

// GetMarkovData returns Markov transition data for a hexagram number.
// Stub implementation - real DB access in Phase 2.
func (r *SQLiteReadingRepository) GetMarkovData(hexagramNumber int) *domain.MarkovData {
	// Stub: return nil (no Markov data)
	return nil
}

// GetReadingsHistory returns all readings for a stock within the past N days.
// Stub implementation - real DB access in Phase 2.
func (r *SQLiteReadingRepository) GetReadingsHistory(stockCode string, days int) []domain.KinhDichHistoryRow {
	// Stub: return empty slice
	return nil
}

// GetTopTransitions returns top-N transitions from a given hexagram for a stock.
// Stub implementation - real DB access in Phase 2.
func (r *SQLiteReadingRepository) GetTopTransitions(fromHexagram int, stockCode string, topN int) []domain.KinhDichTransitionRow {
	// Stub: return empty slice
	return nil
}

// GetPriceHistory returns price rows for a stock within the past N days.
// Stub implementation - real DB access in Phase 2.
// Implements PriceHistorySource interface (returns nil, nil for stub).
func (r *SQLiteReadingRepository) GetPriceHistory(stockCode string, days int) ([]domain.KinhDichPriceRow, error) {
	// Stub: return empty slice (not an error, just no local data)
	return nil, nil
}
