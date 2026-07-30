// Package main — composition-root adapter shim types.
//
// Split from main.go (FACTORY-MACRO-split-or-justify-over-cap, 2026-07-24): these types
// bridge application-layer port interfaces (BOPParser, BOPURLBuilder, IIPParser, CPIParser,
// TradeBalanceParser, PolicyRatesProvider, SJCFXProvider, OMOProvider, OMODailyRepository)
// to the concrete pkg/infrastructure functions WITHOUT pkg/infrastructure importing
// pkg/application (which would be a DDD Fence-B violation).
//
// They live here — cmd/server/ is the only zone allowed to import BOTH pkg/application AND
// pkg/infrastructure (Fence-C). This file is STILL `package main` (same package as main.go) —
// splitting into a sibling file within the same package is a zero-import-graph-change move,
// not a new package boundary. main.go's DI wiring (func main) constructs these adapters and
// passes them to the use-case constructors; see main.go for the wiring order.
//
// size-justification: ~300L — 10 one-purpose composition-root shim types (bopParserAdapter,
// bopURLBuilderAdapter, iipParserAdapter, cpiParserAdapter, tradeBalanceParserAdapter,
// policyRatesHTMLAdapter, policyRatesDBAdapter, sjcFXAdapter, omoRawAdapter,
// omoDailyRepoAdapter), one per VMT feature slice (VMT-1a/1b, VMT-2, VMT-3b, VMT-4, VMT-5a,
// VMT-5b, P0-3-OMO-CURVE), plus one free field-mapping helper (convertOMOTenorRows). Each
// shim is a handful of lines and none has any logic beyond delegating to the matching
// pkg/infrastructure function — they are grouped here (not split further, one file per
// shim) because Fence-C already confines them to a single file's worth of DI wiring;
// N one-line files would just fragment the same wiring story the DoD asked to consolidate
// out of main.go. FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL (2026-07-30) split the former
// policyRatesAdapter/omoAdapter into raw pure-delegation pairs (HTML/DB fetch, OMO fetch) —
// the fallback/ParseOK decision logic they used to embed moved to
// pkg/application/usecases_vmt_liquidity_resolvers.go (PolicyRatesResolver, omoResolver);
// see that file for the design rationale and scripts/audits/composition-root-logic-gate.go
// for the CI mechanism that flags composition-root business-logic branching.
package main

import (
	"context"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/application"
	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
	"github.com/vn-market-intelligence/macro-indicators/pkg/infrastructure"
)

// ---------------------------------------------------------------------------
// VMT-2 composition-root adapters
//
// These types bridge the application-layer interfaces (BOPParser, BOPURLBuilder)
// to the concrete infrastructure functions WITHOUT pkg/infrastructure importing
// pkg/application (which would be a DDD Fence-B violation).
//
// They live here — the composition root (cmd/server/main.go) is the only file
// allowed to import BOTH pkg/application AND pkg/infrastructure (Fence-C).
// ---------------------------------------------------------------------------

// bopParserAdapter implements application.BOPParser using infrastructure.ParseBOPResponse.
// Composition-root type: lives in cmd/server/ (Fence-C compliant).
type bopParserAdapter struct{}

// Parse delegates to infrastructure.ParseBOPResponse.
// Returns domain.BOPRecord — satisfies the application.BOPParser interface.
func (a *bopParserAdapter) Parse(body []byte) (domain.BOPRecord, error) {
	return infrastructure.ParseBOPResponse(body)
}

// bopURLBuilderAdapter implements application.BOPURLBuilder using infrastructure helpers.
// Composition-root type: lives in cmd/server/ (Fence-C compliant).
type bopURLBuilderAdapter struct{}

// BuildURL delegates to infrastructure.BuildBOPFetchURL.
func (b *bopURLBuilderAdapter) BuildURL(start, end string) string {
	return infrastructure.BuildBOPFetchURL(start, end)
}

// QuarterWindow delegates to infrastructure.CurrentQuarterWindow.
func (b *bopURLBuilderAdapter) QuarterWindow(t time.Time) (string, string) {
	return infrastructure.CurrentQuarterWindow(t)
}

// PrevQuarterWindow delegates to infrastructure.PrevQuarterWindow.
func (b *bopURLBuilderAdapter) PrevQuarterWindow(t time.Time) (string, string) {
	return infrastructure.PrevQuarterWindow(t)
}

// ---------------------------------------------------------------------------
// VMT-3b + VMT-4 composition-root adapters
//
// These bridge application.IIPParser and application.CPIParser to the concrete
// infrastructure parser functions without pkg/infrastructure importing pkg/application.
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// iipParserAdapter implements application.IIPParser using infrastructure.ParseIIPFromExcel.
type iipParserAdapter struct{}

