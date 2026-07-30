// Package application — VMT-5a/VMT-5b liquidity-state provider resolvers
// (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL).
//
// PolicyRatesResolver and omoResolver absorb the fallback-selection +
// IsEstimate/ParseOK confidence-flag decision logic that used to live inside
// cmd/server/adapters.go's policyRatesAdapter.FetchPolicyRates and
// omoAdapter.FetchOMO — flagged by the composition-root-logic-gate
// (scripts/audits/composition-root-logic-gate.go, go/ast-based) as
// business-semantic branching that does not belong in a composition-root
// receiver method. Both resolvers still implement the SAME existing
// PolicyRatesProvider / OMOProvider interfaces consumed by
// LiquidityStateUseCase (usecases_vmt_liquidity.go) — LiquidityStateUseCase
// itself is UNCHANGED, so /liquidity-state's output shape and behaviour are
// identical before/after this refactor for identical upstream inputs; only
// the composition root's wiring in cmd/server/main.go changes (see that
// file's comment at the wiring site).
//
// The composition-root adapters that implement PolicyRatesHTMLProvider /
// PolicyRatesDBProvider / OMORawProvider (cmd/server/adapters.go) are now
// pure one-line delegations to pkg/infrastructure with zero branching —
// verified by `go run scripts/audits/composition-root-logic-gate.go --check
// apps/macro-indicators/cmd/server`.
//
// Fence-B: this file, like the rest of pkg/application, imports only
// pkg/domain — never pkg/infrastructure. PolicyRatesHTMLProvider,
// PolicyRatesDBProvider, and OMORawProvider are injected interfaces,
// implemented by adapters that live in cmd/server/ (Fence-C).
package application

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// ---------------------------------------------------------------------------
// Policy rates: HTML-first, DB-fallback resolver.
// ---------------------------------------------------------------------------

// PolicyRatesHTMLResult is the application-layer mirror of
// infrastructure.SBVPolicyRatesResult. The composition-root adapter converts
// infrastructure.SBVPolicyRatesResult -> PolicyRatesHTMLResult field-by-field
// (Fence-B: this package never imports pkg/infrastructure directly).
type PolicyRatesHTMLResult struct {
	RefiRatePct     float64
	DiscountRatePct float64
	LombardRatePct  float64
	// ParseOK is true when at least refi + discount were successfully parsed.
	ParseOK bool
}

// PolicyRatesDBResult is the application-layer mirror of
// infrastructure.SBVPolicyRatesDBResult (sbv_rates DB fallback row).
type PolicyRatesDBResult struct {
	RefiRatePct     float64
	DiscountRatePct float64
	FetchedAt       string
	// OK is true when at least refi > 0.
	OK bool
}

// PolicyRatesHTMLProvider fetches the raw (undecided) SBV policy-rates HTML
// parse result. Implemented by a pure-delegation composition-root adapter
// (cmd/server/adapters.go, Fence-C compliant).
type PolicyRatesHTMLProvider interface {
	FetchHTML(ctx context.Context) (PolicyRatesHTMLResult, error)
}

// PolicyRatesDBProvider fetches the raw (undecided) sbv_rates DB fallback
// row. Implemented by a pure-delegation composition-root adapter
// (cmd/server/adapters.go, Fence-C compliant).
type PolicyRatesDBProvider interface {
	FetchDB(ctx context.Context) PolicyRatesDBResult
}

// PolicyRatesResolver implements PolicyRatesProvider: HTML-first with
// sbv_rates DB fallback, and the is_estimate confidence-flag decision.
// Moved out of the composition root (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL) —
// this IS the business decision the composition-root-logic-gate flags when
// it lives inside a cmd/server/ receiver method.
type PolicyRatesResolver struct {
	htmlProvider PolicyRatesHTMLProvider
	dbProvider   PolicyRatesDBProvider
	logger       *slog.Logger
}

// NewPolicyRatesResolver creates a PolicyRatesResolver with injected raw
// (undecided) HTML + DB providers. logger may be nil (no logging, same
// nil-safe contract as the composition-root adapter it replaces).
func NewPolicyRatesResolver(
	htmlProvider PolicyRatesHTMLProvider,
	dbProvider PolicyRatesDBProvider,
	logger *slog.Logger,
) *PolicyRatesResolver {
	return &PolicyRatesResolver{
		htmlProvider: htmlProvider,
		dbProvider:   dbProvider,
		logger:       logger,
	}
}

