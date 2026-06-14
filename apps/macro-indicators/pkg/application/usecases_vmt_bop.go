// Package application — BOP use case for VMT-2.
//
// Orchestrates: VpsFetchPort call → SBV Liferay JSON parse → domain services → DTO assembly.
// No domain logic here — pure orchestration (DDD application layer rule).
//
// Fetch recipe: SBV Liferay headless article API, Direct JSON, NO Excel, NO PDF.
// Source: docs/handoffs/ARCH-VN-MACRO-TOOLING.md § VMT-2 (PROBE-2 PASS).
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
// vpsFetch is injected via domain.VpsFetchPort (composition root wires the adapter).
//
// Live fetch is VPS-routed (SBV is geo-blocked from outside Vietnam).
// Use-case headers: Accept: application/json + browser User-Agent (required by SBV Liferay).
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// sbvBOPSource is the provenance label for BOP responses.
const sbvBOPSource = "SBV Liferay headless article API (PROBE-2 PASS)"

// BOPParser is the interface satisfied by the infrastructure BOP parser.
// Defined in the application layer to keep the use case free from infrastructure imports.
// The composition root wires the concrete infrastructure.ParseBOPResponse function
// via a closure adapter (see NewBOPUseCase).
//
// Fence-B: this interface lives in pkg/application, not in pkg/domain, because it
// is purely an application-layer concern (parse step between fetch and domain service).
type BOPParser interface {
	// Parse accepts the raw JSON body from the SBV Liferay API and returns a BOPRecord.
	Parse(body []byte) (domain.BOPRecord, error)
}

// BOPURLBuilder is the interface for constructing the SBV BOP API URL.
// Injected to enable deterministic testing without live URLs.
type BOPURLBuilder interface {
	// BuildURL returns the full SBV BOP API URL for the given quarter window.
	BuildURL(quarterStart, quarterEnd string) string
	// QuarterWindow returns the start and end ISO dates for the quarter containing t.
	QuarterWindow(t time.Time) (start, end string)
	// PrevQuarterWindow returns the start and end ISO dates for the quarter before t.
	PrevQuarterWindow(t time.Time) (start, end string)
}

// BOPUseCase orchestrates BOP data retrieval and signal computation.
// Depends on VpsFetchPort (domain port) and injected parser/URL builder.
// No infrastructure imports (Fence-B compliant).
type BOPUseCase struct {
	fetcher    domain.VpsFetchPort
	parser     BOPParser
	urlBuilder BOPURLBuilder
}

// NewBOPUseCase creates a new BOPUseCase with injected dependencies.
// fetcher: the VPS proxy adapter (VpsFetchPort from pkg/domain/ports.go).
// parser: the BOP JSON parser adapter.
// urlBuilder: the SBV URL builder adapter.
// All three are mandatory; nil values will cause Execute to return an error.
func NewBOPUseCase(
	fetcher domain.VpsFetchPort,
	parser BOPParser,
	urlBuilder BOPURLBuilder,
) *BOPUseCase {
	return &BOPUseCase{
		fetcher:    fetcher,
		parser:     parser,
		urlBuilder: urlBuilder,
	}
}

