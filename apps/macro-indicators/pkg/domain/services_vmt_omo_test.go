// Package domain — tests for OMO curve domain services (P0-3-OMO-CURVE).
//
// Covers:
//   - ComputeImpliedShortRates: per-tenor weighted avg, cross-tenor weighted avg, member ratio
//   - DeriveStressResult: all four label branches + score interpolation + null-when-<5d
package domain

import (
	"fmt"
	"testing"
)

// ---------------------------------------------------------------------------
// ComputeImpliedShortRates tests
// ---------------------------------------------------------------------------

func TestComputeImpliedShortRates_Empty(t *testing.T) {
	rates := ComputeImpliedShortRates(nil)
	if rates.Rate7dPct != nil || rates.Rate14dPct != nil || rates.Rate28dPct != nil {
		t.Error("expected all tenor rates nil for empty input")
	}
	if rates.WeightedAvgRatePct != nil {
		t.Error("expected WeightedAvgRatePct nil for empty input")
	}
	if rates.MemberWinRatio != nil {
		t.Error("expected MemberWinRatio nil for empty input")
	}
}

func TestComputeImpliedShortRates_Single7d(t *testing.T) {
	tenors := []OMOTenorEntry{
		{OperationType: "mua ky han", TenorDays: 7, VolumeBnVND: 100, WinningRatePct: 4.5, MemberWinRatio: 1.0},
	}
	rates := ComputeImpliedShortRates(tenors)

	if rates.Rate7dPct == nil {
		t.Fatal("Rate7dPct should not be nil for 7-day entry")
	}
	if fmt.Sprintf("%.4f", *rates.Rate7dPct) != "4.5000" {
		t.Errorf("Rate7dPct = %.4f; want 4.5000", *rates.Rate7dPct)
	}
	if rates.Rate14dPct != nil {
		t.Error("Rate14dPct should be nil (no 14-day entries)")
	}
	if rates.Rate28dPct != nil {
		t.Error("Rate28dPct should be nil (no 28-day entries)")
	}
	if rates.WeightedAvgRatePct == nil {
		t.Fatal("WeightedAvgRatePct should not be nil")
	}
	if fmt.Sprintf("%.4f", *rates.WeightedAvgRatePct) != "4.5000" {
		t.Errorf("WeightedAvgRatePct = %.4f; want 4.5000", *rates.WeightedAvgRatePct)
	}
	if rates.MemberWinRatio == nil {
		t.Fatal("MemberWinRatio should not be nil")
	}
	if fmt.Sprintf("%.4f", *rates.MemberWinRatio) != "1.0000" {
		t.Errorf("MemberWinRatio = %.4f; want 1.0000", *rates.MemberWinRatio)
	}
}

func TestComputeImpliedShortRates_VolumeWeighted7dAnd14d(t *testing.T) {
	// 7d: 100bn @ 4.5%, 14d: 200bn @ 4.75%
	// Rate7d = 4.5, Rate14d = 4.75
	// WeightedAvg = (100*4.5 + 200*4.75) / 300 = (450 + 950) / 300 = 1400/300 ≈ 4.6667
	tenors := []OMOTenorEntry{
		{OperationType: "mua ky han", TenorDays: 7, VolumeBnVND: 100, WinningRatePct: 4.5, MemberWinRatio: 1.0},
		{OperationType: "mua ky han", TenorDays: 14, VolumeBnVND: 200, WinningRatePct: 4.75, MemberWinRatio: 0.8},
	}
	rates := ComputeImpliedShortRates(tenors)

	if rates.Rate7dPct == nil || fmt.Sprintf("%.4f", *rates.Rate7dPct) != "4.5000" {
		t.Errorf("Rate7dPct = %v; want 4.5000", rates.Rate7dPct)
	}
	if rates.Rate14dPct == nil || fmt.Sprintf("%.4f", *rates.Rate14dPct) != "4.7500" {
		t.Errorf("Rate14dPct = %v; want 4.7500", rates.Rate14dPct)
	}
	if rates.Rate28dPct != nil {
		t.Error("Rate28dPct should be nil")
	}
	if rates.WeightedAvgRatePct == nil {
		t.Fatal("WeightedAvgRatePct nil")
	}
	want := 1400.0 / 300.0
	if fmt.Sprintf("%.4f", *rates.WeightedAvgRatePct) != fmt.Sprintf("%.4f", want) {
		t.Errorf("WeightedAvgRatePct = %.4f; want %.4f", *rates.WeightedAvgRatePct, want)
	}
	// MemberWinRatio: mean of 1.0 and 0.8 = 0.9
	if rates.MemberWinRatio == nil {
		t.Fatal("MemberWinRatio nil")
	}
	if fmt.Sprintf("%.4f", *rates.MemberWinRatio) != "0.9000" {
		t.Errorf("MemberWinRatio = %.4f; want 0.9000", *rates.MemberWinRatio)
	}
}

