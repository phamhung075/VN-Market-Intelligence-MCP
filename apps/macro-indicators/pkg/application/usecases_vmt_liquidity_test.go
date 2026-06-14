// Package application — LiquidityStateUseCase tests (VMT-5a + VMT-5b).
//
// Covers:
//   - Nil dependency guards (policyRates + sjcFX + omo providers).
//   - Error paths: is_estimate=true on IRS + Interbank1W even when fetch/parse fails.
//   - Successful execution with anchor values.
//   - IRS is_estimate=true ALWAYS invariant (DD-6, all paths incl. error).
//   - Interbank1W is_estimate=true + rate_1w_pct=nil ALWAYS (architect Decision B, all paths).
//   - OMO is_estimate=false on parse success; is_estimate=true on parse failure.
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

// stubOMOProvider is a test double for OMOProvider.
type stubOMOProvider struct {
	inputs OMOInputs
	err    error
}

func (s *stubOMOProvider) FetchOMO(_ context.Context) (OMOInputs, error) {
	return s.inputs, s.err
}

// goodOMOProvider returns the June-12-2026 anchor OMO values (ParseOK=true).
func goodOMOProvider() *stubOMOProvider {
	return &stubOMOProvider{
		inputs: OMOInputs{
			TotalAddBnVND:    1217.45,
			TotalAbsorbBnVND: 0,
			AuctionDate:      "12/06/2026",
			ParseOK:          true,
		},
	}
}

// failOMOProvider returns a stub that simulates a parse failure (ParseOK=false).
func failOMOProvider() *stubOMOProvider {
	return &stubOMOProvider{
		inputs: OMOInputs{ParseOK: false, ParseError: "HTTP 503"},
		err:    errors.New("HTTP 503 from www.sbv.gov.vn"),
	}
}

// ---------------------------------------------------------------------------
// Nil guard tests
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_NilPolicyProvider verifies nil-provider guard.
// IRS.IsEstimate + Interbank1W.IsEstimate must be true even on this error path (fail-closed).
func TestLiquidityStateUseCase_NilPolicyProvider(t *testing.T) {
	uc := NewLiquidityStateUseCase(nil, &stubSJCFXProvider{}, goodOMOProvider())
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
	// INVARIANT: Interbank1W.IsEstimate must be true + Rate1WPct=nil (architect Decision B).
	if !resp.Interbank1W.IsEstimate {
		t.Error("Interbank1W.IsEstimate must be true on nil-provider error path (architect Decision B)")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Error("Interbank1W.Rate1WPct must be nil on error path (architect Decision B)")
	}
}

// TestLiquidityStateUseCase_NilSJCFXProvider verifies nil sjcFXProvider guard.
// IRS.IsEstimate + Interbank1W.IsEstimate must be true even on this error path.
func TestLiquidityStateUseCase_NilSJCFXProvider(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
		nil,
		goodOMOProvider(),
	)
	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err == nil {
		t.Error("expected error for nil sjcFXProvider")
	}
	// INVARIANT: IRS.IsEstimate must be true even on nil-guard error path.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true on nil sjcFX error path (DD-6 fail-closed)")
	}
	// INVARIANT: Interbank1W.IsEstimate must be true + Rate1WPct=nil (architect Decision B).
	if !resp.Interbank1W.IsEstimate {
		t.Error("Interbank1W.IsEstimate must be true on nil sjcFX error path (architect Decision B)")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Error("Interbank1W.Rate1WPct must be nil on nil sjcFX error path")
	}
}

