// Package domain — unit tests for MomentumService (TDD gate for IND-P1-ROC-MOMENTUM).
// All tests are pure (no DB, no network, no I/O).
//
// AC coverage:
//   - Full 273-bar path: real ROC value computed
//   - <273-bar path: null + "insufficient_history"
//   - Cross-section <5: null + "insufficient_cross_section"
//   - Degenerate z-score (flat prices): null_reason "degenerate_distribution"
//   - Gap >5 days: null + "data_gap_too_large"
//   - Feed-forward scalar (median z-score) correct
package domain_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// makeMomentumBars creates n OHLCV bars with a linear close ramp (base + i*step).
func makeMomentumBars(n int, base, step float64) []domain.OHLCVBar {
	bars := make([]domain.OHLCVBar, n)
	start := time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC)
	for i := 0; i < n; i++ {
		// Advance by 1 business day (simple: skip Sat/Sun).
		d := start
		for {
			if d.Weekday() != time.Saturday && d.Weekday() != time.Sunday {
				break
			}
			d = d.AddDate(0, 0, 1)
		}
		bars[i] = domain.OHLCVBar{
			Date:  d.Format("2006-01-02"),
			Close: base + float64(i)*step,
		}
		start = start.AddDate(0, 0, 1)
	}
	return bars
}

// makeMomentumBarsWithGap creates bars with a gap > 5 days at position gapAfter.
func makeMomentumBarsWithGap(n, gapAfter int, base, step float64) []domain.OHLCVBar {
	bars := makeMomentumBars(n, base, step)
	if gapAfter > 0 && gapAfter < n-1 {
		// Jump 10 days ahead for the bar after the gap.
		t, _ := time.Parse("2006-01-02", bars[gapAfter].Date)
		bars[gapAfter+1] = domain.OHLCVBar{
			Date:  t.AddDate(0, 0, 10).Format("2006-01-02"),
			Close: bars[gapAfter+1].Close,
		}
	}
	return bars
}

// multiTickerBars builds a map[code][]OHLCVBar for cross-section tests.
func multiTickerBars(codes []string, nBars int, base, step float64) map[string][]domain.OHLCVBar {
	m := make(map[string][]domain.OHLCVBar, len(codes))
	for i, c := range codes {
		m[c] = makeMomentumBars(nBars, base+float64(i)*10, step)
	}
	return m
}

