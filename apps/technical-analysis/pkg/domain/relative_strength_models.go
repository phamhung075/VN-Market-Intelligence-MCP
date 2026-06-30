// Package domain — value objects for the cross-sectional Relative Strength feature.
// IND-P1-RELATIVE-STRENGTH: Mansfield RS (63/126/252d) vs VNINDEX + percentile rank.
package domain

// RSLabel classifies a ticker's relative strength posture for a given horizon.
type RSLabel string

const (
	// RSLeading: percentile >= 75 (outperforming the index).
	RSLeading RSLabel = "LEADING"
	// RSLagging: percentile <= 25 (underperforming the index).
	RSLagging RSLabel = "LAGGING"
	// RSInLine: percentile 26–74.
	RSInLine RSLabel = "IN_LINE"
)

// RSCompositeLabel classifies the composite RS across all horizons.
type RSCompositeLabel string

const (
	RSStrong  RSCompositeLabel = "STRONG"  // composite >= 70
	RSWeak    RSCompositeLabel = "WEAK"    // composite <= 30
	RSNeutral RSCompositeLabel = "NEUTRAL" // 31–69
)

// RSHorizonResult holds Mansfield RS + percentile for one horizon (63/126/252d).
// NullReason is non-nil when insufficient data for this horizon.
type RSHorizonResult struct {
	Horizon    int      // 63, 126, or 252
	RS         *float64 // Mansfield RS = stock_%change - index_%change; nil when null
	Percentile *float64 // cross-sectional percentile (0–100); nil when null
	Label      *RSLabel // LEADING/IN_LINE/LAGGING; nil when null
	NullReason *string  // "insufficient_history" | "index_data_absent" | "insufficient_bars_<horizon>d"
}

// CompositeRSResult holds per-ticker RS data across all 3 horizons + composite.
type CompositeRSResult struct {
	Code            string
	H63             RSHorizonResult
	H126            RSHorizonResult
	H252            RSHorizonResult
	CompositeScore  *float64         // arithmetic mean of non-nil horizon percentiles; nil when all null
	CompositeLabel  *RSCompositeLabel
	NullReason      *string // top-level null when all horizons null
}

// RelativeStrengthCrossSection is the full domain result for get_relative_strength.
type RelativeStrengthCrossSection struct {
	Tickers          []CompositeRSResult
	// MarketRSComposite is the feed-forward gauge scalar: mean composite RS across watchlist.
	// Nil when fewer than 5 tickers have valid composite scores.
	MarketRSComposite *float64
	// LowSampleWarning is true when N<5 tickers have sufficient history for any horizon.
	LowSampleWarning bool
	// NullReason is set when VNINDEX is absent from the data.
	NullReason *string
}
