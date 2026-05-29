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
type stubCarryYieldInputs struct {
	vndDeposit float64
	fedFunds   float64
	earnYield  float64
}

func (s *stubCarryYieldInputs) GetVNDDepositRate(_ context.Context) (float64, error) {
	return s.vndDeposit, nil
}
func (s *stubCarryYieldInputs) GetFedFundsRate(_ context.Context) (float64, error) {
	return s.fedFunds, nil
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
// Returns (carrySpread, regime) from resp.Signals.Carry.
func extractCarrySignal(t *testing.T, resp MacroSnapshotResponse) (float64, string) {
	t.Helper()
	type carryFields struct {
		CarrySpread float64 `json:"carrySpread"`
		Regime      string  `json:"regime"`
	}
	b, err := json.Marshal(resp.Signals.Carry)
	if err != nil {
		t.Fatalf("DPI-2b: marshal carry signal: %v", err)
	}
	var f carryFields
	if err = json.Unmarshal(b, &f); err != nil {
		t.Fatalf("DPI-2b: unmarshal carry signal: %v", err)
	}
	return f.CarrySpread, f.Regime
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
		&stubCarryYieldInputs{vndDeposit: liveDeposit, fedFunds: 5.33, earnYield: 8.2},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// carrySpread = liveDeposit − fedFunds = 6.0 − 5.33 = 0.67 (NEUTRAL, not frozen −0.63)
	carrySpread, _ := extractCarrySignal(t, resp)
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
		&stubCarryYieldInputs{vndDeposit: 4.7, fedFunds: liveFed, earnYield: 8.2},
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error: %v", err)
	}

	// carrySpread = 4.7 − 4.0 = 0.70 (NEUTRAL); frozen would give 4.7 − 5.33 = −0.63
	carrySpread, _ := extractCarrySignal(t, resp)
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
// constants and does not error or panic.
//
// Behavior: port returns 0 → resolvers detect v==0 → fixtures (4.7/5.33/8.2) apply.
// carrySpread = fixtureVNDDepositRate − fixtureFedFundsRate = 4.7 − 5.33 = −0.63.
// This is CORRECT safe-degrade: fixture values propagate, not panic, not zero.
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

	// Zero port values → resolvers return fixture constants (4.7/5.33/8.2).
	// carrySpread = fixture 4.7 − fixture 5.33 = −0.63 (FII_OUTFLOW_RISK).
	// This verifies safe-degrade fires exactly (no panic, fixture used as fallback).
	carrySpread, carryRegime := extractCarrySignal(t, resp)
	const frozenSpread = -0.63
	if abs(carrySpread-frozenSpread) > 0.01 {
		t.Errorf("DPI-2b AC-4: carrySpread = %.4f, want %.2f (zero port → fixtures 4.7−5.33=−0.63 must apply)", carrySpread, frozenSpread)
	}
	// Regime must be FII_OUTFLOW_RISK (spread −0.63 < OutflowRiskThreshold 0.5).
	if carryRegime != "FII_OUTFLOW_RISK" {
		t.Errorf("DPI-2b AC-4: regime = %q, want FII_OUTFLOW_RISK (fixture safe-degrade path)", carryRegime)
	}
}

// TestDPI2b_SafeDegrade_NilPort (AC-4 nil) verifies that a nil CarryYieldInputsPort
// causes Execute() to use fixture constants — no panic.
func TestDPI2b_SafeDegrade_NilPort(t *testing.T) {
	uc := NewComputeMacroUseCase(
		newStubCommodity(),
		&stubSBVRate{},
		&stubMarketIndex{vnIndex: 1880.0},
		nil, // nil port → resolvers return fixture constants
	)

	resp, err := uc.Execute(context.Background(), MacroSnapshotRequest{})
	if err != nil {
		t.Fatalf("Execute() error on nil port: %v", err)
	}

	// With nil port, fixtures (4.7/5.33/8.2) are used.
	// carrySpread = 4.7 − 5.33 = −0.63 → FII_OUTFLOW_RISK (the "frozen" regime).
	// This confirms the fixture fallback path activates exactly when expected.
	carrySpread, carryRegime := extractCarrySignal(t, resp)
	if abs(carrySpread-(-0.63)) > 0.01 {
		t.Errorf("DPI-2b AC-4 nil: carrySpread = %.4f, want −0.63 (fixture fallback 4.7−5.33)", carrySpread)
	}
	if carryRegime != "FII_OUTFLOW_RISK" {
		t.Errorf("DPI-2b AC-4 nil: carryRegime = %q, want FII_OUTFLOW_RISK (fixture path)", carryRegime)
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

	carrySpread, carryRegime := extractCarrySignal(t, resp)

	// --- anti-false-green assertions ---

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

// abs returns the absolute value of a float64.
// Defined locally (math.Abs exists but this avoids an import for a trivial helper).
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
