// Package application — CPI use case for VMT-4 (POST /cpi-components).
//
// Orchestrates: NSOExcelProvider.GetOrFetchNSOMonthlyExcel → CPI parser → DTO assembly.
// No domain logic here — pure orchestration (DDD application layer rule).
//
// Shared Excel download: the same NSO monthly Excel bytes (returned by NSOExcelProvider)
// serve both VMT-3b (sheet "2.IIPthang") and VMT-4 (sheet "16.CPI").
// Entry 11 (sprint-VN-MACRO-TOOLING.md): ONE download per cycle, all tools read from cache.
//
// CPIParser interface: defined in this package so the use case does not import
// pkg/infrastructure. The composition root wires the concrete parser.
//
// CRITICAL weights policy: all weight_pct fields in the response MUST be nil.
// is_estimate=true on the weights sub-field is non-negotiable per architect handoff.
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoCPISource is the provenance label for CPI responses.
const nsoCPISource = "NSO monthly Excel, sheet '16.CPI' (PROBE-3 PASS)"

// CPIParser is the interface for parsing the NSO monthly Excel into CPI domain records.
// Implemented by infrastructure.ParseCPIFromExcel (via a closure adapter in main.go).
// Defined here (application layer) to avoid Fence-B violations.
type CPIParser interface {
	// ParseCPI accepts raw Excel bytes + period string, returns a CPIRecord.
	ParseCPI(excelBytes []byte, period string) (domain.CPIRecord, error)
}

// CPIComponentsUseCase orchestrates CPI data retrieval and DTO assembly.
// Depends on NSOExcelProvider (shared cache+fetcher) and CPIParser.
// No infrastructure imports (Fence-B compliant).
//
// NOTE: NSOExcelProvider is the same interface defined in usecases_vmt_macro.go.
// Both VMT-3b and VMT-4 share this interface for the NSO Excel download.
type CPIComponentsUseCase struct {
	excelProvider NSOExcelProvider
	cpiParser     CPIParser
}

// NewCPIComponentsUseCase creates a new CPIComponentsUseCase with injected deps.
// excelProvider: the shared NSO Excel cache+fetch adapter (same instance as VMT-3b).
// cpiParser: the CPI Excel sheet parser adapter.
// Both are mandatory; nil values will cause Execute to return an error.
func NewCPIComponentsUseCase(
	excelProvider NSOExcelProvider,
	cpiParser CPIParser,
) *CPIComponentsUseCase {
	return &CPIComponentsUseCase{
		excelProvider: excelProvider,
		cpiParser:     cpiParser,
	}
}

