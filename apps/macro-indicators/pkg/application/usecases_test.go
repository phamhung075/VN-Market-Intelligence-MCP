// Package application — unit tests for ComputeMacroUseCase.
//
// Seed-data-leak detector: verifies that VNIndex in the snapshot response is
// sourced from the MarketIndexPort when the port returns a non-zero value,
// NOT from the fixture constant (1280.5).
//
// DPI-2b tests (AC-1 through AC-6): verify that carry/yield regime inputs are
// sourced from CarryYieldInputsPort when live values are available, fall back
// to fixture constants on empty/stale port, and that regime sign can flip
// (anti-false-green proof — AC-6).
//
// If these tests fail it means the use case is leaking the fixture/seed constants.
package application

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Stub ports — in-package fakes; no infrastructure imported (Fence-C).
// ---------------------------------------------------------------------------

// stubCommodityFetcher returns fixed commodity prices.
type stubCommodityFetcher struct {
	prices map[string]float64
}

func (s *stubCommodityFetcher) FetchPrices(_ context.Context, symbols []string) (map[string]float64, error) {
	result := make(map[string]float64, len(symbols))
	for _, sym := range symbols {
		if v, ok := s.prices[sym]; ok {
			result[sym] = v
		}
	}
	return result, nil
}

// stubSBVRate is a no-op SBV rate stub.
type stubSBVRate struct{}

func (s *stubSBVRate) GetRate(_ context.Context, _, _ string) (float64, error) {
	return 0, nil
}

// stubCarryYieldInputs returns configurable carry/yield input values.
// Zero values signal "no data" (port safe-degrade → Execute() uses fixtures).
// fedFundsSourceDate is the FRED source date returned by GetFedFundsSourceDate;
// nil simulates absent/unparseable FRED date.
type stubCarryYieldInputs struct {
	vndDeposit          float64
	fedFunds            float64
	earnYield           float64
	fedFundsSourceDate  *time.Time
}

func (s *stubCarryYieldInputs) GetVNDDepositRate(_ context.Context) (float64, error) {
	return s.vndDeposit, nil
}
func (s *stubCarryYieldInputs) GetFedFundsRate(_ context.Context) (float64, error) {
	return s.fedFunds, nil
}
func (s *stubCarryYieldInputs) GetFedFundsSourceDate(_ context.Context) (*time.Time, error) {
	return s.fedFundsSourceDate, nil
}
func (s *stubCarryYieldInputs) GetEarningYield(_ context.Context) (float64, error) {
	return s.earnYield, nil
}

// stubMarketIndex returns a configurable VN-Index value.
type stubMarketIndex struct {
	vnIndex float64
}

func (s *stubMarketIndex) FetchVNIndex(_ context.Context) (float64, error) {
	return s.vnIndex, nil
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestVNIndexSourcedFromPort is the seed-data-leak detector.
//
// Contract: when MarketIndexPort.FetchVNIndex returns a non-zero value,
// MacroSnapshotResponse.VNIndex MUST equal that value, not fixtureVNIndex (1280.5).
//
// If this test fails the use case is leaking the seed/fixture constant.
func TestVNIndexSourcedFromPort(t *testing.T) {
	const liveVNIndex = 1880.89 // value the live market returned on 2026-05-26

	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": 24500.0,
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: liveVNIndex},
		nil, // carryYieldInputs nil → fixture safe-degrade (this test checks VNIndex, not carry/yield)
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	if resp.VNIndex == fixtureVNIndex {
		t.Errorf("VNIndex seed-data-leak: got fixture value %.1f, want live port value %.2f — "+
			"the use case is not wiring through MarketIndexPort", fixtureVNIndex, liveVNIndex)
	}
	if resp.VNIndex != liveVNIndex {
		t.Errorf("VNIndex = %.2f, want %.2f (from MarketIndexPort)", resp.VNIndex, liveVNIndex)
	}
}

// TestVNIndexFallsBackToFixtureWhenPortReturnsZero verifies the fallback path:
// if the port returns 0 (no data yet), the fixture default is used rather than
// serving a zero vnIndex.
func TestVNIndexFallsBackToFixtureWhenPortReturnsZero(t *testing.T) {
	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": 24500.0,
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 0}, // port has no data
		nil, // carryYieldInputs nil → fixture safe-degrade
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	if resp.VNIndex == 0 {
		t.Errorf("VNIndex = 0 when port returned 0 — use case must fall back to fixtureVNIndex (%.1f), not emit zero", fixtureVNIndex)
	}
	if resp.VNIndex != fixtureVNIndex {
		t.Errorf("VNIndex fallback = %.2f, want fixtureVNIndex %.1f", resp.VNIndex, fixtureVNIndex)
	}
}

// ---------------------------------------------------------------------------
// T-MLP-4: resolveMarketPrices passes live port values through
// ---------------------------------------------------------------------------

