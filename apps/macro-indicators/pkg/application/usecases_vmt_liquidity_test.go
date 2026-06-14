// Package application — LiquidityStateUseCase tests (VMT-5a).
//
// Covers:
//   - Nil dependency guards.
//   - Error paths: is_estimate=true on IRS even when fetch/parse fails.
//   - Successful execution with anchor values.
//   - IRS is_estimate=true ALWAYS invariant (DD-6, all paths incl. error).
//   - SJC-absent fail-closed: is_estimate=true on sjc_gold_gap when SJC missing.
//   - Policy rates isEstimate=true on DB fallback path.
//
// Fence-B: only pkg/domain and pkg/application imports allowed here.
package application

import (
	"context"
	"errors"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

// stubPolicyRatesProvider is a test double for PolicyRatesProvider.
type stubPolicyRatesProvider struct {
	rates domain.PolicyRates
	err   error
}

func (s *stubPolicyRatesProvider) FetchPolicyRates(_ context.Context) (domain.PolicyRates, error) {
	return s.rates, s.err
}

// stubSJCFXProvider is a test double for SJCFXProvider.
type stubSJCFXProvider struct {
	inputs SJCFXInputs
	err    error
}

func (s *stubSJCFXProvider) FetchInputs(_ context.Context) (SJCFXInputs, error) {
	return s.inputs, s.err
}

// ---------------------------------------------------------------------------
// Nil guard tests
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_NilPolicyProvider verifies nil-provider guard.
// IRS.IsEstimate must be true even on this error path (fail-closed).
func TestLiquidityStateUseCase_NilPolicyProvider(t *testing.T) {
	uc := NewLiquidityStateUseCase(nil, &stubSJCFXProvider{})
	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err == nil {
		t.Error("expected error for nil policyRatesProvider")
	}
	if resp.Status != "error" {
		t.Errorf("status: got %q, want error", resp.Status)
	}
	// INVARIANT: IRS.IsEstimate must be true even on nil-guard error path.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true on nil-provider error path (DD-6 fail-closed)")
	}
}

// TestLiquidityStateUseCase_NilSJCFXProvider verifies nil sjcFXProvider guard.
// IRS.IsEstimate must be true even on this error path.
func TestLiquidityStateUseCase_NilSJCFXProvider(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
		nil,
	)
	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err == nil {
		t.Error("expected error for nil sjcFXProvider")
	}
	// INVARIANT: IRS.IsEstimate must be true even on nil-guard error path.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true on nil sjcFX error path (DD-6 fail-closed)")
	}
}

// ---------------------------------------------------------------------------
// IRS is_estimate=true ALWAYS invariant (DD-6, all paths incl. error)
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_IRSIsEstimateAlwaysTrue is the critical DD-6 invariant test.
// Mirrors TestComputeBlocSplit_IsEstimateAlwaysTrue for VMT-1b.
func TestLiquidityStateUseCase_IRSIsEstimateAlwaysTrue(t *testing.T) {
	cases := []struct {
		name           string
		policyProvider PolicyRatesProvider
		sjcFXProvider  SJCFXProvider
		wantErr        bool
	}{
		{
			name:           "normal_success",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5, DiscountRatePct: 1.5, IsEstimate: false}},
			sjcFXProvider:  &stubSJCFXProvider{inputs: SJCFXInputs{GoldUSDPerOz: 4238.8, USDVNDRate: 26250, SBVCenterRate: 25155}},
			wantErr:        false,
		},
		{
			name:           "policy_fetch_error",
			policyProvider: &stubPolicyRatesProvider{err: errors.New("HTML fetch failed")},
			sjcFXProvider:  &stubSJCFXProvider{inputs: SJCFXInputs{GoldUSDPerOz: 4238.8}},
			wantErr:        false, // non-fatal: partial success
		},
		{
			name:           "sjcfx_fetch_error",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
			sjcFXProvider:  &stubSJCFXProvider{err: errors.New("DB read failed")},
			wantErr:        false, // non-fatal: safe-degrade
		},
		{
			name:           "nil_policy_provider",
			policyProvider: nil,
			sjcFXProvider:  &stubSJCFXProvider{},
			wantErr:        true,
		},
		{
			name:           "nil_sjcfx_provider",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{}},
			sjcFXProvider:  nil,
			wantErr:        true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewLiquidityStateUseCase(tc.policyProvider, tc.sjcFXProvider)
			resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})

			if tc.wantErr && err == nil {
				t.Errorf("%s: expected error, got nil", tc.name)
			}
			// CRITICAL: IRS.IsEstimate MUST be true on ALL paths (DD-6 permanent).
			if !resp.IRS.IsEstimate {
				t.Errorf("%s: IRS.IsEstimate must be true ALWAYS (DD-6 permanent) — got false", tc.name)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// SJC-absent fail-closed
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_SJCAbsent_FailClosed verifies that when SJC price = 0
// (absent from DB), sjc_gold_gap.IsEstimate is true and gap = 0.
func TestLiquidityStateUseCase_SJCAbsent_FailClosed(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5, IsEstimate: false}},
		&stubSJCFXProvider{inputs: SJCFXInputs{
			GoldUSDPerOz:  4238.8,
			USDVNDRate:    26250,
			SBVCenterRate: 25155,
			SJCPriceMnVND: 0, // SJC absent from DB
		}},
	)

	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status: got %q, want ok", resp.Status)
	}

	// Fail-closed: SJC absent → is_estimate=true, gap=0.
	if !resp.SJCGoldGap.IsEstimate {
		t.Error("SJCGoldGap.IsEstimate must be true when SJC is absent (fail-closed)")
	}
	if resp.SJCGoldGap.SJCGapMnVND != 0 {
		t.Errorf("SJCGapMnVND must be 0 when SJC absent, got %.4f", resp.SJCGoldGap.SJCGapMnVND)
	}
	// IRS still true.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true (DD-6 permanent)")
	}
}