// ParseIIP delegates to infrastructure.ParseIIPFromExcel.
// Returns domain.MacroIndicatorsGSORecord — satisfies the application.IIPParser interface.
func (a *iipParserAdapter) ParseIIP(excelBytes []byte, period string) (domain.MacroIndicatorsGSORecord, error) {
	return infrastructure.ParseIIPFromExcel(excelBytes, period)
}

// cpiParserAdapter implements application.CPIParser using infrastructure.ParseCPIFromExcel.
type cpiParserAdapter struct{}

// ParseCPI delegates to infrastructure.ParseCPIFromExcel.
// Returns domain.CPIRecord — satisfies the application.CPIParser interface.
func (c *cpiParserAdapter) ParseCPI(excelBytes []byte, period string) (domain.CPIRecord, error) {
	return infrastructure.ParseCPIFromExcel(excelBytes, period)
}

// ---------------------------------------------------------------------------
// VMT-1a + VMT-1b composition-root adapter
//
// Bridges application.TradeBalanceParser to the concrete infrastructure parser
// without pkg/infrastructure importing pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// tradeBalanceParserAdapter implements application.TradeBalanceParser
// using infrastructure.ParseTradeBalanceFromExcel.
// Composition-root type: lives in cmd/server/ (Fence-C compliant).
type tradeBalanceParserAdapter struct{}

// ParseTradeBalance delegates to infrastructure.ParseTradeBalanceFromExcel.
// Returns domain.TradeBalanceRecord — satisfies the application.TradeBalanceParser interface.
func (t *tradeBalanceParserAdapter) ParseTradeBalance(excelBytes []byte, period string) (domain.TradeBalanceRecord, error) {
	return infrastructure.ParseTradeBalanceFromExcel(excelBytes, period)
}

// ---------------------------------------------------------------------------
// VMT-5a composition-root adapters
//
// These bridge the application-layer interfaces (PolicyRatesProvider, SJCFXProvider)
// to the concrete infrastructure functions without pkg/infrastructure importing
// pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// policyRatesHTMLAdapter implements application.PolicyRatesHTMLProvider.
// Pure delegation to infrastructure.FetchSBVPolicyRatesFromHTML — zero branching.
// FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL: the former policyRatesAdapter also decided
// HTML-vs-DB fallback + is_estimate here; that decision now lives in
// application.PolicyRatesResolver (usecases_vmt_liquidity_resolvers.go) — this
// shim only fetches + field-maps the infrastructure result.
type policyRatesHTMLAdapter struct{}

// FetchHTML delegates to infrastructure.FetchSBVPolicyRatesFromHTML.
func (a *policyRatesHTMLAdapter) FetchHTML(ctx context.Context) (application.PolicyRatesHTMLResult, error) {
	result, err := infrastructure.FetchSBVPolicyRatesFromHTML(ctx)
	return application.PolicyRatesHTMLResult{
		RefiRatePct:     result.RefiRatePct,
		DiscountRatePct: result.DiscountRatePct,
		LombardRatePct:  result.LombardRatePct,
		ParseOK:         result.ParseOK,
	}, err
}

// policyRatesDBAdapter implements application.PolicyRatesDBProvider.
// Pure delegation to infrastructure.FetchSBVPolicyRatesFromDB — zero branching.
type policyRatesDBAdapter struct{}

// FetchDB delegates to infrastructure.FetchSBVPolicyRatesFromDB.
func (a *policyRatesDBAdapter) FetchDB(ctx context.Context) application.PolicyRatesDBResult {
	result := infrastructure.FetchSBVPolicyRatesFromDB(ctx)
	return application.PolicyRatesDBResult{
		RefiRatePct:     result.RefiRatePct,
		DiscountRatePct: result.DiscountRatePct,
		FetchedAt:       result.FetchedAt,
		OK:              result.OK,
	}
}

// sjcFXAdapter implements application.SJCFXProvider.
// Bridges infrastructure.SJCGoldFXAdapter → application.SJCFXInputs (Fence-C).
type sjcFXAdapter struct {
	inner *infrastructure.SJCGoldFXAdapter
}

// FetchInputs implements application.SJCFXProvider.
// Converts infrastructure.SJCFXInputs → application.SJCFXInputs.
func (a *sjcFXAdapter) FetchInputs(ctx context.Context) (application.SJCFXInputs, error) {
	infraInputs, err := a.inner.FetchInputs(ctx)
	if err != nil {
		return application.SJCFXInputs{}, err
	}
	return application.SJCFXInputs{
		GoldUSDPerOz:  infraInputs.GoldUSDPerOz,
		USDVNDRate:    infraInputs.USDVNDRate,
		DXY:           infraInputs.DXY,
		CNYVNDRate:    infraInputs.CNYVNDRate,
		SBVCenterRate: infraInputs.SBVCenterRate,
		SBVFetchedAt:  infraInputs.SBVFetchedAt,
		SJCPriceMnVND: infraInputs.SJCPriceMnVND,
	}, nil
}

