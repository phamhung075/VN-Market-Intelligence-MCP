// Package application — unit tests for ComputeMacroUseCase.
//
// Seed-data-leak detector: verifies that VNIndex in the snapshot response is
// sourced from the MarketIndexPort when the port returns a non-zero value,
// NOT from the fixture constant (1280.5).
//
// If this test fails it means the use case is leaking the fixture/seed value
// instead of wiring through the live data port.
package application

import (
	"context"
	"testing"
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