func TestComputeImpliedShortRates_AbsorbRowsExcludedFromTenorBuckets(t *testing.T) {
	// Absorb rows contribute to cross-tenor avg but NOT to per-tenor buckets.
	tenors := []OMOTenorEntry{
		{OperationType: "mua ky han", TenorDays: 7, VolumeBnVND: 100, WinningRatePct: 4.5, MemberWinRatio: 1.0},
		{OperationType: "ban ky han", TenorDays: 7, VolumeBnVND: 200, WinningRatePct: 5.0, MemberWinRatio: 0.5},
	}
	rates := ComputeImpliedShortRates(tenors)

	// Rate7d should only reflect the add row (100bn @ 4.5%)
	if rates.Rate7dPct == nil || fmt.Sprintf("%.4f", *rates.Rate7dPct) != "4.5000" {
		t.Errorf("Rate7dPct = %v; want 4.5000 (absorb row excluded)", rates.Rate7dPct)
	}
	// Cross-tenor avg includes both: (100*4.5 + 200*5.0) / 300 = 1450/300 ≈ 4.8333
	if rates.WeightedAvgRatePct == nil {
		t.Fatal("WeightedAvgRatePct nil")
	}
	want := 1450.0 / 300.0
	if fmt.Sprintf("%.4f", *rates.WeightedAvgRatePct) != fmt.Sprintf("%.4f", want) {
		t.Errorf("WeightedAvgRatePct = %.4f; want %.4f", *rates.WeightedAvgRatePct, want)
	}
	// Member ratio: only add rows (absorb excluded from member ratio).
	if rates.MemberWinRatio == nil {
		t.Fatal("MemberWinRatio nil")
	}
	if fmt.Sprintf("%.4f", *rates.MemberWinRatio) != "1.0000" {
		t.Errorf("MemberWinRatio = %.4f; want 1.0000 (absorb excluded)", *rates.MemberWinRatio)
	}
}

func TestComputeImpliedShortRates_ZeroRateExcluded(t *testing.T) {
	// Row with WinningRatePct=0 (parse failure) must not contaminate weighted avg.
	tenors := []OMOTenorEntry{
		{OperationType: "mua ky han", TenorDays: 7, VolumeBnVND: 100, WinningRatePct: 4.5, MemberWinRatio: 1.0},
		{OperationType: "mua ky han", TenorDays: 14, VolumeBnVND: 200, WinningRatePct: 0, MemberWinRatio: 0.8},
	}
	rates := ComputeImpliedShortRates(tenors)

	if rates.Rate14dPct != nil {
		t.Error("Rate14dPct should be nil (rate=0 excluded)")
	}
	// WeightedAvg uses only the 7d row (rate>0).
	if rates.WeightedAvgRatePct == nil || fmt.Sprintf("%.4f", *rates.WeightedAvgRatePct) != "4.5000" {
		t.Errorf("WeightedAvgRatePct = %v; want 4.5000 (only non-zero-rate rows)", rates.WeightedAvgRatePct)
	}
}

// ---------------------------------------------------------------------------
// DeriveStressResult tests
// ---------------------------------------------------------------------------

func ptr64(f float64) *float64 { return &f }

func TestDeriveStressResult_NilNet(t *testing.T) {
	label, score := DeriveStressResult(nil, 0, nil, nil)
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL", label)
	}
	if score != nil {
		t.Error("score should be nil when net5d is nil")
	}
}

func TestDeriveStressResult_DRAIN(t *testing.T) {
	// net < -20,000 → DRAIN; 5 days → score = 1.0
	label, score := DeriveStressResult(ptr64(-25_000), 5, ptr64(4.75), ptr64(4.5))
	if label != "DRAIN" {
		t.Errorf("label = %q; want DRAIN", label)
	}
	if score == nil {
		t.Fatal("score should not be nil (5 days in window)")
	}
	if fmt.Sprintf("%.4f", *score) != "1.0000" {
		t.Errorf("score = %.4f; want 1.0000", *score)
	}
}

func TestDeriveStressResult_EASY(t *testing.T) {
	// net > +20,000 → EASY; score = 0.0
	label, score := DeriveStressResult(ptr64(30_000), 5, ptr64(4.25), ptr64(4.5))
	if label != "EASY" {
		t.Errorf("label = %q; want EASY", label)
	}
	if score == nil {
		t.Fatal("score should not be nil (5 days in window)")
	}
	if fmt.Sprintf("%.4f", *score) != "0.0000" {
		t.Errorf("score = %.4f; want 0.0000", *score)
	}
}

