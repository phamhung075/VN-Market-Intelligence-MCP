// Package infrastructure — NSO Excel parser for VMT-1a (trade balance + HS) + VMT-1b (bloc split).
//
// Source: NSO monthly Excel, selected by A1 header CONTENT (FIX-NSO-TRADE-SHEET).
// Sheet name drift: NSO uses "14. XK" / "15. NK" (SPACE after period) in 2026-06,
// vs the former "14.XK" / "15.NK". Labels drift month-to-month. Sheet selection is
// now content-based via selectSheetsByContent() — immune to name/spacing changes.
//
// Contract derived from LIVE RECON of the cached NSO Excel (2026-06, 646KB,
// FIX-NSO-TRADE-VALUE-SCALE — verified via excelize.GetRows probe):
//
// Sheet layout (XK/NK sheets — verified live 2026-06):
//
//	Row 1: A1 header ("14. Hàng hóa xuất khẩu" / "15. Hàng hóa nhập khẩu")
//	Rows 2-8: multi-row header (blank, unit note, column header rows)
//	Row 9: "TỔNG TRỊ GIÁ" — national total row (col0 label)
//	  col3: current-month Trị giá (Triệu USD = M USD, integer string "46929")
//	  col6: YTD Trị giá 5 months (Triệu USD, integer string "215656")
//	  col9: YoY% Trị giá monthly (standard float "118.0" = 18% growth vs prior year)
//	Rows 10+: economic zone sub-totals (Khu vực kinh tế, Khu vực FDI, Dầu thô, Hàng hoá khác)
//	  — same column structure; parsed as HS-like rows but skipped for total detection
//	Row with col0 "MẶT HÀNG CHỦ YẾU": HS section header (no numeric data)
//	Rows after "MẶT HÀNG CHỦ YẾU": HS commodity breakdown rows
//	  col1: commodity/sector name (e.g., "Thủy sản ", "Điện tử, máy tính")
//	  col3: monthly value M USD
//	  col9: YoY% monthly
//
// Unit: Triệu USD (M USD) — col3/col6 values are ALREADY in M USD (no ×1000 needed).
// Unit note appears in row 3: "Nghìn tấn; Triệu USD" (col12 of header region).
//
// Column index constants (0-indexed, from live excelize.GetRows probe):
//
//	colLabel     = 0   // main row label ("TỔNG TRỊ GIÁ", "MẶT HÀNG CHỦ YẾU", blank for HS)
//	colSubLabel  = 1   // sub-label / commodity name for HS rows
//	colMonthly   = 3   // current-month Trị giá (M USD, integer string)
//	colYTD       = 6   // YTD Trị giá 5 months (M USD, integer string)
//	colYoYPct    = 9   // YoY% Trị giá monthly (standard decimal float, e.g. "118.0")
//
// Total row detection: col0 == "TỔNG TRỊ GIÁ" (case-insensitive).
// HS rows: col1 non-blank AND col3 numeric AND past the "MẶT HÀNG CHỦ YẾU" section header.
//
// YoY% parsing: col9 uses standard decimal float format ("118.0" = 18% growth index).
//   strconv.ParseFloat is used directly (NOT ParseVNNumber — which strips periods and
//   would incorrectly convert "118.0" → "1180" → 1180.0).
//
// ParseVNNumber is used only for col3/col6 (integer strings with no decimal period).
//
// FDI sheet (A1 contains "đầu tư"):
//
//	col 1: row label ("Tổng số" for national total)
//	The total registered capital row is: Col1 == "Tổng số" → registered capital M USD
//	(from vmt-3-sample.json: total_registered_5m_2026_mn_usd = 24810)
//
// Anchor (must pass in tests): May-2026 (period "2026-05")
//
//	export_total: ~46929 M USD
//	import_total: ~52141 M USD
//	trade_balance: ~-5212 M USD
//	fdi_registered: 24810 M USD
//
// VMT-1b bloc_split ALWAYS is_estimate=true (ARCH Decision A — PERMANENT).
// Fail-closed: if FDI parse fails, BlocSplitEstimate still has is_estimate=true.
//
// Plausibility guard: ParseTradeBalanceFromExcel returns an error if parsed values
// fail sanity checks: monthly > YTD (impossible), or monthly value outside 5000–200000 M USD
// (VN monthly trade is typically ~$25–60bn), or |balance| > 50000 M USD ($50bn).
//
// Fence-C: only cmd/server/main.go imports pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"github.com/vn-market-intelligence/macro-indicators/pkg/domain"
)

