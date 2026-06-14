// Package application — liquidity-state use case for VMT-5a (POST /liquidity-state).
//
// Orchestrates three blocs:
//  1. policy_rates: PolicyRatesProvider.Fetch() → SBV HTML parse (direct, no VPS proxy).
//     Falls back to DB when HTML parse fails. is_estimate=true on fallback.
//  2. sjc_gold_gap: SJCFXProvider.FetchInputs() → domain.ComputeSJCGoldGap().
//     Pure DB reads — no new crawl (DD-7). is_estimate=true when SJC absent from DB.
//  3. fx_coupling: same SJCFXProvider.FetchInputs() → domain.BuildFXCoupling().
//     DB reads from sbv_rates + commodity_prices.
//  4. irs: domain.BuildIRSField() — always is_estimate=true (DD-6 PERMANENT).
//
// INVARIANT (fail-closed): IRS.IsEstimate MUST be true on ALL paths including error paths.
// This is enforced in errorLiquidityResponse AND in Execute(). NEVER flip to false.
// Same pattern as VMT-1b bloc_split + VMT-4 CPI WeightsIsEstimate.
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
// PolicyRatesProvider and SJCFXProvider are injected via interfaces.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// liquiditySource is the provenance label for liquidity-state responses.
const liquiditySource = "SBV HTML (policy_rates) + market.db reads (sjc_gap + fx_coupling)"

// PolicyRatesProvider is the interface for fetching SBV key policy rates.
// Implemented by a composition-root adapter (cmd/server/main.go, Fence-C compliant).
// Returns domain.PolicyRates — the application layer adapts to DTO.
type PolicyRatesProvider interface {
	// FetchPolicyRates fetches the three SBV key policy rates.
	// Returns a domain.PolicyRates struct. On failure, returns partial values
	// with IsEstimate=true (fallback from DB or safe-degrade).
	FetchPolicyRates(ctx context.Context) (domain.PolicyRates, error)
}

// SJCFXProvider is the interface for reading SJC gold + FX coupling inputs from market.db.
// Implemented by infrastructure.SJCGoldFXAdapter (via adapter in main.go).
// Returns raw inputs; domain service functions compute the derived values.
type SJCFXProvider interface {
	// FetchInputs reads commodity_prices and sbv_rates from market.db.
	// Returns zero-value inputs on any DB error (fail-closed, safe-degrade).
	// DD-7: NO new crawl — purely reads EXISTING market.db tables.
	FetchInputs(ctx context.Context) (SJCFXInputs, error)
}

// SJCFXInputs is the application-layer DTO for raw SJC/FX DB inputs.
// This mirrors infrastructure.SJCFXInputs but lives in the application layer
// to keep Fence-B compliant (no direct infra import in use case).
//
// The composition root adapter converts infrastructure.SJCFXInputs → SJCFXInputs.
type SJCFXInputs struct {
	GoldUSDPerOz  float64
	USDVNDRate    float64
	DXY           float64
	CNYVNDRate    float64
	SBVCenterRate float64
	SBVFetchedAt  string
	SJCPriceMnVND float64
}

// LiquidityStateUseCase orchestrates the three liquidity-state blocs.
// Depends on PolicyRatesProvider + SJCFXProvider (both injected interfaces).
// No infrastructure imports (Fence-B compliant).
type LiquidityStateUseCase struct {
	policyRatesProvider PolicyRatesProvider
	sjcFXProvider       SJCFXProvider
}

// NewLiquidityStateUseCase creates a new LiquidityStateUseCase with injected deps.
// policyRatesProvider: SBV HTML fetch + DB fallback adapter.
// sjcFXProvider: market.db SJC+FX inputs adapter.
// Both are mandatory; nil values will cause Execute to return an error
// (with IRS.IsEstimate=true enforced in errorLiquidityResponse).
func NewLiquidityStateUseCase(
	policyRatesProvider PolicyRatesProvider,
	sjcFXProvider SJCFXProvider,
) *LiquidityStateUseCase {
	return &LiquidityStateUseCase{
		policyRatesProvider: policyRatesProvider,
		sjcFXProvider:       sjcFXProvider,
	}
}