// ---------------------------------------------------------------------------
// Anchor values test
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_AnchorValues tests against PROBE-4 confirmed values.
// June-12-2026 anchors: usd_center=25155, buy=23948, sell=26362, DXY=99.807.
// gold_usd_per_oz=4238.8, usd_vnd=26250.
// Policy: refi=4.5, discount=1.5 (from DB sbv_rates).
func TestLiquidityStateUseCase_AnchorValues(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{
			RefiRatePct:     4.5,
			DiscountRatePct: 1.5,
			LombardRatePct:  0, // not in DB, HTML parse pending
			IsEstimate:      false,
			Source:          "SBV HTML",
			FetchedAt:       "2026-06-12T12:00:00Z",
		}},
		&stubSJCFXProvider{inputs: SJCFXInputs{
			GoldUSDPerOz:  4238.8,
			USDVNDRate:    26250,
			DXY:           99.807,
			CNYVNDRate:    0,
			SBVCenterRate: 25155,
			SJCPriceMnVND: 0, // SJC not in DB yet
		}},
	)

	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status: got %q, want ok", resp.Status)
	}

	// Policy rates passthrough.
	if resp.PolicyRates.RefiRatePct != 4.5 {
		t.Errorf("PolicyRates.RefiRatePct: got %.2f, want 4.5", resp.PolicyRates.RefiRatePct)
	}
	if resp.PolicyRates.DiscountRatePct != 1.5 {
		t.Errorf("PolicyRates.DiscountRatePct: got %.2f, want 1.5", resp.PolicyRates.DiscountRatePct)
	}
	if resp.PolicyRates.IsEstimate {
		t.Error("PolicyRates.IsEstimate should be false when SBV HTML succeeds")
	}

	// FX coupling.
	if resp.FXCoupling.USDVNDCenter != 25155 {
		t.Errorf("FXCoupling.USDVNDCenter: got %.2f, want 25155", resp.FXCoupling.USDVNDCenter)
	}
	if resp.FXCoupling.BandPct != 5.0 {
		t.Errorf("FXCoupling.BandPct: got %.2f, want 5.0", resp.FXCoupling.BandPct)
	}
	if resp.FXCoupling.DXY != 99.807 {
		t.Errorf("FXCoupling.DXY: got %.4f, want 99.807", resp.FXCoupling.DXY)
	}
	if resp.FXCoupling.IsEstimate {
		t.Error("FXCoupling.IsEstimate should be false when center rate > 0")
	}

	// World gold price (computed from gold_usd * usd_vnd).
	if resp.SJCGoldGap.WorldPriceMnVND <= 0 {
		t.Errorf("SJCGoldGap.WorldPriceMnVND must be > 0 with valid gold+fx inputs, got %.4f", resp.SJCGoldGap.WorldPriceMnVND)
	}

	// IRS ALWAYS true (DD-6).
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true ALWAYS (DD-6 permanent)")
	}
}

// ---------------------------------------------------------------------------
// Policy rates DB fallback (is_estimate=true)
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_PolicyRatesFallback verifies is_estimate=true when
// policy rates provider returns an error (falls back to zero-value + is_estimate=true).
func TestLiquidityStateUseCase_PolicyRatesFallback(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{err: errors.New("SBV HTML fetch failed")},
		&stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
	)

	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	// Non-fatal: policy rates error does not abort the overall response.
	if err != nil {
		t.Fatalf("unexpected error (policy rates error should be non-fatal): %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status: got %q, want ok (policy rates error is non-fatal)", resp.Status)
	}
	// On policy rates error, IsEstimate must be true (fail-closed).
	if !resp.PolicyRates.IsEstimate {
		t.Error("PolicyRates.IsEstimate must be true when fetch fails (fail-closed)")
	}
	// IRS still always true.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true (DD-6 permanent, even on policy error path)")
	}
}
