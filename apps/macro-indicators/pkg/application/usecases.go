// Package application — use-case orchestrators (application layer).
//
// P2-X3: Execute() implemented using the macro_signals module (6-primitive composition).
// Fixture mode: indicator inputs are baked-in constants (deterministic, R-1 compliant).
// No live HTTP calls are made from this layer — infrastructure adapters supply data
// to the use case via the domain ports, but for sandbox determinism the fixture
// values below are used when port values are unavailable (zero from ports).
//
// Fence-C note: only cmd/server/main.go imports pkg/infrastructure.
// This package imports only pkg/module and pkg/primitive (via module types).
package application

import (
	"context"
	"time"

	mic "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_investment_clock"
	oil "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_oil_impact_classifier"
	gld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_gold_direction_classifier"
	uvnd "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier"
	carry "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_carry_trade_signal"
	yld "github.com/vn-market-intelligence/macro-indicators/pkg/primitive/macro_yield_spread_signal"
	ms "github.com/vn-market-intelligence/macro-indicators/pkg/module/macro_signals"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Fixture defaults (sandbox-deterministic, R-1 compliant)
// These represent plausible VN macro indicator values for fixture/demo mode.
// ---------------------------------------------------------------------------

const (
	fixtureVNIndex       = 1280.5  // VN-Index level
	fixtureOilUSD        = 82.5    // Brent crude USD/barrel (NEUTRAL band: 60–100)
	fixtureGoldUSD       = 2350.0  // XAU/USD (BULLISH: >2200)
	fixtureUSDVnd        = 24500.0 // USDVND spot (NEUTRAL band: 23000–25000)
	fixtureVNDDepositRate = 4.7    // SBV max deposit rate %
	fixtureFedFundsRate  = 5.33    // US Fed Funds effective rate %
	fixtureEarningYield  = 8.2     // VN equity earnings yield %
)

// ---------------------------------------------------------------------------
// concreteClock — satisfies macro_signals.Classifier interface using pkg/primitive
// ---------------------------------------------------------------------------

type concreteClock struct{}

func (c *concreteClock) Classify(input mic.InvestmentClockInput) mic.InvestmentClockOutput {
	return mic.Classify(input)
}

// ---------------------------------------------------------------------------
// ComputeMacroUseCase
// ---------------------------------------------------------------------------

// ComputeMacroUseCase orchestrates macro snapshot computation.
// Depends on domain ports; never imports infrastructure or interface packages directly.
type ComputeMacroUseCase struct {
	commodityFetcher domain.CommodityFetcherPort
	sbvRate          domain.SBVRatePort
	marketIndex      domain.MarketIndexPort
}

// NewComputeMacroUseCase creates a new use case with injected ports.
// The composition root (cmd/server/main.go) is responsible for providing
// the concrete infrastructure adapters at startup.
func NewComputeMacroUseCase(
	cf domain.CommodityFetcherPort,
	sr domain.SBVRatePort,
	mi domain.MarketIndexPort,
) *ComputeMacroUseCase {
	return &ComputeMacroUseCase{
		commodityFetcher: cf,
		sbvRate:          sr,
		marketIndex:      mi,
	}
}

// Execute runs the macro snapshot computation using the 6-primitive module composition.
//
// VNIndex is resolved from MarketIndexPort.FetchVNIndex(); falls back to
// fixtureVNIndex only when the port returns zero (no data yet in market.db).
// Commodity prices (oil/gold/usdvnd) are resolved via CommodityFetcherPort.
// USDVND is then overridden by SBVRatePort if it returns a positive value (DPI-1).
// carry.computedAt and yield.computedAt reflect the actual Execute() call time (DPI-2).
//
// R-1 compliant: no random seeding. time.Now() is used only for the computedAt
// timestamp label (not as input to any primitive classifier decision).
// Fence-B compliant: module imports only primitives (BuildMacroSignals satisfies this).
func (uc *ComputeMacroUseCase) Execute(
	ctx context.Context,
	_ MacroSnapshotRequest,
) (MacroSnapshotResponse, error) {
	// DPI-2: computedAt reflects the actual recompute time, not a frozen constant.
	computedAt := time.Now().UTC().Format(time.RFC3339)

	// Resolve VN-Index from port; fall back to fixture default if port returns zero.
	vnIndex := resolveVNIndex(ctx, uc)

	// Resolve commodity prices via port; fall back to fixture defaults on zero/error.
	oilPrice, goldPrice, usdVnd, allLive := resolveMarketPrices(ctx, uc)

	// DPI-1: SBV official USDVND takes priority over Yahoo Finance value.
	// If sbvRate port returns a positive value, replace usdVnd (preserves OIL/GOLD).
	// Safe-degrade: if sbv_rates is empty or stale, GetRate returns (0, nil) and
	// usdVnd keeps the commodity/fixture value. No error, no panic.
	if uc.sbvRate != nil {
		if r, err := uc.sbvRate.GetRate(ctx, "USD", "VND"); err == nil && r > 0 {
			usdVnd = r
		}
	}

	// Build module input.
	input := ms.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
		OilImpact:       oil.OilImpactInput{PriceUSD: oilPrice},
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: goldPrice},
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: usdVnd},
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: fixtureVNDDepositRate,
			FedFundsRate:   fixtureFedFundsRate,
			ComputedAt:     computedAt,
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: fixtureEarningYield,
			DepositRate:  fixtureVNDDepositRate,
			ComputedAt:   computedAt,
		},
	}

	// Wire concrete primitive (via interface) + call module composition.
	sigs := ms.New(&concreteClock{})
	out := sigs.BuildMacroSignals(input)

	fetchedAt := time.Now().UTC()

	// DataSource: "live" when all three commodity values came from the port (>0),
	// "fixture" when any value fell back to fixture defaults.
	dataSource := "fixture"
	if allLive {
		dataSource = "live"
	}

	return MacroSnapshotResponse{
		Status:     "ok",
		VNIndex:    vnIndex,
		OilUSD:     oilPrice,
		GoldUSD:    goldPrice,
		USDVnd:     usdVnd,
		DataSource: dataSource,
		Signals: SignalResult{
			InvestmentClock: out.InvestmentClock,
			Oil:             out.OilImpact,
			Gold:            out.GoldDirection,
			UsdVnd:          out.UsdVndDirection,
			Carry:           out.CarryTrade,
			Yield:           out.YieldSpread,
		},
		FetchedAt: fetchedAt,
	}, nil
}

