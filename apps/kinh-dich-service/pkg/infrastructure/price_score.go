// Package infrastructure contains the infrastructure layer implementations.
package infrastructure

import (
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// PriceHistorySource is the interface for fetching price history.
// Can be satisfied by HTTPPriceHistorySource or SQLiteReadingRepository.
type PriceHistorySource interface {
	// GetPriceHistory returns price rows for a stock within the past N days.
	// Returns (rows, error) - error surfaces as 503 to HTTP layer.
	GetPriceHistory(stockCode string, days int) ([]domain.KinhDichPriceRow, error)
}

// PriceScoreAdapter implements PriceScorePort using a PriceHistorySource.
// This adapter computes 6 normalized scores from price returns.
type PriceScoreAdapter struct {
	source PriceHistorySource
}

// NewPriceScoreAdapter creates a new PriceScoreAdapter with the given source.
func NewPriceScoreAdapter(source PriceHistorySource) *PriceScoreAdapter {
	return &PriceScoreAdapter{
		source: source,
	}
}

// ComputeScores computes 6 normalized scores from price history.
// The scores represent price momentum over 6 periods.
// Returns nil if insufficient data (requires at least 7 price points).
func (a *PriceScoreAdapter) ComputeScores(stockCode string, days int) []float64 {
	prices, err := a.source.GetPriceHistory(stockCode, days)
	if err != nil {
		// Log error but return nil (insufficient data) - fail-loud at HTTP layer
		return nil
	}
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

// Ensure PriceScoreAdapter implements PriceScorePort.
var _ domain.PriceScorePort = (*PriceScoreAdapter)(nil)

// SQLitePriceScoreAdapter is deprecated - use PriceScoreAdapter with a PriceHistorySource.
// Kept for backward compatibility.
type SQLitePriceScoreAdapter = PriceScoreAdapter

// NewSQLitePriceScoreAdapter creates a PriceScoreAdapter using the repository as source.
// Deprecated: use NewPriceScoreAdapter(NewHTTPPriceHistorySource()) for production.
func NewSQLitePriceScoreAdapter(repo *SQLiteReadingRepository) *PriceScoreAdapter {
	return NewPriceScoreAdapter(repo)
}
