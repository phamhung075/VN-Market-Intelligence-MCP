// Package infrastructure — SQLiteMultiTickerOHLCVRepository: reads OHLCV bars for
// multiple ticker codes in a single IN-clause query from market.db.
// Implements domain.MultiTickerOHLCVRepository.
package infrastructure

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"

	_ "modernc.org/sqlite"
)

// SQLiteMultiTickerOHLCVRepository fetches bars for a batch of ticker codes
// using a single parameterized SQL query with an IN-clause.
// Watchlist size <= 50 tickers per the handoff contract.
type SQLiteMultiTickerOHLCVRepository struct {
	dbPath string
}

// NewSQLiteMultiTickerOHLCVRepository constructs the repository.
// Reads DB_PATH env var; defaults to ./data/market.db (same as other OHLCV repos).
func NewSQLiteMultiTickerOHLCVRepository() *SQLiteMultiTickerOHLCVRepository {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/market.db"
	}
	return &SQLiteMultiTickerOHLCVRepository{dbPath: dbPath}
}

// GetMultiTickerCandles returns up to limit bars per code for each code in codes.
// Returns a map[code][]OHLCVBar ordered oldest→newest per code.
// Codes with zero rows are absent from the returned map (not an error).
// The total SQL LIMIT is len(codes)*limit to bound memory usage.
func (r *SQLiteMultiTickerOHLCVRepository) GetMultiTickerCandles(
	codes []string,
	limit int,
) (map[string][]domain.OHLCVBar, error) {
	if len(codes) == 0 {
		return map[string][]domain.OHLCVBar{}, nil
	}
	if limit <= 0 {
		limit = 300 // enough for 52w (252) + buffer
	}

	db, err := sql.Open("sqlite", r.dbPath)
	if err != nil {
		return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: open %s: %w", r.dbPath, err)
	}
	defer db.Close()

	// Build IN-clause placeholders: (?, ?, ...) with len(codes) slots.
	placeholders := strings.Repeat("?,", len(codes))
	placeholders = strings.TrimSuffix(placeholders, ",")

	// Total row cap = len(codes) * limit to prevent unbounded memory.
	totalLimit := len(codes) * limit

	// Build args: code strings + totalLimit.
	args := make([]interface{}, 0, len(codes)+1)
	for _, c := range codes {
		args = append(args, c)
	}
	args = append(args, totalLimit)

	query := fmt.Sprintf(
		`SELECT code, date, open, high, low, close
		   FROM daily_ohlcv
		  WHERE code IN (%s)
		  ORDER BY code, date ASC
		  LIMIT ?`,
		placeholders,
	)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: query: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]domain.OHLCVBar, len(codes))
	for rows.Next() {
		var (
			code        string
			bar         domain.OHLCVBar
			open, high, low sql.NullFloat64
		)
		if err := rows.Scan(&code, &bar.Date, &open, &high, &low, &bar.Close); err != nil {
			return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: scan: %w", err)
		}
		if open.Valid {
			bar.Open = open.Float64
		}
		if high.Valid {
			bar.High = high.Float64
		}
		if low.Valid {
			bar.Low = low.Float64
		}
		result[code] = append(result[code], bar)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: iterate: %w", err)
	}

	// Per-code limit enforcement: trim to the latest `limit` bars if a code
	// somehow returned more rows than expected (belt-and-suspenders).
	for code, bars := range result {
		if len(bars) > limit {
			result[code] = bars[len(bars)-limit:]
		}
	}

	return result, nil
}