// TestResolveMarketPrices_LivePortValues (T-MLP-4) verifies that when the
// CommodityFetcherPort returns non-zero values, they pass through to the
// snapshot response unchanged.
//
// Values differ from fixtures (82.5/2350.0/24500.0) — proves the port was
// read, not the constants (per brief §11 QA-GATE-1 note).
func TestResolveMarketPrices_LivePortValues(t *testing.T) {
	// Live values: distinct from all fixture constants.
	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    96.0,
			"GOLD":   4480.0,
			"USDVND": 26150.0,
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade (this test checks commodity, not carry/yield)
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	// Verify each commodity value is the live port value, NOT the fixture.
	if resp.OilUSD == fixtureOilUSD {
		t.Errorf("OilUSD seed-data-leak: got fixture %.1f, want live port value 96.0", fixtureOilUSD)
	}
	if resp.OilUSD != 96.0 {
		t.Errorf("OilUSD = %.2f, want 96.0 (from port)", resp.OilUSD)
	}

	if resp.GoldUSD == fixtureGoldUSD {
		t.Errorf("GoldUSD seed-data-leak: got fixture %.1f, want live port value 4480.0", fixtureGoldUSD)
	}
	if resp.GoldUSD != 4480.0 {
		t.Errorf("GoldUSD = %.2f, want 4480.0 (from port)", resp.GoldUSD)
	}

	if resp.USDVnd == fixtureUSDVnd {
		t.Errorf("USDVnd seed-data-leak: got fixture %.1f, want live port value 26150.0", fixtureUSDVnd)
	}
	if resp.USDVnd != 26150.0 {
		t.Errorf("USDVnd = %.2f, want 26150.0 (from port)", resp.USDVnd)
	}
}

// ---------------------------------------------------------------------------
// T-MLP-5: resolveMarketPrices falls back to fixture constants on empty port
// ---------------------------------------------------------------------------

// TestResolveMarketPrices_EmptyPortFallback (T-MLP-5) verifies that when the
// CommodityFetcherPort returns an empty map (stale or missing data from DB),
// the use case falls back to fixture constants.
//
// This simulates SQLiteCommodityRepository returning {} when:
//   - fetched_at > 26h (stale row), or
//   - no 'yahoo' row exists, or
//   - commodity_prices table is absent.
func TestResolveMarketPrices_EmptyPortFallback(t *testing.T) {
	// Empty map — simulates SQLiteCommodityRepository stale/missing data.
	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	// All three values MUST be the fixture constants (fixture fallback fired).
	if resp.OilUSD != fixtureOilUSD {
		t.Errorf("OilUSD fallback = %.2f, want fixtureOilUSD %.1f (empty port must use fixture)", resp.OilUSD, fixtureOilUSD)
	}
	if resp.GoldUSD != fixtureGoldUSD {
		t.Errorf("GoldUSD fallback = %.2f, want fixtureGoldUSD %.1f (empty port must use fixture)", resp.GoldUSD, fixtureGoldUSD)
	}
	if resp.USDVnd != fixtureUSDVnd {
		t.Errorf("USDVnd fallback = %.2f, want fixtureUSDVnd %.1f (empty port must use fixture)", resp.USDVnd, fixtureUSDVnd)
	}
}

// ---------------------------------------------------------------------------
// DPI-1: SBV rate takes priority over commodity FX
// ---------------------------------------------------------------------------

// stubSBVRateLive returns a configurable SBV exchange rate (positive = live).
type stubSBVRateLive struct {
	rate float64
}

func (s *stubSBVRateLive) GetRate(_ context.Context, _, _ string) (float64, error) {
	return s.rate, nil
}

// TestSBVRateOverridesUSDVnd (DPI-1 AC-3) verifies that when SBVRatePort returns
// a positive value, it overrides the commodity USDVND in the snapshot response.
//
// Contract: Execute() must call sbvRate.GetRate(ctx, "USD", "VND") after
// resolveMarketPrices() and replace usdVnd if result is positive.
func TestSBVRateOverridesUSDVnd(t *testing.T) {
	const commodityUSDVnd = 26255.0 // Yahoo Finance value (the one being overridden)
	const sbvUSDVnd = 26115.0       // SBV official value (expected winner)

	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": commodityUSDVnd,
		}},
		&stubSBVRateLive{rate: sbvUSDVnd},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	if resp.USDVnd == commodityUSDVnd {
		t.Errorf("DPI-1: USDVnd = commodity value %.2f — SBV override did not fire; "+
			"Execute() must replace usdVnd with sbvRate.GetRate() when result > 0", commodityUSDVnd)
	}
	if resp.USDVnd != sbvUSDVnd {
		t.Errorf("DPI-1: USDVnd = %.2f, want SBV official value %.2f", resp.USDVnd, sbvUSDVnd)
	}
}

// TestSBVRateZeroKeepsCommodityUSDVnd (DPI-1 AC-5 safe-degrade) verifies that
// when SBVRatePort returns 0 (stale/absent sbv_rates), the commodity USDVND
// is kept unchanged — no override, no panic.
func TestSBVRateZeroKeepsCommodityUSDVnd(t *testing.T) {
	const commodityUSDVnd = 26255.0

	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": commodityUSDVnd,
		}},
		&stubSBVRate{}, // returns 0 — simulates stale/absent sbv_rates
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	if resp.USDVnd != commodityUSDVnd {
		t.Errorf("DPI-1 safe-degrade: USDVnd = %.2f, want commodity value %.2f "+
			"(sbvRate returns 0 → must keep commodity value)", resp.USDVnd, commodityUSDVnd)
	}
}

// TestSBVRateDoesNotAffectOilGold (DPI-1 OIL/GOLD unaffected) verifies that
// the SBV override only touches USDVnd — OIL and GOLD are preserved from the
// commodity port.
func TestSBVRateDoesNotAffectOilGold(t *testing.T) {
	const liveOil = 96.0
	const liveGold = 4480.0

	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    liveOil,
			"GOLD":   liveGold,
			"USDVND": 26255.0,
		}},
		&stubSBVRateLive{rate: 26115.0}, // SBV fires
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	if resp.OilUSD != liveOil {
		t.Errorf("DPI-1: OilUSD = %.2f, want %.2f (SBV override must not affect OIL)", resp.OilUSD, liveOil)
	}
	if resp.GoldUSD != liveGold {
		t.Errorf("DPI-1: GoldUSD = %.2f, want %.2f (SBV override must not affect GOLD)", resp.GoldUSD, liveGold)
	}
}

