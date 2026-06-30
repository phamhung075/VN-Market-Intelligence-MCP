// Package domain — Foreign Accumulation Rank models.
// Zero I/O — pure value objects per DDD.
package domain

// AccumLabel classifies foreign accumulation intensity.
type AccumLabel string

const (
	AccumLabelAccumulating AccumLabel = "ACCUMULATING" // z >= 1.5
	AccumLabelDistributing AccumLabel = "DISTRIBUTING" // z <= -1.5
	AccumLabelNeutral      AccumLabel = "NEUTRAL"      // -1.5 < z < 1.5
)

// RoomEventType enum for foreign_room_events.
type RoomEventType string

const (
	RoomEventFull   RoomEventType = "ROOM_FULL"
	RoomEventReopen RoomEventType = "ROOM_REOPEN"
)

// ForeignFlowBar is one day's foreign flow data from daily_ohlcv.
// LIVE-CONFIRMED columns: foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume
type ForeignFlowBar struct {
	Code           string   // ticker code
	Date           string   // ISO date YYYY-MM-DD
	ForeignBuyVol  *float64 // nullable — pre-migration rows have NULL
	ForeignSellVol *float64 // nullable
	ForeignNetVol  *float64 // nullable — computed as buy-sell (may differ from our calc)
	Volume         float64  // total volume for ADTV calc
}

// RoomEvent is a single room event from foreign_room_events.
type RoomEvent struct {
	Code      string
	EventDate string
	EventType RoomEventType
}

// ForeignAccumTickerResult is the per-ticker result in the rank response.
type ForeignAccumTickerResult struct {
	Code string `json:"code"`

	// Raw flow values (shares, not normalized)
	NetFlow5dRaw  *float64 `json:"net_flow_5d_raw"`
	NetFlow20dRaw *float64 `json:"net_flow_20d_raw"`

	// ADTV-normalized cumulative flows
	CumNetFlow5dNormalized  *float64 `json:"cum_net_flow_5d_normalized"`
	CumNetFlow20dNormalized *float64 `json:"cum_net_flow_20d_normalized"`

	// Cross-sectional z-score
	ZScore5d *float64 `json:"z_score_5d"`

	// Rank (1 = most accumulated, N = most distributed)
	Rank *int `json:"rank,omitempty"`

	// Classification label
	Label *AccumLabel `json:"label,omitempty"`

	// Room exhaustion flag from foreign_room_events
	// NEVER false when no event row — use null + null_reason
	RoomExhaustion *bool `json:"room_exhaustion"`

	// Honest-null: explains why any field is null
	NullReason *string `json:"null_reason,omitempty"`

	// Separate null_reason for specific fields when needed
	NullReason20d       *string `json:"null_reason_20d,omitempty"`
	NullReasonRoom      *string `json:"null_reason_room,omitempty"`
	NullReasonZScore    *string `json:"null_reason_z_score,omitempty"`
	NullReasonNormalize *string `json:"null_reason_normalize,omitempty"`
}

// ForeignAccumRankResult is the full response.
type ForeignAccumRankResult struct {
	Tickers      []ForeignAccumTickerResult `json:"tickers"`
	ADTVUnit     string                     `json:"adtv_unit"` // always "shares"
	ComputedAsOf string                     `json:"computed_as_of"`

	// Aggregate scalar for Fear & Greed composition
	ForeignAccumZMarket *float64 `json:"foreign_accum_z_market"`
}
