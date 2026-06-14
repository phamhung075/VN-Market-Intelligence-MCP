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
//   - Status="error" + Error field on any fetch/parse failure.
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

	// Get or fetch the NSO monthly Excel (shared with VMT-3b IIP).
	excelBytes, period, err := uc.excelProvider.GetOrFetchNSOMonthlyExcel(ctx)
	if err != nil {
		return errorCPIResponse(fmt.Sprintf("CPIComponents: fetch NSO Excel: %v", err))
	}

	// Parse CPI from the Excel sheet "16.CPI".
	record, err := uc.cpiParser.ParseCPI(excelBytes, period)
	if err != nil {
		return errorCPIResponse(fmt.Sprintf("CPIComponents: parse CPI: %v", err))
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
		WeightsIsEstimate: true,     // ALWAYS — weights not in monthly Excel
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

// errorCPIResponse builds a CPIComponentsResponse with Status="error".
func errorCPIResponse(msg string) (CPIComponentsResponse, error) {
	return CPIComponentsResponse{
		Status:            "error",
		Error:             msg,
		Source:            nsoCPISource,
		WeightsIsEstimate: true, // even on error, weights remain is_estimate=true
	}, fmt.Errorf("%s", msg)
}