// ---------------------------------------------------------------------------
// DPI-2: computedAt reflects Execute() call time
// ---------------------------------------------------------------------------

// TestComputedAtIsCurrentTime (DPI-2 AC-2) verifies that carry.computedAt and
// yield.computedAt in the snapshot response reflect the current time (not frozen
// 2026-05-23 constant).
//
// Strategy: marshal resp.Signals.Carry and resp.Signals.Yield to JSON (both are
// interface{} wrapping concrete carry/yield output structs), then unmarshal into
// a minimal struct to extract computedAt. Record time before/after Execute() and
// verify computedAt is within the window.
func TestComputedAtIsCurrentTime(t *testing.T) {
	uc := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    82.5,
			"GOLD":   2350.0,
			"USDVND": 24500.0,
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // carryYieldInputs nil → fixture safe-degrade (this test checks computedAt only)
	)

	// Truncate to second precision: time.RFC3339 drops sub-second; comparison must
	// use the same granularity or the window check produces false failures.
	before := time.Now().UTC().Truncate(time.Second)
	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	after := time.Now().UTC().Add(time.Second).Truncate(time.Second)

	if err != nil {
		t.Fatalf("Execute() returned unexpected error: %v", err)
	}

	// Extract computedAt from carry and yield via JSON round-trip.
	// resp.Signals.Carry and resp.Signals.Yield are interface{} wrapping
	// concrete carry/yield output structs that have a json:"computedAt" field.
	type withComputedAt struct {
		ComputedAt string `json:"computedAt"`
	}

	extractComputedAt := func(signal interface{}, label string) string {
		b, merr := json.Marshal(signal)
		if merr != nil {
			t.Fatalf("DPI-2: marshal %s signal: %v", label, merr)
		}
		var s withComputedAt
		if merr = json.Unmarshal(b, &s); merr != nil {
			t.Fatalf("DPI-2: unmarshal %s computedAt: %v", label, merr)
		}
		return s.ComputedAt
	}

	carryAt := extractComputedAt(resp.Signals.Carry, "carry")
	yieldAt := extractComputedAt(resp.Signals.Yield, "yield")

	// DPI-2 AC-1: frozen constant must not appear.
	const frozen = "2026-05-23T00:00:00Z"
	if carryAt == frozen {
		t.Errorf("DPI-2: carry.computedAt = frozen constant %q — fixtureComputedAt was not removed", frozen)
	}
	if yieldAt == frozen {
		t.Errorf("DPI-2: yield.computedAt = frozen constant %q — fixtureComputedAt was not removed", frozen)
	}

	// DPI-2 AC-2: RFC3339 prefix check.
	if !strings.HasPrefix(carryAt, "202") {
		t.Errorf("DPI-2: carry.computedAt = %q does not look like RFC3339 timestamp", carryAt)
	}
	if !strings.HasPrefix(yieldAt, "202") {
		t.Errorf("DPI-2: yield.computedAt = %q does not look like RFC3339 timestamp", yieldAt)
	}

	// DPI-2 AC-2: parse and verify within execute window.
	carryTs, parseErr := time.Parse(time.RFC3339, carryAt)
	if parseErr != nil {
		t.Fatalf("DPI-2: carry.computedAt %q failed RFC3339 parse: %v", carryAt, parseErr)
	}
	if carryTs.Before(before) || carryTs.After(after) {
		t.Errorf("DPI-2: carry.computedAt %v outside execute window [%v, %v]", carryTs, before, after)
	}

	yieldTs, parseErr := time.Parse(time.RFC3339, yieldAt)
	if parseErr != nil {
		t.Fatalf("DPI-2: yield.computedAt %q failed RFC3339 parse: %v", yieldAt, parseErr)
	}
	if yieldTs.Before(before) || yieldTs.After(after) {
		t.Errorf("DPI-2: yield.computedAt %v outside execute window [%v, %v]", yieldTs, before, after)
	}
}

// ---------------------------------------------------------------------------
// DPI-2b: CarryYieldInputsPort — live inputs wire-through + safe-degrade tests
// ---------------------------------------------------------------------------

// newStubCommodity returns a stubCommodityFetcher with plausible live values.
func newStubCommodity() *stubCommodityFetcher {
	return &stubCommodityFetcher{prices: map[string]float64{
		"OIL":    82.5,
		"GOLD":   2350.0,
		"USDVND": 24500.0,
	}}
}

// extractCarrySignal extracts carry signal fields via JSON round-trip.
// Returns (carrySpread, regime, isEstimate) from resp.Signals.Carry.
// carrySpread is 0 when the JSON field is null (suppressed by DSI-INV-1).
func extractCarrySignal(t *testing.T, resp MacroSnapshotResponse) (float64, string, bool) {
	t.Helper()
	type carryFields struct {
		CarrySpread *float64 `json:"carrySpread"` // pointer: null when suppressed
		Regime      string   `json:"regime"`
		IsEstimate  bool     `json:"is_estimate"`
	}
	b, err := json.Marshal(resp.Signals.Carry)
	if err != nil {
		t.Fatalf("DSI-INV-1: marshal carry signal: %v", err)
	}
	var f carryFields
	if err = json.Unmarshal(b, &f); err != nil {
		t.Fatalf("DSI-INV-1: unmarshal carry signal: %v", err)
	}
	spread := 0.0
	if f.CarrySpread != nil {
		spread = *f.CarrySpread
	}
	return spread, f.Regime, f.IsEstimate
}

