// Package infrastructure contains the infrastructure layer implementations.
package infrastructure

import (
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// SQLitePriceScoreAdapter implements PriceScorePort using price history from SQLite.
// This adapter computes 6 normalized scores from price returns.
type SQLitePriceScoreAdapter struct {
	repo *SQLiteReadingRepository
}

// NewSQLitePriceScoreAdapter creates a new SQLitePriceScoreAdapter.
func NewSQLitePriceScoreAdapter(repo *SQLiteReadingRepository) *SQLitePriceScoreAdapter {
	return &SQLitePriceScoreAdapter{
		repo: repo,
	}
}

// ComputeScores computes 6 normalized scores from price history.
// The scores represent price momentum over 6 periods.
// Returns nil if insufficient data (requires at least 7 price points).
func (a *SQLitePriceScoreAdapter) ComputeScores(stockCode string, days int) []float64 {
	prices := a.repo.GetPriceHistory(stockCode, days)
	if len(prices) < 7 {
		// Insufficient data to compute 6 period returns
		return nil
	}

	// Use the most recent 7 prices to compute 6 returns
	// Each return is normalized to [-1, +1] range
	scores := make([]float64, 6)
	recentPrices := prices[len(prices)-7:]

	for i := 0; i < 6; i++ {
		prevPrice := recentPrices[i].Price
		currPrice := recentPrices[i+1].Price

		if prevPrice == 0 {
			scores[i] = 0
			continue
		}

		// Compute percentage return
		ret := (currPrice - prevPrice) / prevPrice

		// Normalize to [-1, +1] range
		// Assume typical daily return range is [-5%, +5%]
		normalized := ret / 0.05
		if normalized > 1 {
			normalized = 1
		} else if normalized < -1 {
			normalized = -1
		}
		scores[i] = normalized
	}

	return scores
}

// Ensure SQLitePriceScoreAdapter implements PriceScorePort.
var _ domain.PriceScorePort = (*SQLitePriceScoreAdapter)(nil)