func TestDeriveStressResult_NEUTRAL_ZeroNet(t *testing.T) {
	// net = 0 → NEUTRAL; score = 0.5
	label, score := DeriveStressResult(ptr64(0), 5, ptr64(4.5), ptr64(4.5))
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL", label)
	}
	if score == nil {
		t.Fatal("score should not be nil")
	}
	if fmt.Sprintf("%.4f", *score) != "0.5000" {
		t.Errorf("score = %.4f; want 0.5000", *score)
	}
}

func TestDeriveStressResult_TIGHT(t *testing.T) {
	// net < 0, rising rate → TIGHT
	label, score := DeriveStressResult(ptr64(-5_000), 5, ptr64(4.75), ptr64(4.5))
	if label != "TIGHT" {
		t.Errorf("label = %q; want TIGHT", label)
	}
	if score == nil {
		t.Fatal("score should not be nil (5 days)")
	}
	// score = 0.5 - (-5000/40000) = 0.5 + 0.125 = 0.625
	if fmt.Sprintf("%.4f", *score) != "0.6250" {
		t.Errorf("score = %.4f; want 0.6250", *score)
	}
}

func TestDeriveStressResult_NEUTRAL_NegNetStableRate(t *testing.T) {
	// net < 0, but rate is NOT rising → NEUTRAL
	label, score := DeriveStressResult(ptr64(-5_000), 5, ptr64(4.5), ptr64(4.75))
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL (rate not rising)", label)
	}
	if score == nil {
		t.Fatal("score should not be nil")
	}
	if fmt.Sprintf("%.4f", *score) != "0.6250" {
		t.Errorf("score = %.4f; want 0.6250", *score)
	}
}

func TestDeriveStressResult_TIGHT_NilPrevRate(t *testing.T) {
	// net < 0, prevRate nil → cannot confirm rising rate → NEUTRAL
	label, score := DeriveStressResult(ptr64(-5_000), 5, ptr64(4.75), nil)
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL (prev rate unknown)", label)
	}
	_ = score
}

func TestDeriveStressResult_ScoreNullWhenFewerThan5Days(t *testing.T) {
	// 4 days in window → score nil even though net is computable.
	label, score := DeriveStressResult(ptr64(-25_000), 4, nil, nil)
	if label != "DRAIN" {
		t.Errorf("label = %q; want DRAIN", label)
	}
	if score != nil {
		t.Errorf("score should be nil when daysInWindow=4; got %.4f", *score)
	}
}

func TestDeriveStressResult_ScoreClampedAt0(t *testing.T) {
	// Large positive net → score clamped to 0.
	label, score := DeriveStressResult(ptr64(100_000), 5, nil, nil)
	if label != "EASY" {
		t.Errorf("label = %q; want EASY", label)
	}
	if score == nil || *score != 0 {
		t.Errorf("score = %v; want 0.0 (clamped)", score)
	}
}

func TestDeriveStressResult_ScoreClampedAt1(t *testing.T) {
	// Large negative net → score clamped to 1.
	label, score := DeriveStressResult(ptr64(-100_000), 5, nil, nil)
	if label != "DRAIN" {
		t.Errorf("label = %q; want DRAIN", label)
	}
	if score == nil || *score != 1.0 {
		t.Errorf("score = %v; want 1.0 (clamped)", score)
	}
}

func TestDeriveStressResult_Score20kBoundary(t *testing.T) {
	// net = +20,000 exactly — BA spec says EASY > +20,000 (strict), so +20,000 → NEUTRAL.
	// Score = 0.5 - 20000/40000 = 0.0 (clamped).
	label, score := DeriveStressResult(ptr64(20_000), 5, nil, nil)
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL (boundary: +20000 is within ±20000)", label)
	}
	if score == nil || *score != 0 {
		t.Errorf("score = %v; want 0.0", score)
	}
}

func TestDeriveStressResult_Score20kDrainBoundary(t *testing.T) {
	// net = -20,000 exactly — BA spec says DRAIN < -20,000 (strict), so -20,000 → NEUTRAL.
	// Score = 0.5 - (-20000)/40000 = 1.0.
	label, score := DeriveStressResult(ptr64(-20_000), 5, nil, nil)
	if label != "NEUTRAL" {
		t.Errorf("label = %q; want NEUTRAL (boundary: -20000 is within ±20000)", label)
	}
	if score == nil || *score != 1.0 {
		t.Errorf("score = %v; want 1.0", score)
	}
}
