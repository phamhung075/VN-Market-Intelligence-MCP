// Package domain — value objects for the ROC-Momentum indicator feature.
// IND-P1-ROC-MOMENTUM: Jegadeesh-Titman 12-1 skip-month momentum, z-score, decile, factor-return.
package domain

// MomentumLabel classifies a ticker's cross-sectional momentum posture.
type MomentumLabel string

const (
	// MomentumLeader: decile 8–10 (top momentum).
	MomentumLeader MomentumLabel = "MOMENTUM_LEADER"
	// MomentumNeutral: decile 3–7.
	MomentumNeutral MomentumLabel = "MOMENTUM_NEUTRAL"
	// MomentumLaggard: decile 1–2 (bottom momentum).
	MomentumLaggard MomentumLabel = "MOMENTUM_LAGGARD"
)

// ROCPerTickerResult holds the computed 12-1 momentum fields for one ticker.
// When NullReason is non-nil, ROC/ZScore/Decile/Label are nil (honest-NULL contract).
type ROCPerTickerResult struct {
	Code       string
	ROC        *float64       // raw 12-1 ROC; nil when NullReason set
	ZScore     *float64       // cross-sectional z-score; nil when NullReason set
	Decile     *int           // 1–10; nil when NullReason set
	Label      *MomentumLabel // nil when NullReason set
	NullReason *string        // "insufficient_history" | "data_gap_too_large" | "insufficient_cross_section"
}

// FactorReturnBucket holds the average realized return for one decile bucket
// over the prior 21-day window (FR-4: compute-on-read, no new table).
type FactorReturnBucket struct {
	Decile            int
	AvgRealizedReturn *float64 // nil when bucket is empty
	TickerCount       int
}

// CrossSectionalROCResult is the full domain result for get_roc_momentum.
type CrossSectionalROCResult struct {
	Tickers             []ROCPerTickerResult
	FactorReturnBuckets []FactorReturnBucket
	// MomentumFactorZ is the feed-forward gauge scalar: median z-score across all
	// tickers with valid z-scores. Nil when fewer than 5 tickers have sufficient history.
	MomentumFactorZ *float64
	// NullReason is set at the top level when the entire cross-section is unusable.
	NullReason *string
}
