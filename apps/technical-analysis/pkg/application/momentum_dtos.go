// Package application — DTOs for the ComputeROCMomentum use case.
// IND-P1-ROC-MOMENTUM: request/response shapes for POST /ta/roc-momentum.
package application

// ROCMomentumRequest is the inbound payload for POST /ta/roc-momentum.
// All fields are optional — production callers leave empty to use WATCHLIST_TICKERS.
type ROCMomentumRequest struct {
	// Tickers overrides WATCHLIST_TICKERS when provided.
	Tickers []string `json:"tickers,omitempty"`
}

// ROCPerTickerDTO holds the computed momentum data for one ticker in the response.
type ROCPerTickerDTO struct {
	Code       string   `json:"code"`
	ROC        *float64 `json:"roc"`                  // raw 12-1 ROC; null when null_reason set
	ZScore     *float64 `json:"z_score"`              // cross-sectional z-score; null when null_reason set
	Decile     *int     `json:"decile"`               // 1–10; null when null_reason set
	Label      *string  `json:"label"`                // MOMENTUM_LEADER/NEUTRAL/LAGGARD; null when null_reason set
	NullReason *string  `json:"null_reason,omitempty"` // present when any field is null
}

// FactorReturnBucketDTO holds avg realized return per decile bucket.
type FactorReturnBucketDTO struct {
	Decile            int      `json:"decile"`
	AvgRealizedReturn *float64 `json:"avg_realized_return"` // null when bucket empty
	TickerCount       int      `json:"ticker_count"`
}

// ROCMomentumResponse is the outbound payload for POST /ta/roc-momentum.
type ROCMomentumResponse struct {
	Tickers             []ROCPerTickerDTO       `json:"tickers"`
	FactorReturnBuckets []FactorReturnBucketDTO `json:"factor_return_buckets"`
	// MomentumFactorZ is the feed-forward gauge scalar: median z-score across the watchlist.
	// Null when fewer than 5 tickers have sufficient history.
	MomentumFactorZ *float64 `json:"momentum_factor_z"`
	// NullReason is set at the top level when the entire cross-section is unusable.
	NullReason *string `json:"null_reason,omitempty"`
}
