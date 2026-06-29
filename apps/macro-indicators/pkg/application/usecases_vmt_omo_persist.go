// Package application — OMO daily persistence use case interface for P0-3-OMO-CURVE.
//
// OMODailyRepository is the application-layer interface for writing and querying
// the sbv_omo_daily table in macro_indicators.db.
//
// Implementation: infrastructure.SQLiteOMODailyRepository (wired in cmd/server/main.go).
// Interface lives here (application layer) to respect Fence-B:
// the LiquidityStateUseCase must NOT import infrastructure directly.
//
// NFR-P03-3: Persist is idempotent — ON CONFLICT REPLACE keyed on auction_date.
package application

import "context"

// OMODailyRepository is the port for persisting OMO daily auction summaries.
// Implemented by infrastructure.SQLiteOMODailyRepository (Fence-C compliant: only
// cmd/server/main.go wires the concrete implementation).
type OMODailyRepository interface {
	// Persist writes one auction-date row to sbv_omo_daily.
	// Idempotent: ON CONFLICT REPLACE — re-fetching the same auction_date overwrites
	// with the same values (NFR-P03-3).
	Persist(ctx context.Context, row OMODailyRow) error

	// NetInjection5d queries the last 5 auction dates in sbv_omo_daily (by auction_date
	// ascending) and returns their sum of net_outstanding_bn_vnd plus the count of rows
	// actually included (DaysInWindow ≤ 5, may be < 5 when SBV skips auction weeks).
	// Returns OMONetInjection5dResult with nil NetInjection5dBnVND when the table is empty.
	NetInjection5d(ctx context.Context) (OMONetInjection5dResult, error)

	// PrevWeightedAvgRate returns the weighted_avg_rate_pct from the most-recent
	// sbv_omo_daily row whose auction_date is strictly before the given date string.
	// Returns nil when no prior row exists (e.g. first session or DB empty).
	// Used to determine rate trend for TIGHT classification (DeriveStressResult).
	PrevWeightedAvgRate(ctx context.Context, beforeDate string) (*float64, error)
}
