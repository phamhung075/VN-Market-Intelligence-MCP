// Package application — GSO/IIP use case for VMT-3b (POST /macro-indicators).
//
// Orchestrates: NSOExcelFetcher.GetOrFetchNSOMonthlyExcel → IIP parser → DTO assembly.
// No domain logic here — pure orchestration (DDD application layer rule).
//
// Shared Excel download: the same NSO monthly Excel bytes (returned by GetOrFetchNSOMonthlyExcel)
// serve both VMT-3b (sheet "2.IIPthang") and VMT-4 (sheet "16.CPI").
// Entry 11 (sprint-VN-MACRO-TOOLING.md): ONE download per cycle, all tools read from cache.
//
// IIPParser interface: defined in this package (application layer) so the use case
// does not import pkg/infrastructure. The composition root wires the concrete parser.
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
// The IIPExcelFetcher and IIPParser are injected via interfaces.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoGSOSource is the provenance label for GSO/IIP responses.
const nsoGSOSource = "NSO monthly Excel, sheet '2.IIPthang' (PROBE-3 PASS)"

// NSOExcelProvider is the interface for obtaining the NSO monthly Excel bytes.
// Implemented by infrastructure.NSOExcelFetcher (cache + VPS fetch).
// Defined in the application layer to keep the use case free from infrastructure imports.
//
// Returns (excelBytes, period, error).
// period is the YYYY-MM string derived from the NSO URL path.
type NSOExcelProvider interface {
	GetOrFetchNSOMonthlyExcel(ctx context.Context) ([]byte, string, error)
}

// IIPParser is the interface for parsing the NSO monthly Excel into IIP domain records.
// Implemented by infrastructure.ParseIIPFromExcel (via a closure adapter in main.go).
// Defined here (application layer) to avoid Fence-B violations.
type IIPParser interface {
	// ParseIIP accepts raw Excel bytes + period string, returns a MacroIndicatorsGSORecord.
	ParseIIP(excelBytes []byte, period string) (domain.MacroIndicatorsGSORecord, error)
}

// MacroIndicatorsGSOUseCase orchestrates GSO/IIP data retrieval and DTO assembly.
// Depends on NSOExcelProvider (shared cache+fetcher) and IIPParser.
// No infrastructure imports (Fence-B compliant).
type MacroIndicatorsGSOUseCase struct {
	excelProvider NSOExcelProvider
	iipParser     IIPParser
}

// NewMacroIndicatorsGSOUseCase creates a new MacroIndicatorsGSOUseCase with injected deps.
// excelProvider: the shared NSO Excel cache+fetch adapter.
// iipParser: the IIP Excel sheet parser adapter.
// Both are mandatory; nil values will cause Execute to return an error.
func NewMacroIndicatorsGSOUseCase(
	excelProvider NSOExcelProvider,
	iipParser IIPParser,
) *MacroIndicatorsGSOUseCase {
	return &MacroIndicatorsGSOUseCase{
		excelProvider: excelProvider,
		iipParser:     iipParser,
	}
}

// Execute fetches the most recent NSO monthly Excel and returns IIP data for 4 target sectors.
//
// Returns MacroIndicatorsGSOResponse with:
//   - 4 IIP sectors (all_industry, manufacturing, mining, electricity).
//   - is_estimate=false on all IIP fields (primary source, PROBE-3 confirmed).
//   - Status="degraded" + BlockedReason + IsEstimate=true on upstream-fetch/parse failure
//     (HTTP 200 honest degraded response — not a 500).
//   - Status="error" + Error field on nil-provider/wiring faults (HTTP 500 genuine fault).
func (uc *MacroIndicatorsGSOUseCase) Execute(
	ctx context.Context,
	_ MacroIndicatorsGSORequest,
) (MacroIndicatorsGSOResponse, error) {
	if uc.excelProvider == nil {
		return errorMacroGSOResponse("MacroIndicatorsGSO: excelProvider is nil (not wired)")
	}
	if uc.iipParser == nil {
		return errorMacroGSOResponse("MacroIndicatorsGSO: iipParser is nil (not wired)")
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	// Get or fetch the NSO monthly Excel (shared with VMT-4 CPI).
	excelBytes, period, err := uc.excelProvider.GetOrFetchNSOMonthlyExcel(ctx)
	if err != nil {
		// Upstream-fetch failure: degrade honestly (HTTP 200 + is_estimate=true).
		return degradedMacroGSOResponse(fmt.Sprintf("NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128: %v", err))
	}

	// Parse IIP from the Excel sheet "2.IIPthang".
	record, err := uc.iipParser.ParseIIP(excelBytes, period)
	if err != nil {
		// Parse failure: degrade honestly (HTTP 200 + is_estimate=true).
		return degradedMacroGSOResponse(fmt.Sprintf("NSO monthly Excel IIP parse failure: %v", err))
	}

	// Map domain sectors → DTOs.
	iipDTOs := make([]IIPSectorDTO, 0, len(record.Sectors))
	for _, s := range record.Sectors {
		iipDTOs = append(iipDTOs, IIPSectorDTO{
			Key:        s.Key,
			NameVI:     s.NameVI,
			YoYPct:     s.YoYPct,
			YTDYoYPct:  s.YTDYoYPct,
			MoMPct:     s.MoMPct,
			IsEstimate: s.IsEstimate,
		})
	}

	return MacroIndicatorsGSOResponse{
		Status:     "ok",
		Period:     record.Period,
		IIP:        iipDTOs,
		Source:     nsoGSOSource,
		FetchedAt:  fetchedAt,
		IsEstimate: false,
	}, nil
}

// degradedMacroGSOResponse builds a MacroIndicatorsGSOResponse with Status="degraded" for
// upstream-fetch/parse failures. Returns (resp, nil) so the HTTP handler emits HTTP 200
// with an honest degraded payload instead of an opaque 500.
//
// Fail-closed invariants:
//   - IsEstimate=true on the whole response (upstream source unreachable).
//   - BlockedReason names the unreachable upstream source.
//   - IIP slice is empty (no data to serve — honest).
func degradedMacroGSOResponse(blockedReason string) (MacroIndicatorsGSOResponse, error) {
	return MacroIndicatorsGSOResponse{
		Status:        "degraded",
		IsEstimate:    true, // upstream source unreachable
		BlockedReason: blockedReason,
		Source:        nsoGSOSource,
		IIP:           []IIPSectorDTO{}, // empty — no data to serve honestly
	}, nil // nil error → HTTP handler emits 200 (not 500)
}

// errorMacroGSOResponse builds a MacroIndicatorsGSOResponse with Status="error" for
// nil-provider/wiring faults. Returns (resp, err) so the HTTP handler emits HTTP 500.
// This is a GENUINE internal fault — NOT a degrade-able upstream gap.
func errorMacroGSOResponse(msg string) (MacroIndicatorsGSOResponse, error) {
	return MacroIndicatorsGSOResponse{
		Status: "error",
		Error:  msg,
		Source: nsoGSOSource,
	}, fmt.Errorf("%s", msg)
}
