// Package domain — port interfaces for volatility feature.
// Infrastructure adapters must implement OHLCVRepository; domain imports none.
package domain

// OHLCVRepository is the port for reading full OHLCV bars from market.db.
// Returns bars ordered oldest→newest for the given symbol.
type OHLCVRepository interface {
	// GetOHLCV returns up to limit full OHLCV bars for symbol, oldest→newest.
	GetOHLCV(symbol string, limit int) ([]OHLCVBar, error)
}
