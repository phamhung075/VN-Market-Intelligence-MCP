// Package domain — VolatilityService: pure calculation functions for all
// P0-1 volatility primitives. Zero I/O, zero side-effects, safe to unit-test
// without any mock infrastructure.
//
// FR-1: Realized Volatility (RV) — 10/20/60d close-to-close, annualized.
// FR-2: Garman-Klass OHLC-based volatility — rolling 20d, annualized.
// FR-3: ATR(14) via Wilder smoothing → ATR% of previous close.
// FR-4: Volatility Regime Band — LOW/NORMAL/ELEVATED/CRISIS by percentile rank.
// FR-5: 252d Maximum Drawdown — peak-to-trough over trailing year.
// Gauge: rv_20d_percentile — rank of rv_20d in available history (0.0–1.0).
package domain

import (
	"math"
	"sort"
)

// VolatilityService provides pure-calculation methods for all volatility indicators.
type VolatilityService struct{}

// NewVolatilityService constructs a VolatilityService.
func NewVolatilityService() *VolatilityService {
	return &VolatilityService{}
}

// ---------------------------------------------------------------------------
// FR-1: Realized Volatility
// ---------------------------------------------------------------------------

// ComputeRV computes annualized realized volatility from a close price series.
//
// Algorithm: daily log-returns r_t = ln(P_t / P_{t-1}).
// RV_N = sqrt(252) × sqrt(mean(r_t²) over N days) × 100  → annualized %.
//
// Requires at least n+1 closes (to produce n log-returns).
// Returns nil when insufficient data.
func (s *VolatilityService) ComputeRV(closes []float64, n int) *float64 {
	if len(closes) < n+1 {
		return nil
	}
	// Use the last n+1 closes to get exactly n log-returns.
	window := closes[len(closes)-(n+1):]

	var sumSq float64
	for i := 1; i < len(window); i++ {
		if window[i-1] <= 0 || window[i] <= 0 {
			// Skip degenerate bars; do not propagate NaN.
			continue
		}
		r := math.Log(window[i] / window[i-1])
		sumSq += r * r
	}

	meanSq := sumSq / float64(n)
	rv := math.Sqrt(252) * math.Sqrt(meanSq) * 100 // annualized %
	return &rv
}

// ---------------------------------------------------------------------------
// FR-2: Garman-Klass Volatility
// ---------------------------------------------------------------------------

// ComputeGarmanKlass computes the rolling 20-day Garman-Klass volatility (annualized %).
//
// GK estimator per bar: 0.5×(ln(H/L))² − (2ln2−1)×(ln(C/O))²
// Rolling 20d annualized: sqrt(252 × mean_GK_per_bar) × 100.
//
// Stub bars where H=L=O=C are skipped. If all 20 bars are stubs → returns nil.
// Returns nil when fewer than 20 bars.
func (s *VolatilityService) ComputeGarmanKlass(bars []OHLCVBar) *float64 {
	const window = 20
	if len(bars) < window {
		return nil
	}

	recent := bars[len(bars)-window:]
	ln2 := math.Log(2)
	coeffCO := 2*ln2 - 1 // ≈ 0.3863

	var sumGK float64
	var validCount int

	for _, b := range recent {
		if b.Open <= 0 || b.High <= 0 || b.Low <= 0 || b.Close <= 0 {
			continue
		}
		// Stub bar: H=L=O=C → GK formula gives zero → return nil per spec.
		if b.High == b.Low && b.High == b.Open && b.High == b.Close {
			continue
		}
		hlTerm := math.Log(b.High / b.Low)
		coTerm := math.Log(b.Close / b.Open)
		gk := 0.5*hlTerm*hlTerm - coeffCO*coTerm*coTerm
		if gk < 0 {
			// Numerical artifact — clamp to zero (GK can theoretically be negative
			// when close=open and H/L is near 1, but should not happen with real bars).
			gk = 0
		}
		sumGK += gk
		validCount++
	}

	if validCount == 0 {
		// All bars were stubs → return nil (not zero) per spec.
		return nil
	}

	meanGK := sumGK / float64(validCount)
	gkVol := math.Sqrt(252*meanGK) * 100 // annualized %
	return &gkVol
}

// ---------------------------------------------------------------------------
// FR-3: ATR(14) via Wilder Smoothing
// ---------------------------------------------------------------------------

