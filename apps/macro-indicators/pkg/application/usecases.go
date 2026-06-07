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
// DSI-INV-1: Execute() now tracks per-input liveness (live vs fixture/estimate).
// When fedFunds or vndDeposit falls back to fixture, the carry signal is suppressed
// to regime="UNKNOWN" with carrySpread=null and is_estimate=true/source_tier=4.
// dataSource="live" is only set when ALL five inputs (oil, gold, usdVnd, fedFunds,
// vndDeposit) are live. fetched_at_source on carry = FRED MAX(date), never time.Now().
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
// DSI-INV-1: per-input liveness is tracked. Carry signal is suppressed to
// regime="UNKNOWN"/carrySpread=null/is_estimate=true when fedFunds or vndDeposit
// falls back to fixture. dataSource="live" requires all five inputs to be live.
// fetched_at_source on carry is the FRED MAX(date), never time.Now().
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
	// FDA-2: track liveness for per-field provenance (VNIndexIsEstimate / VNIndexSourceTier).
	vnIndex, vnIndexLive := resolveVNIndex(ctx, uc)

	// U4: Resolve prev-session VN-Index for delta + direction computation.
	// Returns nil when < 2 rows exist (safe-degrade → computeDelta returns nil/"unknown").
	prevVnIndex := resolvePrevSessionVnIndex(ctx, uc)

	// Resolve commodity prices via port; fall back to fixture defaults on zero/error.
	// FDA-2: per-field liveness flags for OilIsEstimate/GoldIsEstimate/USDVndIsEstimate.
	oilPrice, goldPrice, usdVnd, oilLive, goldLive, usdVndLive := resolveMarketPrices(ctx, uc)
	allCommodityLive := oilLive && goldLive && usdVndLive

	// DPI-1: SBV official USDVND takes priority over Yahoo Finance value.
	// If sbvRate port returns a positive value, replace usdVnd (preserves OIL/GOLD).
	// Safe-degrade: if sbv_rates is empty or stale, GetRate returns (0, nil) and
	// usdVnd keeps the commodity/fixture value. No error, no panic.
	if uc.sbvRate != nil {
		if r, err := uc.sbvRate.GetRate(ctx, "USD", "VND"); err == nil && r > 0 {
			usdVnd = r
		}
	}

	// DSI-INV-1: Resolve carry/yield regime inputs with per-input liveness tracking.
	// isLive=true means the port returned a fresh DB value; false means fixture fallback.
	vndDeposit, vndDepositLive := resolveVNDDepositRate(ctx, uc)
	fedFunds, fedFundsLive := resolveFedFundsRate(ctx, uc)
	earnYield, earnYieldLive := resolveEarningYield(ctx, uc)

	// DSI-INV-1: Fetch the FRED source date for carry DTO provenance.
	// NEVER use time.Now() on the fallback path — use the actual FRED MAX(date).
	var fedFundsSourceDate *time.Time
	if uc.carryYieldInputs != nil {
		fedFundsSourceDate, _ = uc.carryYieldInputs.GetFedFundsSourceDate(ctx)
	}

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

	// DSI-INV-1: dataSource="live" ONLY when all five inputs are live.
	// Commodity (oil+gold+usdVnd) AND fedFunds AND vndDeposit must all be non-fixture.
	carryInputsLive := fedFundsLive && vndDepositLive
	dataSource := "estimate"
	if allCommodityLive && carryInputsLive {
		dataSource = "live"
	}

	// FDA-3: honest FetchedAt — only stamp time.Now() when at least one live source
	// contributed. On all-fixture path (no live port data), use zero time to avoid
	// fresh-stamping non-fresh data.
	anyLive := vnIndexLive || oilLive || goldLive || usdVndLive || carryInputsLive
	var fetchedAt time.Time
	if anyLive {
		fetchedAt = time.Now().UTC()
	}

	// DSI-INV-1: Build carry DTO with provenance metadata.
	// When any carry input is a fixture fallback, suppress the actionable regime:
	// emit regime="UNKNOWN", carrySpread=null, is_estimate=true, source_tier=4.
	carryEstimate := !carryInputsLive
	carryDTO := buildCarryDTO(out.CarryTrade, carryEstimate, fedFundsSourceDate)

	// DSI-INV-1: Build yield DTO with provenance metadata.
	// earnYield and vndDeposit are both needed for a live yield signal.
	yieldEstimate := !earnYieldLive || !vndDepositLive
	yieldDTO := buildYieldDTO(out.YieldSpread, yieldEstimate)

	// FDA-2: per-field source tiers.
	// Live commodity sources are exchange-direct (tier:1); SBV USDVND override is tier:2
	// but we track the commodity path here (SBV override is post-resolve, not tracked
	// per-field). Fixture fallback is always tier:4.
	const tierLive = 1
	const tierFixture = 4

	vnIndexTier := tierFixture
	if vnIndexLive {
		vnIndexTier = tierLive
	}
	oilTier := tierFixture
	if oilLive {
		oilTier = tierLive
	}
	goldTier := tierFixture
	if goldLive {
		goldTier = tierLive
	}
	usdVndTier := tierFixture
	if usdVndLive {
		usdVndTier = tierLive
	}

	// U4: Compute direction+delta for all 4 headline values.
	// VnIndex: uses prev-session close from daily_ohlcv (nil when < 2 rows → unknown).
	// Oil/Gold/UsdVnd: no prev-session history persisted → always (nil, "unknown").
	vnIndexDelta, vnIndexDirection := computeDelta(vnIndex, prevVnIndex)
	var (
		oilDelta      *float64 = nil // no history; never fabricate
		oilDirection           = "unknown"
		goldDelta     *float64 = nil // no history; never fabricate
		goldDirection          = "unknown"
		usdVndDelta   *float64 = nil // no history; never fabricate
		usdVndDirection        = "unknown"
	)

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
			Carry:           carryDTO,
			Yield:           yieldDTO,
		},
		FetchedAt:         fetchedAt,
		VNIndexIsEstimate: !vnIndexLive,
		VNIndexSourceTier: vnIndexTier,
		OilIsEstimate:     !oilLive,
		OilSourceTier:     oilTier,
		GoldIsEstimate:    !goldLive,
		GoldSourceTier:    goldTier,
		USDVndIsEstimate:  !usdVndLive,
		USDVndSourceTier:  usdVndTier,
		// U4: direction+delta (additive fields)
		VNIndexDelta:    vnIndexDelta,
		VNIndexDirection: vnIndexDirection,
		OilUSDDelta:     oilDelta,
		OilUSDDirection: oilDirection,
		GoldUSDDelta:    goldDelta,
		GoldUSDDirection: goldDirection,
		USDVndDelta:     usdVndDelta,
		USDVndDirection: usdVndDirection,
	}, nil
}

