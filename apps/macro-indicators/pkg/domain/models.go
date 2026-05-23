// Package domain — pure business value types for the macro-indicators service.
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

import "time"

// SignalDirection represents the direction of a macro indicator signal.
type SignalDirection string

const (
	BULLISH SignalDirection = "BULLISH"
	BEARISH SignalDirection = "BEARISH"
	NEUTRAL SignalDirection = "NEUTRAL"
)

// PriceSignal represents a single macro indicator signal.
type PriceSignal struct {
	Name       string
	Direction  SignalDirection
	Confidence float64
	Reason     string
}

// MacroSnapshot is the top-level output of macro-indicators analysis.
// Fields ported from src/domain/models.ts MacroSnapshot.
// TODO(P1-B1): extend with Signals []PriceSignal when primitive wiring lands.
type MacroSnapshot struct {
	VNIndex   float64
	OilUSD    float64
	GoldUSD   float64
	USDVnd    float64
	FetchedAt time.Time
}
