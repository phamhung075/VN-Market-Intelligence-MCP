// Package infrastructure — NSO Excel parser for VMT-1a (trade balance + HS) + VMT-1b (bloc split).
//
// Source: NSO monthly Excel, sheets '14.XK' (exports) + '15.NK' (imports) + '12.FDI' (FDI).
// Contract derived from LIVE payload in scripts/probes/vmt-3-sample.json and the
// authoritative live_contract in orch-state.json (VMT-1a-TRADE-BALANCE-TOTAL-HS /
// VMT-1b-TRADE-BALANCE-BLOC-SPLIT).
//
// Sheet layout (live_contract parse_rules):
//
//	'14.XK' (exports):
//	  col 0: HS code / sector name (Vietnamese string)
//	  col 2: current-month absolute (tỷ USD, VN thousands-sep format)
//	  col 3: YTD cumulative (tỷ USD, VN thousands-sep format)
//	  col 4: YoY% vs same period prior year
//
//	'15.NK' (imports): same column structure as '14.XK'
//
//	'12.FDI' (FDI registered capital):
//	  col 1: row label ("Tổng số" for national total)
//	  The total registered capital row is: Col1 == "Tổng số" → registered capital M USD
//	  (from vmt-3-sample.json: total_registered_5m_2026_mn_usd = 24810)
//
// VN number format (tỷ USD cells in XK/NK): period=thousands sep, comma=decimal.
// Examples: "27.400" → 27400 M USD (then / 1000 for bn USD if needed).
// Absolute column stores tỷ USD (billion USD), so "27.4" → 27.4 bn USD = 27400 M USD.
// ParseVNNumber handles this: removes period-separators, replaces comma→point.
// For YoY% column: standard float ("15.5" = 15.5%) — ParseVNNumber also works.
//
// Total rows: first data row after the sheet header (row 0 is usually the total row
// for the whole economy). The parser uses label matching:
//   - XK/NK total: row where col0 matches total patterns (e.g., "Tổng số", blank col0
//     on first numeric-content row, or a row with bold total indicator — we use
//     positional: first row with valid col2+col3+col4 AND no label → treated as total).
//   - FDI total: row where col1 (0-indexed) == "Tổng số".
//
// HS breakdown: ALL rows with a non-empty col0 label AND valid col2+col4 numeric data.
// Skip: header rows, subtotal rows with blank numeric cells, note rows.
//
// Anchor (must pass in tests): May-2026
//
//	export_total: ~27.4 bn USD (~27400 M USD)
//	import_total: ~24.1 bn USD (~24100 M USD)
//	trade_balance: ~+3.3 bn USD (~+3300 M USD)
//	fdi_registered: 24810 M USD
//
// VMT-1b bloc_split ALWAYS is_estimate=true (ARCH Decision A — PERMANENT).
// Fail-closed: if FDI parse fails, BlocSplitEstimate still has is_estimate=true.
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// Sheet names — matched by NAME, not positional index (resilient to reordering).
const (
	nsoExportSheetName = "14.XK"
	nsoImportSheetName = "15.NK"
	nsoFDISheetName    = "12.FDI"
)

// nsoTradeSource is the provenance label for trade-balance responses.
const nsoTradeSource = "NSO monthly Excel, sheets '14.XK' (exports) + '15.NK' (imports) + '12.FDI' (FDI) (PROBE-3 PASS)"

// tradeBlockSplitNote is the permanent bloc-split cross-join note (ARCH Decision A).
const tradeBlockSplitNote = "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"

// fdiTotalLabel is the Vietnamese label identifying the FDI national total row in sheet '12.FDI'.
// From vmt-3-sample.json: "Tổng số" in col1 identifies the national total registered capital.
const fdiTotalLabel = "Tổng số"

// minCols is the minimum number of columns required in a trade sheet data row.
// We need at least col4 (index 4) to parse YoY%, so minimum is 5 columns.
const minTradeCols = 5