// nsoFDISheetName is the FDI sheet name — matches the current NSO Excel exactly
// (no space after period). Kept as a fallback constant; primary selection is
// content-based via selectSheetsByContent (FIX-NSO-TRADE-SHEET).
const nsoFDISheetName = "12.FDI"

// nsoTradeSource is the provenance label for trade-balance responses.
const nsoTradeSource = "NSO monthly Excel, content-selected sheets (xuất khẩu/nhập khẩu/đầu tư) (PROBE-3 PASS + FIX-NSO-TRADE-SHEET)"

// tradeBlockSplitNote is the permanent bloc-split cross-join note (ARCH Decision A).
const tradeBlockSplitNote = "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"

// fdiTotalLabel is the Vietnamese label identifying the FDI national total row in the FDI sheet.
// From vmt-3-sample.json: "Tổng số" in col1 identifies the national total registered capital.
const fdiTotalLabel = "Tổng số"

// Column indices for XK/NK trade sheets (0-indexed, from live excelize.GetRows probe 2026-06).
// Verified via FIX-NSO-TRADE-VALUE-SCALE recon on cached NSO Excel (646KB, 2026-06).
const (
	colLabel    = 0  // main row label: "TỔNG TRỊ GIÁ", "MẶT HÀNG CHỦ YẾU", blank for HS rows
	colSubLabel = 1  // commodity name for HS rows (e.g. "Thủy sản", "Điện tử, máy tính")
	colMonthly  = 3  // current-month Trị giá (Triệu USD = M USD)
	colYTD      = 6  // YTD cumulative Trị giá 5 months (M USD)
	colYoYPct   = 9  // YoY% Trị giá monthly vs same period prior year (standard decimal float)
)

// nsoTotalRowLabel is the Vietnamese label for the national total row in XK/NK sheets.
// Identified via live excelize.GetRows probe: col0 == "TỔNG TRỊ GIÁ" in row 9.
const nsoTotalRowLabel = "TỔNG TRỊ GIÁ"

// nsoHSSectionLabel is the Vietnamese label for the HS commodity section header.
// HS breakdown rows appear AFTER this row in XK/NK sheets.
const nsoHSSectionLabel = "MẶT HÀNG CHỦ YẾU"

// minTradeCols is the minimum number of columns required in a trade sheet data row.
// We need at least colYoYPct (index 9) + 1 = 10 columns.
// Using 10 as the minimum guard; rows with fewer columns are header/blank rows.
const minTradeCols = 10

// plausibilityMinMnUSD is the minimum plausible monthly export/import value (M USD).
// VN monthly trade is typically $25–60bn, so 5000 M USD ($5bn) is a conservative lower bound.
const plausibilityMinMnUSD = 5_000.0

// plausibilityMaxMnUSD is the maximum plausible monthly export/import value (M USD).
// Using 200000 M USD ($200bn) as an upper bound for any single month.
const plausibilityMaxMnUSD = 200_000.0

// plausibilityMaxBalanceMnUSD is the maximum plausible absolute trade balance (M USD).
// VN's monthly balance has historically been within ±$10bn. Using $50bn as a conservative guard.
const plausibilityMaxBalanceMnUSD = 50_000.0

