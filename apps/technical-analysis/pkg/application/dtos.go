// Package application — request/response DTOs (data-transfer objects).
// Stubs: fields will be enriched in P1-B primitives bucket.
package application

// ComputeTARequest is the inbound payload for the /ta/indicators endpoint.
// Closes is the credential-free pure-compute path: provide closes directly
// (no DB lookup). Symbol+Period is the DB-backed path (requires SQLite).
type ComputeTARequest struct {
	Symbol string    `json:"symbol"`
	Period int       `json:"period"`
	Closes []float64 `json:"closes,omitempty"`
}

// ComputeTAResponse is the outbound payload returned by the use case.
type ComputeTAResponse struct {
	Symbol          string    `json:"symbol"`
	RSI             []float64 `json:"rsi,omitempty"`
	MACDLine        []float64 `json:"macdLine,omitempty"`
	SignalLine       []float64 `json:"signalLine,omitempty"`
	Histogram       []float64 `json:"histogram,omitempty"`
	BollingerUpper  []float64 `json:"bollingerUpper,omitempty"`
	BollingerMiddle []float64 `json:"bollingerMiddle,omitempty"`
	BollingerLower  []float64 `json:"bollingerLower,omitempty"`
	SMA             []float64 `json:"sma,omitempty"`
	EMA             []float64 `json:"ema,omitempty"`
}
