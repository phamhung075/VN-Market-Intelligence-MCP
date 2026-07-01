// Package domain — MoneyFlowService: pure calculation for MONEY-RADAR-P0-T1-OSCILLATORS.
//
// FR-1: OBV — cumulative sign(close_t-close_{t-1})*volume_t, depth-independent (no window).
// FR-2: Relative-volume z-score(20) — (vol_t-mean_20)/std_20 over the trailing 20-bar window.
// FR-3: Up/Down volume ratio — sum(vol up days)/sum(vol down days) over the trailing 20-bar window.
// FR-4: Degraded VWAP — sum(close*vol)/sum(vol) over the trailing 20-bar window; is_proxy=true always.
//
// FIELD-CONSTRAINT C1: close+volume only. Do NOT add MFI/CMF/A-D-line/Chaikin here —
// those need High/Low and are FIELD-GATED per money-radar brief §2. Adding any
// H/L-gated oscillator to this file is a task-acceptance failure.
package domain

import "math"

// moneyFlowWindow is the trailing window (in bars) for the rel-vol z-score,
// up/down volume ratio, and degraded VWAP. 20 bars, per money-radar brief §2 —
// well within the live ~76-bar depth.
const moneyFlowWindow = 20

// minBarsWindowed = moneyFlowWindow + 1: the up/down-ratio direction calc needs
// one prior close before the 20-bar window to classify the window's first day.
// All three windowed metrics share this single threshold for a consistent,
// non-partial window (no ragged edge cases).
const minBarsWindowed = moneyFlowWindow + 1

// minBarsOBV is the minimum bar count to compute at least one close-to-close
// direction comparison for OBV.
const minBarsOBV = 2

// MoneyFlowService provides pure-calculation methods for the 4 Phase-0
// money-flow oscillators (C1-clean: close+volume only).
type MoneyFlowService struct{}

// NewMoneyFlowService constructs a MoneyFlowService.
func NewMoneyFlowService() *MoneyFlowService {
	return &MoneyFlowService{}
}

// ComputeCrossSection computes Phase-0 money-flow oscillators for a map of
// ticker→bars, for each ticker in tickers (any watchlist ticker — no
// per-ticker special-casing).
func (s *MoneyFlowService) ComputeCrossSection(allBars map[string][]OHLCVBar, tickers []string) MoneyFlowCrossSection {
	results := make([]MoneyFlowResult, 0, len(tickers))
	for _, code := range tickers {
		results = append(results, s.computeTicker(code, allBars[code]))
	}
	return MoneyFlowCrossSection{Tickers: results}
}

// computeTicker computes all 4 oscillators for a single ticker's bar series
// (bars ordered oldest→newest, per the OHLCVRepository contract).
func (s *MoneyFlowService) computeTicker(code string, bars []OHLCVBar) MoneyFlowResult {
	r := MoneyFlowResult{Code: code, IsProxy: true, BarsUsed: len(bars)}

	if len(bars) < minBarsOBV {
		reason := "insufficient_history"
		r.NullReason = &reason
		return r
	}

	obv := s.computeOBV(bars)
	r.OBV = &obv

	if len(bars) < minBarsWindowed {
		reason := "insufficient_window"
		r.NullReason = &reason
		return r
	}

	window20 := bars[len(bars)-moneyFlowWindow:]
	windowWithAnchor := bars[len(bars)-minBarsWindowed:] // 21 bars: anchor + 20-bar window

	r.RelVolZ20 = s.computeRelVolZ20(window20)
	r.UpDownVolRatio = s.computeUpDownVolRatio(windowWithAnchor)
	r.DegradedVWAP = s.computeDegradedVWAP(window20)

	return r
}

// computeOBV computes On-Balance Volume over the FULL supplied bar series
// (depth-independent, no window per spec). OBV_0 = 0; OBV_t = OBV_{t-1} +/- vol_t
// by close direction; unchanged on a flat close.
func (s *MoneyFlowService) computeOBV(bars []OHLCVBar) float64 {
	obv := 0.0
	for i := 1; i < len(bars); i++ {
		switch {
		case bars[i].Close > bars[i-1].Close:
			obv += bars[i].Volume
		case bars[i].Close < bars[i-1].Close:
			obv -= bars[i].Volume
		}
	}
	return obv
}

// computeRelVolZ20 computes the z-score of the window's last bar volume against
// the sample mean/stddev of the same 20-bar window. Nil when stddev is zero
// (constant volume — z-score undefined, honest-NULL rather than +Inf/NaN).
func (s *MoneyFlowService) computeRelVolZ20(window []OHLCVBar) *float64 {
	n := len(window)
	if n == 0 {
		return nil
	}
	vols := make([]float64, n)
	for i, b := range window {
		vols[i] = b.Volume
	}
	mean, stddev := meanStddevSample(vols)
	if stddev == 0 {
		return nil
	}
	z := (vols[n-1] - mean) / stddev
	return &z
}

// computeUpDownVolRatio computes sum(volume on up days)/sum(volume on down
// days) over the window. barsWithAnchor must have minBarsWindowed (21) bars:
// index 0 is the anchor close used only to classify direction at index 1.
// Nil when down-volume sums to zero (ratio undefined — honest-NULL, not +Inf).
func (s *MoneyFlowService) computeUpDownVolRatio(barsWithAnchor []OHLCVBar) *float64 {
	var upVol, downVol float64
	for i := 1; i < len(barsWithAnchor); i++ {
		switch {
		case barsWithAnchor[i].Close > barsWithAnchor[i-1].Close:
			upVol += barsWithAnchor[i].Volume
		case barsWithAnchor[i].Close < barsWithAnchor[i-1].Close:
			downVol += barsWithAnchor[i].Volume
		}
	}
	if downVol == 0 {
		return nil
	}
	ratio := upVol / downVol
	return &ratio
}

// computeDegradedVWAP computes sum(close*volume)/sum(volume) over the window —
// a close-only proxy (no true typical price without H/L, C1). Callers MUST
// carry is_proxy=true alongside this value (HN-5). Nil when total volume is zero.
func (s *MoneyFlowService) computeDegradedVWAP(window []OHLCVBar) *float64 {
	var sumPV, sumV float64
	for _, b := range window {
		sumPV += b.Close * b.Volume
		sumV += b.Volume
	}
	if sumV == 0 {
		return nil
	}
	vwap := sumPV / sumV
	return &vwap
}

// meanStddevSample computes the mean and sample stddev (divisor n-1) of vals.
// Returns (mean, 0) when len(vals) < 2 (stddev undefined for a single point).
func meanStddevSample(vals []float64) (mean, stddev float64) {
	n := float64(len(vals))
	if n == 0 {
		return 0, 0
	}
	for _, v := range vals {
		mean += v
	}
	mean /= n
	if n < 2 {
		return mean, 0
	}
	var sumSq float64
	for _, v := range vals {
		d := v - mean
		sumSq += d * d
	}
	return mean, math.Sqrt(sumSq / (n - 1))
}