// TestLiquidityStateUseCase_NilOMOProvider verifies nil omoProvider guard.
// IRS.IsEstimate + Interbank1W invariants enforced even on nil omoProvider path.
func TestLiquidityStateUseCase_NilOMOProvider(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
		&stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
		nil,
	)
	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	if err == nil {
		t.Error("expected error for nil omoProvider")
	}
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true on nil OMO error path (DD-6 fail-closed)")
	}
	if !resp.Interbank1W.IsEstimate {
		t.Error("Interbank1W.IsEstimate must be true on nil OMO error path (architect Decision B)")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Error("Interbank1W.Rate1WPct must be nil on nil OMO error path")
	}
	// OMO fail-closed on error path.
	if !resp.OMO.IsEstimate {
		t.Error("OMO.IsEstimate must be true on nil omoProvider error path (fail-closed)")
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
		omoProvider    OMOProvider
		wantErr        bool
	}{
		{
			name:           "normal_success",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5, DiscountRatePct: 1.5, IsEstimate: false}},
			sjcFXProvider:  &stubSJCFXProvider{inputs: SJCFXInputs{GoldUSDPerOz: 4238.8, USDVNDRate: 26250, SBVCenterRate: 25155}},
			omoProvider:    goodOMOProvider(),
			wantErr:        false,
		},
		{
			name:           "policy_fetch_error",
			policyProvider: &stubPolicyRatesProvider{err: errors.New("HTML fetch failed")},
			sjcFXProvider:  &stubSJCFXProvider{inputs: SJCFXInputs{GoldUSDPerOz: 4238.8}},
			omoProvider:    goodOMOProvider(),
			wantErr:        false, // non-fatal: partial success
		},
		{
			name:           "sjcfx_fetch_error",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
			sjcFXProvider:  &stubSJCFXProvider{err: errors.New("DB read failed")},
			omoProvider:    goodOMOProvider(),
			wantErr:        false, // non-fatal: safe-degrade
		},
		{
			name:           "omo_fetch_error",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
			sjcFXProvider:  &stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
			omoProvider:    failOMOProvider(),
			wantErr:        false, // non-fatal: OMO fail-closed is_estimate=true
		},
		{
			name:           "nil_policy_provider",
			policyProvider: nil,
			sjcFXProvider:  &stubSJCFXProvider{},
			omoProvider:    goodOMOProvider(),
			wantErr:        true,
		},
		{
			name:           "nil_sjcfx_provider",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{}},
			sjcFXProvider:  nil,
			omoProvider:    goodOMOProvider(),
			wantErr:        true,
		},
		{
			name:           "nil_omo_provider",
			policyProvider: &stubPolicyRatesProvider{rates: domain.PolicyRates{}},
			sjcFXProvider:  &stubSJCFXProvider{},
			omoProvider:    nil,
			wantErr:        true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewLiquidityStateUseCase(tc.policyProvider, tc.sjcFXProvider, tc.omoProvider)
			resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})

			if tc.wantErr && err == nil {
				t.Errorf("%s: expected error, got nil", tc.name)
			}
			// CRITICAL: IRS.IsEstimate MUST be true on ALL paths (DD-6 permanent).
			if !resp.IRS.IsEstimate {
				t.Errorf("%s: IRS.IsEstimate must be true ALWAYS (DD-6 permanent) — got false", tc.name)
			}
			// CRITICAL: Interbank1W.IsEstimate MUST be true on ALL paths (architect Decision B).
			if !resp.Interbank1W.IsEstimate {
				t.Errorf("%s: Interbank1W.IsEstimate must be true ALWAYS (architect Decision B) — got false", tc.name)
			}
			// CRITICAL: Interbank1W.Rate1WPct MUST be nil on ALL paths.
			if resp.Interbank1W.Rate1WPct != nil {
				t.Errorf("%s: Interbank1W.Rate1WPct must be nil ALWAYS (architect Decision B)", tc.name)
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
		goodOMOProvider(),
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
// OMO anchor: TotalAddBnVND=1217.45, TotalAbsorb=0, net=1217.45 (June-12-2026 probe).
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
		goodOMOProvider(), // June-12-2026: add=1217.45, absorb=0
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

	// OMO anchor: June-12-2026 — net=1217.45 bn VND, is_estimate=false (parse success).
	if resp.OMO.IsEstimate {
		t.Error("OMO.IsEstimate must be false when parse succeeds (primary source)")
	}
	if resp.OMO.NetOutstandingBnVND == nil {
		t.Fatal("OMO.NetOutstandingBnVND must not be nil on parse success")
	}
	const wantOMONet = 1217.45
	if *resp.OMO.NetOutstandingBnVND < wantOMONet-0.01 || *resp.OMO.NetOutstandingBnVND > wantOMONet+0.01 {
		t.Errorf("OMO.NetOutstandingBnVND = %.2f; want %.2f", *resp.OMO.NetOutstandingBnVND, wantOMONet)
	}
	if resp.OMO.AuctionDate != "12/06/2026" {
		t.Errorf("OMO.AuctionDate = %q; want 12/06/2026", resp.OMO.AuctionDate)
	}

	// Interbank1W: PERMANENTLY blocked (architect Decision B).
	if !resp.Interbank1W.IsEstimate {
		t.Error("Interbank1W.IsEstimate must be true ALWAYS (architect Decision B, PERMANENT)")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Errorf("Interbank1W.Rate1WPct must be nil ALWAYS; got non-nil")
	}
	if resp.Interbank1W.BlockedReason == "" {
		t.Error("Interbank1W.BlockedReason must be non-empty")
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
		goodOMOProvider(),
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

// ---------------------------------------------------------------------------
// OMO fail-closed tests (VMT-5b)
// ---------------------------------------------------------------------------

// TestLiquidityStateUseCase_OMOParseFailure verifies that when OMO fetch fails,
// omo.is_estimate=true and net_outstanding_bn_vnd=nil (fail-closed).
// IRS + Interbank1W invariants still enforced.
func TestLiquidityStateUseCase_OMOParseFailure(t *testing.T) {
	uc := NewLiquidityStateUseCase(
		&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5, IsEstimate: false}},
		&stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
		failOMOProvider(),
	)

	resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})
	// OMO failure is non-fatal — overall response is Status="ok".
	if err != nil {
		t.Fatalf("unexpected error (OMO failure should be non-fatal): %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status: got %q; want ok (OMO failure is non-fatal)", resp.Status)
	}

	// OMO fail-closed: is_estimate=true + net_outstanding_bn_vnd=nil.
	if !resp.OMO.IsEstimate {
		t.Error("OMO.IsEstimate must be true when OMO fetch fails (fail-closed)")
	}
	if resp.OMO.NetOutstandingBnVND != nil {
		t.Errorf("OMO.NetOutstandingBnVND must be nil when parse fails (fail-closed); got %v", *resp.OMO.NetOutstandingBnVND)
	}

	// IRS + Interbank1W invariants must hold even on OMO failure path.
	if !resp.IRS.IsEstimate {
		t.Error("IRS.IsEstimate must be true (DD-6 permanent, even on OMO failure path)")
	}
	if !resp.Interbank1W.IsEstimate {
		t.Error("Interbank1W.IsEstimate must be true (architect Decision B, even on OMO failure path)")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Error("Interbank1W.Rate1WPct must be nil even on OMO failure path")
	}
}

// TestLiquidityStateUseCase_Interbank1W_AlwaysBlocked verifies the interbank_1w
// is_estimate=true + rate_1w_pct=nil + blocked_reason invariants on ALL paths.
func TestLiquidityStateUseCase_Interbank1W_AlwaysBlocked(t *testing.T) {
	cases := []struct {
		name        string
		omoProvider OMOProvider
	}{
		{"omo_success", goodOMOProvider()},
		{"omo_failure", failOMOProvider()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewLiquidityStateUseCase(
				&stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
				&stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
				tc.omoProvider,
			)
			resp, _ := uc.Execute(context.Background(), LiquidityStateRequest{})

			// PERMANENT INVARIANTS (architect Decision B):
			if !resp.Interbank1W.IsEstimate {
				t.Errorf("[%s] Interbank1W.IsEstimate must be true ALWAYS", tc.name)
			}
			if resp.Interbank1W.Rate1WPct != nil {
				t.Errorf("[%s] Interbank1W.Rate1WPct must be nil ALWAYS", tc.name)
			}
			if resp.Interbank1W.BlockedReason == "" {
				t.Errorf("[%s] Interbank1W.BlockedReason must be non-empty ALWAYS", tc.name)
			}
		})
	}
}