// selectSheetsByContent scans all sheets in the workbook and returns the sheet names
// for export, import, and FDI sheets by matching Vietnamese keywords in cell A1.
//
// FIX-NSO-TRADE-SHEET: NSO sheet names drift month-to-month (e.g. "14.XK" → "14. XK").
// Content-based selection via A1 header keywords is immune to name/spacing changes:
//   - Export sheet: A1 contains "xuất khẩu"
//   - Import sheet: A1 contains "nhập khẩu"
//   - FDI sheet:    A1 contains "đầu tư"
//
// Matching is case-sensitive on the Vietnamese Unicode text (keywords are lowercase
// as NSO headers use Title Case but containment check still works). All three patterns
// must match exactly one sheet each; returns an error (fail-loud) if any is missing.
func selectSheetsByContent(f *excelize.File) (exportSheet, importSheet, fdiSheet string, err error) {
	for _, sheetName := range f.GetSheetList() {
		rows, rowErr := f.GetRows(sheetName)
		if rowErr != nil || len(rows) == 0 || len(rows[0]) == 0 {
			continue
		}
		header := strings.TrimSpace(rows[0][0])
		headerLower := strings.ToLower(header)

		if strings.Contains(headerLower, "xuất khẩu") {
			exportSheet = sheetName
		}
		if strings.Contains(headerLower, "nhập khẩu") {
			importSheet = sheetName
		}
		if strings.Contains(headerLower, "đầu tư") {
			fdiSheet = sheetName
		}
	}

	if exportSheet == "" || importSheet == "" || fdiSheet == "" {
		return "", "", "", fmt.Errorf(
			"trade_parser: content-based sheet selection failed — exportSheet=%q importSheet=%q fdiSheet=%q; "+
				"expected A1 headers containing 'xuất khẩu'/'nhập khẩu'/'đầu tư'",
			exportSheet, importSheet, fdiSheet,
		)
	}
	return exportSheet, importSheet, fdiSheet, nil
}

