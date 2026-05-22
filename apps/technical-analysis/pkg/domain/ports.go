// Package domain — port interfaces (dependency inversion boundary).
// Infrastructure adapters must implement these; domain layer imports none of them.
package domain

// PriceHistoryRepository is the port for reading historical OHLCV candles.
type PriceHistoryRepository interface {
	// GetCandles returns daily candles for the given symbol and period count.
	GetCandles(symbol string, period int) ([]CandleStick, error)
}

// TAIndicatorCalculator is the port for computing technical indicators.
type TAIndicatorCalculator interface {
	// Calculate computes all indicators from a slice of closing prices.
	Calculate(closes []float64, period int) (*TechnicalIndicators, error)
}
