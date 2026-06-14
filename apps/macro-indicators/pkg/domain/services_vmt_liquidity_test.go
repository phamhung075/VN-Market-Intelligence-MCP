// Package domain — tests for liquidity-state domain service functions (VMT-5a).
//
// Covers:
//   - BuildIRSField: is_estimate=true ALWAYS invariant (DD-6, including error paths).
//   - ConvertWorldGoldToMnVND: formula + edge cases.
//   - ComputeSJCGoldGap: normal case, SJC-absent fail-closed, is_estimate invariant.
//   - BuildFXCoupling: center-rate present vs absent.
//
// Fence-A: only the domain package is imported.
package domain

import (
	"math"
	"testing"
)

// ---------------------------------------------------------------------------
// BuildIRSField — is_estimate ALWAYS true (DD-6, PERMANENT)
// ---------------------------------------------------------------------------

// TestBuildIRSField_IsEstimateAlwaysTrue is the critical invariant test.
// IRS.IsEstimate must be true in ALL cases — this is DD-6 PERMANENT.
func TestBuildIRSField_IsEstimateAlwaysTrue(t *testing.T) {
	// Multiple calls must all return is_estimate=true.
	for i := 0; i < 5; i++ {
		irs := BuildIRSField()
		if !irs.IsEstimate {
			t.Errorf("call %d: BuildIRSField().IsEstimate must be true ALWAYS (DD-6 permanent) — got false", i)
		}
		if irs.Note == "" {
			t.Errorf("call %d: BuildIRSField().Note must be non-empty", i)
		}
	}
}