// ---------------------------------------------------------------------------
// VMT-5b composition-root adapter
//
// Bridges application.OMOProvider to the concrete infrastructure function
// infrastructure.FetchSBVOMOFromHTML without pkg/infrastructure importing
// pkg/application (Fence-B violation).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// omoRawAdapter implements application.OMORawProvider using
// infrastructure.FetchSBVOMOFromHTML. Fetches the SBV nghiep-vu-thi-truong-mo
// Liferay HTML (direct, no VPS proxy) and field-maps the result — zero
// branching, pure delegation.
// FACTORY-GUARD-CI-COMPROOT-LOGIC-IMPL: the former omoAdapter also decided
// the ParseOK/error fail-closed handling + logging here; that decision now
// lives in application.omoResolver (usecases_vmt_liquidity_resolvers.go).
type omoRawAdapter struct{}

// FetchOMORaw delegates to infrastructure.FetchSBVOMOFromHTML and converts
// OMOParseResult -> application.OMOInputs (raw/undecided — ParseError unset,
// the resolver decides that). Returns err unchanged on fetch failure.
func (a *omoRawAdapter) FetchOMORaw(ctx context.Context) (application.OMOInputs, error) {
	result, err := infrastructure.FetchSBVOMOFromHTML(ctx)
	return application.OMOInputs{
		TotalAddBnVND:    result.TotalAddBnVND,
		TotalAbsorbBnVND: result.TotalAbsorbBnVND,
		AuctionDate:      result.AuctionDate,
		ParseOK:          result.ParseOK,
		TenorRows:        convertOMOTenorRows(result.Tenors),
		ParseWarnings:    result.ParseWarnings,
	}, err
}

// convertOMOTenorRows converts infrastructure.OMOTenorRow rows to
// application.OMOTenorRowInput rows (P0-3-OMO-CURVE field subset).
// Free function — NOT a receiver method: pure structural DTO field-mapping,
// not a composition-root business decision. Go's type system requires an
// explicit per-element loop to convert a slice between two distinct named
// struct types even when the target fields are a subset with identical
// names/types (no implicit slice conversion between named element types) —
// this mirrors the repo's existing free-helper carve-out (envStr/splitCSV/
// parseWatchlist-class functions) that the composition-root-logic-gate
// (scripts/audits/composition-root-logic-gate.go) scopes to receiver
// methods only.
func convertOMOTenorRows(rows []infrastructure.OMOTenorRow) []application.OMOTenorRowInput {
	out := make([]application.OMOTenorRowInput, 0, len(rows))
	for _, r := range rows {
		out = append(out, application.OMOTenorRowInput{
			OperationType:  r.OperationType,
			TenorDays:      r.ParsedTenorDays,
			VolumeBnVND:    r.VolumeBnVND,
			WinningRatePct: r.WinningRatePct,
			MemberWinRatio: r.MemberWinRatio,
		})
	}
	return out
}

// ---------------------------------------------------------------------------
// P0-3-OMO-CURVE composition-root adapter
//
// omoDailyRepoAdapter wraps infrastructure.SQLiteOMODailyRepository to implement
// application.OMODailyRepository. Nil-safe: when inner is nil, all methods
// return safe-degrade zero values (repo disabled via safe-degrade path).
// Lives here (composition root — Fence-C compliant).
// ---------------------------------------------------------------------------

// omoDailyRepoAdapter implements application.OMODailyRepository.
// Wraps *infrastructure.SQLiteOMODailyRepository for DDD Fence-B compliance.
type omoDailyRepoAdapter struct {
	inner *infrastructure.SQLiteOMODailyRepository
}

// Persist delegates to the inner SQLiteOMODailyRepository.
// Returns nil when inner is nil (safe-degrade: repo not wired).
func (a *omoDailyRepoAdapter) Persist(ctx context.Context, row application.OMODailyRow) error {
	if a.inner == nil {
		return nil
	}
	return a.inner.Persist(ctx, row)
}

// NetInjection5d delegates to the inner repository.
// Returns empty result when inner is nil.
func (a *omoDailyRepoAdapter) NetInjection5d(ctx context.Context) (application.OMONetInjection5dResult, error) {
	if a.inner == nil {
		return application.OMONetInjection5dResult{}, nil
	}
	return a.inner.NetInjection5d(ctx)
}

// PrevWeightedAvgRate delegates to the inner repository.
// Returns nil when inner is nil.
func (a *omoDailyRepoAdapter) PrevWeightedAvgRate(ctx context.Context, beforeDate string) (*float64, error) {
	if a.inner == nil {
		return nil, nil
	}
	return a.inner.PrevWeightedAvgRate(ctx, beforeDate)
}