// extractYieldSignal extracts yield signal fields via JSON round-trip.
// Returns (spread, label) from resp.Signals.Yield.
func extractYieldSignal(t *testing.T, resp MacroSnapshotResponse) (float64, string) {
	t.Helper()
	type yieldFields struct {
		Spread float64 `json:"spread"`
		Label  string  `json:"label"`
	}
	b, err := json.Marshal(resp.Signals.Yield)
	if err != nil {
		t.Fatalf("DPI-2b: marshal yield signal: %v", err)
	}
	var f yieldFields
	if err = json.Unmarshal(b, &f); err != nil {
		t.Fatalf("DPI-2b: unmarshal yield signal: %v", err)
	}
	return f.Spread, f.Label
}

// TestDPI2b_DepositLive (AC-1) verifies that when CarryYieldInputsPort returns a
// live VND deposit rate, Execute() uses it instead of fixtureVNDDepositRate (4.7).
func TestDPI2b_DepositLive(t *testing.T) {
	const liveDeposit = 6.0 // distinct from fixture 4.7

	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		// fedFunds=5.33 is also "live" (non-zero from port) even though it equals the fixture.
		// Both inputs live → carry is NOT suppressed; we get the real spread.
		&stubCarryYieldInputs{vndDeposit: liveDeposit, fedFunds: 5.33, earnYield: 8.2},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// Both inputs live → not suppressed → carrySpread = liveDeposit − fedFunds = 6.0 − 5.33 = 0.67
	carrySpread, _, isEstimate := extractCarrySignal(t, resp)
	if isEstimate {
		t.Errorf("DPI-2b AC-1: is_estimate=true but both inputs are live (non-zero from port)")
	}
	const wantSpread = 0.67
	if carrySpread == -0.63 {
		t.Errorf("DPI-2b AC-1: carrySpread = frozen −0.63 — deposit live input not wired (still using fixture 4.7)")
	}
	if abs(carrySpread-wantSpread) > 0.01 {
		t.Errorf("DPI-2b AC-1: carrySpread = %.4f, want ~%.2f (liveDeposit %.1f − fedFunds 5.33)", carrySpread, wantSpread, liveDeposit)
	}
}

// TestDPI2b_FedFundsLive (AC-2) verifies that when CarryYieldInputsPort returns a
// live Fed funds rate, Execute() uses it instead of fixtureFedFundsRate (5.33).
func TestDPI2b_FedFundsLive(t *testing.T) {
	const liveFed = 4.0 // distinct from fixture 5.33

	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		// vndDeposit=4.7 is "live" (non-zero from port). Both inputs live → not suppressed.
		&stubCarryYieldInputs{vndDeposit: 4.7, fedFunds: liveFed, earnYield: 8.2},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// Both inputs live → not suppressed → carrySpread = 4.7 − 4.0 = 0.70
	carrySpread, _, isEstimate := extractCarrySignal(t, resp)
	if isEstimate {
		t.Errorf("DPI-2b AC-2: is_estimate=true but both inputs are live (non-zero from port)")
	}
	if carrySpread == -0.63 {
		t.Errorf("DPI-2b AC-2: carrySpread = frozen −0.63 — fed funds live input not wired (still using fixture 5.33)")
	}
	if abs(carrySpread-0.7) > 0.01 {
		t.Errorf("DPI-2b AC-2: carrySpread = %.4f, want ~0.70 (deposit 4.7 − liveFed %.1f)", carrySpread, liveFed)
	}
}

// TestDPI2b_EarningYieldLive (AC-3) verifies that when CarryYieldInputsPort returns a
// live earnings yield, Execute() uses it instead of fixtureEarningYield (8.2).
func TestDPI2b_EarningYieldLive(t *testing.T) {
	const liveYield = 5.5 // distinct from fixture 8.2 — also changes yield regime

	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: 4.7, fedFunds: 5.33, earnYield: liveYield},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// yieldSpread = liveYield − deposit = 5.5 − 4.7 = 0.8 (FAIRLY_VALUED)
	// fixture gives 8.2 − 4.7 = 3.5 (CHEAP) → regime changes
	yieldSpread, yieldLabel := extractYieldSignal(t, resp)
	if abs(yieldSpread-3.5) < 0.01 {
		t.Errorf("DPI-2b AC-3: yieldSpread = frozen 3.5 — earning yield live input not wired (still using fixture 8.2)")
	}
	if abs(yieldSpread-0.8) > 0.01 {
		t.Errorf("DPI-2b AC-3: yieldSpread = %.4f, want ~0.80 (liveYield %.1f − deposit 4.7)", yieldSpread, liveYield)
	}
	if yieldLabel == "CHEAP" {
		t.Errorf("DPI-2b AC-3: yield label = CHEAP (fixture regime) — earning yield live input not wired; want FAIRLY_VALUED for spread 0.8")
	}
}

