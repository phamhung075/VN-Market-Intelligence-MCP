// Package application — DTOs for the Compute52WProximity use case.
// IND-P1-52W-HIGH-PROXIMITY: request/response shapes for POST /ta/52w-proximity.
package application

// ProximityRequest is the inbound payload for POST /ta/52w-proximity.
type ProximityRequest struct {
	// Tickers overrides WATCHLIST_TICKERS when provided.
	Tickers []string `json:"tickers,omitempty"`
}

// ProximityPerTickerDTO holds per-ticker 52w proximity data.
type ProximityPerTickerDTO struct {
	Code           string   `json:"code"`
	High52w        *float64 `json:"high_52w"`                  // null when <252 bars
	Low52w         *float64 `json:"low_52w"`                   // null when <252 bars
	PctFromHigh    *float64 `json:"pct_from_52w_high"`         // null when <252 bars
	PctFromLow     *float64 `json:"pct_from_52w_low"`          // null when <252 bars
	NewHighToday   *bool    `json:"new_high_today"`            // null when <252 bars
	AboveMA50      *bool    `json:"above_ma50"`                // null when <50 bars
	AboveMA200     *bool    `json:"above_ma200"`               // null when <200 bars
	ProximityLabel *string  `json:"proximity_label"`           // null when <252 bars
	NullReason52w  *string  `json:"null_reason_52w,omitempty"` // present when 52w fields null
	NullReasonMA200 *string `json:"null_reason_ma200,omitempty"` // present when MA200 null
}

// NetNewHighsAggregateDTO is the cross-sectional aggregate for get_52w_proximity.
type NetNewHighsAggregateDTO struct {
	NewHighsCount    int      `json:"new_highs_count"`
	NewLowsCount     int      `json:"new_lows_count"`
	NetNewHighs      int      `json:"net_new_highs"`
	PctAboveMA50     *float64 `json:"pct_above_ma50"`  // null when 0 tickers have >=50 bars
	PctAboveMA200    *float64 `json:"pct_above_ma200"` // null when 0 tickers have >=200 bars
	// DenominatorMA200 is the count of tickers with >=200 bars (sample transparency per spec).
	DenominatorMA200 int `json:"denominator_ma200"`
}

// ProximityResponse is the outbound payload for POST /ta/52w-proximity.
type ProximityResponse struct {
	Tickers   []ProximityPerTickerDTO `json:"tickers"`
	Aggregate NetNewHighsAggregateDTO `json:"aggregate"`
	// NetNewHighs is the feed-forward gauge scalar (new_highs_count - new_lows_count).
	NetNewHighs int `json:"net_new_highs"`
}
