// Package application — VMT-8-MACRO-GRACEFUL-FAILCLOSE gate tests (G1-G4).
//
// Verification gates per task contract:
//
//	G1: Per use-case — inject upstream-fetch/parse failure, assert Execute returns
//	    (resp, nil) with Status="degraded", IsEstimate=true, BlockedReason non-empty.
//	    NOT a nil-provider/wiring fault (those stay as HTTP 500).
//
//	G2: Handler path — on degraded use-case return (Status="degraded", err=nil),
//	    the thin HTTP handler emits HTTP 200 with is_estimate=true + blocked_reason.
//	    (Tested via httptest + mock use-case returning degraded response.)
//
//	G3: Regression — nil-provider/wiring fault STILL returns (resp, error) → HTTP 500.
//	    The genuine-fault path must NOT be silenced.
//
//	G4: Permanent-estimate invariants intact across all paths:
//	    - BlocSplit FDI/Domestic.IsEstimate=true always (ARCH Decision A / VMT-1b).
//	    - LiquidityState IRS.IsEstimate=true always (DD-6 permanent).
//	    - LiquidityState Interbank1W.IsEstimate=true + Rate1WPct=nil always (architect Decision B).
//	    - CPIComponents WeightsIsEstimate=true always.
//	    None of these may flip to false on degraded paths.
//
// Fence-B: only pkg/domain and pkg/application imports allowed here.
// Handler tests (G2) live in the pkg/interface/http package test file.
package application

import (
	"context"
	"errors"
	"testing"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Shared stub helpers (already defined in other test files in this package)
// Stubs reused: stubNSOProvider, stubTradeParser, stubVpsFetcher, stubBOPParser,
// stubBOPURLBuilder, stubPolicyRatesProvider, stubSJCFXProvider, stubOMOProvider,
// goodOMOProvider, failOMOProvider.
// ---------------------------------------------------------------------------

// stubIIPParser is a test double for IIPParser.
type stubIIPParser struct {
	record domain.MacroIndicatorsGSORecord
	err    error
}

func (s *stubIIPParser) ParseIIP(_ []byte, _ string) (domain.MacroIndicatorsGSORecord, error) {
	return s.record, s.err
}

// stubCPIParser is a test double for CPIParser.
type stubCPIParser struct {
	record domain.CPIRecord
	err    error
}

func (s *stubCPIParser) ParseCPI(_ []byte, _ string) (domain.CPIRecord, error) {
	return s.record, s.err
}

// ---------------------------------------------------------------------------
// G1: Per use-case upstream-fetch/parse failure → (resp, nil), Status="degraded"
// ---------------------------------------------------------------------------

// TestG1_TradeBalance_FetchFailure_Degraded asserts that an upstream-fetch failure in
// TradeBalanceUseCase returns (resp, nil) with Status="degraded" + IsEstimate=true +
// BlockedReason non-empty. Handler will emit HTTP 200, NOT 500.
func TestG1_TradeBalance_FetchFailure_Degraded(t *testing.T) {
	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{err: errors.New("VPS proxy 125.212.251.27:3128: connection refused")},
		&stubTradeParser{},
	)
	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: upstream fetch failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: IsEstimate must be true on upstream fetch failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: BlockedReason must be non-empty (names the unreachable source)")
	}
}

// TestG1_TradeBalance_ParseFailure_Degraded asserts that a parse failure also degrades.
func TestG1_TradeBalance_ParseFailure_Degraded(t *testing.T) {
	uc := NewTradeBalanceUseCase(
		&stubNSOProvider{bytes: []byte("corrupt"), period: "2026-05"},
		&stubTradeParser{err: errors.New("sheet '14.XK' not found in workbook")},
	)
	resp, err := uc.Execute(context.Background(), TradeBalanceRequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: parse failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: IsEstimate must be true on parse failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: BlockedReason must be non-empty")
	}
}

