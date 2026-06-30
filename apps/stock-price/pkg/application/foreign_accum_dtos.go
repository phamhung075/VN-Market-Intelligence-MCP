// Package application — Foreign Accumulation Rank DTOs.
package application

import "github.com/vn-market-intelligence/stock-price/pkg/domain"

// ForeignAccumRequest is the inbound DTO for foreign accumulation rank.
type ForeignAccumRequest struct {
	// Codes is optional; if empty, use WATCHLIST_TICKERS env var
	Codes []string `json:"codes,omitempty"`
}

// ForeignAccumResponse is the outbound DTO.
// Wraps domain.ForeignAccumRankResult with DTO conventions.
type ForeignAccumResponse struct {
	Tickers      []ForeignAccumTickerDTO `json:"tickers"`
	ADTVUnit     string                  `json:"adtv_unit"` // always "shares"
	ComputedAsOf string                  `json:"computed_as_of"`

	// Aggregate scalar for Fear & Greed composition
	ForeignAccumZMarket *float64 `json:"foreign_accum_z_market"`
}

// ForeignAccumTickerDTO is the per-ticker DTO in the response.
type ForeignAccumTickerDTO struct {
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
	Label *domain.AccumLabel `json:"label,omitempty"`

	// Room exhaustion flag from foreign_room_events
	// NEVER false when no event row — use null + null_reason
	RoomExhaustion *bool `json:"room_exhaustion"`

	// Honest-null: explains why any field is null
	NullReason          *string `json:"null_reason,omitempty"`
	NullReason20d       *string `json:"null_reason_20d,omitempty"`
	NullReasonRoom      *string `json:"null_reason_room,omitempty"`
	NullReasonZScore    *string `json:"null_reason_z_score,omitempty"`
	NullReasonNormalize *string `json:"null_reason_normalize,omitempty"`
}
