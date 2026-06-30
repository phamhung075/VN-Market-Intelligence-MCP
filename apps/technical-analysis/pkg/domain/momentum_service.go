// Package domain — MomentumService: pure calculation for IND-P1-ROC-MOMENTUM.
//
// FR-1: ROC = (close[t-22] / close[t-252]) - 1  (12-1 Jegadeesh-Titman skip-month).
// FR-2: Cross-sectional z-score across all tickers with sufficient history.
// FR-3: Decile rank 1–10; labels MOMENTUM_LEADER/NEUTRAL/LAGGARD.
// FR-4: Factor-return per decile: avg realized return over prior 21-day window (compute-on-read).
// FR-5: <273 bars → null + null_reason:"insufficient_history".
// FR-6: <5 tickers with sufficient history → z-score/decile null + null_reason:"insufficient_cross_section".
// Edge: gap >5 calendar days → null_reason:"data_gap_too_large";
//
//	all-same-direction → null_reason:"degenerate_distribution" for z/decile (raw ROC emitted).
package domain

import (
	"math"
	"sort"
	"time"
)

// minBarsROC is the minimum bar count required for the 12-1 skip-month ROC.
// 273 = 252 (12-month lookback) + 21 (1-month skip).
const minBarsROC = 273

// minCrossSection is the minimum number of tickers with valid ROC for z-score/decile.
const minCrossSection = 5

// maxCalendarGap is the maximum allowed calendar-day gap between consecutive bars.
// FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE: raised from 5 to 14 to accommodate the
// Vietnamese Tết / Lunar New Year market closure, which causes a ~10-day calendar
// gap (e.g. 2026-02-13 → 2026-02-23).  A 5-day threshold incorrectly rejected all
// series that spanned Tết, producing false "data_gap_too_large" null results.
// 14 days covers Tết + weekend combination while still catching true data outages
// (missing weeks / months of data).
const maxCalendarGap = 14

// MomentumService provides pure calculation for cross-sectional ROC momentum.
type MomentumService struct{}

// NewMomentumService constructs a MomentumService.
func NewMomentumService() *MomentumService {
	return &MomentumService{}
}

// ComputeCrossSection computes the full cross-sectional ROC result for a map of
// ticker→bars. VNINDEX (if present) is excluded from the cross-section but allowed in the map.
func (s *MomentumService) ComputeCrossSection(allBars map[string][]OHLCVBar, tickers []string) CrossSectionalROCResult {
	perTicker := make([]ROCPerTickerResult, 0, len(tickers))

	// Step 1: compute ROC per ticker.
	for _, code := range tickers {
		bars := allBars[code]
		roc, reason := s.ComputeROC(bars)
		r := ROCPerTickerResult{Code: code, ROC: roc, NullReason: reason}
		perTicker = append(perTicker, r)
	}

	// Step 2: collect valid ROCs for cross-sectional stats.
	var valid []idxROC
	for i, t := range perTicker {
		if t.ROC != nil {
			valid = append(valid, idxROC{i, *t.ROC})
		}
	}

	// Step 3: check cross-section minimum.
	if len(valid) < minCrossSection {
		reason := "insufficient_cross_section"
		for i := range perTicker {
			if perTicker[i].NullReason == nil {
				perTicker[i].NullReason = &reason
				perTicker[i].ROC = nil // mask ROC too when cross-section fails
			}
		}
		return CrossSectionalROCResult{
			Tickers:             perTicker,
			FactorReturnBuckets: tenEmptyBuckets(),
			MomentumFactorZ:     nil,
			NullReason:          &reason,
		}
	}

	// Step 4: compute mean + stddev for z-score.
	mean, stddev := meanStddev(extractROCs(valid))

	// Degenerate distribution: all same direction or stddev ≈ 0.
	degenerate := stddev < 1e-9
	degenerateReason := "degenerate_distribution"

	// Step 5: assign z-score, decile, label per valid ticker.
	for _, v := range valid {
		if degenerate {
			// Raw ROC is already set; only null z-score/decile.
			perTicker[v.idx].NullReason = &degenerateReason
			continue
		}
		z := (v.roc - mean) / stddev
		perTicker[v.idx].ZScore = &z
		decile := rocDecile(z, extractROCs(valid), v.roc)
		perTicker[v.idx].Decile = &decile
		lbl := momentumLabel(decile)
		perTicker[v.idx].Label = &lbl
	}

	// Step 6: factor-return per decile (compute-on-read from closes).
	buckets := s.computeFactorReturnBuckets(allBars, tickers, perTicker)

	// Step 7: feed-forward scalar — median z-score.
	var medianZ *float64
	if !degenerate {
		zs := collectZScores(perTicker)
		if len(zs) > 0 {
			med := median(zs)
			medianZ = &med
		}
	}

	return CrossSectionalROCResult{
		Tickers:             perTicker,
		FactorReturnBuckets: buckets,
		MomentumFactorZ:     medianZ,
	}
}