// ParseTradeBalanceFromExcel parses the NSO monthly Excel bytes and returns a TradeBalanceRecord.
//
// Sheet selection is content-based via selectSheetsByContent (FIX-NSO-TRADE-SHEET):
// export (A1 "xuất khẩu"), import (A1 "nhập khẩu"), FDI (A1 "đầu tư").
// This survives month-to-month NSO sheet name drift (e.g. "14.XK" → "14. XK").
//
// Computes trade_balance = export_total - import_total via domain.ComputeTradeBalance.
// Computes bloc_split via domain.ComputeBlocSplit (always is_estimate=true, ARCH Decision A).
//
// Returns (record, nil) on success.
// Returns an error if any required sheet is not found or the total rows cannot be found.
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

	// Content-based sheet selection (FIX-NSO-TRADE-SHEET): immune to sheet name drift.
	exportSheetName, importSheetName, fdiSheetName, err := selectSheetsByContent(f)
	if err != nil {
		return domain.TradeBalanceRecord{}, err
	}

	// Parse export sheet (A1 "xuất khẩu").
	exportTotal, exportYTD, exportYoY, hsExports, errXK := parseTradeSheet(f, exportSheetName)
	if errXK != nil {
		return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: export sheet %q: %w", exportSheetName, errXK)
	}

	// Parse import sheet (A1 "nhập khẩu").
	importTotal, importYTD, importYoY, hsImports, errNK := parseTradeSheet(f, importSheetName)
	if errNK != nil {
		return domain.TradeBalanceRecord{}, fmt.Errorf("trade_parser: import sheet %q: %w", importSheetName, errNK)
	}

	// Compute trade balance using domain function.
	// Both exportTotal and importTotal are in M USD (parsed from tỷ USD × 1000).
	tradeBalance := domain.ComputeTradeBalance(exportTotal, importTotal)

	// Parse FDI sheet (A1 "đầu tư") for bloc_split (VMT-1b).
	// Fail-closed: if FDI parse fails, bloc_split still has is_estimate=true.
	fdiRegistered, errFDI := parseFDITotal(f, fdiSheetName)
	if errFDI != nil {
		// Non-fatal for the overall record — but bloc_split will have zeroed values + is_estimate=true.
		// This preserves the fail-closed contract (ARCH Decision A).
		fdiRegistered = 0
	}

	// Compute bloc_split using domain function (always is_estimate=true).
	// exportTotal is in M USD — matches fdiRegistered units (M USD from probe).
	blocSplit := domain.ComputeBlocSplit(fdiRegistered, exportTotal)

	// Plausibility guard (FIX-NSO-TRADE-VALUE-SCALE DoD §3):
	// monthly must be within sane band; monthly must not exceed YTD; |balance| within sane band.
	// Fail-loud: returns error so caller can degrade (not silently serve implausible data).
	if exportTotal < plausibilityMinMnUSD || exportTotal > plausibilityMaxMnUSD {
		return domain.TradeBalanceRecord{}, fmt.Errorf(
			"trade_parser: export_total %.0f M USD outside plausible band [%.0f, %.0f] M USD — column/unit misparse",
			exportTotal, plausibilityMinMnUSD, plausibilityMaxMnUSD,
		)
	}
	if importTotal < plausibilityMinMnUSD || importTotal > plausibilityMaxMnUSD {
		return domain.TradeBalanceRecord{}, fmt.Errorf(
			"trade_parser: import_total %.0f M USD outside plausible band [%.0f, %.0f] M USD — column/unit misparse",
			importTotal, plausibilityMinMnUSD, plausibilityMaxMnUSD,
		)
	}
	if exportTotal > exportYTD && exportYTD > 0 {
		return domain.TradeBalanceRecord{}, fmt.Errorf(
			"trade_parser: export_total %.0f M USD > export_ytd %.0f M USD — impossible (monthly > cumulative)",
			exportTotal, exportYTD,
		)
	}
	if importTotal > importYTD && importYTD > 0 {
		return domain.TradeBalanceRecord{}, fmt.Errorf(
			"trade_parser: import_total %.0f M USD > import_ytd %.0f M USD — impossible (monthly > cumulative)",
			importTotal, importYTD,
		)
	}
	absBalance := tradeBalance
	if absBalance < 0 {
		absBalance = -absBalance
	}
	if absBalance > plausibilityMaxBalanceMnUSD {
		return domain.TradeBalanceRecord{}, fmt.Errorf(
			"trade_parser: |trade_balance| %.0f M USD > %.0f M USD sane band — column/unit misparse",
			absBalance, plausibilityMaxBalanceMnUSD,
		)
	}

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
// Sheet structure (verified via live excelize.GetRows probe on 2026-06 NSO Excel,
// FIX-NSO-TRADE-VALUE-SCALE recon):
//
//	col 0 (colLabel):    main row label ("TỔNG TRỊ GIÁ" for total, "MẶT HÀNG CHỦ YẾU"
//	                     for HS section header, blank for HS rows and sub-totals)
//	col 1 (colSubLabel): commodity/sector name for HS rows (blank for total row)
//	col 3 (colMonthly):  current-month Trị giá (Triệu USD = M USD, integer string e.g. "46929")
//	col 6 (colYTD):      YTD Trị giá cumulative (M USD, integer string e.g. "215656")
//	col 9 (colYoYPct):   YoY% Trị giá monthly (standard decimal float e.g. "118.0" = 18% growth)
//
// Total row detection: col0 == "TỔNG TRỊ GIÁ" (nsoTotalRowLabel, case-insensitive).
// HS rows: col1 non-blank AND col3 numeric, only after the "MẶT HÀNG CHỦ YẾU" section header.
//
// Unit: Triệu USD (M USD) — NO ×1000 conversion needed. Values are already in M USD.
//
// YoY% parsing: col9 values are standard decimal floats ("118.0", "91.3") — strconv.ParseFloat
// is used directly. ParseVNNumber is NOT used for col9 because it strips periods, which would
// incorrectly convert "118.0" → "1180" (treating decimal point as thousands separator).
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
	hsSectionStarted := false // set to true after "MẶT HÀNG CHỦ YẾU" section header row

	for _, row := range rows {
		// Check col0 for the HS section header BEFORE the minTradeCols guard:
		// the "MẶT HÀNG CHỦ YẾU" row often has only 1 column in excelize GetRows output
		// (trailing empty cells are trimmed), so it would be skipped by the column count check.
		if len(row) >= 1 {
			col0candidate := strings.TrimSpace(row[0])
			if strings.Contains(col0candidate, nsoHSSectionLabel) {
				hsSectionStarted = true
				continue
			}
		}

		// Rows shorter than minTradeCols lack the value/YoY% columns — skip (header/blank rows).
		if len(row) < minTradeCols {
			continue
		}

		col0 := strings.TrimSpace(row[colLabel])
		col1 := strings.TrimSpace(row[colSubLabel])

		// Total row detection: col0 == "TỔNG TRỊ GIÁ" (nsoTotalRowLabel).
		if strings.EqualFold(col0, nsoTotalRowLabel) && !totalFound {
			col3Str := ""
			if len(row) > colMonthly {
				col3Str = strings.TrimSpace(row[colMonthly])
			}
			col6Str := ""
			if len(row) > colYTD {
				col6Str = strings.TrimSpace(row[colYTD])
			}
			col9Str := ""
			if len(row) > colYoYPct {
				col9Str = strings.TrimSpace(row[colYoYPct])
			}

			// Parse col3 (monthly value, M USD): integer string, use ParseVNNumber.
			totalVal, totalOK := domain.ParseVNNumber(col3Str)
			if !totalOK {
				return 0, 0, 0, nil, fmt.Errorf(
					"sheet %q: 'TỔNG TRỊ GIÁ' row col3 (monthly value) %q is not numeric",
					sheetName, col3Str,
				)
			}

			// Parse col6 (YTD value, M USD): integer string, use ParseVNNumber.
			ytdVal := 0.0
			if col6Str != "" {
				if v, ok := domain.ParseVNNumber(col6Str); ok {
					ytdVal = v
				}
			}

			// Parse col9 (YoY%): standard decimal float ("118.0"), use strconv.ParseFloat.
			// Do NOT use ParseVNNumber — it strips periods, turning "118.0" → "1180".
			yoyVal := 0.0
			if col9Str != "" {
				if v, parseErr := strconv.ParseFloat(col9Str, 64); parseErr == nil {
					yoyVal = v
				}
			}

			totalMnUSD = totalVal  // already in M USD (Triệu USD) — no ×1000
			ytdMnUSD = ytdVal      // already in M USD
			yoyPct = yoyVal
			totalFound = true
			continue
		}

		// HS breakdown rows: col1 non-blank AND we are past the HS section header.
		// HS rows have blank col0 and the sector name in col1.
		if hsSectionStarted && col0 == "" && col1 != "" {
			col3Str := ""
			if len(row) > colMonthly {
				col3Str = strings.TrimSpace(row[colMonthly])
			}
			col9Str := ""
			if len(row) > colYoYPct {
				col9Str = strings.TrimSpace(row[colYoYPct])
			}

			// Parse col3 (monthly value M USD).
			hsVal, hsOK := domain.ParseVNNumber(col3Str)
			if !hsOK {
				// Row has no numeric value — skip (dash, blank, structural row).
				continue
			}

			// Parse col9 (YoY% — standard float).
			hsYoY := 0.0
			if col9Str != "" {
				if v, parseErr := strconv.ParseFloat(col9Str, 64); parseErr == nil {
					hsYoY = v
				}
			}

			hsRows = append(hsRows, domain.HSSector{
				NameVI:        strings.TrimSpace(col1),
				AbsoluteBnUSD: hsVal / 1000, // M USD → bn USD for HSSector.AbsoluteBnUSD
				YoYPct:        hsYoY,
				IsEstimate:    false, // primary NSO source (VMT-1a)
			})
		}
	}

	if !totalFound {
		return 0, 0, 0, nil, fmt.Errorf(
			"sheet %q: national total row (col0 == %q) not found — sheet may have wrong structure",
			sheetName, nsoTotalRowLabel,
		)
	}

	return totalMnUSD, ytdMnUSD, yoyPct, hsRows, nil
}