// TestDPI2b_SafeDegrade_EmptyPort (AC-4) verifies that when CarryYieldInputsPort
// returns zero for all three inputs (empty DB), Execute() falls back to fixture
// constants without panicking, AND suppresses the carry regime per DSI-INV-1.
//
// DSI-INV-1 behavior: port returns 0 → resolvers detect v==0 → fixture values
// used for computation but isLive=false → carry regime suppressed to "UNKNOWN",
// carrySpread=null, is_estimate=true, source_tier=4.
// This prevents fixture arithmetic from being served as actionable "FII_OUTFLOW_RISK".
func TestDPI2b_SafeDegrade_EmptyPort(t *testing.T) {
	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: 0, fedFunds: 0, earnYield: 0}, // all zero = absent DB
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error on empty port: %v", err)
	}

	// DSI-INV-1: zero port → fixture fallback → carry SUPPRESSED (is_estimate=true, regime=UNKNOWN).
	_, carryRegime, isEstimate := extractCarrySignal(t, resp)
	if !isEstimate {
		t.Errorf("DSI-INV-1 AC-4: is_estimate=false — carry must be marked estimate when port returns zero")
	}
	if carryRegime != "UNKNOWN" {
		t.Errorf("DSI-INV-1 AC-4: regime = %q, want UNKNOWN (fixture fallback → suppressed per DSI-INV-1)", carryRegime)
	}
	// dataSource must NOT be "live" when carry inputs are fixture.
	if resp.DataSource == "live" {
		t.Errorf("DSI-INV-1 AC-4: dataSource=%q, must not be 'live' when carry inputs are fixture", resp.DataSource)
	}
}

// TestDPI2b_SafeDegrade_NilPort (AC-4 nil) verifies that a nil CarryYieldInputsPort
// causes Execute() to use fixture constants — no panic — and suppresses carry regime.
func TestDPI2b_SafeDegrade_NilPort(t *testing.T) {
	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // nil port → resolvers return fixture constants, isLive=false
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error on nil port: %v", err)
	}

	// DSI-INV-1: nil port → fixture fallback → carry SUPPRESSED.
	_, carryRegime, isEstimate := extractCarrySignal(t, resp)
	if !isEstimate {
		t.Errorf("DSI-INV-1 AC-4 nil: is_estimate=false — carry must be marked estimate when port is nil")
	}
	if carryRegime != "UNKNOWN" {
		t.Errorf("DSI-INV-1 AC-4 nil: carryRegime = %q, want UNKNOWN (nil port → suppressed per DSI-INV-1)", carryRegime)
	}
}

// TestDPI2b_RegimeFlip_LiveInputs (AC-6) — THE ANTI-FALSE-GREEN PROOF.
//
// This is the decisive DV: with live inputs, carrySpread MUST change sign vs
// the frozen fixture value (4.7 − 5.33 = −0.63, FII_OUTFLOW_RISK).
//
// Scenario: VND deposit = 6.0%, Fed = 4.0% → spread = +2.0% (NEUTRAL).
// Frozen fixture: VND = 4.7%, Fed = 5.33% → spread = −0.63% (FII_OUTFLOW_RISK).
//
// If this test passes, the regime is NOT frozen — carry is recomputing from
// live inputs. This is the proof that DPI-2b is not a false-green.
func TestDPI2b_RegimeFlip_LiveInputs(t *testing.T) {
	const liveDeposit = 6.0 // > fed → positive spread → regime flips out of FII_OUTFLOW_RISK
	const liveFed = 4.0
	const liveYield = 7.0

	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: liveDeposit, fedFunds: liveFed, earnYield: liveYield},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	carrySpread, carryRegime, isEstimate := extractCarrySignal(t, resp)

	// --- anti-false-green assertions ---

	// 0. Not suppressed: both inputs are live (non-zero from port).
	if isEstimate {
		t.Errorf("DPI-2b AC-6: is_estimate=true — carry is suppressed when it should be live (deposit=6.0, fed=4.0 both non-zero)")
	}

	// 1. Spread must NOT be the frozen fixture value (−0.63).
	if abs(carrySpread-(-0.63)) < 0.01 {
		t.Errorf("DPI-2b AC-6 REGIME-FLIP FAIL: carrySpread = −0.63 (frozen fixture 4.7−5.33) — "+
			"live inputs NOT wired; this is the false-green the sprint is designed to prevent")
	}

	// 2. Spread must equal liveDeposit − liveFed = 6.0 − 4.0 = 2.0.
	const wantSpread = 2.0
	if abs(carrySpread-wantSpread) > 0.01 {
		t.Errorf("DPI-2b AC-6: carrySpread = %.4f, want %.2f (live %.1f − %.1f)", carrySpread, wantSpread, liveDeposit, liveFed)
	}

	// 3. Regime must NOT be FII_OUTFLOW_RISK (the frozen regime from −0.63).
	if carryRegime == "FII_OUTFLOW_RISK" {
		t.Errorf("DPI-2b AC-6 REGIME-FLIP FAIL: regime = FII_OUTFLOW_RISK — carry is still frozen; "+
			"with deposit=6.0 > fed=4.0, spread=+2.0 must produce NEUTRAL, not FII_OUTFLOW_RISK")
	}

	// 4. Regime must be NEUTRAL (spread 2.0 is in the 0.5–2.5 band).
	if carryRegime != "NEUTRAL" {
		t.Errorf("DPI-2b AC-6: carryRegime = %q, want NEUTRAL (spread 2.0 in [0.5, 2.5] NEUTRAL band)", carryRegime)
	}

	t.Logf("DPI-2b AC-6 REGIME-FLIP PROVEN: carrySpread %.2f (was frozen −0.63), regime %s (was FII_OUTFLOW_RISK)", carrySpread, carryRegime)
}

// ---------------------------------------------------------------------------
// DSI-INV-1 table-driven tests — liveness gate for carry/regime suppression
// ---------------------------------------------------------------------------

