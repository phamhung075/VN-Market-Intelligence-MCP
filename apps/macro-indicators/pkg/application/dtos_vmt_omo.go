// Package application — OMO curve DTOs for P0-3-OMO-CURVE.
//
// These application-layer DTOs bridge the domain models and the HTTP response.
// They mirror domain types but live here to keep Fence-B compliant
// (no direct infrastructure imports in the application layer).
//
// No domain logic — pure data containers.
package application

// OMOTenorRowInput is the application-layer representation of one parsed OMO tenor row.
// Mirrors infrastructure.OMOTenorRow but lives in the application layer (Fence-B).
// The composition root adapter converts infrastructure.OMOTenorRow → OMOTenorRowInput.
type OMOTenorRowInput struct {
	// OperationType is the normalised ASCII keyword ("mua ky han", "ban ky han", "tin phieu").
	OperationType string

	// TenorDays is the parsed tenor in calendar days. -1 when unknown.
	TenorDays int

	// VolumeBnVND is the winning bid volume in billion VND.
	VolumeBnVND float64

	// WinningRatePct is the winning bid rate in % per annum. 0 when absent/unparseable.
	WinningRatePct float64

	// MemberWinRatio = MembersWinning / MembersParticipating (0.0–1.0). 0 when absent.
	MemberWinRatio float64
}

// OMODailyRow is the application-layer DTO for persisting one auction date's OMO summary.
// Passed to OMODailyRepository.Persist (Fence-B: no infrastructure import).
type OMODailyRow struct {
	// AuctionDate in DD/MM/YYYY format (from SBV HTML heading).
	// Used as the UNIQUE key in sbv_omo_daily (ON CONFLICT REPLACE).
	AuctionDate string

	// AddBnVND is the total Mua kỳ hạn volume in billion VND.
	AddBnVND float64

	// AbsorbBnVND is the total Bán kỳ hạn + Tín phiếu volume in billion VND.
	AbsorbBnVND float64

	// NetOutstandingBnVND = AddBnVND - AbsorbBnVND.
	NetOutstandingBnVND float64

	// WeightedAvgRatePct is the volume-weighted avg rate across all tenor rows for this session.
	// nil when no rate data was parsed (ParseWarnings may explain why).
	WeightedAvgRatePct *float64
}

// OMONetInjection5dResult holds the 5-day rolling net injection and window metadata.
// Returned by OMODailyRepository.NetInjection5d.
type OMONetInjection5dResult struct {
	// NetInjection5dBnVND is the sum of net_outstanding_bn_vnd over the last N auction dates.
	// nil when the table has no rows.
	NetInjection5dBnVND *float64

	// DaysInWindow is the number of auction dates included in the sum (0 = empty, max = 5).
	DaysInWindow int
}

// OMOCurveDTO is the new additive bloc in LiquidityStateResponse for P0-3-OMO-CURVE.
// Contains the implied short rates, net injection 5d rolling sum, and liquidity stress result.
// All fields are nullable (omitempty) when the OMO parse failed or history is insufficient.
type OMOCurveDTO struct {
	// OmoRate7dPct is the volume-weighted winning rate for 7-day add rows. null when absent.
	OmoRate7dPct *float64 `json:"omo_rate_7d_pct"`

	// OmoRate14dPct is the volume-weighted winning rate for 14-day add rows. null when absent.
	OmoRate14dPct *float64 `json:"omo_rate_14d_pct"`

	// OmoRate28dPct is the volume-weighted winning rate for 28-day add rows. null when absent.
	OmoRate28dPct *float64 `json:"omo_rate_28d_pct"`

	// OmoWeightedAvgRatePct is the cross-tenor volume-weighted avg over all rows. null when absent.
	OmoWeightedAvgRatePct *float64 `json:"omo_weighted_avg_rate_pct"`

	// OmoMemberWinRatio is the simple mean member win ratio across add rows. null when absent.
	OmoMemberWinRatio *float64 `json:"omo_member_win_ratio"`

	// NetInjection5dBnVND is the 5-day rolling sum of net_outstanding_bn_vnd. null when no data.
	NetInjection5dBnVND *float64 `json:"net_injection_5d_bn_vnd"`

	// DaysInWindow is the count of auction dates included in the 5d sum (0–5).
	// May be < 5 when SBV skips auction weeks (honest partial sum).
	DaysInWindow int `json:"days_in_window"`

	// LiquidityStress is the discrete stress label (DRAIN/TIGHT/NEUTRAL/EASY).
	LiquidityStress string `json:"liquidity_stress"`

	// LiquidityStressScore is the gauge-ready continuous score (0=EASY, 0.5=NEUTRAL, 1=DRAIN).
	// null when DaysInWindow < 5 (insufficient history per BA spec FR-5 gauge contract).
	LiquidityStressScore *float64 `json:"liquidity_stress_score"`

	// ParseWarnings lists non-fatal parse issues from the HTML parser (missing cells, unknown tenors).
	// Empty slice is omitted from JSON response.
	ParseWarnings []string `json:"parse_warnings,omitempty"`
}
