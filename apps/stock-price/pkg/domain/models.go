// Package domain contains pure value objects for the stock-price service.
// Zero I/O — no external dependencies.
package domain

// PriceSource identifies which tier/exchange returned the quote.
type PriceSource string

const (
	SourceHOSE  PriceSource = "hose"
	SourceHNX   PriceSource = "hnx"
	SourceUPCOM PriceSource = "upcom"
	SourceCache PriceSource = "cache"
)

// PriceQuote is a single price snapshot from any tier.
// DSI-INV-1: Change/ChangePercent are pointers — nil = unavailable (serializes as JSON null),
// not 0 which is ambiguous with a genuine flat day.
type PriceQuote struct {
	Code          string      `json:"code"`
	Price         float64     `json:"price"`
	Volume        float64     `json:"volume"`
	Change        *float64    `json:"change"`        // nil = unavailable, 0 = genuine flat day
	ChangePercent *float64    `json:"changePercent"` // nil = unavailable, 0 = genuine flat day
	Source        PriceSource `json:"source"`
	LatencyMs     int64       `json:"latencyMs"`
	FetchedAt     string      `json:"fetchedAt"`
}

// DailyOHLCV is one OHLCV candle for the history endpoint.
type DailyOHLCV struct {
	Date   string  `json:"date"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// PriceNotAvailableError is returned when all tiers fail.
type PriceNotAvailableError struct {
	Code string
}

func (e *PriceNotAvailableError) Error() string {
	return "Price not available for " + e.Code
}
