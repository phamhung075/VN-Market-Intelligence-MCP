// Package domain — port interfaces (dependency inversion).
package domain

// PriceFetcherPort is the abstract single-tier price fetcher.
type PriceFetcherPort interface {
	FetchPrice(code string) (*PriceQuote, error)
}

// PriceHistoryPort is the abstract price history port.
type PriceHistoryPort interface {
	GetHistory(code string, days int) ([]DailyOHLCV, error)
}