// ComputeATRPct computes ATR(14) via Wilder smoothing and returns ATR as % of
// the previous close (ATR% = ATR / prev_close × 100).
//
// Wilder smoothing: initial ATR = simple mean of first 14 True Ranges,
// then ATR_n = (ATR_{n-1} × 13 + TR_n) / 14.
//
// Requires at least 15 bars (14 TRs from bars 1..14, then Wilder warm-up).
// Returns nil when insufficient.
func (s *VolatilityService) ComputeATRPct(bars []OHLCVBar) *float64 {
	const period = 14
	if len(bars) < period+1 {
		return nil
	}

	// Compute True Range for each bar i relative to bars[i-1].
	trs := make([]float64, len(bars)-1)
	for i := 1; i < len(bars); i++ {
		prev := bars[i-1].Close
		high := bars[i].High
		low := bars[i].Low
		tr := math.Max(high-low, math.Max(math.Abs(high-prev), math.Abs(low-prev)))
		trs[i-1] = tr
	}

	if len(trs) < period {
		return nil
	}

	// Wilder initial ATR: simple mean of first 14 TRs.
	atr := 0.0
	for i := 0; i < period; i++ {
		atr += trs[i]
	}
	atr /= float64(period)

	// Wilder smoothing for any remaining TRs.
	for i := period; i < len(trs); i++ {
		atr = (atr*float64(period-1) + trs[i]) / float64(period)
	}

	prevClose := bars[len(bars)-2].Close
	if prevClose <= 0 {
		return nil
	}
	atrPct := atr / prevClose * 100
	return &atrPct
}

// ---------------------------------------------------------------------------
// FR-4: Volatility Regime Band
// ---------------------------------------------------------------------------

// ComputeRegime classifies the current RV into a regime band using percentile rank
// in the available history.
//
// Thresholds: LOW < 25th pct, NORMAL 25–75th, ELEVATED 75–90th, CRISIS ≥ 90th.
//
// Returns: regime label, percentile rank (0.0–1.0), and count of history sessions.
// When rvHistory is empty, returns NORMAL, 0.5, 0 (honest default with no history).
func (s *VolatilityService) ComputeRegime(rvHistory []float64, currentRV float64) (VolatilityRegime, float64, int) {
	sessions := len(rvHistory)
	if sessions == 0 {
		return RegimeNormal, 0.5, 0
	}

	sorted := make([]float64, sessions)
	copy(sorted, rvHistory)
	sort.Float64s(sorted)

	var below int
	for _, v := range sorted {
		if v < currentRV {
			below++
		}
	}

	pct := float64(below) / float64(sessions)

	var regime VolatilityRegime
	switch {
	case pct < 0.25:
		regime = RegimeLow
	case pct < 0.75:
		regime = RegimeNormal
	case pct < 0.90:
		regime = RegimeElevated
	default:
		regime = RegimeCrisis
	}

	return regime, pct, sessions
}

// ---------------------------------------------------------------------------
// FR-5: 252-Day Maximum Drawdown
// ---------------------------------------------------------------------------

// ComputeDrawdown252d computes maximum drawdown (peak-to-trough) over the
// trailing 252-session window as an annualized %.
//
// Returns nil when fewer than 252 bars — gated on OHLCV-BACKFILL-P0 completion.
func (s *VolatilityService) ComputeDrawdown252d(closes []float64) *float64 {
	const required = 252
	if len(closes) < required {
		return nil
	}

	window := closes[len(closes)-required:]
	peak := window[0]
	maxDD := 0.0

	for _, c := range window {
		if c > peak {
			peak = c
		}
		if peak > 0 {
			dd := (peak - c) / peak
			if dd > maxDD {
				maxDD = dd
			}
		}
	}

	result := maxDD * 100 // as %
	return &result
}

// ---------------------------------------------------------------------------
// Gauge-ready scalar: rv_20d_percentile
// ---------------------------------------------------------------------------

// ComputePercentileRank computes the percentile rank of value in series (0.0–1.0).
// Returns nil when len(series) < 2.
//
// Definition: fraction of series values strictly below the given value.
// This makes rank=0 for the minimum and rank=1 for a value above all series.
func (s *VolatilityService) ComputePercentileRank(series []float64, value float64) *float64 {
	if len(series) < 2 {
		return nil
	}

	var below int
	for _, v := range series {
		if v < value {
			below++
		}
	}

	rank := float64(below) / float64(len(series))
	return &rank
}

// ---------------------------------------------------------------------------
// Utility helpers (used by use case layer)
// ---------------------------------------------------------------------------

// BuildRVHistory computes a rolling 20d RV series from the full close series.
// Returns one RV value for each position i where closes[:i] has at least 21 bars.
// This is used to build the historical distribution for regime band + percentile.
func (s *VolatilityService) BuildRVHistory(closes []float64) []float64 {
	var history []float64
	for i := 21; i <= len(closes); i++ {
		rv := s.ComputeRV(closes[:i], 20)
		if rv != nil {
			history = append(history, *rv)
		}
	}
	return history
}

// ExtractCloses extracts the Close price from a slice of OHLCVBars.
func ExtractCloses(bars []OHLCVBar) []float64 {
	closes := make([]float64, len(bars))
	for i, b := range bars {
		closes[i] = b.Close
	}
	return closes
}