// TestG1_BOP_FetchFailure_Degraded asserts that an upstream-fetch failure in BOPUseCase
// returns (resp, nil) with Status="degraded" + IsEstimate=true + BlockedReason non-empty.
func TestG1_BOP_FetchFailure_Degraded(t *testing.T) {
	uc := NewBOPUseCase(
		&stubVpsFetcher{err: errors.New("dial tcp 125.212.251.27:3128: connect: connection refused")},
		&stubBOPParser{},
		&stubBOPURLBuilder{},
	)
	resp, err := uc.Execute(context.Background(), BOPRequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: BOP upstream fetch failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: BOP Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: BOP IsEstimate must be true on upstream fetch failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: BOP BlockedReason must be non-empty")
	}
	// OffshoreParked is always is_estimate=true (heuristic, never primary source).
	if !resp.OffshoreParked.IsEstimate {
		t.Error("G1 FAIL: BOP OffshoreParked.IsEstimate must be true ALWAYS (heuristic)")
	}
}

// TestG1_MacroIndicators_FetchFailure_Degraded asserts that an upstream-fetch failure in
// MacroIndicatorsGSOUseCase returns (resp, nil) with Status="degraded" + IsEstimate=true.
func TestG1_MacroIndicators_FetchFailure_Degraded(t *testing.T) {
	uc := NewMacroIndicatorsGSOUseCase(
		&stubNSOProvider{err: errors.New("VPS proxy 125.212.251.27:3128: connection refused")},
		&stubIIPParser{},
	)
	resp, err := uc.Execute(context.Background(), MacroIndicatorsGSORequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: MacroGSO upstream fetch failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: MacroGSO Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: MacroGSO IsEstimate must be true on upstream fetch failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: MacroGSO BlockedReason must be non-empty")
	}
}

// TestG1_MacroIndicators_ParseFailure_Degraded asserts that an IIP parse failure also degrades.
func TestG1_MacroIndicators_ParseFailure_Degraded(t *testing.T) {
	uc := NewMacroIndicatorsGSOUseCase(
		&stubNSOProvider{bytes: []byte("corrupt"), period: "2026-05"},
		&stubIIPParser{err: errors.New("sheet '2.IIPthang' not found")},
	)
	resp, err := uc.Execute(context.Background(), MacroIndicatorsGSORequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: MacroGSO parse failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: MacroGSO Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: MacroGSO IsEstimate must be true on parse failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: MacroGSO BlockedReason must be non-empty")
	}
}

// TestG1_CPIComponents_FetchFailure_Degraded asserts that an upstream-fetch failure in
// CPIComponentsUseCase returns (resp, nil) with Status="degraded" + IsEstimate=true.
func TestG1_CPIComponents_FetchFailure_Degraded(t *testing.T) {
	uc := NewCPIComponentsUseCase(
		&stubNSOProvider{err: errors.New("VPS proxy 125.212.251.27:3128: connection refused")},
		&stubCPIParser{},
	)
	resp, err := uc.Execute(context.Background(), CPIComponentsRequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: CPI upstream fetch failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: CPI Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: CPI IsEstimate must be true on upstream fetch failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: CPI BlockedReason must be non-empty")
	}
	// WeightsIsEstimate=true always.
	if !resp.WeightsIsEstimate {
		t.Error("G1 FAIL: CPI WeightsIsEstimate must be true ALWAYS")
	}
}

// TestG1_CPIComponents_ParseFailure_Degraded asserts that a CPI parse failure also degrades.
func TestG1_CPIComponents_ParseFailure_Degraded(t *testing.T) {
	uc := NewCPIComponentsUseCase(
		&stubNSOProvider{bytes: []byte("corrupt"), period: "2026-05"},
		&stubCPIParser{err: errors.New("sheet '16.CPI' not found")},
	)
	resp, err := uc.Execute(context.Background(), CPIComponentsRequest{})

	if err != nil {
		t.Fatalf("G1 FAIL: CPI parse failure must return nil error (degraded→HTTP 200), got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: CPI Status=%q, want 'degraded'", resp.Status)
	}
	if !resp.IsEstimate {
		t.Error("G1 FAIL: CPI IsEstimate must be true on parse failure")
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: CPI BlockedReason must be non-empty")
	}
	// WeightsIsEstimate=true always — even on parse failure.
	if !resp.WeightsIsEstimate {
		t.Error("G1 FAIL: CPI WeightsIsEstimate must be true ALWAYS (even on parse failure)")
	}
}

