// Package infrastructure — SQLiteMultiTickerOHLCVRepository: reads OHLCV bars for
// multiple ticker codes using per-code subqueries from market.db.
// Implements domain.MultiTickerOHLCVRepository.
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: replaced single IN-clause query with
// per-code latest-N subqueries to fix global-LIMIT starvation and stale-data bugs.
package infrastructure

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"

	_ "modernc.org/sqlite"
)

// SQLiteMultiTickerOHLCVRepository fetches the latest N OHLCV bars per ticker code
// using independent per-code subqueries.
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
//
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: replaced the single IN-clause query with
// per-code subqueries to eliminate two compounding bugs:
//
//  1. Global-LIMIT starvation: a single LIMIT of len(codes)*limit applied after
//     ORDER BY code, date ASC caused early-alphabet codes (FPT, HPG) to consume the
//     entire budget, leaving later-alphabet codes (VCB, VHM) with zero bars.
//
//  2. Stale-data direction: ORDER BY date ASC combined with a global LIMIT returned
//     the OLDEST rows first; even when the per-code trim selected "last N of those
//     returned", the window started from old contaminated data rather than the most
//     recent bars.
//
// The fix uses one subquery per code:
//
//	SELECT ... FROM (SELECT ... WHERE code=? ORDER BY date DESC LIMIT ?) ORDER BY date ASC
//
// This guarantees every code independently receives its latest `limit` bars, ordered
// oldest→newest for consumption by domain services.
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

	result := make(map[string][]domain.OHLCVBar, len(codes))

	for _, code := range codes {
		rows, err := db.Query(
			`SELECT date, open, high, low, close
			   FROM (SELECT date, open, high, low, close
			           FROM daily_ohlcv
			          WHERE code = ?
			          ORDER BY date DESC
			          LIMIT ?)
			  ORDER BY date ASC`,
			code, limit,
		)
		if err != nil {
			return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: query %s: %w", code, err)
		}

		var bars []domain.OHLCVBar
		for rows.Next() {
			var (
				bar             domain.OHLCVBar
				open, high, low sql.NullFloat64
			)
			if err := rows.Scan(&bar.Date, &open, &high, &low, &bar.Close); err != nil {
				_ = rows.Close()
				return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: scan %s: %w", code, err)
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
			bars = append(bars, bar)
		}
		if err := rows.Close(); err != nil {
			return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: close rows %s: %w", code, err)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("SQLiteMultiTickerOHLCVRepository: iterate %s: %w", code, err)
		}

		if len(bars) > 0 {
			result[code] = bars
		}
	}

	return result, nil
}
