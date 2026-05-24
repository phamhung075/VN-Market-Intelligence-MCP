// Package domain contains the business types and ports for the kinh-dich-service.
package domain

// KinhDichHistoryRow represents a history row returned from kinhdich_readings.
type KinhDichHistoryRow struct {
	Timestamp      string   `json:"timestamp"`
	HexagramNumber int      `json:"hexagram_number"`
	TradingSignal  *string  `json:"trading_signal"`
	Confidence     *float64 `json:"confidence"`
}

// KinhDichTransitionRow represents a transition row from hexagram_transitions.
type KinhDichTransitionRow struct {
	ToHexagram  int     `json:"to_hexagram"`
	Count       int     `json:"count"`
	Probability float64 `json:"probability"`
}

// KinhDichPriceRow represents a price row for backtest.
type KinhDichPriceRow struct {
	Price     float64 `json:"price"`
	Timestamp string  `json:"timestamp"`
}

// KinhDichRepositoryPort is the port for reading Kinh Dich stored readings from a data store.
type KinhDichRepositoryPort interface {
	// GetLatestReading returns the most recent stored reading for a given stock code.
	GetLatestReading(stockCode string) *KinhDichStoredRow

	// GetMarkovData returns Markov transition data for a hexagram number.
	GetMarkovData(hexagramNumber int) *MarkovData

	// GetReadingsHistory returns all readings for a stock within the past N days.
	GetReadingsHistory(stockCode string, days int) []KinhDichHistoryRow

	// GetTopTransitions returns top-N transitions from a given hexagram for a stock.
	GetTopTransitions(fromHexagram int, stockCode string, topN int) []KinhDichTransitionRow

	// GetPriceHistory returns price rows for a stock within the past N days.
	GetPriceHistory(stockCode string, days int) []KinhDichPriceRow
}

// PriceScorePort is the port for computing hexagram scores from price history.
type PriceScorePort interface {
	// ComputeScores computes 6 normalised scores from price history for a stock.
	// Returns nil if insufficient data.
	ComputeScores(stockCode string, days int) []float64
}

// MarkovPort is the port for obtaining Markov transition data.
// This interface is used by the reading_composer module for dependency injection.
type MarkovPort interface {
	// GetMarkovData returns Markov transition data for a hexagram number.
	// Returns nil if no data available.
	GetMarkovData(hexagramNumber int) *MarkovData
}