// Execute fetches the most recent NSO monthly Excel and returns CPI basket data.
//
// Returns CPIComponentsResponse with:
//   - Headline "CHỈ SỐ GIÁ TIÊU DÙNG" and all recognized basket rows.
//   - Anchors May-2026: headline YoYPct=5.60, MoMPct=0.29, AvgYTDYoYPct=4.31.
//   - weights_is_estimate=true (all weight_pct fields null — never fabricated).
//   - Status="degraded" + BlockedReason + IsEstimate=true on upstream-fetch/parse failure
//     (HTTP 200 honest degraded response — not a 500).
//   - Status="error" + Error field on nil-provider/wiring faults (HTTP 500 genuine fault).
func (uc *CPIComponentsUseCase) Execute(
	ctx context.Context,
	_ CPIComponentsRequest,
) (CPIComponentsResponse, error) {
	if uc.excelProvider == nil {
		return errorCPIResponse("CPIComponents: excelProvider is nil (not wired)")
	}
	if uc.cpiParser == nil {
		return errorCPIResponse("CPIComponents: cpiParser is nil (not wired)")
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	// Belt-and-suspenders: bound the NSO Excel fetch to FetchBudgetSec.
	// The infrastructure layer bounds the 3-step chain internally; this outer deadline
	// protects against any hanging NSOExcelProvider implementation.
	fetchCtx, fetchCancel := context.WithTimeout(ctx, time.Duration(domain.FetchBudgetSec)*time.Second)
	defer fetchCancel()

	// Get or fetch the NSO monthly Excel (shared with VMT-3b IIP).
	excelBytes, period, err := uc.excelProvider.GetOrFetchNSOMonthlyExcel(fetchCtx)
	if err != nil {
		// Upstream-fetch failure: degrade honestly (HTTP 200 + is_estimate=true).
		return degradedCPIResponse(fmt.Sprintf("NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128: %v", err))
	}

	// Parse CPI from the Excel sheet "16.CPI".
	record, err := uc.cpiParser.ParseCPI(excelBytes, period)
	if err != nil {
		// Parse failure: degrade honestly (HTTP 200 + is_estimate=true).
		return degradedCPIResponse(fmt.Sprintf("NSO monthly Excel CPI parse failure: %v", err))
	}

	// Map domain headline → DTO.
	headlineDTO := cpiBasketToDTO(record.Headline)

	// Map domain baskets → DTOs.
	basketDTOs := make([]CPIBasketDTO, 0, len(record.Baskets))
	for _, b := range record.Baskets {
		basketDTOs = append(basketDTOs, cpiBasketToDTO(b))
	}

	return CPIComponentsResponse{
		Status:            "ok",
		Period:            record.Period,
		Headline:          headlineDTO,
		Baskets:           basketDTOs,
		WeightsIsEstimate: true, // ALWAYS — weights not in monthly Excel
		WeightsNote:       record.WeightsNote,
		Source:            nsoCPISource,
		FetchedAt:         fetchedAt,
		IsEstimate:        false, // index values are primary source
	}, nil
}

// cpiBasketToDTO maps a domain.CPIBasket to a CPIBasketDTO.
// WeightPct is always nil (weights not available from monthly Excel).
func cpiBasketToDTO(b domain.CPIBasket) CPIBasketDTO {
	return CPIBasketDTO{
		Key:          b.Key,
		NameVI:       b.NameVI,
		MoMPct:       b.MoMPct,
		AvgYTDYoYPct: b.AvgYTDYoYPct,
		YoYPct:       b.YoYPct,
		WeightPct:    nil, // ALWAYS nil — weights not in monthly Excel
		IsEstimate:   b.IsEstimate,
	}
}

// degradedCPIResponse builds a CPIComponentsResponse with Status="degraded" for
// upstream-fetch/parse failures. Returns (resp, nil) so the HTTP handler emits HTTP 200
// with an honest degraded payload instead of an opaque 500.
//
// Fail-closed invariants:
//   - IsEstimate=true on the whole response (upstream source unreachable).
//   - WeightsIsEstimate=true always (weights never in monthly Excel).
//   - BlockedReason names the unreachable upstream source.
//   - Baskets slice is empty (no data to serve honestly).
func degradedCPIResponse(blockedReason string) (CPIComponentsResponse, error) {
	return CPIComponentsResponse{
		Status:            "degraded",
		IsEstimate:        true, // upstream source unreachable
		BlockedReason:     blockedReason,
		WeightsIsEstimate: true, // always true — weights not in monthly Excel
		Source:            nsoCPISource,
		Baskets:           []CPIBasketDTO{}, // empty — no data to serve honestly
	}, nil // nil error → HTTP handler emits 200 (not 500)
}

// errorCPIResponse builds a CPIComponentsResponse with Status="error" for
// nil-provider/wiring faults. Returns (resp, err) so the HTTP handler emits HTTP 500.
// This is a GENUINE internal fault — NOT a degrade-able upstream gap.
func errorCPIResponse(msg string) (CPIComponentsResponse, error) {
	return CPIComponentsResponse{
		Status:            "error",
		Error:             msg,
		Source:            nsoCPISource,
		WeightsIsEstimate: true, // even on error, weights remain is_estimate=true
	}, fmt.Errorf("%s", msg)
}