// ComputeROC computes the 12-1 skip-month ROC for a single close series.
// Returns (nil, &reason) on any disqualifying condition.
func (s *MomentumService) ComputeROC(bars []OHLCVBar) (roc *float64, nullReason *string) {
	if len(bars) < minBarsROC {
		r := "insufficient_history"
		return nil, &r
	}

	// Data gap check: scan consecutive bars for gaps > maxCalendarGap days.
	if reason := detectGap(bars); reason != nil {
		return nil, reason
	}

	N := len(bars)
	// close[t-22] = bars[N-23] (22 bars before the most recent)
	// close[t-252] = bars[N-253] (252 bars before the most recent)
	t22 := bars[N-23].Close
	t252 := bars[N-253].Close

	if t252 <= 0 || t22 <= 0 {
		r := "invalid_price_data"
		return nil, &r
	}

	result := (t22 / t252) - 1.0
	return &result, nil
}

// computeFactorReturnBuckets computes average realized return per decile bucket.
// Realized return = (close[t-1] / close[t-22]) - 1 for each ticker in that decile.
func (s *MomentumService) computeFactorReturnBuckets(
	allBars map[string][]OHLCVBar,
	tickers []string,
	perTicker []ROCPerTickerResult,
) []FactorReturnBucket {
	buckets := make([]FactorReturnBucket, 10)
	for i := range buckets {
		buckets[i].Decile = i + 1
	}
	sums := make([]float64, 10)
	counts := make([]int, 10)

	for i, t := range perTicker {
		if t.Decile == nil {
			continue
		}
		d := *t.Decile
		if d < 1 || d > 10 {
			continue
		}
		bars := allBars[tickers[i]]
		N := len(bars)
		if N < 23 {
			continue
		}
		curr := bars[N-1].Close
		prev := bars[N-23].Close
		if prev <= 0 || curr <= 0 {
			continue
		}
		realized := (curr / prev) - 1.0
		sums[d-1] += realized
		counts[d-1]++
	}

	for i := range buckets {
		buckets[i].TickerCount = counts[i]
		if counts[i] > 0 {
			avg := sums[i] / float64(counts[i])
			buckets[i].AvgRealizedReturn = &avg
		}
	}
	return buckets
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// detectGap scans consecutive bars for a calendar gap exceeding maxCalendarGap days.
// Returns nil if no gap is detected.
func detectGap(bars []OHLCVBar) *string {
	const layout = "2006-01-02"
	for i := 1; i < len(bars); i++ {
		t1, err1 := time.Parse(layout, bars[i-1].Date)
		t2, err2 := time.Parse(layout, bars[i].Date)
		if err1 != nil || err2 != nil {
			continue // skip unparseable dates
		}
		diff := int(t2.Sub(t1).Hours() / 24)
		if diff > maxCalendarGap {
			r := "data_gap_too_large"
			return &r
		}
	}
	return nil
}

// meanStddev computes mean and sample stddev of a float64 slice.
func meanStddev(vals []float64) (mean, stddev float64) {
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
	stddev = math.Sqrt(sumSq / (n - 1)) // sample stddev
	return mean, stddev
}

// rocDecile returns the decile rank (1–10) of roc within the distribution.
func rocDecile(z float64, allROCs []float64, roc float64) int {
	// Rank = count of values strictly below roc.
	below := 0
	for _, v := range allROCs {
		if v < roc {
			below++
		}
	}
	N := len(allROCs)
	if N == 0 {
		return 5
	}
	// Map to decile 1–10 (percentile * 10, clamped).
	pct := float64(below) / float64(N)
	_ = z // z available if needed for tie-breaking
	decile := int(pct*10) + 1
	if decile > 10 {
		decile = 10
	}
	if decile < 1 {
		decile = 1
	}
	return decile
}

// momentumLabel classifies decile into momentum label.
func momentumLabel(decile int) MomentumLabel {
	switch {
	case decile >= 8:
		return MomentumLeader
	case decile <= 2:
		return MomentumLaggard
	default:
		return MomentumNeutral
	}
}

// median returns the median of a sorted float64 slice (sorts in place).
func median(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sort.Float64s(vals)
	n := len(vals)
	if n%2 == 0 {
		return (vals[n/2-1] + vals[n/2]) / 2.0
	}
	return vals[n/2]
}

// collectZScores extracts non-nil z-scores from per-ticker results.
func collectZScores(tickers []ROCPerTickerResult) []float64 {
	var zs []float64
	for _, t := range tickers {
		if t.ZScore != nil {
			zs = append(zs, *t.ZScore)
		}
	}
	return zs
}

// idxROC pairs a ticker slice index with its ROC value for cross-sectional ranking.
type idxROC struct {
	idx int
	roc float64
}

// extractROCs extracts ROC float64 values from idxROC pairs.
func extractROCs(pairs []idxROC) []float64 {
	out := make([]float64, len(pairs))
	for i, p := range pairs {
		out[i] = p.roc
	}
	return out
}

// tenEmptyBuckets returns 10 empty FactorReturnBucket entries (decile 1–10).
func tenEmptyBuckets() []FactorReturnBucket {
	buckets := make([]FactorReturnBucket, 10)
	for i := range buckets {
		buckets[i].Decile = i + 1
	}
	return buckets
}