// TestG1_Liquidity_DegradedResponse_InvariantsHeld verifies that degradedLiquidityResponse
// (the hardened path added for liquidity's latent bug) enforces all permanent invariants:
// IRS.IsEstimate=true (DD-6), Interbank1W.IsEstimate=true + Rate1WPct=nil (Decision B).
//
// Note: the liquidity use-case Execute already handles upstream errors non-fatally inline
// (policy/db/omo blocs degrade individually). This test covers the degradedLiquidityResponse
// helper's invariant enforcement — used if a future path needs whole-response degrade.
func TestG1_Liquidity_DegradedResponse_InvariantsHeld(t *testing.T) {
	resp, err := degradedLiquidityResponse("SBV HTML unreachable: connection refused")

	if err != nil {
		t.Fatalf("G1 FAIL: degradedLiquidityResponse must return nil error, got: %v", err)
	}
	if resp.Status != "degraded" {
		t.Errorf("G1 FAIL: Status=%q, want 'degraded'", resp.Status)
	}
	if resp.BlockedReason == "" {
		t.Error("G1 FAIL: BlockedReason must be non-empty")
	}
	// DD-6 PERMANENT invariant.
	if !resp.IRS.IsEstimate {
		t.Error("G1 FAIL: IRS.IsEstimate must be true ALWAYS (DD-6 permanent) on degraded path")
	}
	// Architect Decision B PERMANENT invariants.
	if !resp.Interbank1W.IsEstimate {
		t.Error("G1 FAIL: Interbank1W.IsEstimate must be true ALWAYS (architect Decision B) on degraded path")
	}
	if resp.Interbank1W.Rate1WPct != nil {
		t.Error("G1 FAIL: Interbank1W.Rate1WPct must be nil ALWAYS (architect Decision B) on degraded path")
	}
	if resp.Interbank1W.BlockedReason == "" {
		t.Error("G1 FAIL: Interbank1W.BlockedReason must be non-empty on degraded path")
	}
	// OMO fail-closed.
	if !resp.OMO.IsEstimate {
		t.Error("G1 FAIL: OMO.IsEstimate must be true on degraded path (fail-closed)")
	}
	// SJCGoldGap fail-closed.
	if !resp.SJCGoldGap.IsEstimate {
		t.Error("G1 FAIL: SJCGoldGap.IsEstimate must be true on degraded path (fail-closed)")
	}
}

// ---------------------------------------------------------------------------
// G3: Nil-provider / wiring fault still returns error → HTTP 500 (genuine fault path)
// ---------------------------------------------------------------------------