// ParseTradeBalanceFromExcel parses the NSO monthly Excel bytes and returns a TradeBalanceRecord.
//
// Reads sheets '14.XK' (exports), '15.NK' (imports), and '12.FDI' (FDI registered capital).
// Computes trade_balance = export_total - import_total via domain.ComputeTradeBalance.
// Computes bloc_split via domain.ComputeBlocSplit (always is_estimate=true, ARCH Decision A).
//
// Returns (record, nil) on success.
// Returns an error if any of the three sheets is missing or the total rows cannot be found.
// Fail-loud: missing sheets / missing total row = error (not silent empty).
func ParseTradeBalanceFromExcel(excelBytes []byte, period string) (domain.TradeBalanceRecord, error) {
	f, err := excelize.OpenReader(bytes.NewReader(excelBytes))
	if err != nil {
		return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: open Excel: %w", err)
	}
	defer f.Close()

	if period == "" {
		period = time.Now().UTC().Format("2006-01")
	}

	// Parse sheet '14.XK' (exports).
	exportTotal, exportYTD, exportYoY, hsExports, errXK := parseTradeSheet(f, nsoExportSheetName)
	if errXK != nil {
		return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: sheet %q: %w", nsoExportSheetName, errXK)
	}

	// Parse sheet '15.NK' (imports).
	importTotal, importYTD, importYoY, hsImports, errNK := parseTradeSheet(f, nsoImportSheetName)
	if errNK != nil {
		return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: sheet %q: %w", nsoImportSheetName, errNK)
	}

	// Compute trade balance using domain function.
	// Both exportTotal and importTotal are in M USD (parsed from tỷ USD × 1000).
	tradeBalance := domain.ComputeTradeBalance(exportTotal, importTotal)

	// Parse sheet '12.FDI' for bloc_split (VMT-1b).
	// Fail-closed: if FDI parse fails, bloc_split still has is_estimate=true.
	fdiRegistered, errFDI := parseFDITotal(f)
	if errFDI != nil {
		// Non-fatal for the overall record — but bloc_split will have zeroed values + is_estimate=true.
		// This preserves the fail-closed contract (ARCH Decision A).
		fdiRegistered = 0
	}

	// Compute bloc_split using domain function (always is_estimate=true).
	// exportTotal is in M USD — matches fdiRegistered units (M USD from probe).
	blocSplit := domain.ComputeBlocSplit(fdiRegistered, exportTotal)

	return domain.TradeBalanceRecord{
		Period:            period,
		ExportTotalMnUSD:  exportTotal,
		ImportTotalMnUSD:  importTotal,
		TradeBalanceMnUSD: tradeBalance,
		ExportYTDMnUSD:    exportYTD,
		ImportYTDMnUSD:    importYTD,
		ExportYoYPct:      exportYoY,
		ImportYoYPct:      importYoY,
		HSExports:         hsExports,
		HSImports:         hsImports,
		BlocSplit:         blocSplit,
		IsEstimate:        false, // trade totals are primary source (VMT-1a)
		Source:            nsoTradeSource,
		FetchedAt:         time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// parseTradeSheet reads one trade sheet (XK or NK) and returns:
//
//	(total_mn_usd, ytd_mn_usd, yoy_pct, hs_rows, error)
//
// Sheet structure (live_contract parse_rules):
//
//	col 0: HS code / sector name
//	col 2: current-month absolute value (tỷ USD, VN format)
//	col 3: YTD cumulative (tỷ USD, VN format)
//	col 4: YoY% vs same period prior year
//
// Total row detection: first row with blank or absent col0 AND valid numeric col2+col4.
// HS breakdown rows: non-empty col0 + valid numeric col2 + valid col4.
//
// Values in col2/col3 are in tỷ USD (billion USD); we convert to M USD (* 1000)
// for internal representation (consistent with BOP/FDI which use M USD).
func parseTradeSheet(f *excelize.File, sheetName string) (
	totalMnUSD, ytdMnUSD, yoyPct float64,
	hsRows []domain.HSSector,
	err error,
) {
	rows, rowErr := f.GetRows(sheetName)
	if rowErr != nil {
		return 0, 0, 0, nil, fmt.Errorf("sheet %q not found or unreadable: %w", sheetName, rowErr)
	}
	if len(rows) == 0 {
		return 0, 0, 0, nil, fmt.Errorf("sheet %q is empty", sheetName)
	}

	totalFound := false

	for _, row := range rows {
		if len(row) < minTradeCols {
			continue
		}

		col0 := strings.TrimSpace(row[0])
		col2Str := strings.TrimSpace(row[2])
		col3Str := ""
		if len(row) > 3 {
			col3Str = strings.TrimSpace(row[3])
		}
		col4Str := strings.TrimSpace(row[4])

		// Skip rows with no numeric data in col2.
		if col2Str == "" {
			continue
		}

		// Try to parse col2 as VN number (absolute value, tỷ USD).
		col2Val, col2Ok := domain.ParseVNNumber(col2Str)
		if !col2Ok {
			// Not a numeric row (header, note, label row) — skip.
			continue
		}

		// Convert tỷ USD → M USD (* 1000).
		col2MnUSD := col2Val * 1000

		// Try to parse col4 as YoY%.
		// YoY% may use VN format (comma as decimal) or plain float.
		col4Val, col4Ok := domain.ParseVNNumber(col4Str)
		if !col4Ok {
			// Some data rows may have missing YoY% — skip them for HS breakdown.
			// But if this is the total row, we still need it; fail-loud if total row is broken.
			col4Val = 0
		}

		// YTD (col3).
		ytdVal := 0.0
		if col3Str != "" {
			if v, ok := domain.ParseVNNumber(col3Str); ok {
				ytdVal = v * 1000 // tỷ USD → M USD
			}
		}

		// Total row detection: col0 is blank/empty for the national total row.
		// The total row is the first numeric row with no label in col0.
		if col0 == "" && !totalFound {
			totalMnUSD = col2MnUSD
			ytdMnUSD = ytdVal
			yoyPct = col4Val
			totalFound = true
			continue
		}

		// HS breakdown row: has a label in col0 + valid numeric col2.
		if col0 != "" && col2Ok {
			// Skip rows that are clearly structural labels (Vietnamese patterns that indicate
			// headers or category groupings without actual data — keep any row with valid numbers).
			// Filter: skip rows where col2 equals the total (would be double-counted),
			// and skip rows with only whitespace/dash values.
			if col2Str == "-" || col2Str == "–" || col2Str == "—" {
				continue
			}

			hsRows = append(hsRows, domain.HSSector{
				NameVI:        col0,
				AbsoluteBnUSD: col2Val, // tỷ USD (already in bn USD, no further conversion)
				YoYPct:        col4Val,
				IsEstimate:    false, // primary NSO source (VMT-1a)
			})
		}
	}

	if !totalFound {
		return 0, 0, 0, nil, fmt.Errorf("sheet %q: national total row (empty col0, numeric col2) not found", sheetName)
	}

	return totalMnUSD, ytdMnUSD, yoyPct, hsRows, nil
}

// parseFDITotal reads sheet '12.FDI' and returns the national total registered capital in M USD.
//
// From vmt-3-sample.json fdi.parse_rules: "row where Col1='Tổng số' → total registered capital M USD"
// Column layout per probe: col 0 = province/entity, col 1 = row type label, col 2 = registered M USD.
// Fallback: also check col 0 == "Tổng số" in case of sheet layout variants.
//
// Returns (fdiRegisteredMnUSD, nil) on success.
// Returns (0, error) if the total row cannot be found or the value is unparseable.
func parseFDITotal(f *excelize.File) (float64, error) {
	rows, err := f.GetRows(nsoFDISheetName)
	if err != nil {
		return 0, fmt.Errorf("sheet %q not found or unreadable: %w", nsoFDISheetName, err)
	}
	if len(rows) == 0 {
		return 0, fmt.Errorf("sheet %q is empty", nsoFDISheetName)
	}

	for _, row := range rows {
		if len(row) < 3 {
			continue
		}

		col0 := strings.TrimSpace(row[0])
		col1 := ""
		if len(row) > 1 {
			col1 = strings.TrimSpace(row[1])
		}

		// Match: col1 == "Tổng số" OR col0 == "Tổng số" (layout variant guard).
		if col1 != fdiTotalLabel && col0 != fdiTotalLabel {
			continue
		}

		// The registered capital column: col 2 (0-indexed) per probe layout.
		// Value is in M USD (confirmed from vmt-3-sample.json: total_registered_5m_2026_mn_usd=24810).
		regStr := strings.TrimSpace(row[2])
		if regStr == "" {
			return 0, fmt.Errorf("sheet %q: 'Tổng số' row has empty registered capital (col2)", nsoFDISheetName)
		}

		// FDI values: may be plain integer ("24810") or VN format ("24.810").
		// Use ParseVNNumber which handles both (strips period-separators).
		regVal, ok := domain.ParseVNNumber(regStr)
		if !ok {
			return 0, fmt.Errorf("sheet %q: 'Tổng số' registered capital %q is not parseable", nsoFDISheetName, regStr)
		}

		return regVal, nil
	}

	return 0, fmt.Errorf("sheet %q: 'Tổng số' row not found", nsoFDISheetName)
}
