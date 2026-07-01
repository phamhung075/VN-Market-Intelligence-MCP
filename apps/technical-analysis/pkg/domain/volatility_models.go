// Package domain — value objects for the volatility indicator feature.
// P0-1-VOLATILITY-INDICATORS: RV10/20/60d, GK, ATR%, regime band, 252d drawdown.
package domain

// OHLCVBar represents a single OHLCV candle for volatility computation.
// Distinct from CandleStick (which is close-only) — volatility needs full OHLCV.
//
// Volume was added for MONEY-RADAR-P0-T1-OSCILLATORS (money-flow oscillators need
// close+volume only — C1 field-constraint, see money-radar brief §2). Zero-value is
// safe for existing volatility/momentum/proximity callers that never populate it.
type OHLCVBar struct {
	Date   string
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume float64
}

// VolatilityRegime is the classification label for the current volatility regime.
type VolatilityRegime string

const (
	RegimeLow      VolatilityRegime = "LOW"
	RegimeNormal   VolatilityRegime = "NORMAL"
	RegimeElevated VolatilityRegime = "ELEVATED"
	RegimeCrisis   VolatilityRegime = "CRISIS"
)

// StockATR holds the ATR% result for a single watchlist ticker.
type StockATR struct {
	Ticker string
	ATRPct *float64 // nil when fewer than 15 bars available
}

// VolatilityResult holds all computed volatility indicators for a full request cycle.
type VolatilityResult struct {
	// FR-1: VN-Index Realized Volatility (annualized %)
	RV10dPct *float64 // nil when <11 bars (need 10 log-returns)
	RV20dPct *float64 // nil when <21 bars
	RV60dPct *float64 // nil when <61 bars (Sprint-0 gated)

	// Gauge-ready scalar for P1 Fear & Greed gauge (0.0–1.0)
	RV20dPercentile *float64 // nil when <2 bars in RV history

	// FR-2: Garman-Klass Volatility (annualized %, rolling 20d)
	GKVol20dPct *float64 // nil when <20 bars or all stub bars

	// FR-3: Per-stock ATR(14)% — one entry per active watchlist ticker
	StockATRs []StockATR

	// FR-4: Volatility Regime Band
	VolRegime       VolatilityRegime // LOW / NORMAL / ELEVATED / CRISIS
	VolRegimePct    float64          // percentile rank used for classification (0.0–1.0)
	HistorySessions int              // number of historical sessions used for regime band

	// FR-5: 252-Day Maximum Drawdown — nil until OHLCV-BACKFILL-P0 completes
	Drawdown252dPct *float64 // nil when <252 bars
}