// TestG3_TradeBalance_NilProvider_StillErrors verifies nil-provider STILL returns (resp, err)
// (genuine wiring fault → HTTP 500). This path must NOT be silenced to nil.
func TestG3_TradeBalance_NilProvider_StillErrors(t *testing.T) {
	uc := NewTradeBalanceUseCase(nil, &stubTradeParser{})
	_, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("G3 FAIL: nil excelProvider must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_TradeBalance_NilParser_StillErrors verifies nil-parser STILL returns (resp, err).
func TestG3_TradeBalance_NilParser_StillErrors(t *testing.T) {
	uc := NewTradeBalanceUseCase(&stubNSOProvider{bytes: []byte("x"), period: "2026-05"}, nil)
	_, err := uc.Execute(context.Background(), TradeBalanceRequest{})
	if err == nil {
		t.Error("G3 FAIL: nil tradeParser must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_BOP_NilFetcher_StillErrors verifies nil-fetcher STILL returns (resp, err).
func TestG3_BOP_NilFetcher_StillErrors(t *testing.T) {
	uc := NewBOPUseCase(nil, &stubBOPParser{}, &stubBOPURLBuilder{})
	_, err := uc.Execute(context.Background(), BOPRequest{})
	if err == nil {
		t.Error("G3 FAIL: nil fetcher must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_MacroIndicators_NilProvider_StillErrors verifies nil-provider STILL returns (resp, err).
func TestG3_MacroIndicators_NilProvider_StillErrors(t *testing.T) {
	uc := NewMacroIndicatorsGSOUseCase(nil, &stubIIPParser{})
	_, err := uc.Execute(context.Background(), MacroIndicatorsGSORequest{})
	if err == nil {
		t.Error("G3 FAIL: nil excelProvider must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_MacroIndicators_NilParser_StillErrors verifies nil-iipParser STILL returns (resp, err).
func TestG3_MacroIndicators_NilParser_StillErrors(t *testing.T) {
	uc := NewMacroIndicatorsGSOUseCase(&stubNSOProvider{bytes: []byte("x"), period: "2026-05"}, nil)
	_, err := uc.Execute(context.Background(), MacroIndicatorsGSORequest{})
	if err == nil {
		t.Error("G3 FAIL: nil iipParser must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_CPIComponents_NilProvider_StillErrors verifies nil-provider STILL returns (resp, err).
func TestG3_CPIComponents_NilProvider_StillErrors(t *testing.T) {
	uc := NewCPIComponentsUseCase(nil, &stubCPIParser{})
	_, err := uc.Execute(context.Background(), CPIComponentsRequest{})
	if err == nil {
		t.Error("G3 FAIL: nil excelProvider must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_CPIComponents_NilParser_StillErrors verifies nil-cpiParser STILL returns (resp, err).
func TestG3_CPIComponents_NilParser_StillErrors(t *testing.T) {
	uc := NewCPIComponentsUseCase(&stubNSOProvider{bytes: []byte("x"), period: "2026-05"}, nil)
	_, err := uc.Execute(context.Background(), CPIComponentsRequest{})
	if err == nil {
		t.Error("G3 FAIL: nil cpiParser must return a non-nil error (wiring fault → HTTP 500)")
	}
}

// TestG3_Liquidity_NilProviders_StillError verifies nil-provider guards in liquidity
// use-case STILL return (resp, err) — genuine wiring fault → HTTP 500.
func TestG3_Liquidity_NilProviders_StillError(t *testing.T) {
	cases := []struct {
		name   string
		policy PolicyRatesProvider
		sjcFX  SJCFXProvider
		omoP   OMOProvider
	}{
		{"nil_policy", nil, &stubSJCFXProvider{}, goodOMOProvider()},
		{"nil_sjcfx", &stubPolicyRatesProvider{rates: domain.PolicyRates{}}, nil, goodOMOProvider()},
		{"nil_omo", &stubPolicyRatesProvider{rates: domain.PolicyRates{}}, &stubSJCFXProvider{}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewLiquidityStateUseCase(tc.policy, tc.sjcFX, tc.omoP)
			_, err := uc.Execute(context.Background(), LiquidityStateRequest{})
			if err == nil {
				t.Errorf("G3 FAIL [%s]: nil provider must return a non-nil error (wiring fault → HTTP 500)", tc.name)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// G4: Permanent-estimate invariants intact across all paths (success + degraded + error)
// ---------------------------------------------------------------------------

// TestG4_TradeBalance_BlocSplitAlwaysEstimate verifies that BlocSplit.FDI.IsEstimate
// and BlocSplit.Domestic.IsEstimate are true on ALL paths (ARCH Decision A — VMT-1b).
func TestG4_TradeBalance_BlocSplitAlwaysEstimate(t *testing.T) {
	cases := []struct {
		name     string
		provider NSOExcelProvider
		parser   TradeBalanceParser
	}{
		{
			"success_path",
			&stubNSOProvider{bytes: []byte("x"), period: "2026-05"},
			&stubTradeParser{record: domain.TradeBalanceRecord{
				BlocSplit: domain.BlocSplitEstimate{
					FDI:      domain.BlocShareEstimate{SharePct: 90.0, IsEstimate: true},
					Domestic: domain.BlocShareEstimate{SharePct: 10.0, IsEstimate: true},
				},
			}},
		},
		{
			"fetch_failure_degraded",
			&stubNSOProvider{err: errors.New("proxy down")},
			&stubTradeParser{},
		},
		{
			"parse_failure_degraded",
			&stubNSOProvider{bytes: []byte("x"), period: "2026-05"},
			&stubTradeParser{err: errors.New("sheet not found")},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewTradeBalanceUseCase(tc.provider, tc.parser)
			resp, _ := uc.Execute(context.Background(), TradeBalanceRequest{})
			if !resp.BlocSplit.FDI.IsEstimate {
				t.Errorf("G4 FAIL [%s]: BlocSplit.FDI.IsEstimate must be true ALWAYS (ARCH Decision A)", tc.name)
			}
			if !resp.BlocSplit.Domestic.IsEstimate {
				t.Errorf("G4 FAIL [%s]: BlocSplit.Domestic.IsEstimate must be true ALWAYS (ARCH Decision A)", tc.name)
			}
		})
	}
}

// TestG4_CPIComponents_WeightsAlwaysEstimate verifies WeightsIsEstimate=true on ALL paths.
func TestG4_CPIComponents_WeightsAlwaysEstimate(t *testing.T) {
	cases := []struct {
		name     string
		provider NSOExcelProvider
		parser   CPIParser
	}{
		{
			"success_path",
			&stubNSOProvider{bytes: []byte("x"), period: "2026-05"},
			&stubCPIParser{record: domain.CPIRecord{WeightsNote: "weights not in monthly Excel"}},
		},
		{
			"fetch_failure_degraded",
			&stubNSOProvider{err: errors.New("proxy down")},
			&stubCPIParser{},
		},
		{
			"parse_failure_degraded",
			&stubNSOProvider{bytes: []byte("x"), period: "2026-05"},
			&stubCPIParser{err: errors.New("sheet '16.CPI' not found")},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewCPIComponentsUseCase(tc.provider, tc.parser)
			resp, _ := uc.Execute(context.Background(), CPIComponentsRequest{})
			if !resp.WeightsIsEstimate {
				t.Errorf("G4 FAIL [%s]: WeightsIsEstimate must be true ALWAYS (never fabricated weights)", tc.name)
			}
		})
	}
}

// TestG4_Liquidity_PermanentInvariants verifies IRS + Interbank1W permanent invariants
// on all paths (success, degraded, nil-provider error) — DD-6 + architect Decision B.
func TestG4_Liquidity_PermanentInvariants(t *testing.T) {
	type testCase struct {
		name    string
		policy  PolicyRatesProvider
		sjcFX   SJCFXProvider
		omoP    OMOProvider
		wantErr bool
	}
	cases := []testCase{
		{
			name:    "success_all_providers_ok",
			policy:  &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
			sjcFX:   &stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
			omoP:    goodOMOProvider(),
			wantErr: false,
		},
		{
			name:    "policy_fetch_error_nonfatal",
			policy:  &stubPolicyRatesProvider{err: errors.New("HTML fetch failed")},
			sjcFX:   &stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
			omoP:    goodOMOProvider(),
			wantErr: false,
		},
		{
			name:    "omo_failure_nonfatal",
			policy:  &stubPolicyRatesProvider{rates: domain.PolicyRates{RefiRatePct: 4.5}},
			sjcFX:   &stubSJCFXProvider{inputs: SJCFXInputs{SBVCenterRate: 25155}},
			omoP:    failOMOProvider(),
			wantErr: false,
		},
		{
			name:    "nil_policy_wiring_fault",
			policy:  nil,
			sjcFX:   &stubSJCFXProvider{},
			omoP:    goodOMOProvider(),
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uc := NewLiquidityStateUseCase(tc.policy, tc.sjcFX, tc.omoP)
			resp, err := uc.Execute(context.Background(), LiquidityStateRequest{})

			if tc.wantErr && err == nil {
				t.Errorf("G4 [%s]: expected error for wiring fault, got nil", tc.name)
			}

			// G4: DD-6 PERMANENT — IRS.IsEstimate must be true on ALL paths including error paths.
			if !resp.IRS.IsEstimate {
				t.Errorf("G4 FAIL [%s]: IRS.IsEstimate must be true ALWAYS (DD-6 permanent)", tc.name)
			}
			// G4: architect Decision B PERMANENT — must hold on ALL paths.
			if !resp.Interbank1W.IsEstimate {
				t.Errorf("G4 FAIL [%s]: Interbank1W.IsEstimate must be true ALWAYS (architect Decision B)", tc.name)
			}
			if resp.Interbank1W.Rate1WPct != nil {
				t.Errorf("G4 FAIL [%s]: Interbank1W.Rate1WPct must be nil ALWAYS (architect Decision B)", tc.name)
			}
		})
	}
}
