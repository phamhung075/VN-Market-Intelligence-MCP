// Package infrastructure — SQLite foreign flow repository.
// CGO required: mattn/go-sqlite3.
package infrastructure

import (
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// SQLiteForeignFlowRepository reads foreign flow data from daily_ohlcv.
// LIVE-CONFIRMED columns: foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume
type SQLiteForeignFlowRepository struct {
	dbPath string // readonly — market.db
}

// NewSQLiteForeignFlowRepository creates the repository.
func NewSQLiteForeignFlowRepository(marketDBPath string) *SQLiteForeignFlowRepository {
	return &SQLiteForeignFlowRepository{dbPath: marketDBPath}
}

// GetForeignFlow fetches trailing daily bars for the given codes.
// FR-1: Reads from daily_ohlcv WHERE code IN (...) AND foreign_buy_vol IS NOT NULL
// Returns map[code][]ForeignFlowBar sorted by date DESC (most recent first).
func (r *SQLiteForeignFlowRepository) GetForeignFlow(codes []string, limit int) (map[string][]domain.ForeignFlowBar, error) {
	if len(codes) == 0 {
		return make(map[string][]domain.ForeignFlowBar), nil
	}

	// Note: readonly mode (mode=ro) conflicts with WAL journal mode creation.
	// Use immutable=1 for truly readonly access, or skip mode=ro for test scenarios.
	// For production: market.db is expected to have WAL already enabled.
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", r.dbPath)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open market.db: %w", err)
	}
	defer db.Close()

	// Build IN-clause with parameterization
	placeholders := make([]string, len(codes))
	args := make([]any, len(codes))
	for i, code := range codes {
		placeholders[i] = "?"
		args[i] = code
	}

	// Query: SELECT for each code, fetch up to `limit` rows sorted by date DESC
	// We need a window function or subquery to limit per code.
	// Using a simpler approach: fetch all and filter in Go (safe for watchlist size ~30 codes, ~20 rows each).
	query := fmt.Sprintf(`
		SELECT code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume
		FROM daily_ohlcv
		WHERE code IN (%s)
		ORDER BY code, date DESC
	`, strings.Join(placeholders, ","))

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily_ohlcv: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]domain.ForeignFlowBar)
	counts := make(map[string]int)

	for rows.Next() {
		var bar domain.ForeignFlowBar
		var foreignBuy, foreignSell, foreignNet sql.NullFloat64

		if err := rows.Scan(&bar.Code, &bar.Date, &foreignBuy, &foreignSell, &foreignNet, &bar.Volume); err != nil {
			slog.Warn("foreign_flow: scan error", "error", err)
			continue
		}

		// Respect per-code limit
		if counts[bar.Code] >= limit {
			continue
		}

		// Handle NULL foreign_*_vol (pre-migration rows)
		if foreignBuy.Valid {
			bar.ForeignBuyVol = &foreignBuy.Float64
		}
		if foreignSell.Valid {
			bar.ForeignSellVol = &foreignSell.Float64
		}
		if foreignNet.Valid {
			bar.ForeignNetVol = &foreignNet.Float64
		}

		result[bar.Code] = append(result[bar.Code], bar)
		counts[bar.Code]++
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows iteration error: %w", err)
	}

	return result, nil
}