// buildCarryDTO wraps a carry.CarryTradeOutput with DSI-INV-1 provenance metadata.
//
// When isEstimate=true (any carry input fell back to fixture), the regime is
// suppressed to "UNKNOWN" and carrySpread is nil (omitted from JSON), preventing
// fixture arithmetic from being served as actionable "FII_OUTFLOW_RISK".
//
// fetchedAtSource is the FRED MAX(date) — nil when unavailable. Never time.Now().
func buildCarryDTO(
	pOut carry.CarryTradeOutput,
	isEstimate bool,
	fetchedAtSource *time.Time,
) CarrySignalDTO {
	sourceTier := 2 // administered SBV deposit rate folds in → tier:2 (administered-published, not exchange-direct) per DSI-INV-1 / FU-SBV-DEPOSIT-PROVENANCE-GO
	if isEstimate {
		sourceTier = 4 // fixture
	}

	if isEstimate {
		return CarrySignalDTO{
			Regime:          "UNKNOWN",
			CarrySpread:     nil, // suppressed — do not emit fixture arithmetic as actionable regime
			VNDDepositRate:  pOut.VNDDepositRate,
			FedFundsRate:    pOut.FedFundsRate,
			Reasoning:       "Carry inputs unavailable — one or more rates are estimated from fixture fallback; regime suppressed per DSI-INV-1",
			ComputedAt:      pOut.ComputedAt,
			IsEstimate:      true,
			SourceTier:      sourceTier,
			FetchedAtSource: fetchedAtSource,
		}
	}

	spread := pOut.CarrySpread
	return CarrySignalDTO{
		Regime:          pOut.Regime,
		CarrySpread:     &spread,
		VNDDepositRate:  pOut.VNDDepositRate,
		FedFundsRate:    pOut.FedFundsRate,
		Reasoning:       pOut.Reasoning,
		ComputedAt:      pOut.ComputedAt,
		IsEstimate:      false,
		SourceTier:      sourceTier,
		FetchedAtSource: fetchedAtSource,
	}
}

// buildYieldDTO wraps a yld.YieldSpreadOutput with DSI-INV-1 provenance metadata.
//
// Unlike carry, yield is not suppressed when inputs are estimated — the label
// (CHEAP/FAIRLY_VALUED/EXPENSIVE) is still surfaced, but is_estimate=true and
// source_tier=4 signal to callers that the result is based on fixture inputs.
func buildYieldDTO(
	pOut yld.YieldSpreadOutput,
	isEstimate bool,
) YieldSignalDTO {
	sourceTier := 2 // administered SBV deposit rate folds in → tier:2 (administered-published, not exchange-direct) per DSI-INV-1 / FU-SBV-DEPOSIT-PROVENANCE-GO
	if isEstimate {
		sourceTier = 4
	}

	return YieldSignalDTO{
		Label:        pOut.Label,
		Spread:       pOut.Spread,
		EarningYield: pOut.EarningYield,
		DepositRate:  pOut.DepositRate,
		Reasoning:    pOut.Reasoning,
		ComputedAt:   pOut.ComputedAt,
		IsEstimate:   isEstimate,
		SourceTier:   sourceTier,
	}
}

