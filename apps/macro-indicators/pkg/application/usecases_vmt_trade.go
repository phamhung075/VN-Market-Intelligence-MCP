// Package application — TradeBalance use case for VMT-1a + VMT-1b (POST /trade-balance).
//
// Orchestrates: NSOExcelFetcher.GetOrFetchNSOMonthlyExcel → TradeBalance parser → DTO assembly.
// No domain logic here — pure orchestration (DDD application layer rule).
//
// Shared Excel download: the same NSO monthly Excel bytes (returned by GetOrFetchNSOMonthlyExcel)
// serve VMT-1a (sheets '14.XK' + '15.NK'), VMT-1b (sheet '12.FDI'), VMT-3b, and VMT-4.
// Entry 11 (sprint-VN-MACRO-TOOLING.md): ONE download per cycle, all tools read from cache.
//
// TradeBalanceParser interface: defined in this package (application layer) so the use case
// does not import pkg/infrastructure. The composition root wires the concrete parser.
//
// Fence-B: this package imports only pkg/domain; never imports pkg/infrastructure.
// The NSOExcelProvider and TradeBalanceParser are injected via interfaces.
package application

import (
	"context"
	"fmt"
	"time"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoTradeSource is the provenance label for trade-balance responses.
const nsoTradeSource = "NSO monthly Excel, sheets '14.XK' (exports) + '15.NK' (imports) + '12.FDI' (FDI)"

// TradeBalanceParser is the interface for parsing NSO monthly Excel into trade-balance domain records.
// Implemented by infrastructure.ParseTradeBalanceFromExcel (via a closure adapter in main.go).
// Defined here (application layer) to avoid Fence-B violations.
type TradeBalanceParser interface {
	// ParseTradeBalance accepts raw Excel bytes + period string, returns a TradeBalanceRecord.
	ParseTradeBalance(excelBytes []byte, period string) (domain.TradeBalanceRecord, error)
}

// TradeBalanceUseCase orchestrates trade-balance data retrieval and DTO assembly.
// Depends on NSOExcelProvider (shared cache+fetcher) and TradeBalanceParser.
// No infrastructure imports (Fence-B compliant).
//
// NSOExcelProvider is shared with VMT-3b (IIP) and VMT-4 (CPI) use cases.
// Within the 6h TTL window, GetOrFetchNSOMonthlyExcel returns a cache hit — no new VPS fetch.
type TradeBalanceUseCase struct {
	excelProvider NSOExcelProvider
	tradeParser   TradeBalanceParser
}

// NewTradeBalanceUseCase creates a new TradeBalanceUseCase with injected deps.
// excelProvider: the shared NSO Excel cache+fetch adapter (REUSE from A2, Entry 11).
// tradeParser: the trade-balance Excel sheet parser adapter.
// Both are mandatory; nil values will cause Execute to return an error.
func NewTradeBalanceUseCase(
	excelProvider NSOExcelProvider,
	tradeParser TradeBalanceParser,
) *TradeBalanceUseCase {
	return &TradeBalanceUseCase{
		excelProvider: excelProvider,
		tradeParser:   tradeParser,
	}
}

// Execute fetches the most recent NSO monthly Excel and returns trade-balance data.
//
// Returns TradeBalanceResponse with:
//   - VMT-1a: trade totals + HS sector breakdown (is_estimate=false, primary NSO source).
//   - VMT-1b: bloc_split FDI share (is_estimate=true PERMANENT, ARCH Decision A).
//   - Status="degraded" + BlockedReason + IsEstimate=true on upstream-fetch/parse failure
//     (HTTP 200 honest degraded response — not a 500).
//   - Status="error" + Error field on nil-provider/wiring faults (HTTP 500 genuine fault).
//
// Fail-closed for bloc_split: is_estimate=true is set even on partial parse errors
// (same pattern as VMT-4 CPI WeightsIsEstimate).
func (uc *TradeBalanceUseCase) Execute(
	ctx context.Context,
	_ TradeBalanceRequest,
) (TradeBalanceResponse, error) {
	if uc.excelProvider == nil {
		return errorTradeResponse("TradeBalance: excelProvider is nil (not wired)")
	}
	if uc.tradeParser == nil {
		return errorTradeResponse("TradeBalance: tradeParser is nil (not wired)")
	}

	fetchedAt := time.Now().UTC().Format(time.RFC3339)

	// Get or fetch the NSO monthly Excel (shared with VMT-3b IIP and VMT-4 CPI).
	// Within 6h TTL this is a cache HIT — same archive, no new VPS fetch.
	excelBytes, period, err := uc.excelProvider.GetOrFetchNSOMonthlyExcel(ctx)
	if err != nil {
		// Upstream-fetch failure: degrade honestly (HTTP 200 + is_estimate=true).
		// This is NOT a wiring fault — the provider is wired but the remote is unreachable.
		return degradedTradeResponse(fmt.Sprintf("NSO customs Excel unreachable via VPS proxy 125.212.251.27:3128: %v", err))
	}

	// Parse trade-balance from sheets '14.XK', '15.NK', '12.FDI'.
	record, err := uc.tradeParser.ParseTradeBalance(excelBytes, period)
	if err != nil {
		// Parse failure: degrade honestly (HTTP 200 + is_estimate=true).
		return degradedTradeResponse(fmt.Sprintf("NSO customs Excel parse failure: %v", err))
	}

	// Map domain HS export rows → DTOs.
	hsExportDTOs := make([]HSSectorDTO, 0, len(record.HSExports))
	for _, s := range record.HSExports {
		hsExportDTOs = append(hsExportDTOs, HSSectorDTO{
			NameVI:        s.NameVI,
			AbsoluteBnUSD: s.AbsoluteBnUSD,
			YoYPct:        s.YoYPct,
			IsEstimate:    s.IsEstimate,
		})
	}

	// Map domain HS import rows → DTOs.
	hsImportDTOs := make([]HSSectorDTO, 0, len(record.HSImports))
	for _, s := range record.HSImports {
		hsImportDTOs = append(hsImportDTOs, HSSectorDTO{
			NameVI:        s.NameVI,
			AbsoluteBnUSD: s.AbsoluteBnUSD,
			YoYPct:        s.YoYPct,
			IsEstimate:    s.IsEstimate,
		})
	}

	return TradeBalanceResponse{
		Status:            "ok",
		Period:            record.Period,
		ExportTotalMnUSD:  record.ExportTotalMnUSD,
		ImportTotalMnUSD:  record.ImportTotalMnUSD,
		TradeBalanceMnUSD: record.TradeBalanceMnUSD,
		ExportYTDMnUSD:    record.ExportYTDMnUSD,
		ImportYTDMnUSD:    record.ImportYTDMnUSD,
		ExportYoYPct:      record.ExportYoYPct,
		ImportYoYPct:      record.ImportYoYPct,
		HSExports:         hsExportDTOs,
		HSImports:         hsImportDTOs,
		BlocSplit: BlocSplitDTO{
			FDI: BlocShareDTO{
				SharePct:   record.BlocSplit.FDI.SharePct,
				IsEstimate: record.BlocSplit.FDI.IsEstimate, // always true
			},
			Domestic: BlocShareDTO{
				SharePct:   record.BlocSplit.Domestic.SharePct,
				IsEstimate: record.BlocSplit.Domestic.IsEstimate, // always true
			},
			FDIRegisteredMnUSD: record.BlocSplit.FDIRegisteredMnUSD,
			Note:               record.BlocSplit.Note,
		},
		IsEstimate: false, // trade totals are primary source (VMT-1a)
		Source:     nsoTradeSource,
		FetchedAt:  fetchedAt,
	}, nil
}

// degradedTradeResponse builds a TradeBalanceResponse with Status="degraded" for
// upstream-fetch/parse failures. Returns (resp, nil) so the HTTP handler emits HTTP 200
// with an honest degraded payload instead of an opaque 500.
//
// Fail-closed invariants:
//   - IsEstimate=true on the whole response (upstream source unreachable).
//   - BlocSplit.FDI.IsEstimate and BlocSplit.Domestic.IsEstimate always true (ARCH Decision A).
//   - BlockedReason names the unreachable upstream source.
func degradedTradeResponse(blockedReason string) (TradeBalanceResponse, error) {
	return TradeBalanceResponse{
		Status:        "degraded",
		IsEstimate:    true, // upstream source unreachable
		BlockedReason: blockedReason,
		Source:        nsoTradeSource,
		BlocSplit: BlocSplitDTO{
			FDI:      BlocShareDTO{IsEstimate: true}, // fail-closed: always true (ARCH Decision A)
			Domestic: BlocShareDTO{IsEstimate: true}, // fail-closed: always true (ARCH Decision A)
			Note:     "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible",
		},
	}, nil // nil error → HTTP handler emits 200 (not 500)
}

// errorTradeResponse builds a TradeBalanceResponse with Status="error" for
// nil-provider/wiring faults. Returns (resp, err) so the HTTP handler emits HTTP 500.
// This is a GENUINE internal fault — NOT a degrade-able upstream gap.
//
// Fail-closed: BlocSplit is still populated with is_estimate=true (ARCH Decision A).
func errorTradeResponse(msg string) (TradeBalanceResponse, error) {
	return TradeBalanceResponse{
		Status: "error",
		Error:  msg,
		Source: nsoTradeSource,
		BlocSplit: BlocSplitDTO{
			FDI:      BlocShareDTO{IsEstimate: true}, // fail-closed: always true
			Domestic: BlocShareDTO{IsEstimate: true}, // fail-closed: always true
			Note:     "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible",
		},
	}, fmt.Errorf("%s", msg)
}