// TestDSIINV1_CarryLivenessGate is the table-driven proof of DSI-INV-1:
// carry is suppressed (regime=UNKNOWN, is_estimate=true) when fedFunds OR vndDeposit
// is zero (fixture fallback); real regime is emitted only when BOTH are live.
func TestDSIINV1_CarryLivenessGate(t *testing.T) {
	type tc struct {
		name             string
		vndDeposit       float64 // 0 = fixture fallback
		fedFunds         float64 // 0 = fixture fallback
		wantSuppressed   bool    // true = regime must be UNKNOWN, is_estimate=true
		wantRegimeNotFII bool    // when not suppressed, regime must not be FII_OUTFLOW_RISK from fixture arithmetic
	}

	tests := []tc{
		{
			name:           "both_live_NEUTRAL",
			vndDeposit:     6.0, // live > fixture 4.7
			fedFunds:       4.0, // live, distinct from fixture 5.33
			wantSuppressed: false,
		},
		{
			name:           "fedFunds_zero_suppressed",
			vndDeposit:     6.0, // live
			fedFunds:       0,   // zero = fixture fallback → suppress
			wantSuppressed: true,
		},
		{
			name:           "vndDeposit_zero_suppressed",
			vndDeposit:     0,   // zero = fixture fallback → suppress
			fedFunds:       4.0, // live
			wantSuppressed: true,
		},
		{
			name:           "both_zero_suppressed",
			vndDeposit:     0, // fixture fallback
			fedFunds:       0, // fixture fallback
			wantSuppressed: true,
		},
		{
			name:           "live_effr_3.62_suppressed_no_FII_OUTFLOW",
			vndDeposit:     5.0, // live (matches production sbv_rates)
			fedFunds:       3.62, // live EFFR (the stale-but-present FRED value)
			wantSuppressed: false,
			// carrySpread = 5.0 - 3.62 = 1.38 → NEUTRAL (not FII_OUTFLOW_RISK)
			wantRegimeNotFII: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := NewComputeMacroUseCase(
				newStubCommodity(),
				&stubSBVRate{},
				&stubMarketIndex{vnIndex: 1880.0},
				&stubCarryYieldInputs{vndDeposit: tt.vndDeposit, fedFunds: tt.fedFunds, earnYield: 8.2},
			)

			resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
			if err != nil {
				t.Fatalf("Execute() error: %v", err)
			}

			carrySpread, carryRegime, isEstimate := extractCarrySignal(t, resp)

			if tt.wantSuppressed {
				// DSI-INV-1: any zero input → suppress carry.
				if !isEstimate {
					t.Errorf("is_estimate=false, want true (any zero carry input must suppress)")
				}
				if carryRegime != "UNKNOWN" {
					t.Errorf("regime = %q, want UNKNOWN (suppressed per DSI-INV-1)", carryRegime)
				}
				if carrySpread != 0 {
					// extractCarrySignal returns 0 when carrySpread JSON is null.
					t.Errorf("carrySpread = %.4f, want 0 (null when suppressed)", carrySpread)
				}
				if resp.DataSource == "live" {
					t.Errorf("dataSource=%q, must not be 'live' when carry is suppressed", resp.DataSource)
				}
			} else {
				// Live inputs: carry must NOT be suppressed.
				if isEstimate {
					t.Errorf("is_estimate=true, want false (both inputs are live non-zero)")
				}
				if carryRegime == "UNKNOWN" {
					t.Errorf("regime = UNKNOWN but both inputs are live — must not be suppressed")
				}
				if tt.wantRegimeNotFII && carryRegime == "FII_OUTFLOW_RISK" {
					t.Errorf("regime = FII_OUTFLOW_RISK — want non-FII (spread = %.4f, inputs: vnd=%.2f fed=%.2f)",
						carrySpread, tt.vndDeposit, tt.fedFunds)
				}
			}
		})
	}
}

// TestDSIINV1_DataSourceLivenessGate verifies that dataSource="live" requires
// all five inputs (oil+gold+usdVnd+fedFunds+vndDeposit) to be live.
//
// When commodity sources are live but carry inputs are fixture, dataSource
// must be "estimate" (not "live").
func TestDSIINV1_DataSourceLivenessGate(t *testing.T) {
	// Commodities live, carry inputs zero (fixture) → dataSource must NOT be "live".
	ucEstimate := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    96.0,   // live
			"GOLD":   4480.0, // live
			"USDVND": 26150.0, // live
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: 0, fedFunds: 0, earnYield: 8.2}, // carry fixture
	)
	resp, err := ucEstimate.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}
	if resp.DataSource == "live" {
		t.Errorf("DSI-INV-1: dataSource=%q — must not be 'live' when carry inputs are fixture (fedFunds=0, vndDeposit=0)", resp.DataSource)
	}

	// All five inputs live → dataSource must be "live".
	ucLive := NewComputeMacroUseCase(
		&stubCommodityFetcher{prices: map[string]float64{
			"OIL":    96.0,
			"GOLD":   4480.0,
			"USDVND": 26150.0,
		}},
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: 5.0, fedFunds: 3.62, earnYield: 6.83}, // all live
	)
	respLive, err := ucLive.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}
	if respLive.DataSource != "live" {
		t.Errorf("DSI-INV-1: dataSource=%q, want 'live' when all five inputs are live", respLive.DataSource)
	}
}