// Execute fetches the latest BOP data from the SBV Liferay API and computes signals.
//
// Quarter selection:
//  1. If req.QuarterStart and req.QuarterEnd are both set, use them directly.
//  2. Otherwise, try the current quarter. If no data is returned (SBV ~3-month lag),
//     fall back to the previous quarter.
//
// Returns BOPResponse with:
//   - All BOP sub-components in M USD.
//   - FX-incidence discriminator (DD-5) from domain.ComputeFXIncidence.
//   - Offshore-parked heuristic from domain.ComputeOffshoreParked (always is_estimate=true).
//   - is_estimate=false on the main fields (primary source confirmed by PROBE-2).
func (uc *BOPUseCase) Execute(ctx context.Context, req BOPRequest) (BOPResponse, error) {
	if uc.fetcher == nil {
		return errorBOPResponse("BOP use case: VpsFetchPort is nil (not wired)")
	}
	if uc.parser == nil {
		return errorBOPResponse("BOP use case: parser is nil (not wired)")
	}
	if uc.urlBuilder == nil {
		return errorBOPResponse("BOP use case: urlBuilder is nil (not wired)")
	}

	now := time.Now().UTC()
	fetchedAt := now.Format(time.RFC3339)

	record, err := uc.fetchRecord(ctx, req, now)
	if err != nil {
		// Upstream-fetch/parse failure: degrade honestly (HTTP 200 + is_estimate=true).
		// This is NOT a wiring fault — the fetcher is wired but the remote is unreachable.
		return degradedBOPResponse(fmt.Sprintf("SBV Liferay BOP API unreachable via VPS proxy 125.212.251.27:3128: %v", err))
	}

	// Determine E&O known status: the field is "known" when the raw string was non-empty.
	// For this use case we treat the parsed value as always known (PROBE-2 confirms the
	// field is always present in SBV records). The domain service handles the isKnown flag.
	eoKnown := true // loiVaSaiSot is always present in SBV BOP records per PROBE-2.

	// DD-5: compute FX-incidence discriminator from the E&O residual.
	fxIncidence := domain.ComputeFXIncidence(record.ErrorsOmissionsMnUSD, eoKnown)

	// Offshore-parked heuristic (always is_estimate=true).
	offshoreParked := domain.ComputeOffshoreParked(record.ErrorsOmissionsMnUSD, record.OverallBalanceMnUSD)

	return BOPResponse{
		Status:  "ok",
		Quarter: record.Quarter,
		Period:  record.Period,
		CurrentAccount: BOPCurrentAccountDTO{
			TotalMnUSD:              record.CurrentAccount.TotalMnUSD,
			GoodsExportsMnUSD:       record.CurrentAccount.GoodsExportsMnUSD,
			GoodsImportsMnUSD:       record.CurrentAccount.GoodsImportsMnUSD,
			GoodsNetMnUSD:           record.CurrentAccount.GoodsNetMnUSD,
			ServicesExportsMnUSD:    record.CurrentAccount.ServicesExportsMnUSD,
			ServicesImportsMnUSD:    record.CurrentAccount.ServicesImportsMnUSD,
			ServicesNetMnUSD:        record.CurrentAccount.ServicesNetMnUSD,
			PrimaryIncomeNetMnUSD:   record.CurrentAccount.PrimaryIncomeNetMnUSD,
			SecondaryIncomeNetMnUSD: record.CurrentAccount.SecondaryIncomeNetMnUSD,
		},
		CapitalAccountMnUSD: record.CapitalAccountMnUSD,
		FinancialAccount: BOPFinancialAccountDTO{
			TotalMnUSD:        record.FinancialAccount.TotalMnUSD,
			FDINetMnUSD:       record.FinancialAccount.FDINetMnUSD,
			PortfolioNetMnUSD: record.FinancialAccount.PortfolioNetMnUSD,
			OtherNetMnUSD:     record.FinancialAccount.OtherNetMnUSD,
		},
		ErrorsOmissionsMnUSD: record.ErrorsOmissionsMnUSD,
		OverallBalanceMnUSD:  record.OverallBalanceMnUSD,
		ReserveAssetsMnUSD:   record.ReserveAssetsMnUSD,
		FXIncidence: FXIncidenceDTO{
			Label:                string(fxIncidence.Label),
			ErrorsOmissionsMnUSD: fxIncidence.ErrorsOmissionsMnUSD,
			IsEstimate:           fxIncidence.IsEstimate,
		},
		OffshoreParked: OffshoreParkedDTO{
			OffshoreParkedMnUSD: offshoreParked.OffshoreParkedMnUSD,
			IsEstimate:          offshoreParked.IsEstimate, // always true
			Note:                offshoreParked.Note,
		},
		Source:     sbvBOPSource,
		FetchedAt:  fetchedAt,
		IsEstimate: false, // all fields are primary source (PROBE-2 confirmed)
	}, nil
}

// fetchRecord fetches and parses a BOP record for the given request.
// Tries the requested quarter first (or current quarter when not specified).
// Falls back to the previous quarter if the current quarter returns no data.
func (uc *BOPUseCase) fetchRecord(ctx context.Context, req BOPRequest, now time.Time) (domain.BOPRecord, error) {
	start, end := req.QuarterStart, req.QuarterEnd

	if start == "" || end == "" {
		start, end = uc.urlBuilder.QuarterWindow(now)
	}

	record, err := uc.fetchAndParseQuarter(ctx, start, end)
	if err == nil {
		return record, nil
	}

	// Fallback: try previous quarter (SBV BOP is published with ~3-month lag).
	prevStart, prevEnd := uc.urlBuilder.PrevQuarterWindow(now)
	if prevStart == start {
		// Already tried this quarter — no further fallback.
		return domain.BOPRecord{}, fmt.Errorf("no data found for quarter %s–%s: %w", start, end, err)
	}

	return uc.fetchAndParseQuarter(ctx, prevStart, prevEnd)
}

// fetchAndParseQuarter performs the VPS fetch + parse for a single quarter window.
func (uc *BOPUseCase) fetchAndParseQuarter(ctx context.Context, start, end string) (domain.BOPRecord, error) {
	url := uc.urlBuilder.BuildURL(start, end)

	body, err := uc.fetcher.Fetch(ctx, url, domain.VpsFetchOptions{
		TimeoutSec:   30,
		BrowserUA:    true,
		AcceptHeader: "application/json",
	})
	if err != nil {
		return domain.BOPRecord{}, fmt.Errorf("vpsFetch %s: %w", url, err)
	}

	return uc.parser.Parse(body)
}

// degradedBOPResponse builds a BOPResponse with Status="degraded" for
// upstream-fetch/parse failures. Returns (resp, nil) so the HTTP handler emits HTTP 200
// with an honest degraded payload instead of an opaque 500.
//
// Fail-closed invariants:
//   - IsEstimate=true on the whole response (upstream source unreachable).
//   - OffshoreParked.IsEstimate=true always (heuristic — never a primary source).
//   - BlockedReason names the unreachable upstream source.
func degradedBOPResponse(blockedReason string) (BOPResponse, error) {
	return BOPResponse{
		Status:        "degraded",
		IsEstimate:    true, // upstream source unreachable
		BlockedReason: blockedReason,
		Source:        sbvBOPSource,
		OffshoreParked: OffshoreParkedDTO{
			IsEstimate: true, // always true — heuristic
		},
	}, nil // nil error → HTTP handler emits 200 (not 500)
}

// errorBOPResponse builds a BOPResponse with Status="error" for nil-provider/wiring faults.
// Returns (resp, err) so the HTTP handler emits HTTP 500.
// This is a GENUINE internal fault — NOT a degrade-able upstream gap.
func errorBOPResponse(msg string) (BOPResponse, error) {
	return BOPResponse{
		Status: "error",
		Error:  msg,
		Source: sbvBOPSource,
	}, fmt.Errorf("%s", msg)
}
