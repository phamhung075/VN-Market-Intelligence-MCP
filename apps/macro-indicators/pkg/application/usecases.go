// Package application — use-case orchestrators (application layer).
//
// P2-X3: Execute() implemented using the macro_signals module (6-primitive composition).
// Fixture mode: indicator inputs are baked-in constants (deterministic, R-1 compliant).
// No live HTTP calls are made from this layer — infrastructure adapters supply data
// to the use case via the domain ports, but for sandbox determinism the fixture
// values below are used when port values are unavailable (zero from ports).
//
// DPI-2b: CarryYieldInputsPort added — Execute() resolves VNDDepositRate, FedFundsRate,
// and EarningYield from live market.db rows via the port. The three fixture* consts
// below are NOW the documented safe-degrade fallbacks only (NOT primary values).
// They are kept explicitly — deleting + inlining a literal would re-create the hardcode.
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
//
// DPI-2b NOTE: fixtureVNDDepositRate, fixtureFedFundsRate, fixtureEarningYield
// are NOW safe-degrade fallbacks only — Execute() resolves each from live
// market.db rows via CarryYieldInputsPort first. Do NOT delete these consts;
// deleting + inlining a literal would silently re-hardcode the values.
// ---------------------------------------------------------------------------

const (
	fixtureVNIndex        = 1280.5  // VN-Index level
	fixtureOilUSD         = 82.5    // Brent crude USD/barrel (NEUTRAL band: 60–100)
	fixtureGoldUSD        = 2350.0  // XAU/USD (BULLISH: >2200)
	fixtureUSDVnd         = 24500.0 // USDVND spot (NEUTRAL band: 23000–25000)
	fixtureVNDDepositRate = 4.7     // SBV max deposit rate % — safe-degrade only (DPI-2b)
	fixtureFedFundsRate   = 5.33    // US Fed Funds effective rate % — safe-degrade only (DPI-2b)
	fixtureEarningYield   = 8.2     // VN equity earnings yield % — safe-degrade only (DPI-2b)
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
	carryYieldInputs domain.CarryYieldInputsPort // DPI-2b: live carry/yield regime inputs
}

// NewComputeMacroUseCase creates a new use case with injected ports.
// The composition root (cmd/server/main.go) is responsible for providing
// the concrete infrastructure adapters at startup.
// DPI-2b: carryYieldInputs port added — supplies live deposit/fed/earningYield from market.db.
func NewComputeMacroUseCase(
	cf domain.CommodityFetcherPort,
	sr domain.SBVRatePort,
	mi domain.MarketIndexPort,
	cy domain.CarryYieldInputsPort,
) *ComputeMacroUseCase {
	return &ComputeMacroUseCase{
		commodityFetcher: cf,
		sbvRate:          sr,
		marketIndex:      mi,
		carryYieldInputs: cy,
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

	// DPI-2b: Resolve carry/yield regime inputs from live market.db via port.
	// Each resolver calls the port; if port returns >0 (fresh row), use it;
	// else fall back to the fixture constant (safe-degrade, not hardcode).
	vndDeposit := resolveVNDDepositRate(ctx, uc)
	fedFunds := resolveFedFundsRate(ctx, uc)
	earnYield := resolveEarningYield(ctx, uc)

	// Build module input.
	input := ms.MacroSignalsInput{
		InvestmentClock: mic.InvestmentClockInput{IndicatorName: "VN_CPI"},
		OilImpact:       oil.OilImpactInput{PriceUSD: oilPrice},
		GoldDirection:   gld.GoldDirectionInput{PriceUSD: goldPrice},
		UsdVndDirection: uvnd.UsdVndDirectionInput{RateVND: usdVnd},
		CarryTrade: carry.CarryTradeInput{
			VNDDepositRate: vndDeposit,
			FedFundsRate:   fedFunds,
			ComputedAt:     computedAt,
		},
		YieldSpread: yld.YieldSpreadInput{
			EarningYield: earnYield,
			DepositRate:  vndDeposit,
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

// ---------------------------------------------------------------------------
// DPI-2b resolvers — live carry/yield inputs from CarryYieldInputsPort
// ---------------------------------------------------------------------------

// resolveVNDDepositRate fetches the SBV max deposit rate from CarryYieldInputsPort.
// Falls back to fixtureVNDDepositRate (4.7) when the port is nil, returns 0, or errors.
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveVNDDepositRate(ctx context.Context, uc *ComputeMacroUseCase) float64 {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetVNDDepositRate(ctx); err == nil && v > 0 {
			return v
		}
	}
	return fixtureVNDDepositRate
}

// resolveFedFundsRate fetches the EFFR from CarryYieldInputsPort.
// Falls back to fixtureFedFundsRate (5.33) when the port is nil, returns 0, or errors.
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveFedFundsRate(ctx context.Context, uc *ComputeMacroUseCase) float64 {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetFedFundsRate(ctx); err == nil && v > 0 {
			return v
		}
	}
	return fixtureFedFundsRate
}

// resolveEarningYield fetches the VN equity earnings yield from CarryYieldInputsPort.
// Falls back to fixtureEarningYield (8.2) when the port is nil, returns 0, or errors.
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveEarningYield(ctx context.Context, uc *ComputeMacroUseCase) float64 {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetEarningYield(ctx); err == nil && v > 0 {
			return v
		}
	}
	return fixtureEarningYield
}

// ---------------------------------------------------------------------------
// resolveMarketPrices — commodity prices from CommodityFetcherPort
// ---------------------------------------------------------------------------

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
