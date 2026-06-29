// Package domain — OMO curve domain models for P0-3-OMO-CURVE.
//
// These types represent the domain-layer view of SBV OMO per-tenor data.
// They are populated by the application layer after converting from
// infrastructure.OMOParseResult / application.OMOInputs.
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// OMOTenorEntry is a single parsed OMO auction row with rate and member data.
// Used as input to ComputeImpliedShortRates domain service.
type OMOTenorEntry struct {
	// OperationType is the normalised ASCII operation type keyword.
	// "mua ky han" for add (reverse-repo), "ban ky han" or "tin phieu" for absorb.
	OperationType string

	// TenorDays is the parsed tenor in calendar days (7, 14, 28, etc.).
	// -1 when the tenor text could not be parsed.
	TenorDays int

	// VolumeBnVND is the auction volume in billion VND. Always > 0 (rows with 0 are skipped).
	VolumeBnVND float64

	// WinningRatePct is the winning bid rate in % per annum.
	// 0 when the rate cell was missing or unparseable (parse warning issued upstream).
	WinningRatePct float64

	// MemberWinRatio = MembersWinning / MembersParticipating (0.0–1.0).
	// 0 when member data is absent.
	MemberWinRatio float64
}

// OMOImpliedRates holds computed implied short rates by standard tenor bucket.
// Output of ComputeImpliedShortRates.
type OMOImpliedRates struct {
	// Rate7dPct is the volume-weighted winning rate for 7-day add rows. nil when absent.
	Rate7dPct *float64

	// Rate14dPct is the volume-weighted winning rate for 14-day add rows. nil when absent.
	Rate14dPct *float64

	// Rate28dPct is the volume-weighted winning rate for 28-day add rows. nil when absent.
	Rate28dPct *float64

	// WeightedAvgRatePct is the cross-tenor volume-weighted avg over all add rows. nil when absent.
	WeightedAvgRatePct *float64

	// MemberWinRatio is the simple average member win ratio across all non-zero add rows. nil when absent.
	MemberWinRatio *float64
}

// OMODailyRecord is the domain model for a single auction date's OMO summary.
// Persisted to sbv_omo_daily table in macro_indicators.db (one row per auction_date, idempotent).
type OMODailyRecord struct {
	// AuctionDate is the auction date in DD/MM/YYYY format (from SBV HTML heading).
	// Used as the UNIQUE key in sbv_omo_daily (ON CONFLICT REPLACE).
	AuctionDate string

	// AddBnVND is the total Mua kỳ hạn (reverse-repo add) volume in billion VND.
	AddBnVND float64

	// AbsorbBnVND is the total Bán kỳ hạn + Tín phiếu (absorb/drain) volume in billion VND.
	AbsorbBnVND float64

	// NetOutstandingBnVND = AddBnVND - AbsorbBnVND.
	// Positive = net injection; negative = net drain.
	NetOutstandingBnVND float64

	// WeightedAvgRatePct is the cross-tenor volume-weighted avg rate for this session.
	// nil when no tenor rate data was parsed.
	WeightedAvgRatePct *float64
}

// OMONetInjection5dResult holds the 5-day rolling net injection and window metadata.
// Returned by the repository after querying the last 5 auction dates in sbv_omo_daily.
type OMONetInjection5dResult struct {
	// NetInjection5dBnVND is the sum of net_outstanding_bn_vnd over the last N auction dates.
	// nil when the table has no rows.
	NetInjection5dBnVND *float64

	// DaysInWindow is the number of auction dates included in the sum (0 when empty, max 5).
	// May be < 5 when SBV skips auction weeks (honest partial sum per BA spec).
	DaysInWindow int
}