// TestDSIINV1_CarryFetchedAtSourceNeverTimeNow verifies that fetched_at_source
// on the carry DTO comes from the port (FRED source date), not time.Now().
//
// When the port returns a known source date, it must appear on the DTO.
// When the port returns nil, fetched_at_source must be null (not a current timestamp).
func TestDSIINV1_CarryFetchedAtSourceNeverTimeNow(t *testing.T) {
	fredDate, _ := time.Parse(time.DateOnly, "2026-05-28")
	fredDateUTC := fredDate.UTC()

	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{
			vndDeposit:         5.0,
			fedFunds:           3.62,
			earnYield:          6.83,
			fedFundsSourceDate: &fredDateUTC, // simulate port returning FRED date
		},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// Extract fetched_at_source from carry DTO via JSON round-trip.
	type carryWithMeta struct {
		FetchedAtSource *time.Time `json:"fetched_at_source"`
	}
	b, _ := json.Marshal(resp.Signals.Carry)
	var m carryWithMeta
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal carry fetched_at_source: %v", err)
	}

	if m.FetchedAtSource == nil {
		t.Errorf("DSI-INV-1: fetched_at_source=nil but port returned %v — must propagate FRED source date", fredDateUTC)
	} else {
		if !m.FetchedAtSource.Equal(fredDateUTC) {
			t.Errorf("DSI-INV-1: fetched_at_source=%v, want %v (FRED date from port)", m.FetchedAtSource, fredDateUTC)
		}
	}

	// Verify it is NOT time.Now() (i.e. not within 1 second of current time if port returned a past date).
	now := time.Now().UTC()
	if m.FetchedAtSource != nil && m.FetchedAtSource.After(now.Add(-time.Second)) {
		t.Errorf("DSI-INV-1: fetched_at_source=%v looks like time.Now() — must use FRED source date, never time.Now()", m.FetchedAtSource)
	}
}

// ---------------------------------------------------------------------------
// FU-SBV-DEPOSIT-PROVENANCE-GO: source_tier=2 for live carry/yield
// ---------------------------------------------------------------------------

// extractSourceTierCarry extracts source_tier from resp.Signals.Carry via JSON.
func extractSourceTierCarry(t *testing.T, resp MacroSnapshotResponse) int {
	t.Helper()
	type carryMeta struct {
		SourceTier int `json:"source_tier"`
	}
	b, err := json.Marshal(resp.Signals.Carry)
	if err != nil {
		t.Fatalf("FU-SBV: marshal carry signal: %v", err)
	}
	var m carryMeta
	if err = json.Unmarshal(b, &m); err != nil {
		t.Fatalf("FU-SBV: unmarshal carry source_tier: %v", err)
	}
	return m.SourceTier
}

// extractSourceTierYield extracts source_tier from resp.Signals.Yield via JSON.
func extractSourceTierYield(t *testing.T, resp MacroSnapshotResponse) int {
	t.Helper()
	type yieldMeta struct {
		SourceTier int `json:"source_tier"`
	}
	b, err := json.Marshal(resp.Signals.Yield)
	if err != nil {
		t.Fatalf("FU-SBV: marshal yield signal: %v", err)
	}
	var m yieldMeta
	if err = json.Unmarshal(b, &m); err != nil {
		t.Fatalf("FU-SBV: unmarshal yield source_tier: %v", err)
	}
	return m.SourceTier
}

// TestDSIINV1_CarrySourceTierAdministeredRate verifies FU-SBV-DEPOSIT-PROVENANCE-GO:
//
//   - live (is_estimate=false) carry → SourceTier==2, NEVER 1, Regime preserved, CarrySpread non-nil.
//   - live yield → SourceTier==2, NEVER 1.
//   - fixture (is_estimate=true) carry → SourceTier==4, Regime=="UNKNOWN", CarrySpread==nil (unchanged).
//
// The SBV max deposit rate is an administered-published rate (tier:2), not exchange-direct (tier:1).
// Folding it into carry or yield computations caps the DTO source_tier at 2.
func TestDSIINV1_CarrySourceTierAdministeredRate(t *testing.T) {
	type tc struct {
		name           string
		vndDeposit     float64
		fedFunds       float64
		earnYield      float64
		wantCarryTier  int
		wantYieldTier  int
		wantEstimate   bool
		wantRegime     string // "" = don't check specific regime, just that it's not UNKNOWN
		wantSpreadNil  bool   // true = CarrySpread must be nil (suppressed)
	}

	tests := []tc{
		{
			name:          "live_inputs_tier2",
			vndDeposit:    5.0,
			fedFunds:      3.62,
			earnYield:     6.83,
			wantCarryTier: 2,
			wantYieldTier: 2,
			wantEstimate:  false,
			wantRegime:    "NEUTRAL", // spread=1.38 in NEUTRAL band
			wantSpreadNil: false,
		},
		{
			name:          "fixture_fallback_tier4",
			vndDeposit:    0, // zero → fixture fallback → is_estimate=true
			fedFunds:      0,
			earnYield:     0,
			wantCarryTier: 4,
			wantYieldTier: 4,
			wantEstimate:  true,
			wantRegime:    "UNKNOWN",
			wantSpreadNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			uc := NewComputeMacroUseCase(
				newStubCommodity(),
				&stubSBVRate{},
				&stubMarketIndex{vnIndex: 1880.0},
				&stubCarryYieldInputs{
					vndDeposit: tt.vndDeposit,
					fedFunds:   tt.fedFunds,
					earnYield:  tt.earnYield,
				},
			)

			resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
			if err != nil {
				t.Fatalf("Execute() error: %v", err)
			}

			// --- carry tier assertions ---
			carryTier := extractSourceTierCarry(t, resp)
			if carryTier == 1 {
				t.Errorf("FU-SBV carry: source_tier=1 (exchange-direct over-claim) — SBV deposit rate is administered (tier:2); must NEVER be 1")
			}
			if carryTier != tt.wantCarryTier {
				t.Errorf("FU-SBV carry: source_tier=%d, want %d", carryTier, tt.wantCarryTier)
			}

			// --- yield tier assertions ---
			yieldTier := extractSourceTierYield(t, resp)
			if yieldTier == 1 {
				t.Errorf("FU-SBV yield: source_tier=1 (exchange-direct over-claim) — SBV deposit rate folds into yield spread (EarningYield−DepositRate); must NEVER be 1")
			}
			if yieldTier != tt.wantYieldTier {
				t.Errorf("FU-SBV yield: source_tier=%d, want %d", yieldTier, tt.wantYieldTier)
			}

			// --- carry content assertions ---
			carrySpreadVal, carryRegime, isEstimate := extractCarrySignal(t, resp)

			if isEstimate != tt.wantEstimate {
				t.Errorf("FU-SBV carry: is_estimate=%v, want %v", isEstimate, tt.wantEstimate)
			}

			if tt.wantSpreadNil {
				// extractCarrySignal returns 0 when JSON is null (nil pointer).
				if carrySpreadVal != 0 {
					t.Errorf("FU-SBV carry: spread=%.4f, want null/nil (fixture path must suppress spread)", carrySpreadVal)
				}
			} else {
				if carrySpreadVal == 0 {
					t.Errorf("FU-SBV carry: spread=0/nil, want non-nil (live path must populate spread)")
				}
			}

			if tt.wantRegime == "UNKNOWN" {
				if carryRegime != "UNKNOWN" {
					t.Errorf("FU-SBV carry: regime=%q, want UNKNOWN (fixture fallback must suppress regime)", carryRegime)
				}
			} else if tt.wantRegime != "" {
				if carryRegime == "UNKNOWN" {
					t.Errorf("FU-SBV carry: regime=UNKNOWN but inputs are live — regime must not be suppressed")
				}
				if carryRegime != tt.wantRegime {
					t.Errorf("FU-SBV carry: regime=%q, want %q", carryRegime, tt.wantRegime)
				}
			}
		})
	}
}