// Execute fetches and composes the three liquidity-state blocs.
//
// Returns LiquidityStateResponse with:
//   - policy_rates: SBV HTML or DB fallback (is_estimate=true on fallback).
//   - sjc_gold_gap: from market.db reads (is_estimate=true when SJC absent).
//   - fx_coupling: from sbv_rates + commodity_prices (is_estimate=true when stale).
//   - irs: ALWAYS is_estimate=true (DD-6, PERMANENT, enforced on ALL paths).
//
// Fail-closed: IRS.IsEstimate=true is set even on partial/full error paths.
// Partial success is returned (Status="ok") even when only some blocs succeed.
func (uc *LiquidityStateUseCase) Execute(
	ctx context.Context,
	_ LiquidityStateRequest,
) (LiquidityStateResponse, error) {
	if uc.policyRatesProvider == nil {
		return errorLiquidityResponse("LiquidityState: policyRatesProvider is nil (not wired)")
	}
	if uc.sjcFXProvider == nil {
		return errorLiquidityResponse("LiquidityState: sjcFXProvider is nil (not wired)")
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	// --- bloc 1: policy_rates ---
	policyRates, policyErr := uc.policyRatesProvider.FetchPolicyRates(ctx)
	if policyErr != nil {
		// Non-fatal: policy rates error doesn't abort the whole response.
		// Use zero-value PolicyRates (is_estimate=true from domain safe-degrade).
		policyRates = domain.PolicyRates{
			IsEstimate: true,
			Source:     "error: " + policyErr.Error(),
			FetchedAt:  fetchedAt,
		}
	}

	// --- blocs 2+3: sjc_gold_gap + fx_coupling from market.db ---
	sjcFXInputs, dbErr := uc.sjcFXProvider.FetchInputs(ctx)
	if dbErr != nil {
		// Non-fatal: DB error → safe-degrade (all zeros → is_estimate=true in domain).
		sjcFXInputs = SJCFXInputs{}
	}

	// Convert world gold USD/oz → million VND/tael.
	worldGoldMnVND := domain.ConvertWorldGoldToMnVND(sjcFXInputs.GoldUSDPerOz, sjcFXInputs.USDVNDRate)

	// Compute SJC gold gap (domain service).
	sjcGap := domain.ComputeSJCGoldGap(sjcFXInputs.SJCPriceMnVND, worldGoldMnVND, fetchedAt)

	// Build FX coupling (domain service).
	// usd_vnd_buy and usd_vnd_sell: not in sbv_rates DB → 0 (safe-degrade).
	fxCoupling := domain.BuildFXCoupling(
		sjcFXInputs.SBVCenterRate,
		0, // usd_vnd_buy: not in sbv_rates
		0, // usd_vnd_sell: not in sbv_rates
		sjcFXInputs.DXY,
		sjcFXInputs.CNYVNDRate,
		fetchedAt,
	)

	// --- bloc 4: irs — ALWAYS is_estimate=true (DD-6 PERMANENT) ---
	irs := domain.BuildIRSField()

	return LiquidityStateResponse{
		Status: "ok",
		PolicyRates: PolicyRatesDTO{
			RefiRatePct:     policyRates.RefiRatePct,
			DiscountRatePct: policyRates.DiscountRatePct,
			LombardRatePct:  policyRates.LombardRatePct,
			Source:          policyRates.Source,
			FetchedAt:       policyRates.FetchedAt,
			IsEstimate:      policyRates.IsEstimate,
		},
		SJCGoldGap: SJCGoldGapDTO{
			SJCPriceMnVND:   sjcGap.SJCPriceMnVND,
			WorldPriceMnVND: sjcGap.WorldPriceMnVND,
			SJCGapMnVND:     sjcGap.SJCGapMnVND,
			IsEstimate:      sjcGap.IsEstimate,
			Note:            sjcGap.Note,
			FetchedAt:       sjcGap.FetchedAt,
		},
		FXCoupling: FXCouplingDTO{
			USDVNDCenter: fxCoupling.USDVNDCenter,
			USDVNDBuy:    fxCoupling.USDVNDBuy,
			USDVNDSell:   fxCoupling.USDVNDSell,
			BandPct:      fxCoupling.BandPct,
			DXY:          fxCoupling.DXY,
			CNYVNDRate:   fxCoupling.CNYVNDRate,
			IsEstimate:   fxCoupling.IsEstimate,
			FetchedAt:    fxCoupling.FetchedAt,
		},
		IRS: LiquidityStateIRSDTO{
			IsEstimate: irs.IsEstimate, // ALWAYS true — DD-6 PERMANENT
			Note:       irs.Note,
		},
		FetchedAt: fetchedAt,
		Source:    liquiditySource,
	}, nil
}

// errorLiquidityResponse builds a LiquidityStateResponse with Status="error".
//
// Fail-closed invariant: IRS.IsEstimate is ALWAYS true even on error paths.
// This ensures the DD-6 invariant is never broken regardless of the error cause.
func errorLiquidityResponse(msg string) (LiquidityStateResponse, error) {
	return LiquidityStateResponse{
		Status: "error",
		Error:  msg,
		Source: liquiditySource,
		// Fail-closed: IRS.IsEstimate=true even on error (DD-6 permanent invariant).
		IRS: LiquidityStateIRSDTO{
			IsEstimate: true, // PERMANENT — DD-6 — even on error paths
			Note:       "HNX OTC IRS market data not machine-readable (DD-6, permanent)",
		},
		// SJCGoldGap fail-closed: is_estimate=true when absent/error.
		SJCGoldGap: SJCGoldGapDTO{
			IsEstimate: true, // fail-closed
		},
	}, fmt.Errorf("%s", msg)
}
