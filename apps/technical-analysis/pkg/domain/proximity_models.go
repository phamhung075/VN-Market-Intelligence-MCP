// Package domain — value objects for the 52-Week-High Proximity feature.
// IND-P1-52W-HIGH-PROXIMITY: 52w high/low proximity, MA50/MA200, net-new-highs aggregate.
package domain

// ProximityLabel classifies a ticker's price position relative to its 52-week range.
type ProximityLabel string

const (
	// ProximityAtHigh: pct_from_52w_high >= -0.02 (within 2% of 52w high).
	ProximityAtHigh ProximityLabel = "AT_HIGH"
	// ProximityNearHigh: -0.10 to -0.02 of 52w high.
	ProximityNearHigh ProximityLabel = "NEAR_HIGH"
	// ProximityMidRange: middle range.
	ProximityMidRange ProximityLabel = "MID_RANGE"
	// ProximityNearLow: 0 to 0.10 above 52w low.
	ProximityNearLow ProximityLabel = "NEAR_LOW"
	// ProximityAtLow: pct_from_52w_low <= 0.02 (within 2% of 52w low).
	ProximityAtLow ProximityLabel = "AT_LOW"
)

// ProximityResult holds per-ticker 52w proximity data.
// Fields are nil when null_reason is set.
type ProximityResult struct {
	Code             string
	High52w          *float64       // max close over 252 bars; nil when <252 bars
	Low52w           *float64       // min close over 252 bars; nil when <252 bars
	PctFromHigh      *float64       // (current - high) / high; nil when <252 bars
	PctFromLow       *float64       // (current - low) / low; nil when <252 bars
	NewHighToday     *bool          // current == high_52w; nil when <252 bars
	AboveMA50        *bool          // current > SMA(50); nil when <50 bars
	AboveMA200       *bool          // current > SMA(200); nil when <200 bars
	ProximityLabel   *ProximityLabel
	NullReason52w    *string // "insufficient_history" when <252 bars
	NullReasonMA200  *string // "insufficient_bars_ma200" when <200 bars
}

// NetNewHighsAggregate is the cross-sectional aggregate for get_52w_proximity.
type NetNewHighsAggregate struct {
	NewHighsCount    int      // tickers with ProximityAtHigh or ProximityNearHigh
	NewLowsCount     int      // tickers with ProximityAtLow or ProximityNearLow
	NetNewHighs      int      // new_highs_count - new_lows_count (feed-forward scalar)
	PctAboveMA50     *float64 // fraction of tickers above MA50 (denom = tickers with >=50 bars)
	PctAboveMA200    *float64 // fraction of tickers above MA200 (denom = tickers with >=200 bars)
	// DenominatorMA200 is the count of tickers with >=200 bars (sample transparency per spec).
	DenominatorMA200 int
}

// ProximityCrossSection is the full domain result for get_52w_proximity.
type ProximityCrossSection struct {
	Tickers   []ProximityResult
	Aggregate NetNewHighsAggregate
	// NetNewHighs is the feed-forward gauge scalar (same as Aggregate.NetNewHighs).
	NetNewHighs int
}