// abs returns the absolute value of a float64.
// Defined locally (math.Abs exists but this avoids an import for a trivial helper).
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

// ---------------------------------------------------------------------------
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE: anti-fixture-value regression guard
// ---------------------------------------------------------------------------

// TestSingleSignalNoFixtureLeak is the explicit DSI-INV-1 regression guard for
// CARRY-YIELD-SINGLE-SIGNAL-FIXTURE: ensures that no live computation path
// produces the known fixture values (5.33/4.7 carry; 8.2/4.7 yield) when live
// port inputs are available. This test proves the fixture consts in the deleted
// handlers_carry.go/handlers_yield.go are permanently dead.
//
// If this test ever fails, the fixture values somehow re-entered a live path.
func TestSingleSignalNoFixtureLeak(t *testing.T) {
	// Inject live inputs distinct from all fixture values.
	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		&stubCarryYieldInputs{vndDeposit: 5.0, fedFunds: 3.62, earnYield: 6.83},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// Extract carry fields via JSON round-trip.
	type carryFields struct {
		FedFundsRate   float64  `json:"fedFundsRate"`
		VNDDepositRate float64  `json:"vndDepositRate"`
		CarrySpread    *float64 `json:"carrySpread"`
		IsEstimate     bool     `json:"is_estimate"`
		SourceTier     int      `json:"source_tier"`
	}
	b, _ := json.Marshal(resp.Signals.Carry)
	var cf carryFields
	if err := json.Unmarshal(b, &cf); err != nil {
		t.Fatalf("unmarshal carry: %v", err)
	}

	// DSI-INV-1: fixture rate 5.33 must NOT be served on live path.
	if abs(cf.FedFundsRate-5.33) < 0.001 {
		t.Errorf("ANTI-FIXTURE: carry fedFundsRate=5.33 — handlers_carry.go fixture const re-entered live path; must be 3.62 (live EFFR)")
	}
	// source_tier must not be 0 (absent/unset).
	if cf.SourceTier == 0 {
		t.Errorf("ANTI-FIXTURE: carry source_tier=0 (absent) — provenance field missing from carry DTO")
	}
	// is_estimate must be false for live inputs.
	if cf.IsEstimate {
		t.Errorf("ANTI-FIXTURE: carry is_estimate=true on live-input path — suppression fired incorrectly (vndDeposit=5.0, fedFunds=3.62 both live)")
	}

	// Extract yield fields via JSON round-trip.
	type yieldFields struct {
		EarningYield float64 `json:"earningYield"`
		DepositRate  float64 `json:"depositRate"`
		IsEstimate   bool    `json:"is_estimate"`
		SourceTier   int     `json:"source_tier"`
	}
	yb, _ := json.Marshal(resp.Signals.Yield)
	var yf yieldFields
	if err := json.Unmarshal(yb, &yf); err != nil {
		t.Fatalf("unmarshal yield: %v", err)
	}

	// DSI-INV-1: fixture earningYield 8.2 must NOT be served when live port returns 6.83.
	if abs(yf.EarningYield-8.2) < 0.001 {
		t.Errorf("ANTI-FIXTURE: yield earningYield=8.2 — handlers_yield.go fixture const re-entered live path; must be 6.83 (live port)")
	}
	if yf.SourceTier == 0 {
		t.Errorf("ANTI-FIXTURE: yield source_tier=0 (absent) — provenance field missing from yield DTO")
	}
}