// ---------------------------------------------------------------------------
// FR-5: insufficient_history null path
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeROC_InsufficientHistory(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	tests := []struct {
		name   string
		nBars  int
		wantOK bool
	}{
		{"272_bars_null", 272, false},
		{"273_bars_ok", 273, true},
		{"300_bars_ok", 300, true},
	}
	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			bars := makeMomentumBars(tc.nBars, 1000.0, 1.0)
			roc, reason := svc.ComputeROC(bars)
			if tc.wantOK {
				if roc == nil {
					t.Errorf("want non-nil ROC for %d bars, got nil (reason: %v)", tc.nBars, reason)
				}
			} else {
				if roc != nil {
					t.Errorf("want nil ROC for %d bars, got %f", tc.nBars, *roc)
				}
				if reason == nil || *reason != "insufficient_history" {
					t.Errorf("want null_reason='insufficient_history', got %v", reason)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// FR-1: ROC formula correctness
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeROC_Formula(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	// With a linear ramp close = 1000 + i*1 over 273 bars:
	// N = 273
	// close[t-22] = bars[273-23] = bars[250] = 1000 + 250 = 1250
	// close[t-252] = bars[273-253] = bars[20] = 1000 + 20 = 1020
	// ROC = (1250 / 1020) - 1 ≈ 0.22549
	bars := makeMomentumBars(273, 1000.0, 1.0)
	roc, reason := svc.ComputeROC(bars)
	if reason != nil {
		t.Fatalf("unexpected null_reason: %s", *reason)
	}
	if roc == nil {
		t.Fatal("want non-nil ROC")
	}
	want := (1250.0 / 1020.0) - 1.0
	if diff := *roc - want; diff > 1e-9 || diff < -1e-9 {
		t.Errorf("ROC: want %.10f, got %.10f (diff %.2e)", want, *roc, diff)
	}
}

// ---------------------------------------------------------------------------
// Edge: gap >5 days → data_gap_too_large
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeROC_GapTooLarge(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	bars := makeMomentumBarsWithGap(273, 100, 1000.0, 1.0)
	roc, reason := svc.ComputeROC(bars)
	if roc != nil {
		t.Errorf("want nil ROC when gap present, got %f", *roc)
	}
	if reason == nil || *reason != "data_gap_too_large" {
		t.Errorf("want null_reason='data_gap_too_large', got %v", reason)
	}
}

// ---------------------------------------------------------------------------
// FR-6: insufficient_cross_section (<5 tickers)
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeCrossSection_InsufficientCrossSection(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	// Only 3 tickers with enough history.
	codes := []string{"A", "B", "C"}
	allBars := multiTickerBars(codes, 273, 1000.0, 1.0)

	result := svc.ComputeCrossSection(allBars, codes)

	if result.NullReason == nil || *result.NullReason != "insufficient_cross_section" {
		t.Errorf("want NullReason='insufficient_cross_section', got %v", result.NullReason)
	}
	if result.MomentumFactorZ != nil {
		t.Errorf("want nil MomentumFactorZ when cross-section < 5, got %f", *result.MomentumFactorZ)
	}
	for _, ticker := range result.Tickers {
		if ticker.ZScore != nil {
			t.Errorf("ticker %s: want nil ZScore for insufficient cross-section, got %f", ticker.Code, *ticker.ZScore)
		}
	}
}

// ---------------------------------------------------------------------------
// FR-2/3: Full cross-section with 5+ tickers
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeCrossSection_ValidCrossSection(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	// 5 tickers with different slopes to produce different ROC values.
	codes := []string{"A", "B", "C", "D", "E"}
	allBars := make(map[string][]domain.OHLCVBar)
	for i, c := range codes {
		// Different step sizes → different ROC values.
		allBars[c] = makeMomentumBars(273, 1000.0, float64(i+1)*0.5)
	}

	result := svc.ComputeCrossSection(allBars, codes)

	if result.NullReason != nil {
		t.Errorf("want no NullReason, got %v", *result.NullReason)
	}
	for _, ticker := range result.Tickers {
		if ticker.ROC == nil {
			t.Errorf("ticker %s: want non-nil ROC", ticker.Code)
		}
		// With 5 distinct ROCs, z-score should be non-nil (non-degenerate).
		if ticker.ZScore == nil {
			t.Errorf("ticker %s: want non-nil ZScore", ticker.Code)
		}
		if ticker.Decile == nil || *ticker.Decile < 1 || *ticker.Decile > 10 {
			t.Errorf("ticker %s: want decile 1–10, got %v", ticker.Code, ticker.Decile)
		}
		if ticker.Label == nil {
			t.Errorf("ticker %s: want non-nil Label", ticker.Code)
		}
	}
	if result.MomentumFactorZ == nil {
		t.Error("want non-nil MomentumFactorZ (feed-forward scalar)")
	}
}

// ---------------------------------------------------------------------------
// Edge: degenerate distribution (all flat prices → stddev ≈ 0)
// ---------------------------------------------------------------------------

func TestMomentumService_ComputeCrossSection_DegenerateDistribution(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	// 5 tickers all with identical closes → ROC is the same → stddev = 0.
	codes := []string{"A", "B", "C", "D", "E"}
	allBars := make(map[string][]domain.OHLCVBar)
	for _, c := range codes {
		allBars[c] = makeMomentumBars(273, 1000.0, 0.0) // flat prices
	}

	result := svc.ComputeCrossSection(allBars, codes)

	// Degenerate: z-score should be null for all with degenerate_distribution reason.
	for _, ticker := range result.Tickers {
		if ticker.ZScore != nil {
			t.Errorf("ticker %s: want nil ZScore for degenerate distribution, got %f", ticker.Code, *ticker.ZScore)
		}
		if ticker.NullReason == nil || *ticker.NullReason != "degenerate_distribution" {
			t.Errorf("ticker %s: want null_reason='degenerate_distribution', got %v", ticker.Code, ticker.NullReason)
		}
	}
}

// ---------------------------------------------------------------------------
// Factor return buckets: FR-4
// ---------------------------------------------------------------------------

func TestMomentumService_FactorReturnBuckets_TenBuckets(t *testing.T) {
	t.Parallel()
	svc := domain.NewMomentumService()

	codes := make([]string, 10)
	allBars := make(map[string][]domain.OHLCVBar)
	for i := range codes {
		codes[i] = fmt.Sprintf("T%02d", i)
		allBars[codes[i]] = makeMomentumBars(273, 500.0+float64(i)*100, float64(i+1)*1.0)
	}

	result := svc.ComputeCrossSection(allBars, codes)

	if len(result.FactorReturnBuckets) != 10 {
		t.Errorf("want 10 factor return buckets, got %d", len(result.FactorReturnBuckets))
	}
	for _, b := range result.FactorReturnBuckets {
		if b.Decile < 1 || b.Decile > 10 {
			t.Errorf("bucket decile out of range: %d", b.Decile)
		}
	}
}