// resolveVNIndex fetches the VN-Index level from MarketIndexPort.
// Falls back to fixtureVNIndex when the port is nil, returns 0, or errors.
// This ensures live data is used when the DB is populated while keeping the
// sandbox deterministic when no market data is available.
func resolveVNIndex(ctx context.Context, uc *ComputeMacroUseCase) float64 {
	if uc.marketIndex != nil {
		v, err := uc.marketIndex.FetchVNIndex(ctx)
		if err == nil && v > 0 {
			return v
		}
	}
	return fixtureVNIndex
}

// resolveMarketPrices fetches commodity prices from the port; uses fixture defaults on failure.
// Returns (oilPrice, goldPrice, usdVnd, allLive) where allLive is true when all three
// values came from the live port (non-zero), enabling the DataSource field to be set.
// This function is a pure helper — no side effects beyond the port call.
func resolveMarketPrices(ctx context.Context, uc *ComputeMacroUseCase) (oilPrice, goldPrice, usdVnd float64, allLive bool) {
	oilPrice = fixtureOilUSD
	goldPrice = fixtureGoldUSD
	usdVnd = fixtureUSDVnd

	oilLive, goldLive, usdVndLive := false, false, false

	if uc.commodityFetcher != nil {
		prices, err := uc.commodityFetcher.FetchPrices(ctx, []string{"OIL", "GOLD", "USDVND"})
		if err == nil {
			if v, ok := prices["OIL"]; ok && v > 0 {
				oilPrice = v
				oilLive = true
			}
			if v, ok := prices["GOLD"]; ok && v > 0 {
				goldPrice = v
				goldLive = true
			}
			if v, ok := prices["USDVND"]; ok && v > 0 {
				usdVnd = v
				usdVndLive = true
			}
		}
	}
	allLive = oilLive && goldLive && usdVndLive
	return
}