// TestBuildIRSField_ErrorPathIsEstimateTrue verifies that even if used on an error path,
// the IRS field remains is_estimate=true.
// This mirrors the VMT-1b TestComputeBlocSplit_IsEstimateAlwaysTrue pattern.
func TestBuildIRSField_ErrorPathIsEstimateTrue(t *testing.T) {
	// Simulate error paths: always calling BuildIRSField() must return is_estimate=true.
	cases := []string{"fetch_error", "parse_error", "nil_inputs", "normal"}
	for _, caseName := range cases {
		t.Run(caseName, func(t *testing.T) {
			irs := BuildIRSField()
			if !irs.IsEstimate {
				t.Errorf("IRS.IsEstimate must be true on %q path (DD-6 permanent, fail-closed)", caseName)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ConvertWorldGoldToMnVND
// ---------------------------------------------------------------------------

// TestConvertWorldGoldToMnVND_Anchor tests against PROBE-4 confirmed values.
// June-12-2026: gold_usd_per_oz ≈ 4238.8, usd_vnd_rate ≈ 26250.
// Expected: (4238.8 * 26250 / 1_000_000) * 1.20565 ≈ 134.2 mn VND/tael.
func TestConvertWorldGoldToMnVND_Anchor(t *testing.T) {
	goldUSD := 4238.8
	usdVND := 26250.0
	result := ConvertWorldGoldToMnVND(goldUSD, usdVND)

	// Expected = (4238.8 * 26250 / 1_000_000) * 1.20565 ≈ 134.18
	expected := (goldUSD * usdVND / 1_000_000) * troyOzPerTael
	if math.Abs(result-expected) > 0.01 {
		t.Errorf("ConvertWorldGoldToMnVND anchor: got %.4f mn VND/tael, want %.4f", result, expected)
	}
	if result <= 0 {
		t.Errorf("ConvertWorldGoldToMnVND anchor: result must be > 0, got %.4f", result)
	}
}

// TestConvertWorldGoldToMnVND_ZeroGold verifies safe-degrade when gold price is 0.
func TestConvertWorldGoldToMnVND_ZeroGold(t *testing.T) {
	result := ConvertWorldGoldToMnVND(0, 26000)
	if result != 0 {
		t.Errorf("ConvertWorldGoldToMnVND zero gold: got %.4f, want 0", result)
	}
}

// TestConvertWorldGoldToMnVND_ZeroFX verifies safe-degrade when FX rate is 0.
func TestConvertWorldGoldToMnVND_ZeroFX(t *testing.T) {
	result := ConvertWorldGoldToMnVND(3000, 0)
	if result != 0 {
		t.Errorf("ConvertWorldGoldToMnVND zero FX: got %.4f, want 0", result)
	}
}

// TestConvertWorldGoldToMnVND_BothZero verifies safe-degrade when both are 0.
func TestConvertWorldGoldToMnVND_BothZero(t *testing.T) {
	result := ConvertWorldGoldToMnVND(0, 0)
	if result != 0 {
		t.Errorf("ConvertWorldGoldToMnVND both zero: got %.4f, want 0", result)
	}
}

// ---------------------------------------------------------------------------
// ComputeSJCGoldGap
// ---------------------------------------------------------------------------

// TestComputeSJCGoldGap_Normal tests the normal case where both SJC and world prices are present.
func TestComputeSJCGoldGap_Normal(t *testing.T) {
	sjcPrice := 135.0   // mn VND/tael
	worldPrice := 134.2 // mn VND/tael
	fetchedAt := "2026-06-12T12:00:00Z"

	result := ComputeSJCGoldGap(sjcPrice, worldPrice, fetchedAt)

	if result.SJCPriceMnVND != sjcPrice {
		t.Errorf("SJCPriceMnVND: got %.4f, want %.4f", result.SJCPriceMnVND, sjcPrice)
	}
	if result.WorldPriceMnVND != worldPrice {
		t.Errorf("WorldPriceMnVND: got %.4f, want %.4f", result.WorldPriceMnVND, worldPrice)
	}
	expectedGap := sjcPrice - worldPrice
	if math.Abs(result.SJCGapMnVND-expectedGap) > 0.001 {
		t.Errorf("SJCGapMnVND: got %.4f, want %.4f", result.SJCGapMnVND, expectedGap)
	}
	if result.IsEstimate {
		t.Error("IsEstimate should be false when both SJC and world prices are present")
	}
	if result.FetchedAt != fetchedAt {
		t.Errorf("FetchedAt: got %q, want %q", result.FetchedAt, fetchedAt)
	}
}

// TestComputeSJCGoldGap_SJCAbsent_FailClosed tests the fail-closed behavior when SJC = 0.
// This is the critical DD-7 path: SJC absent from DB → is_estimate=true, gap=0.
func TestComputeSJCGoldGap_SJCAbsent_FailClosed(t *testing.T) {
	worldPrice := 134.2
	fetchedAt := "2026-06-12T12:00:00Z"

	result := ComputeSJCGoldGap(0, worldPrice, fetchedAt)

	if result.SJCPriceMnVND != 0 {
		t.Errorf("SJCPriceMnVND must be 0 when SJC absent, got %.4f", result.SJCPriceMnVND)
	}
	if result.SJCGapMnVND != 0 {
		t.Errorf("SJCGapMnVND must be 0 when SJC absent, got %.4f", result.SJCGapMnVND)
	}
	if !result.IsEstimate {
		t.Error("IsEstimate MUST be true when SJC is absent (fail-closed)")
	}
	if result.WorldPriceMnVND != worldPrice {
		t.Errorf("WorldPriceMnVND preserved: got %.4f, want %.4f", result.WorldPriceMnVND, worldPrice)
	}
}

// TestComputeSJCGoldGap_IsEstimateInvariant verifies is_estimate is true on all error-path cases.
func TestComputeSJCGoldGap_IsEstimateInvariant(t *testing.T) {
	cases := []struct {
		name       string
		sjc        float64
		world      float64
		wantEstimate bool
	}{
		{"sjc_absent", 0, 134.2, true},
		{"both_zero", 0, 0, true},
		{"sjc_negative", -1.0, 134.2, true},
		{"normal_both_present", 135.0, 134.2, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := ComputeSJCGoldGap(tc.sjc, tc.world, "2026-06-12T12:00:00Z")
			if result.IsEstimate != tc.wantEstimate {
				t.Errorf("IsEstimate: got %v, want %v (case: %s)", result.IsEstimate, tc.wantEstimate, tc.name)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// BuildFXCoupling
// ---------------------------------------------------------------------------

// TestBuildFXCoupling_WithCenterRate tests the normal case with a live center rate.
func TestBuildFXCoupling_WithCenterRate(t *testing.T) {
	result := BuildFXCoupling(25155, 23948, 26362, 99.807, 0, "2026-06-12T12:00:00Z")
	if result.USDVNDCenter != 25155 {
		t.Errorf("USDVNDCenter: got %.2f, want 25155.0", result.USDVNDCenter)
	}
	if result.BandPct != sbvBandPct {
		t.Errorf("BandPct: got %.2f, want %.2f", result.BandPct, sbvBandPct)
	}
	if result.IsEstimate {
		t.Error("IsEstimate should be false when center rate is present (> 0)")
	}
	if result.DXY != 99.807 {
		t.Errorf("DXY: got %.4f, want 99.807", result.DXY)
	}
}

// TestBuildFXCoupling_AbsentCenterRate tests safe-degrade when center rate = 0.
func TestBuildFXCoupling_AbsentCenterRate(t *testing.T) {
	result := BuildFXCoupling(0, 0, 0, 0, 0, "2026-06-12T12:00:00Z")
	if !result.IsEstimate {
		t.Error("IsEstimate must be true when center rate is 0 (safe-degrade)")
	}
	if result.BandPct != sbvBandPct {
		t.Errorf("BandPct must always be sbvBandPct (%.1f), got %.2f", sbvBandPct, result.BandPct)
	}
}

// TestBuildFXCoupling_BandPctAlwaysSet verifies BandPct is always 5.0.
func TestBuildFXCoupling_BandPctAlwaysSet(t *testing.T) {
	cases := []struct{ center, buy, sell float64 }{
		{25155, 23948, 26362},
		{0, 0, 0},
		{24500, 0, 0},
	}
	for _, tc := range cases {
		result := BuildFXCoupling(tc.center, tc.buy, tc.sell, 0, 0, "ts")
		if result.BandPct != sbvBandPct {
			t.Errorf("BandPct must always be %.1f, got %.2f (center=%.0f)", sbvBandPct, result.BandPct, tc.center)
		}
	}
}
