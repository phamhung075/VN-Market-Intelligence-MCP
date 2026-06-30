// Package domain — port for reading multiple tickers' OHLCV bars in one query.
// Used by momentum, relative-strength, and 52w-proximity use cases to avoid N+1
// DB round-trips over the watchlist.
package domain

// MultiTickerOHLCVRepository is the port for fetching OHLCV bars for a batch of
// ticker codes in a single database query.
//
// The returned map key is the ticker code as stored in daily_ohlcv.code.
// Each slice is ordered oldest→newest (same contract as OHLCVRepository).
// Codes that have zero rows in the DB are absent from the returned map (not an error).
type MultiTickerOHLCVRepository interface {
	// GetMultiTickerCandles fetches up to limit bars per code for each code in codes.
	// Returns a map[code][]OHLCVBar; codes with no data are absent (not an error).
	GetMultiTickerCandles(codes []string, limit int) (map[string][]OHLCVBar, error)
}
