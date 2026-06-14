// Package application — liquidity-state use case for VMT-5a + VMT-5b (POST /liquidity-state).
//
// Orchestrates five blocs:
//  1. policy_rates: PolicyRatesProvider.Fetch() → SBV HTML parse (direct, no VPS proxy).
//     Falls back to DB when HTML parse fails. is_estimate=true on fallback.
//  2. sjc_gold_gap: SJCFXProvider.FetchInputs() → domain.ComputeSJCGoldGap().
//     Pure DB reads — no new crawl (DD-7). is_estimate=true when SJC absent from DB.
//  3. fx_coupling: same SJCFXProvider.FetchInputs() → domain.BuildFXCoupling().
//     DB reads from sbv_rates + commodity_prices.
//  4. irs: domain.BuildIRSField() — always is_estimate=true (DD-6 PERMANENT).
//  5. omo: OMOProvider.FetchOMO() → domain.BuildOMOSuccess / domain.BuildOMOFailed.
//     SBV nghiep-vu-thi-truong-mo HTML (direct, no VPS proxy). is_estimate=false on success.
//  6. interbank_1w: domain.BuildInterbankRate() — PERMANENTLY is_estimate=true, rate=nil.
//     dttktt.sbv.gov.vn blocked (architect Decision B). No fetch attempted.
//
// INVARIANTS (fail-closed):
//   - IRS.IsEstimate MUST be true on ALL paths (DD-6 PERMANENT). NEVER flip to false.
//   - Interbank1W.IsEstimate MUST be true on ALL paths (architect Decision B PERMANENT).
//   - Interbank1W.Rate1WPct MUST be nil on ALL paths.
//   - OMO.IsEstimate=true on parse failure (fail-closed).
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
// PolicyRatesProvider, SJCFXProvider, and OMOProvider are injected via interfaces.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// liquiditySource is the provenance label for liquidity-state responses.
const liquiditySource = "SBV HTML (policy_rates + omo) + market.db reads (sjc_gap + fx_coupling)"

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

// OMOInputs is the application-layer DTO for OMO parse results.
// Mirrors infrastructure.OMOParseResult but lives in the application layer (Fence-B).
// The composition root adapter converts infrastructure.OMOParseResult → OMOInputs.
type OMOInputs struct {
	// TotalAddBnVND is the sum of Mua kỳ hạn (reverse-repo add) in billion VND.
	TotalAddBnVND float64
	// TotalAbsorbBnVND is the sum of Bán kỳ hạn + Tín phiếu in billion VND.
	TotalAbsorbBnVND float64
	// AuctionDate is the most-recent auction date string (DD/MM/YYYY).
	AuctionDate string
	// ParseOK is true when at least one add or absorb row was successfully parsed.
	ParseOK bool
	// ParseError holds the error message when ParseOK=false.
	ParseError string
}

// OMOProvider is the interface for fetching SBV OMO net outstanding.
// Implemented by a composition-root adapter (cmd/server/main.go, Fence-C compliant).
// Returns OMOInputs — the application layer adapts to DTO via domain functions.
type OMOProvider interface {
	// FetchOMO fetches and parses the SBV OMO auction result HTML page.
	// Returns OMOInputs with ParseOK=false on any fetch or parse error (fail-closed).
	// is_estimate=true on ParseOK=false (use case calls domain.BuildOMOFailed).
	FetchOMO(ctx context.Context) (OMOInputs, error)
}

// LiquidityStateUseCase orchestrates the five liquidity-state blocs.
// Depends on PolicyRatesProvider + SJCFXProvider + OMOProvider (all injected interfaces).
// No infrastructure imports (Fence-B compliant).
type LiquidityStateUseCase struct {
	policyRatesProvider PolicyRatesProvider
	sjcFXProvider       SJCFXProvider
	omoProvider         OMOProvider
}

// NewLiquidityStateUseCase creates a new LiquidityStateUseCase with injected deps.
// policyRatesProvider: SBV HTML fetch + DB fallback adapter.
// sjcFXProvider: market.db SJC+FX inputs adapter.
// omoProvider: SBV OMO Liferay HTML fetch + parse adapter.
// All are mandatory; nil values will cause Execute to return an error
// (with IRS.IsEstimate=true + Interbank1W.IsEstimate=true enforced in errorLiquidityResponse).
func NewLiquidityStateUseCase(
	policyRatesProvider PolicyRatesProvider,
	sjcFXProvider SJCFXProvider,
	omoProvider OMOProvider,
) *LiquidityStateUseCase {
	return &LiquidityStateUseCase{
		policyRatesProvider: policyRatesProvider,
		sjcFXProvider:       sjcFXProvider,
		omoProvider:         omoProvider,
	}
}

