// Package application — DTOs for the ComputeRelativeStrength use case.
// IND-P1-RELATIVE-STRENGTH: request/response shapes for POST /ta/relative-strength.
package application

// RSRequest is the inbound payload for POST /ta/relative-strength.
type RSRequest struct {
	// Tickers overrides WATCHLIST_TICKERS when provided (VNINDEX always prepended internally).
	Tickers []string `json:"tickers,omitempty"`
}

// RSHorizonDTO holds RS data for one horizon (63/126/252d).
type RSHorizonDTO struct {
	Horizon    int      `json:"horizon_bars"`
	RS         *float64 `json:"rs"`                    // Mansfield RS; null when null_reason set
	Percentile *float64 `json:"percentile"`            // cross-sectional percentile 0–100; null when null_reason set
	Label      *string  `json:"label"`                 // LEADING/IN_LINE/LAGGING; null when null_reason set
	NullReason *string  `json:"null_reason,omitempty"` // present when this horizon is null
}

// RSPerTickerDTO holds RS data for one ticker across all 3 horizons.
type RSPerTickerDTO struct {
	Code           string       `json:"code"`
	H63            RSHorizonDTO `json:"h63"`
	H126           RSHorizonDTO `json:"h126"`
	H252           RSHorizonDTO `json:"h252"`
	CompositeScore *float64     `json:"composite_score"` // mean of non-nil percentiles; null when all null
	CompositeLabel *string      `json:"composite_label"` // STRONG/NEUTRAL/WEAK; null when all null
	NullReason     *string      `json:"null_reason,omitempty"`
}

// RSResponse is the outbound payload for POST /ta/relative-strength.
type RSResponse struct {
	Tickers []RSPerTickerDTO `json:"tickers"`
	// MarketRSComposite is the feed-forward gauge scalar: mean composite RS across watchlist.
	// Null when fewer than 5 tickers have valid composite scores.
	MarketRSComposite *float64 `json:"market_rs_composite"`
	// LowSampleWarning is true when N<5 tickers have sufficient history.
	LowSampleWarning bool    `json:"low_sample_warning"`
	NullReason       *string `json:"null_reason,omitempty"`
}
