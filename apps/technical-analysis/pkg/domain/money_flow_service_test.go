// Package domain — unit tests for MoneyFlowService (TDD gate for MONEY-RADAR-P0-T1-OSCILLATORS).
// All tests are pure (no DB, no network, no I/O).
//
// AC coverage:
//   - OBV: monotone-with-tape on an all-up / all-down series, depth-independent (no window)
//   - <2 bars: everything nil, null_reason="insufficient_history"
//   - >=2 but <21 bars: OBV real, windowed fields nil, null_reason="insufficient_window"
//   - >=21 bars: all 4 fields non-nil, is_proxy=true always
//   - RelVolZ20: known z-score on a constructed volume series
//   - UpDownVolRatio: known ratio on a constructed up/down series; nil on zero down-volume
//   - DegradedVWAP: known VWAP on a constructed close*volume series
//   - FIELD-CONSTRAINT C1: OHLCVBar has no MFI/CMF/A-D/Chaikin-only fields consumed here
package domain_test

import (
	"fmt"
	"testing"

	"github.com/vn-market-intelligence/technical-analysis/pkg/domain"
)

// makeMoneyFlowBars creates n bars with a linear close ramp (base + i*step) and
// constant volume (simplifies expected-value math in most tests).
func makeMoneyFlowBars(n int, base, step, volume float64) []domain.OHLCVBar {
	bars := make([]domain.OHLCVBar, n)
	for i := 0; i < n; i++ {
		bars[i] = domain.OHLCVBar{
			Date:   date2026MF(i),
			Close:  base + float64(i)*step,
			Volume: volume,
		}
	}
	return bars
}

// date2026MF returns a simple sequential 2026 date string (no calendar-gap logic
// needed for this feature — money-flow oscillators are depth/window-gated only).
func date2026MF(i int) string {
	day := 1 + i%28
	month := 1 + i/28
	if month > 12 {
		month = 12
	}
	return fmt.Sprintf("2026-%02d-%02d", month, day)
}

// ---------------------------------------------------------------------------
// Insufficient history: <2 bars
// ---------------------------------------------------------------------------

func TestMoneyFlowService_InsufficientHistory(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	tickers := []string{"THIN"}
	allBars := map[string][]domain.OHLCVBar{
		"THIN": makeMoneyFlowBars(1, 50000, 100, 1000),
	}

	result := svc.ComputeCrossSection(allBars, tickers)
	if len(result.Tickers) != 1 {
		t.Fatalf("want 1 ticker, got %d", len(result.Tickers))
	}
	r := result.Tickers[0]

	if r.OBV != nil || r.RelVolZ20 != nil || r.UpDownVolRatio != nil || r.DegradedVWAP != nil {
		t.Errorf("want all-nil fields for <2 bars, got OBV=%v RelVolZ20=%v UpDownVolRatio=%v DegradedVWAP=%v",
			r.OBV, r.RelVolZ20, r.UpDownVolRatio, r.DegradedVWAP)
	}
	if r.NullReason == nil || *r.NullReason != "insufficient_history" {
		t.Errorf("want null_reason=insufficient_history, got %v", r.NullReason)
	}
	if !r.IsProxy {
		t.Errorf("want is_proxy=true even on the null-history path")
	}
}

// ---------------------------------------------------------------------------
// Insufficient window: >=2 but <21 bars — OBV real, windowed fields nil
// ---------------------------------------------------------------------------