// Execute fetches and composes the five liquidity-state blocs.
//
// Returns LiquidityStateResponse with:
//   - policy_rates: SBV HTML or DB fallback (is_estimate=true on fallback).
//   - sjc_gold_gap: from market.db reads (is_estimate=true when SJC absent).
//   - fx_coupling: from sbv_rates + commodity_prices (is_estimate=true when stale).
//   - irs: ALWAYS is_estimate=true (DD-6, PERMANENT, enforced on ALL paths).
//   - omo: SBV OMO HTML parse (is_estimate=false on success; is_estimate=true on failure).
//   - interbank_1w: ALWAYS is_estimate=true + rate_1w_pct=null (architect Decision B, PERMANENT).
//
// Fail-closed invariants enforced on ALL paths including error paths:
//   - IRS.IsEstimate=true (DD-6 PERMANENT).
//   - Interbank1W.IsEstimate=true + Rate1WPct=nil (architect Decision B PERMANENT).
//   - OMO.IsEstimate=true on parse failure.
//
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
	if uc.omoProvider == nil {
		return errorLiquidityResponse("LiquidityState: omoProvider is nil (not wired)")
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

	// --- bloc 5: omo — SBV nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy) ---
	omoInputs, omoErr := uc.omoProvider.FetchOMO(ctx)
	var omoDomain domain.OMOOutstanding
	if omoErr != nil || !omoInputs.ParseOK {
		blockedReason := ""
		if omoErr != nil {
			blockedReason = omoErr.Error()
		} else if omoInputs.ParseError != "" {
			blockedReason = omoInputs.ParseError
		} else {
			blockedReason = "OMO HTML parse: no add/absorb rows found"
		}
		omoDomain = domain.BuildOMOFailed(blockedReason, fetchedAt)
	} else {
		omoDomain = domain.BuildOMOSuccess(omoInputs.TotalAddBnVND, omoInputs.TotalAbsorbBnVND, omoInputs.AuctionDate, fetchedAt)
	}

	// --- bloc 6: interbank_1w — PERMANENTLY blocked (architect Decision B) ---
	// dttktt.sbv.gov.vn 100% packet loss from VPS. NO fetch attempted.
	interbank := domain.BuildInterbankRate()

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
		OMO: OMOOutstandingDTO{
			NetOutstandingBnVND: omoDomain.NetOutstandingBnVND,
			TotalAddBnVND:       omoDomain.TotalAddBnVND,
			TotalAbsorbBnVND:    omoDomain.TotalAbsorbBnVND,
			AuctionDate:         omoDomain.AuctionDate,
			IsEstimate:          omoDomain.IsEstimate,
			BlockedReason:       omoDomain.BlockedReason,
			Source:              omoDomain.Source,
			FetchedAt:           omoDomain.FetchedAt,
		},
		Interbank1W: InterbankRateDTO{
			Rate1WPct:     interbank.Rate1WPct,     // ALWAYS nil — architect Decision B PERMANENT
			IsEstimate:    interbank.IsEstimate,    // ALWAYS true — NEVER flip
			BlockedReason: interbank.BlockedReason, // ALWAYS set
		},
		FetchedAt: fetchedAt,
		Source:    liquiditySource,
	}, nil
}

// degradedLiquidityResponse builds a LiquidityStateResponse with Status="degraded" for
// upstream-fetch/parse failures. Returns (resp, nil) so the HTTP handler emits HTTP 200
// with an honest degraded payload instead of an opaque 500.
//
// Fail-closed invariants (same as errorLiquidityResponse, enforced on ALL paths):
//   - IRS.IsEstimate=true (DD-6 PERMANENT — NEVER flip to false).
//   - Interbank1W.IsEstimate=true + Rate1WPct=nil (architect Decision B PERMANENT).
//   - OMO.IsEstimate=true (fail-closed on degraded path).
//   - SJCGoldGap.IsEstimate=true (fail-closed on degraded path).
//   - BlockedReason names the unreachable upstream source.
func degradedLiquidityResponse(blockedReason string) (LiquidityStateResponse, error) {
	return LiquidityStateResponse{
		Status:        "degraded",
		BlockedReason: blockedReason,
		Source:        liquiditySource,
		// Fail-closed: IRS.IsEstimate=true even on degraded path (DD-6 permanent invariant).
		IRS: LiquidityStateIRSDTO{
			IsEstimate: true, // PERMANENT — DD-6 — even on degraded paths
			Note:       "HNX OTC IRS market data not machine-readable (DD-6, permanent)",
		},
		// SJCGoldGap fail-closed: is_estimate=true when absent/error.
		SJCGoldGap: SJCGoldGapDTO{
			IsEstimate: true, // fail-closed
		},
		// OMO fail-closed: is_estimate=true on degraded path.
		OMO: OMOOutstandingDTO{
			IsEstimate:    true, // fail-closed
			BlockedReason: "liquidity-state degraded: " + blockedReason,
		},
		// Interbank1W: PERMANENTLY blocked — same on success AND degraded paths.
		// architect Decision B: dttktt.sbv.gov.vn 100% packet loss from VPS.
		Interbank1W: InterbankRateDTO{
			Rate1WPct:     nil,  // PERMANENT — NEVER non-nil
			IsEstimate:    true, // PERMANENT — architect Decision B — even on degraded paths
			BlockedReason: "dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)",
		},
	}, nil // nil error → HTTP handler emits 200 (not 500)
}

// errorLiquidityResponse builds a LiquidityStateResponse with Status="error" for
// nil-provider/wiring faults. Returns (resp, err) so the HTTP handler emits HTTP 500.
// This is a GENUINE internal fault — NOT a degrade-able upstream gap.
//
// Fail-closed invariants enforced even on error paths:
//   - IRS.IsEstimate=true (DD-6 PERMANENT — NEVER flip to false).
//   - Interbank1W.IsEstimate=true + Rate1WPct=nil (architect Decision B PERMANENT).
//   - OMO.IsEstimate=true (fail-closed on error path).
//   - SJCGoldGap.IsEstimate=true (fail-closed on error path).
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
		// OMO fail-closed: is_estimate=true on error path.
		OMO: OMOOutstandingDTO{
			IsEstimate:    true, // fail-closed
			BlockedReason: "liquidity-state error: " + msg,
		},
		// Interbank1W: PERMANENTLY blocked — same on success AND error paths.
		// architect Decision B: dttktt.sbv.gov.vn 100% packet loss from VPS.
		Interbank1W: InterbankRateDTO{
			Rate1WPct:     nil,  // PERMANENT — NEVER non-nil
			IsEstimate:    true, // PERMANENT — architect Decision B — even on error paths
			BlockedReason: "dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)",
		},
	}, fmt.Errorf("%s", msg)
}
