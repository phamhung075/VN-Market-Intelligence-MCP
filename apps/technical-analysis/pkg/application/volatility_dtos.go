// Package application — DTOs for the ComputeVolatility use case.
// P0-1-VOLATILITY-INDICATORS: request/response shapes for POST /ta/volatility-indicators.
package application

// OHLCVBarDTO is a data-transfer object for a single OHLCV bar.
// Used in ComputeVolatilityRequest.VNIndexBars / TickerBars for sandbox injection.
type OHLCVBarDTO struct {
	Date  string  `json:"date"`
	Open  float64 `json:"open"`
	High  float64 `json:"high"`
	Low   float64 `json:"low"`
	Close float64 `json:"close"`
}

// ComputeVolatilityRequest is the inbound payload for POST /ta/volatility-indicators.
//
// Tickers: optional watchlist override. When empty, the use case falls back to the
// tickers supplied at construction time (from WATCHLIST_TICKERS env var or caller injection).
//
// VNIndexBars / TickerBars: sandbox/test injection paths — bypasses DB lookup when provided.
// Production callers leave these nil; the use case fetches from market.db.
type ComputeVolatilityRequest struct {
	Tickers    []string               `json:"tickers,omitempty"`
	VNIndexBars []OHLCVBarDTO         `json:"vnindex_bars,omitempty"`
	TickerBars  map[string][]OHLCVBarDTO `json:"ticker_bars,omitempty"`
}

// StockATRResponse holds the ATR(14)% result for a single ticker.
type StockATRResponse struct {
	Ticker string   `json:"ticker"`
	ATRPct *float64 `json:"atr_pct_14d"` // null when <15 bars available
}

// ComputeVolatilityResponse is the outbound payload for GET /ta/volatility-indicators.
// Fields follow the Gauge-Readiness contract (P1 dependency):
//   - rv_20d_percentile: gauge-ready scalar for the P1 Fear & Greed volatility leg.
type ComputeVolatilityResponse struct {
	// FR-1: VN-Index Realized Volatility (annualized %)
	RV10dPct *float64 `json:"rv_10d_pct"`  // null when <11 bars
	RV20dPct *float64 `json:"rv_20d_pct"`  // null when <21 bars
	RV60dPct *float64 `json:"rv_60d_pct"`  // null until OHLCV-BACKFILL-P0 (≥61 bars)

	// Gauge-ready scalar for P1 Fear & Greed gauge volatility leg (0.0–1.0)
	RV20dPercentile *float64 `json:"rv_20d_percentile"` // null when <2 history bars

	// FR-2: Garman-Klass Volatility (annualized %, rolling 20d)
	GKVol20dPct *float64 `json:"gk_vol_20d_pct"` // null when <20 bars or all-stub

	// FR-3: Per-stock ATR(14)% for each watchlist ticker
	StockATRs []StockATRResponse `json:"stock_atrs"`

	// FR-4: Volatility Regime Band
	VolRegime       string  `json:"vol_regime"`        // LOW / NORMAL / ELEVATED / CRISIS
	VolRegimePct    float64 `json:"vol_regime_pct"`    // percentile rank used (0.0–1.0)
	HistorySessions int     `json:"history_sessions"`  // history session count for band quality

	// FR-5: 252-Day Maximum Drawdown (null until Sprint-0 backfill: OHLCV-BACKFILL-P0)
	Drawdown252dPct *float64 `json:"drawdown_252d_pct"` // null when <252 bars
}