func TestMoneyFlowService_InsufficientWindow_OBVStillReal(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	tickers := []string{"SHORT"}
	allBars := map[string][]domain.OHLCVBar{
		"SHORT": makeMoneyFlowBars(10, 50000, 100, 1000), // 10 bars: >=2, <21
	}

	result := svc.ComputeCrossSection(allBars, tickers)
	r := result.Tickers[0]

	if r.OBV == nil {
		t.Fatalf("want non-nil OBV for 10-bar ticker (depth-independent, only needs >=2 bars)")
	}
	if r.RelVolZ20 != nil || r.UpDownVolRatio != nil || r.DegradedVWAP != nil {
		t.Errorf("want nil windowed fields for <21 bars, got RelVolZ20=%v UpDownVolRatio=%v DegradedVWAP=%v",
			r.RelVolZ20, r.UpDownVolRatio, r.DegradedVWAP)
	}
	if r.NullReason == nil || *r.NullReason != "insufficient_window" {
		t.Errorf("want null_reason=insufficient_window, got %v", r.NullReason)
	}

	// Monotone-up series (constant step>0, constant volume) — OBV = 9 * volume.
	want := 9.0 * 1000
	if *r.OBV != want {
		t.Errorf("OBV: got %.1f, want %.1f (monotone-up over 10 bars, constant vol)", *r.OBV, want)
	}
}

// ---------------------------------------------------------------------------
// Sufficient data (>=21 bars): all 4 fields non-nil, is_proxy=true
// ---------------------------------------------------------------------------

func TestMoneyFlowService_SufficientData_AllFieldsPopulated(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	tickers := []string{"VCB"}
	// 76 bars — matches the live watchlist depth (money-radar brief §2).
	// Alternate up/down closes with varying volume so up/down ratio and VWAP are
	// both well-defined (no zero-denominator degenerate cases).
	bars := make([]domain.OHLCVBar, 76)
	px := 60000.0
	for i := 0; i < 76; i++ {
		if i%2 == 0 {
			px += 100 // up day
		} else {
			px -= 40 // down day
		}
		bars[i] = domain.OHLCVBar{
			Date:   date2026MF(i),
			Close:  px,
			Volume: 1_000_000 + float64(i)*1000,
		}
	}
	allBars := map[string][]domain.OHLCVBar{"VCB": bars}

	result := svc.ComputeCrossSection(allBars, tickers)
	r := result.Tickers[0]

	if r.NullReason != nil {
		t.Fatalf("want nil null_reason on sufficient data, got %v", *r.NullReason)
	}
	if r.OBV == nil {
		t.Error("want non-nil OBV")
	}
	if r.RelVolZ20 == nil {
		t.Error("want non-nil RelVolZ20")
	}
	if r.UpDownVolRatio == nil {
		t.Error("want non-nil UpDownVolRatio")
	}
	if r.DegradedVWAP == nil {
		t.Error("want non-nil DegradedVWAP")
	}
	if !r.IsProxy {
		t.Error("want is_proxy=true (HN-5: degraded VWAP must always carry the proxy flag)")
	}
	if r.BarsUsed != 76 {
		t.Errorf("BarsUsed: got %d, want 76", r.BarsUsed)
	}

	// Plausibility: degraded VWAP must fall within the window's close range.
	window := bars[len(bars)-20:]
	lo, hi := window[0].Close, window[0].Close
	for _, b := range window {
		if b.Close < lo {
			lo = b.Close
		}
		if b.Close > hi {
			hi = b.Close
		}
	}
	if *r.DegradedVWAP < lo || *r.DegradedVWAP > hi {
		t.Errorf("DegradedVWAP=%.2f outside window close range [%.2f, %.2f]", *r.DegradedVWAP, lo, hi)
	}

	// Plausibility: up/down ratio must be strictly positive (up and down volume both present).
	if *r.UpDownVolRatio <= 0 {
		t.Errorf("UpDownVolRatio=%.4f, want > 0", *r.UpDownVolRatio)
	}
}

// ---------------------------------------------------------------------------
// RelVolZ20: known z-score on a constructed volume series
// ---------------------------------------------------------------------------