// resolveVNIndex fetches the VN-Index level from MarketIndexPort.
// Falls back to fixtureVNIndex when the port is nil, returns 0, or errors.
// Returns (value, isLive) where isLive=true means the port returned a live value.
//
// FDA-2: returns liveness flag so Execute() can populate VNIndexIsEstimate / VNIndexSourceTier.
func resolveVNIndex(ctx context.Context, uc *ComputeMacroUseCase) (float64, bool) {
	if uc.marketIndex != nil {
		v, err := uc.marketIndex.FetchVNIndex(ctx)
		if err == nil && v > 0 {
			return v, true
		}
	}
	return fixtureVNIndex, false
}

// resolvePrevSessionVnIndex fetches the second-most-recent VN-Index close from
// MarketIndexPort.FetchPrevSessionVnIndex (daily_ohlcv, OFFSET 1).
// Returns nil when the port is nil, errors, or returns nil (< 2 rows safe-degrade).
// U4: used by Execute() to compute VnIndex prev_session_delta + direction.
func resolvePrevSessionVnIndex(ctx context.Context, uc *ComputeMacroUseCase) *float64 {
	if uc.marketIndex != nil {
		prev, err := uc.marketIndex.FetchPrevSessionVnIndex(ctx)
		if err == nil && prev != nil {
			return prev
		}
	}
	return nil
}

// computeDelta computes the signed point delta and direction string for a price field.
//
// Direction enum: "up" | "down" | "flat" | "unknown".
// "flat" is returned when |delta/current| < flatThreshold (0.1% — ARCH-DEFERRED: tunable).
// "unknown" is returned when prev is nil (no history available).
//
// Safe: returns (nil, "unknown") when prev is nil.
// U4: covers all 4 headline values; oil/gold/usdVnd always pass nil → (nil, "unknown").
func computeDelta(current float64, prev *float64) (*float64, string) {
	if prev == nil {
		return nil, "unknown"
	}
	delta := current - *prev
	// flatThreshold: 0.1% of current price.
	// Architect-deferred: threshold tunable in a future sprint (ARCH-U4-2 risk).
	const flatThresholdPct = 0.001
	var direction string
	switch {
	case current > 0 && delta/current > flatThresholdPct:
		direction = "up"
	case current > 0 && delta/current < -flatThresholdPct:
		direction = "down"
	default:
		direction = "flat"
	}
	return &delta, direction
}

// ---------------------------------------------------------------------------
// DSI-INV-1 resolvers — live carry/yield inputs from CarryYieldInputsPort
// Each resolver returns (value, isLive) where isLive=true means the port
// returned a fresh DB value. isLive=false means fixture fallback fired.
// ---------------------------------------------------------------------------

// resolveVNDDepositRate fetches the SBV max deposit rate from CarryYieldInputsPort.
// Returns (value, isLive). Falls back to fixtureVNDDepositRate (4.7) with isLive=false
// when the port is nil, returns 0, or errors.
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveVNDDepositRate(ctx context.Context, uc *ComputeMacroUseCase) (float64, bool) {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetVNDDepositRate(ctx); err == nil && v > 0 {
			return v, true
		}
	}
	return fixtureVNDDepositRate, false
}

// resolveFedFundsRate fetches the EFFR from CarryYieldInputsPort.
// Returns (value, isLive). Falls back to fixtureFedFundsRate (5.33) with isLive=false
// when the port is nil, returns 0, or errors (including staleness rejection).
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveFedFundsRate(ctx context.Context, uc *ComputeMacroUseCase) (float64, bool) {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetFedFundsRate(ctx); err == nil && v > 0 {
			return v, true
		}
	}
	return fixtureFedFundsRate, false
}

// resolveEarningYield fetches the VN equity earnings yield from CarryYieldInputsPort.
// Returns (value, isLive). Falls back to fixtureEarningYield (8.2) with isLive=false
// when the port is nil, returns 0, or errors.
// Safe-degrade: port contract guarantees (0, nil) on absent/stale rows.
func resolveEarningYield(ctx context.Context, uc *ComputeMacroUseCase) (float64, bool) {
	if uc.carryYieldInputs != nil {
		if v, err := uc.carryYieldInputs.GetEarningYield(ctx); err == nil && v > 0 {
			return v, true
		}
	}
	return fixtureEarningYield, false
}

// ---------------------------------------------------------------------------
// resolveMarketPrices — commodity prices from CommodityFetcherPort
// ---------------------------------------------------------------------------

// resolveMarketPrices fetches commodity prices from the port; uses fixture defaults on failure.
// Returns (oilPrice, goldPrice, usdVnd, oilLive, goldLive, usdVndLive) where each *Live flag
// is true when the corresponding value came from the live port (non-zero), enabling per-field
// provenance tracking (FDA-2).
//
// allCommodityLive (used for DataSource logic) is oilLive && goldLive && usdVndLive.
// This function is a pure helper — no side effects beyond the port call.
func resolveMarketPrices(ctx context.Context, uc *ComputeMacroUseCase) (oilPrice, goldPrice, usdVnd float64, oilLive, goldLive, usdVndLive bool) {
	oilPrice = fixtureOilUSD
	goldPrice = fixtureGoldUSD
	usdVnd = fixtureUSDVnd

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
	return
}
