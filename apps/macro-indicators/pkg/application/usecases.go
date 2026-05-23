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

// fixtureComputedAt is the deterministic timestamp injected into carry/yield primitives.
// Using a fixed string satisfies R-1 (no time.Now() in primitive computation).
const fixtureComputedAt = "2026-05-23T00:00:00Z"

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
}

// NewComputeMacroUseCase creates a new use case with injected ports.
// The composition root (cmd/server/main.go) is responsible for providing
// the concrete infrastructure adapters at startup.
func NewComputeMacroUseCase(
	cf domain.CommodityFetcherPort,
	sr domain.SBVRatePort,
) *ComputeMacroUseCase {
	return &ComputeMacroUseCase{
		commodityFetcher: cf,
		sbvRate:          sr,
	}
}

// Execute runs the macro snapshot computation using the 6-primitive module composition.
//
// Fixture mode (P2-X3): prices are fetched from the commodity port; if the port
// returns zero or an error the fixture defaults are used instead. This keeps the
// sandbox deterministic while leaving room for real adapters post-pilot.
//
// R-1 compliant: no random seeding, no time.Now() in any primitive call.
// Fence-B compliant: module imports only primitives (BuildMacroSignals satisfies this).
func (uc *ComputeMacroUseCase) Execute(
	ctx context.Context,
	_ MacroSnapshotRequest,
) (MacroSnapshotResponse, error) {
	// Resolve prices via port; fall back to fixture defaults on zero/error.
	oilPrice, goldPrice, usdVnd := resolveMarketPrices(ctx, uc)

	// Build module input with fixture-stable timestamps (R-1).
	input := ms.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
		OilImpact:       oil.OilImpactInput{PriceUSD: oilPrice},
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: goldPrice},
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: usdVnd},
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: fixtureVNDDepositRate,
			FedFundsRate:   fixtureFedFundsRate,
			ComputedAt:     fixtureComputedAt,
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: fixtureEarningYield,
			DepositRate:  fixtureVNDDepositRate,
			ComputedAt:   fixtureComputedAt,
		},
	}

	// Wire concrete primitive (via interface) + call module composition.
	sigs := ms.New(&concreteClock{})
	out := sigs.BuildMacroSignals(input)

	fetchedAt := time.Now().UTC()

	return MacroSnapshotResponse{
		Status:  "ok",
		VNIndex: fixtureVNIndex,
		OilUSD:  oilPrice,
		GoldUSD: goldPrice,
		USDVnd:  usdVnd,
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

// resolveMarketPrices fetches commodity prices from the port; uses fixture defaults on failure.
// This function is a pure helper — no side effects beyond the port call.
func resolveMarketPrices(ctx context.Context, uc *ComputeMacroUseCase) (oilPrice, goldPrice, usdVnd float64) {
	oilPrice = fixtureOilUSD
	goldPrice = fixtureGoldUSD
	usdVnd = fixtureUSDVnd

	if uc.commodityFetcher != nil {
		prices, err := uc.commodityFetcher.FetchPrices(ctx, []string{"OIL", "GOLD", "USDVND"})
		if err == nil {
			if v, ok := prices["OIL"]; ok && v > 0 {
				oilPrice = v
			}
			if v, ok := prices["GOLD"]; ok && v > 0 {
				goldPrice = v
			}
			if v, ok := prices["USDVND"]; ok && v > 0 {
				usdVnd = v
			}
		}
	}
	return
}
