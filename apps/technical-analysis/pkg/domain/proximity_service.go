// Package domain — ProximityService: pure calculation for IND-P1-52W-HIGH-PROXIMITY.
//
// FR-1: high_52w = max(close) over 252 bars; low_52w = min(close); pct_from_52w_high/low.
// FR-2: above_ma50 = current > SMA(50); above_ma200 = current > SMA(200).
// FR-3: new_high_today = (current == high_52w) boolean.
// FR-4: Proximity labels: AT_HIGH(pct>=-0.02), NEAR_HIGH(-0.10 to -0.02),
//
//	MID_RANGE(middle), NEAR_LOW(0 to 0.10), AT_LOW(pct_from_low<=0.02).
//
// FR-5: Aggregate: net-new-highs, pct_above_ma50, pct_above_ma200, denominator_ma200.
// FR-6: <252 bars → 52w fields null; >=50 but <252 → above_ma50 real + above_ma200 null.
//
//	denominator_ma200 EXCLUDES tickers with <200 bars (sample transparency).
package domain

// Minimum bar counts for each indicator.
const (
	minBars52w   = 252
	minBarsMA50  = 50
	minBarsMA200 = 200
)

// ProximityService provides pure calculation for 52-week proximity indicators.
type ProximityService struct{}

// NewProximityService constructs a ProximityService.
func NewProximityService() *ProximityService {
	return &ProximityService{}
}

// ComputeCrossSection computes per-ticker proximity data and the cross-sectional aggregate.
func (s *ProximityService) ComputeCrossSection(
	allBars map[string][]OHLCVBar,
	tickers []string,
) ProximityCrossSection {
	results := make([]ProximityResult, 0, len(tickers))

	var (
		newHighsCount   int
		newLowsCount    int
		aboveMA50Count  int
		ma50DenomCount  int
		aboveMA200Count int
		ma200DenomCount int
	)

	for _, code := range tickers {
		bars := allBars[code]
		r := s.computeTicker(code, bars)
		results = append(results, r)

		// Aggregate counters.
		if r.ProximityLabel != nil {
			switch *r.ProximityLabel {
			case ProximityAtHigh, ProximityNearHigh:
				newHighsCount++
			case ProximityAtLow, ProximityNearLow:
				newLowsCount++
			}
		}
		if r.AboveMA50 != nil {
			ma50DenomCount++
			if *r.AboveMA50 {
				aboveMA50Count++
			}
		}
		if r.AboveMA200 != nil {
			ma200DenomCount++
			if *r.AboveMA200 {
				aboveMA200Count++
			}
		}
	}

	// Build aggregate.
	agg := NetNewHighsAggregate{
		NewHighsCount:    newHighsCount,
		NewLowsCount:     newLowsCount,
		NetNewHighs:      newHighsCount - newLowsCount,
		DenominatorMA200: ma200DenomCount,
	}
	if ma50DenomCount > 0 {
		v := float64(aboveMA50Count) / float64(ma50DenomCount)
		agg.PctAboveMA50 = &v
	}
	if ma200DenomCount > 0 {
		v := float64(aboveMA200Count) / float64(ma200DenomCount)
		agg.PctAboveMA200 = &v
	}

	return ProximityCrossSection{
		Tickers:     results,
		Aggregate:   agg,
		NetNewHighs: agg.NetNewHighs,
	}
}

// computeTicker computes all proximity fields for one ticker.
func (s *ProximityService) computeTicker(code string, bars []OHLCVBar) ProximityResult {
	r := ProximityResult{Code: code}
	nBars := len(bars)
	if nBars == 0 {
		reason := "insufficient_history"
		r.NullReason52w = &reason
		r.NullReasonMA200 = &reason
		return r
	}

	current := bars[nBars-1].Close
	closes := extractClosesSlice(bars)

	// MA50.
	ma50 := latestSMA(closes, minBarsMA50)
	if ma50 != nil {
		above := current > *ma50
		r.AboveMA50 = &above
	}

	// MA200 (reusing same latestSMA with period=200 per architect spec ROC-1 reuse note).
	ma200 := latestSMA(closes, minBarsMA200)
	if ma200 != nil {
		above := current > *ma200
		r.AboveMA200 = &above
	} else {
		if nBars >= minBarsMA50 {
			// >=50 but <200 bars: MA50 real, MA200 null.
			reason := "insufficient_bars_ma200"
			r.NullReasonMA200 = &reason
		} else {
			reason := "insufficient_history"
			r.NullReasonMA200 = &reason
		}
	}

	// 52-week fields require 252 bars.
	if nBars < minBars52w {
		reason := "insufficient_history"
		r.NullReason52w = &reason
		return r
	}

	window := closes[nBars-minBars52w:] // last 252 closes
	high52w, low52w := highLow(window)

	if high52w <= 0 || low52w <= 0 {
		reason := "invalid_price_data"
		r.NullReason52w = &reason
		return r
	}

	pctFromHigh := (current - high52w) / high52w
	pctFromLow := (current - low52w) / low52w

	newHighToday := current >= high52w // >= handles exact tie (breakout included per spec edge note)
	lbl := proximityLabel(pctFromHigh, pctFromLow)

	r.High52w = &high52w
	r.Low52w = &low52w
	r.PctFromHigh = &pctFromHigh
	r.PctFromLow = &pctFromLow
	r.NewHighToday = &newHighToday
	r.ProximityLabel = &lbl

	return r
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// latestSMA returns the SMA of the last `period` closes, or nil if insufficient bars.
// Implements the MA calculation inline per DDD layer constraint (no infra import).
// Referenced in handoff as "reuse TACalculator.calculateMA(closes, period)".
func latestSMA(closes []float64, period int) *float64 {
	if len(closes) < period {
		return nil
	}
	window := closes[len(closes)-period:]
	var sum float64
	for _, v := range window {
		sum += v
	}
	avg := sum / float64(period)
	return &avg
}

// highLow returns the max and min of a float64 slice.
func highLow(vals []float64) (high, low float64) {
	if len(vals) == 0 {
		return 0, 0
	}
	high = vals[0]
	low = vals[0]
	for _, v := range vals[1:] {
		if v > high {
			high = v
		}
		if v < low {
			low = v
		}
	}
	return high, low
}

// extractClosesSlice extracts Close prices from a bar slice.
func extractClosesSlice(bars []OHLCVBar) []float64 {
	cs := make([]float64, len(bars))
	for i, b := range bars {
		cs[i] = b.Close
	}
	return cs
}

// proximityLabel classifies a ticker's position in its 52-week range.
// pctFromHigh = (current - high) / high  (typically <= 0)
// pctFromLow  = (current - low) / low    (typically >= 0)
//
// Priority: AT_HIGH and AT_LOW (extremes) are checked first so that a ticker
// at its 52w low is never misclassified as NEAR_HIGH despite having a large
// negative pct_from_high.
func proximityLabel(pctFromHigh, pctFromLow float64) ProximityLabel {
	switch {
	case pctFromHigh >= -0.02:
		// Within 2% of 52w high — AT_HIGH takes precedence.
		return ProximityAtHigh
	case pctFromLow <= 0.02:
		// Within 2% of 52w low — AT_LOW takes next precedence.
		return ProximityAtLow
	case pctFromHigh >= -0.10:
		// 2%–10% below 52w high — NEAR_HIGH.
		return ProximityNearHigh
	case pctFromLow <= 0.10:
		// 2%–10% above 52w low — NEAR_LOW.
		return ProximityNearLow
	default:
		return ProximityMidRange
	}
}