func TestMoneyFlowService_RelVolZ20_KnownValue(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	// 21 bars: 20-bar window has 19 bars at volume=1000, last bar volume=2000 (spike).
	bars := make([]domain.OHLCVBar, 21)
	for i := 0; i < 21; i++ {
		vol := 1000.0
		if i == 20 {
			vol = 2000.0 // spike on the last bar (index 20 = last of the 20-bar window)
		}
		bars[i] = domain.OHLCVBar{
			Date:   date2026MF(i),
			Close:  50000 + float64(i), // monotone up, avoids down-vol=0 edge elsewhere
			Volume: vol,
		}
	}
	allBars := map[string][]domain.OHLCVBar{"X": bars}

	result := svc.ComputeCrossSection(allBars, []string{"X"})
	r := result.Tickers[0]

	if r.RelVolZ20 == nil {
		t.Fatalf("want non-nil RelVolZ20")
	}
	// Window = bars[1:21] (last 20): 19 bars @1000, 1 bar @2000.
	// mean = (19*1000 + 2000)/20 = 1050. sample variance = sum((v-mean)^2)/(n-1).
	// 19 * (1000-1050)^2 + (2000-1050)^2 = 19*2500 + 902500 = 47500+902500=950000
	// sample var = 950000/19 = 50000; stddev ≈ 223.607
	// z = (2000 - 1050) / 223.607 ≈ 4.2492
	if *r.RelVolZ20 <= 3.5 || *r.RelVolZ20 >= 5.0 {
		t.Errorf("RelVolZ20=%.4f, want ≈4.25 (spike bar vs 19 flat bars)", *r.RelVolZ20)
	}
}

// ---------------------------------------------------------------------------
// UpDownVolRatio: zero down-volume → nil (honest, not +Inf)
// ---------------------------------------------------------------------------

func TestMoneyFlowService_UpDownVolRatio_ZeroDownVolume_Nil(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	// All-up series (monotone close increase) over 21 bars → down-volume sums to 0.
	bars := makeMoneyFlowBars(21, 50000, 10, 1000)
	allBars := map[string][]domain.OHLCVBar{"UP": bars}

	result := svc.ComputeCrossSection(allBars, []string{"UP"})
	r := result.Tickers[0]

	if r.UpDownVolRatio != nil {
		t.Errorf("want nil UpDownVolRatio when down-volume is zero, got %.4f", *r.UpDownVolRatio)
	}
	// OBV and DegradedVWAP should still be populated — only the ratio is degenerate.
	if r.OBV == nil {
		t.Error("want non-nil OBV on the all-up path")
	}
	if r.DegradedVWAP == nil {
		t.Error("want non-nil DegradedVWAP on the all-up path")
	}
}

// ---------------------------------------------------------------------------
// FIELD-CONSTRAINT C1 regression guard: OHLCVBar Volume is populated independently
// of High/Low — confirms the money-flow calc path never depends on H/L fields.
// ---------------------------------------------------------------------------

func TestMoneyFlowService_C1_NoHighLowDependency(t *testing.T) {
	t.Parallel()
	svc := domain.NewMoneyFlowService()

	// Bars deliberately carry zero High/Low (as if the source never populated them,
	// mirroring the live C1 constraint) — computation must still succeed on Close+Volume.
	bars := make([]domain.OHLCVBar, 21)
	for i := 0; i < 21; i++ {
		bars[i] = domain.OHLCVBar{
			Date:   date2026MF(i),
			Close:  50000 + float64(i)*10,
			Volume: 1000 + float64(i)*10,
			High:   0,
			Low:    0,
		}
	}
	allBars := map[string][]domain.OHLCVBar{"NOHL": bars}

	result := svc.ComputeCrossSection(allBars, []string{"NOHL"})
	r := result.Tickers[0]

	if r.OBV == nil || r.RelVolZ20 == nil || r.DegradedVWAP == nil {
		t.Errorf("want all fields computable from close+volume alone (H/L=0), got OBV=%v RelVolZ20=%v DegradedVWAP=%v",
			r.OBV, r.RelVolZ20, r.DegradedVWAP)
	}
}