// parseFDITotal reads the FDI sheet (identified by content via selectSheetsByContent)
// and returns the national total registered capital in M USD.
//
// From vmt-3-sample.json fdi.parse_rules: "row where Col1='Tổng số' → total registered capital M USD"
// Column layout per probe: col 0 = province/entity, col 1 = row type label, col 2 = registered M USD.
// Fallback: also check col 0 == "Tổng số" in case of sheet layout variants.
//
// Returns (fdiRegisteredMnUSD, nil) on success.
// Returns (0, error) if the total row cannot be found or the value is unparseable.
func parseFDITotal(f *excelize.File, sheetName string) (float64, error) {
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return 0, fmt.Errorf("sheet %q not found or unreadable: %w", sheetName, err)
	}
	if len(rows) == 0 {
		return 0, fmt.Errorf("sheet %q is empty", sheetName)
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
			return 0, fmt.Errorf("sheet %q: 'Tổng số' row has empty registered capital (col2)", sheetName)
		}

		// FDI values: may be plain integer ("24810") or VN format ("24.810").
		// Use ParseVNNumber which handles both (strips period-separators).
		regVal, ok := domain.ParseVNNumber(regStr)
		if !ok {
			return 0, fmt.Errorf("sheet %q: 'Tổng số' registered capital %q is not parseable", sheetName, regStr)
		}

		return regVal, nil
	}

	return 0, fmt.Errorf("sheet %q: 'Tổng số' row not found", sheetName)
}
