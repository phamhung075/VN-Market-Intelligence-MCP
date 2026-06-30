// Package domain — unit tests for RelativeStrengthService (TDD gate for IND-P1-RELATIVE-STRENGTH).
// All tests are pure (no DB, no network, no I/O).
//
// AC coverage:
//   - VNINDEX absent → index_data_absent for all tickers
//   - Partial RS: 70-bar ticker → 63d real + 126d/252d null
//   - Low sample warning when N<5 tickers have >=63 bars
//   - Full 3-horizon RS with valid percentiles and labels
//   - Composite score = mean of non-nil percentiles
package domain_test

import (
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// makeRSBars creates n OHLCV bars with close = base + i*step.
func makeRSBars(n int, base, step float64) []domain.OHLCVBar {
	bars := make([]domain.OHLCVBar, n)
	for i := 0; i < n; i++ {
		bars[i] = domain.OHLCVBar{
			Date:  date2026(i),
			Close: base + float64(i)*step,
		}
	}
	return bars
}

// buildRSMap creates a multi-ticker map with VNINDEX and the given tickers.
func buildRSMap(tickers []string, nBars int, base, step float64) map[string][]domain.OHLCVBar {
	m := make(map[string][]domain.OHLCVBar)
	m["VNINDEX"] = makeRSBars(nBars, 1000.0, 0.5) // VNINDEX with same bar count
	for i, t := range tickers {
		m[t] = makeRSBars(nBars, base+float64(i)*50, step)
	}
	return m
}

// ---------------------------------------------------------------------------
// FR-7: VNINDEX absent → index_data_absent
// ---------------------------------------------------------------------------

func TestRSService_VNINDEXAbsent(t *testing.T) {
	t.Parallel()
	svc := domain.NewRelativeStrengthService()

	tickers := []string{"VCB", "FPT"}
	allBars := map[string][]domain.OHLCVBar{
		"VCB": makeRSBars(252, 60000.0, 10.0),
		"FPT": makeRSBars(252, 70000.0, 8.0),
		// VNINDEX absent
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	if result.NullReason == nil || *result.NullReason != "index_data_absent" {
		t.Errorf("want NullReason='index_data_absent', got %v", result.NullReason)
	}
	for _, t2 := range result.Tickers {
		if t2.H63.NullReason == nil || *t2.H63.NullReason != "index_data_absent" {
			t.Errorf("ticker %s H63: want null_reason='index_data_absent', got %v", t2.Code, t2.H63.NullReason)
		}
	}
}

// ---------------------------------------------------------------------------
// FR-6: Partial RS — 70-bar ticker → 63d real, 126d/252d null
// ---------------------------------------------------------------------------

func TestRSService_PartialRS_70Bars(t *testing.T) {
	t.Parallel()
	svc := domain.NewRelativeStrengthService()

	tickers := []string{"SHORT"}
	allBars := map[string][]domain.OHLCVBar{
		"VNINDEX": makeRSBars(300, 1000.0, 0.5),
		"SHORT":   makeRSBars(70, 50000.0, 5.0), // 70 bars: >= 63 but < 126
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	if len(result.Tickers) != 1 {
		t.Fatalf("want 1 ticker, got %d", len(result.Tickers))
	}
	ticker := result.Tickers[0]

	// H63: should have RS (70 >= 63+1 = 64 bars needed for h+1 index check; index has 300).
	// Actually: need stockBars >= h+1 = 64 bars. 70 >= 64 → H63 real.
	if ticker.H63.RS == nil {
		t.Errorf("H63: want non-nil RS for 70-bar ticker (>= 64 bars needed), got nil (reason=%v)", ticker.H63.NullReason)
	}

	// H126: need >= 127 bars → 70 < 127 → null.
	if ticker.H126.RS != nil {
		t.Errorf("H126: want nil RS for 70-bar ticker, got %f", *ticker.H126.RS)
	}
	if ticker.H126.NullReason == nil {
		t.Errorf("H126: want non-nil NullReason for 70-bar ticker")
	}

	// H252: need >= 253 bars → 70 < 253 → null.
	if ticker.H252.RS != nil {
		t.Errorf("H252: want nil RS for 70-bar ticker, got %f", *ticker.H252.RS)
	}
	if ticker.H252.NullReason == nil {
		t.Errorf("H252: want non-nil NullReason for 70-bar ticker")
	}
}

// ---------------------------------------------------------------------------
// FR-3/4/5: Full 3-horizon RS, percentile rank, and composite
// ---------------------------------------------------------------------------

func TestRSService_FullRS_Labels(t *testing.T) {
	t.Parallel()
	svc := domain.NewRelativeStrengthService()

	// 5 tickers with enough history (260 bars) + VNINDEX.
	tickers := []string{"A", "B", "C", "D", "E"}
	allBars := buildRSMap(tickers, 260, 50000.0, 2.0)

	result := svc.ComputeCrossSection(allBars, tickers)

	if result.NullReason != nil {
		t.Errorf("want no NullReason, got %v", *result.NullReason)
	}
	for _, ticker := range result.Tickers {
		// H63 and H126 should be non-nil (260 >= 64 and 260 >= 127).
		if ticker.H63.RS == nil {
			t.Errorf("ticker %s H63: want non-nil RS", ticker.Code)
		}
		if ticker.H126.RS == nil {
			t.Errorf("ticker %s H126: want non-nil RS", ticker.Code)
		}
		// H252: 260 >= 253 → should be non-nil.
		if ticker.H252.RS == nil {
			t.Errorf("ticker %s H252: want non-nil RS (260 bars)", ticker.Code)
		}
		// Composite score should be set.
		if ticker.CompositeScore == nil {
			t.Errorf("ticker %s: want non-nil CompositeScore", ticker.Code)
		}
		if ticker.CompositeLabel == nil {
			t.Errorf("ticker %s: want non-nil CompositeLabel", ticker.Code)
		}
	}
}

// ---------------------------------------------------------------------------
// NFR: low_sample_warning when N<5 tickers with >= 63 bars
// ---------------------------------------------------------------------------

func TestRSService_LowSampleWarning(t *testing.T) {
	t.Parallel()
	svc := domain.NewRelativeStrengthService()

	// Only 3 tickers with >= 63 bars.
	tickers := []string{"A", "B", "C"}
	allBars := map[string][]domain.OHLCVBar{
		"VNINDEX": makeRSBars(100, 1000.0, 0.5),
		"A":       makeRSBars(70, 50000.0, 2.0),
		"B":       makeRSBars(70, 51000.0, 2.0),
		"C":       makeRSBars(70, 52000.0, 2.0),
	}

	result := svc.ComputeCrossSection(allBars, tickers)

	if !result.LowSampleWarning {
		t.Errorf("want LowSampleWarning=true for 3 tickers with >= 63 bars")
	}
}

// ---------------------------------------------------------------------------
// Percentile range: 0–100
// ---------------------------------------------------------------------------

func TestRSService_Percentile_InRange(t *testing.T) {
	t.Parallel()
	svc := domain.NewRelativeStrengthService()

	tickers := []string{"A", "B", "C", "D", "E", "F"}
	allBars := buildRSMap(tickers, 260, 40000.0, 3.0)

	result := svc.ComputeCrossSection(allBars, tickers)

	for _, ticker := range result.Tickers {
		if ticker.H63.Percentile != nil {
			p := *ticker.H63.Percentile
			if p < 0 || p > 100 {
				t.Errorf("ticker %s H63 percentile out of [0,100]: %.2f", ticker.Code, p)
			}
		}
	}
}