// FetchPolicyRates implements PolicyRatesProvider.
// Primary: SBV HTML direct fetch -> parse refi + discount + lombard rates.
// Fallback: sbv_rates DB table (refi + discount only; lombard = 0 in fallback).
// is_estimate=false on HTML success; is_estimate=true on fallback.
//
// Logic moved verbatim from cmd/server/adapters.go's former
// policyRatesAdapter.FetchPolicyRates (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL) —
// behaviourally identical for identical htmlProvider/dbProvider responses.
func (r *PolicyRatesResolver) FetchPolicyRates(ctx context.Context) (domain.PolicyRates, error) {
	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	htmlResult, fetchErr := r.htmlProvider.FetchHTML(ctx)
	if fetchErr == nil && htmlResult.ParseOK {
		// HTML fetch + parse succeeded.
		return domain.PolicyRates{
			RefiRatePct:     htmlResult.RefiRatePct,
			DiscountRatePct: htmlResult.DiscountRatePct,
			LombardRatePct:  htmlResult.LombardRatePct,
			Source:          "www.sbv.gov.vn Liferay HTML (direct, no VPS proxy)",
			FetchedAt:       fetchedAt,
			IsEstimate:      false, // primary source confirmed
		}, nil
	}

	// HTML fetch failed or parse returned ParseOK=false -> fall back to DB.
	if r.logger != nil {
		r.logger.Warn("sbv_policy_rates: HTML fetch/parse failed, falling back to sbv_rates DB",
			slog.Any("fetch_err", fetchErr),
			slog.Bool("parse_ok", htmlResult.ParseOK),
		)
	}

	dbResult := r.dbProvider.FetchDB(ctx)
	if dbResult.OK {
		return domain.PolicyRates{
			RefiRatePct:     dbResult.RefiRatePct,
			DiscountRatePct: dbResult.DiscountRatePct,
			LombardRatePct:  0, // not in sbv_rates table
			Source:          "sbv_rates DB fallback (HTML parse failed)",
			FetchedAt:       dbResult.FetchedAt,
			IsEstimate:      true, // fallback path = is_estimate=true
		}, nil
	}

	// Both HTML and DB failed -> return zero-value with is_estimate=true (fail-closed).
	return domain.PolicyRates{
		IsEstimate: true,
		Source:     "no source available (HTML + DB both failed)",
		FetchedAt:  fetchedAt,
	}, fmt.Errorf("sbv_policy_rates: HTML fetch/parse failed and DB fallback empty")
}

// ---------------------------------------------------------------------------
// OMO: fail-closed parse-result resolver.
// ---------------------------------------------------------------------------

// OMORawProvider fetches the raw (undecided) SBV OMO HTML parse result,
// already converted to the application-layer OMOInputs shape (TenorRows
// mapped from infrastructure.OMOTenorRow). ParseError is left unset — the
// resolver (not the adapter) decides ParseError text + logging.
// Implemented by a pure-delegation composition-root adapter
// (cmd/server/adapters.go, Fence-C compliant).
type OMORawProvider interface {
	FetchOMORaw(ctx context.Context) (OMOInputs, error)
}

// omoResolver implements OMOProvider: fail-closed ParseOK/error decision +
// logging. Moved out of the composition root
// (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL) — this IS the business decision the
// composition-root-logic-gate flags when it lives inside a cmd/server/
// receiver method.
type omoResolver struct {
	raw    OMORawProvider
	logger *slog.Logger
}

// NewOMOResolver creates an OMOProvider backed by the given raw (undecided)
// OMO fetch provider. logger may be nil (no logging, same nil-safe contract
// as the composition-root adapter it replaces).
func NewOMOResolver(raw OMORawProvider, logger *slog.Logger) OMOProvider {
	return &omoResolver{raw: raw, logger: logger}
}

// FetchOMO implements OMOProvider.
// Delegates to the raw provider and applies the fail-closed ParseOK/error
// decision + logging.
//
// Logic moved verbatim from cmd/server/adapters.go's former
// omoAdapter.FetchOMO (FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL) — behaviourally
// identical for identical raw-provider responses. The tenor-row conversion
// loop (infrastructure.OMOTenorRow -> OMOTenorRowInput) now lives in the
// composition-root adapter's free (non-receiver) helper function
// convertOMOTenorRows — pure structural DTO mapping, not a business
// decision, out of the composition-root-logic-gate's scope by construction
// (the gate only inspects receiver methods).
func (r *omoResolver) FetchOMO(ctx context.Context) (OMOInputs, error) {
	result, err := r.raw.FetchOMORaw(ctx)
	if err != nil {
		if r.logger != nil {
			r.logger.Warn("sbv_omo: fetch/parse failed", slog.Any("error", err))
		}
		return OMOInputs{
			ParseOK:    false,
			ParseError: err.Error(),
		}, err
	}
	if !result.ParseOK {
		if r.logger != nil {
			r.logger.Warn("sbv_omo: parse returned ParseOK=false (no add/absorb rows found)")
		}
		return OMOInputs{
			ParseOK:    false,
			ParseError: "OMO HTML parse: no add/absorb rows found",
		}, nil
	}
	// ParseOK=true: result already carries TotalAddBnVND/TotalAbsorbBnVND/
	// AuctionDate/TenorRows/ParseWarnings from the raw provider, ParseError
	// unset (zero value) — matches the former adapter's success return exactly.
	return result, nil
}
