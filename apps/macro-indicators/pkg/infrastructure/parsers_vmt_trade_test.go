// Package infrastructure — tests for trade-balance + bloc-split NSO Excel parsers (VMT-1a + VMT-1b).
//
// Tests use synthetic Excel bytes built via excelize to avoid live network dependencies.
// The test matrix covers:
//  1. ParseTradeBalanceFromExcel with May-2026 anchor values (MUST pass per G12 DoD).
//  2. BlocSplit is_estimate=true invariant (ARCH Decision A — PERMANENT).
//  3. Error paths: missing sheets, no total row, empty sheets.
//  4. FDI parse from sheet '12.FDI' with "Tổng số" total row.
//  5. TestSelectSheetsByContent: content-based selection with SPACED names "14. XK"/"15. NK".
//  6. Plausibility guard: monthly > YTD, value out of band → parser error (FIX-NSO-TRADE-VALUE-SCALE).
//
// FIX-NSO-TRADE-VALUE-SCALE (2026-06-15): tests updated to match the LIVE 2026-06 NSO Excel
// column layout, verified via excelize.GetRows probe on the cached 646KB NSO Excel:
//   - Total row: col0="TỔNG TRỊ GIÁ", col3=monthly M USD, col6=YTD M USD, col9=YoY% (std float)
//   - HS rows: col0="", col1=sectorName, col3=monthly M USD, col9=YoY%
//   - HS section header: col0="MẶT HÀNG CHỦ YẾU" (arms HS collection)
//   - Unit: Triệu USD (M USD) — NO ×1000 conversion needed
//   - YoY%: standard float "118.0" (NOT VN format — strconv.ParseFloat, NOT ParseVNNumber)
//
// FIX-NSO-TRADE-SHEET (prior, 4c2fcb5c): uses actual sheet names "14. XK"/"15. NK"
// (with space after period). Sheet selection is content-based via A1 header — immune to
// month-to-month name drift.
//
// Corrected anchors for May-2026 (from live NSO Excel 2026-06 excelize probe):
//
//	export_total:  ~46929 M USD (corrected from wrong 27400 due to col2/col3 misparse)
//	import_total:  ~52141 M USD (corrected from wrong 24100)
//	trade_balance: ~-5212 M USD (deficit; corrected from wrong +3300)
//	fdi_registered: 24810 M USD (unchanged)
//
// Fence-C: this test file is in pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"math"
	"testing"

	"github.com/xuri/excelize/v2"
)

// Actual sheet names from the live 2026-06 NSO monthly Excel (with space after period).
// Used in buildTradeTestExcel to match real-world conditions for FIX-NSO-TRADE-SHEET.
const (
	testExportSheetName = "14. XK" // actual NSO name: space after period
	testImportSheetName = "15. NK" // actual NSO name: space after period
	testFDISheetName    = "12.FDI" // unchanged: no space (still matches hardcoded)
)

// makeTradeRow builds a 13-element row slice matching the live NSO Excel column layout.
//
// FIX-NSO-TRADE-VALUE-SCALE: column layout verified via excelize.GetRows probe 2026-06:
//
//	col 0 (colLabel):    row label ("TỔNG TRỊ GIÁ", "MẶT HÀNG CHỦ YẾU", or "" for HS rows)
//	col 1 (colSubLabel): commodity/sector name for HS rows (blank for total/header rows)
//	col 2:               Lượng (quantity, nghìn tấn — blank for most rows, causes old col2 bug)
//	col 3 (colMonthly):  monthly Trị giá M USD (integer string, e.g. "46929")
//	col 4-5:             blank (Lượng YTD, etc.)
//	col 6 (colYTD):      YTD Trị giá M USD (integer string, e.g. "215656")
//	col 7-8:             blank
//	col 9 (colYoYPct):   YoY% Trị giá monthly (standard decimal float, e.g. "118.0")
//	col 10-12:           blank (additional YoY% columns)
func makeTradeRow(label, subLabel, monthlyMnUSD, ytdMnUSD, yoyPct string) []string {
	row := make([]string, 13)
	row[colLabel] = label          // col 0: main label
	row[colSubLabel] = subLabel    // col 1: sub-label / commodity name
	// col 2: Lượng (blank — most rows have no quantity; the old parser wrongly used this)
	row[colMonthly] = monthlyMnUSD // col 3: monthly Trị giá M USD
	// col 4: blank
	// col 5: Lượng YTD (blank)
	row[colYTD] = ytdMnUSD        // col 6: YTD Trị giá M USD
	// col 7, 8: blank
	row[colYoYPct] = yoyPct       // col 9: YoY% standard float (NOT VN format)
	// col 10, 11, 12: blank (additional YoY columns)
	return row
}

// buildTradeTestExcel creates a synthetic NSO monthly Excel matching the LIVE 2026-06 layout.
//
// FIX-NSO-TRADE-VALUE-SCALE: structure verified against live excelize.GetRows probe.
//
// Row layout per sheet:
//
//	Row 1 (A1): Vietnamese header keyword (for selectSheetsByContent — not a data row)
//	Rows 2+: caller-supplied data rows (exportRows/importRows — use makeTradeRow)
//
// exportRows: rows for "14. XK" sheet (A1 = "14. Hàng hóa xuất khẩu")
// importRows: rows for "15. NK" sheet (A1 = "15. Hàng hóa nhập khẩu")
// fdiRows: rows for "12.FDI" sheet (A1 = "12. Đầu tư nước ngoài vào Việt Nam")
func buildTradeTestExcel(
	exportRows, importRows, fdiRows [][]string,
) ([]byte, error) {
	f := excelize.NewFile()

	// Export sheet with spaced name "14. XK" and A1 header "14. Hàng hóa xuất khẩu".
	xkSheet, err := f.NewSheet(testExportSheetName)
	if err != nil {
		return nil, err
	}
	_ = xkSheet
	// Set A1 header so selectSheetsByContent can identify this as the export sheet.
	_ = f.SetCellValue(testExportSheetName, "A1", "14. Hàng hóa xuất khẩu")
	for i, row := range exportRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(testExportSheetName, col+itoa(i+2), cell) // offset by 1 for the A1 header
		}
	}

	// Import sheet with spaced name "15. NK" and A1 header "15. Hàng hóa nhập khẩu".
	nkSheet, err := f.NewSheet(testImportSheetName)
	if err != nil {
		return nil, err
	}
	_ = nkSheet
	// Set A1 header so selectSheetsByContent can identify this as the import sheet.
	_ = f.SetCellValue(testImportSheetName, "A1", "15. Hàng hóa nhập khẩu")
	for i, row := range importRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(testImportSheetName, col+itoa(i+2), cell)
		}
	}

	// FDI sheet "12.FDI" with A1 header "12. Đầu tư nước ngoài vào Việt Nam".
	fdiSheetIdx, err := f.NewSheet(testFDISheetName)
	if err != nil {
		return nil, err
	}
	_ = fdiSheetIdx
	// Set A1 header so selectSheetsByContent can identify this as the FDI sheet.
	_ = f.SetCellValue(testFDISheetName, "A1", "12. Đầu tư nước ngoài vào Việt Nam")
	for i, row := range fdiRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(testFDISheetName, col+itoa(i+2), cell)
		}
	}

	// Remove default "Sheet1" if present.
	_ = f.DeleteSheet("Sheet1")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// itoa converts an int to string (avoids fmt dependency for simple ints).
func itoa(n int) string {
	if n < 0 {
		return "-"
	}
	s := ""
	if n == 0 {
		return "0"
	}
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

// ---------------------------------------------------------------------------
// Minimal valid trade rows for tests that just need parse to succeed.
// ---------------------------------------------------------------------------

// minExportRows is a minimal valid export sheet: total row only.
// Values within plausibility band: 46929 M USD monthly < 215656 M USD YTD.
var minExportRows = [][]string{
	makeTradeRow("TỔNG TRỊ GIÁ", "", "46929", "215656", "118.0"),
}

// minImportRows is a minimal valid import sheet: total row only.
// Values within plausibility band: 52141 M USD monthly < 229464 M USD YTD.
var minImportRows = [][]string{
	makeTradeRow("TỔNG TRỊ GIÁ", "", "52141", "229464", "133.8"),
}

// minFDIRows is a minimal valid FDI sheet: total row only.
var minFDIRows = [][]string{
	{"Cả nước", "Tổng số", "24810", "14500"},
}

// ---------------------------------------------------------------------------
// TestParseTradeBalanceFromExcel_AnchorMay2026 — MANDATORY anchor (G12 DoD gate)
// ---------------------------------------------------------------------------

// TestParseTradeBalanceFromExcel_AnchorMay2026 is the MANDATORY anchor test (G12 DoD).
//
// FIX-NSO-TRADE-VALUE-SCALE: corrected anchor values from live NSO Excel 2026-06:
//
//	export_total: 46929 M USD (col3 of "TỔNG TRỊ GIÁ" row in XK sheet)
//	import_total: 52141 M USD (col3 of "TỔNG TRỊ GIÁ" row in NK sheet)
//	trade_balance: -5212 M USD (46929 - 52141 = -5212, VN ran a deficit in May-2026)
//
// The test also verifies:
//   - YTD values parsed from col6
//   - YoY% parsed as standard float from col9 (NOT VN format)
//   - HS sector rows collected after "MẶT HÀNG CHỦ YẾU" section header
//   - HS label comes from col1 (sub-label), not col0
//   - HSSector.AbsoluteBnUSD = monthly M USD / 1000
func TestParseTradeBalanceFromExcel_AnchorMay2026(t *testing.T) {
	// Export sheet structure (matches live NSO Excel 2026-06):
	// - Total row: col0="TỔNG TRỊ GIÁ", col3=46929 M USD, col6=215656 M USD YTD, col9=118.0 YoY%
	// - Bloc sub-total rows (col0="", col1=zone label) — present in live Excel after total
	// - HS section header: col0="MẶT HÀNG CHỦ YẾU" (arms HS row collection)
	// - HS commodity rows: col0="", col1=commodity name, col3=monthly M USD, col9=YoY%
	exportRows := [][]string{
		makeTradeRow("TỔNG TRỊ GIÁ", "", "46929", "215656", "118.0"),
		// Bloc sub-totals (after total; before HS section — NOT the national total)
		makeTradeRow("", "Khu vực kinh tế trong nước", "9051", "43498", "103.5"),
		makeTradeRow("", "Khu vực có vốn đầu tư NN", "37878", "172158", "122.0"),
		// HS section header — arms hsSectionStarted flag
		makeTradeRow("MẶT HÀNG CHỦ YẾU", "", "", "", ""),
		// HS commodity breakdown rows
		makeTradeRow("", "Điện tử, máy tính", "13394", "60000", "146.3"),
		makeTradeRow("", "Dệt may", "3188", "15000", "96.6"),
	}

	importRows := [][]string{
		makeTradeRow("TỔNG TRỊ GIÁ", "", "52141", "229464", "133.8"),
		makeTradeRow("", "Khu vực kinh tế trong nước", "13175", "64261", "122.2"),
		makeTradeRow("MẶT HÀNG CHỦ YẾU", "", "", "", ""),
		makeTradeRow("", "Máy móc thiết bị", "5100", "25000", "110.0"),
	}

	fdiRows := [][]string{
		{"Tỉnh/Thành phố", "Loại", "Vốn đăng ký (Triệu USD)", "Vốn thực hiện"},
		{"Cả nước", "Tổng số", "24810", "14500"},
		{"Hà Nội", "Tỉnh", "3200", "2100"},
	}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseTradeBalanceFromExcel: %v", err)
	}

	// FIX-NSO-TRADE-VALUE-SCALE anchor: export_total ~46929 M USD (live NSO May-2026).
	wantExport := 46929.0
	if math.Abs(record.ExportTotalMnUSD-wantExport) > 1.0 {
		t.Errorf("ExportTotalMnUSD: got %.2f, want ~%.2f", record.ExportTotalMnUSD, wantExport)
	}

	// FIX-NSO-TRADE-VALUE-SCALE anchor: import_total ~52141 M USD.
	wantImport := 52141.0
	if math.Abs(record.ImportTotalMnUSD-wantImport) > 1.0 {
		t.Errorf("ImportTotalMnUSD: got %.2f, want ~%.2f", record.ImportTotalMnUSD, wantImport)
	}

	// FIX-NSO-TRADE-VALUE-SCALE anchor: trade_balance ~-5212 M USD (deficit).
	wantBalance := -5212.0
	if math.Abs(record.TradeBalanceMnUSD-wantBalance) > 1.0 {
		t.Errorf("TradeBalanceMnUSD: got %.2f, want ~%.2f", record.TradeBalanceMnUSD, wantBalance)
	}

	// YTD values from col6.
	wantExportYTD := 215656.0
	if math.Abs(record.ExportYTDMnUSD-wantExportYTD) > 1.0 {
		t.Errorf("ExportYTDMnUSD: got %.2f, want ~%.2f", record.ExportYTDMnUSD, wantExportYTD)
	}
	wantImportYTD := 229464.0
	if math.Abs(record.ImportYTDMnUSD-wantImportYTD) > 1.0 {
		t.Errorf("ImportYTDMnUSD: got %.2f, want ~%.2f", record.ImportYTDMnUSD, wantImportYTD)
	}

	// YoY% from col9 (standard decimal float, strconv.ParseFloat NOT ParseVNNumber).
	// "118.0" stored as-is — represents 118% index (= 18% growth vs prior year).
	wantExportYoY := 118.0
	if math.Abs(record.ExportYoYPct-wantExportYoY) > 0.1 {
		t.Errorf("ExportYoYPct: got %.2f, want ~%.2f", record.ExportYoYPct, wantExportYoY)
	}

	// Period pass-through.
	if record.Period != "2026-05" {
		t.Errorf("Period: got %q, want 2026-05", record.Period)
	}

	// HS breakdown rows from col1 (sub-label), after "MẶT HÀNG CHỦ YẾU" section header.
	if len(record.HSExports) == 0 {
		t.Error("HSExports: expected at least 1 HS row (after MẶT HÀNG CHỦ YẾU section header)")
	}
	// Verify HS sector label comes from col1 (not col0) and AbsoluteBnUSD = M USD / 1000.
	found := false
	for _, s := range record.HSExports {
		if s.NameVI == "Điện tử, máy tính" {
			found = true
			// 13394 M USD / 1000 = 13.394 bn USD
			wantBnUSD := 13.394
			if math.Abs(s.AbsoluteBnUSD-wantBnUSD) > 0.01 {
				t.Errorf("HSExport 'Điện tử, máy tính' AbsoluteBnUSD: got %.4f, want ~%.4f",
					s.AbsoluteBnUSD, wantBnUSD)
			}
		}
	}
	if !found {
		t.Errorf("HSExports: expected sector 'Điện tử, máy tính' (col1 sub-label) — got %v", record.HSExports)
	}

	// VMT-1a is_estimate=false (primary source).
	if record.IsEstimate {
		t.Error("TradeBalanceRecord.IsEstimate must be false (primary NSO source)")
	}
	for _, s := range record.HSExports {
		if s.IsEstimate {
			t.Errorf("HSExport %q IsEstimate must be false (primary NSO source)", s.NameVI)
		}
	}
}

// ---------------------------------------------------------------------------
// BlocSplit invariants (ARCH Decision A — PERMANENT)
// ---------------------------------------------------------------------------

// TestParseTradeBalanceFromExcel_BlocSplitIsEstimateAlwaysTrue verifies ARCH Decision A invariant.
// BlocSplit.FDI.IsEstimate and BlocSplit.Domestic.IsEstimate must ALWAYS be true.
func TestParseTradeBalanceFromExcel_BlocSplitIsEstimateAlwaysTrue(t *testing.T) {
	excelBytes, err := buildTradeTestExcel(minExportRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseTradeBalanceFromExcel: %v", err)
	}

	// ARCH Decision A — PERMANENT.
	if !record.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true ALWAYS (ARCH Decision A)")
	}
	if !record.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must be true ALWAYS (ARCH Decision A)")
	}
}

// TestParseTradeBalanceFromExcel_BlocSplitFDIValue verifies FDI registered capital parse.
// 24810 M USD from the '12.FDI' sheet "Tổng số" row.
func TestParseTradeBalanceFromExcel_BlocSplitFDIValue(t *testing.T) {
	excelBytes, err := buildTradeTestExcel(minExportRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseTradeBalanceFromExcel: %v", err)
	}

	if math.Abs(record.BlocSplit.FDIRegisteredMnUSD-24810.0) > 0.01 {
		t.Errorf("BlocSplit.FDIRegisteredMnUSD: got %.2f, want 24810.0", record.BlocSplit.FDIRegisteredMnUSD)
	}
}

// TestParseTradeBalanceFromExcel_BlocSplitNote verifies the permanent cross-join note.
func TestParseTradeBalanceFromExcel_BlocSplitNote(t *testing.T) {
	excelBytes, err := buildTradeTestExcel(minExportRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseTradeBalanceFromExcel: %v", err)
	}

	wantNote := "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"
	if record.BlocSplit.Note != wantNote {
		t.Errorf("BlocSplit.Note: got %q, want %q", record.BlocSplit.Note, wantNote)
	}
}

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

// TestParseTradeBalanceFromExcel_MissingExportSheet verifies fail-loud on missing sheet.
// FIX-NSO-TRADE-SHEET: missing sheet is detected via selectSheetsByContent failure
// (no sheet with A1 "xuất khẩu" found), not by hardcoded name lookup.
func TestParseTradeBalanceFromExcel_MissingExportSheet(t *testing.T) {
	// Build Excel with only an import sheet (no export sheet A1 "xuất khẩu").
	f := excelize.NewFile()
	_, _ = f.NewSheet("15. NK")
	_ = f.SetCellValue("15. NK", "A1", "15. Hàng hóa nhập khẩu")
	_ = f.DeleteSheet("Sheet1")
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write Excel: %v", err)
	}

	_, err := ParseTradeBalanceFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Error("expected error when no sheet with A1 containing 'xuất khẩu' is found")
	}
}

// TestParseTradeBalanceFromExcel_MissingTotalRow verifies fail-loud when no total row found.
// FIX-NSO-TRADE-VALUE-SCALE: total row must have col0 == "TỔNG TRỊ GIÁ".
// A sheet with no such row returns an error.
func TestParseTradeBalanceFromExcel_MissingTotalRow(t *testing.T) {
	// Export sheet with NO "TỔNG TRỊ GIÁ" row — only HS sub-rows.
	exportRows := [][]string{
		makeTradeRow("MẶT HÀNG CHỦ YẾU", "", "", "", ""),
		makeTradeRow("", "Điện tử, máy tính", "13394", "60000", "146.3"),
		makeTradeRow("", "Dệt may", "3188", "15000", "96.6"),
	}
	excelBytes, err := buildTradeTestExcel(exportRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	_, err = ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err == nil {
		t.Error("expected error when export 'TỔNG TRỊ GIÁ' total row is missing")
	}
}

// TestParseTradeBalanceFromExcel_FDIMissingFailClosed verifies fail-closed behavior
// when the FDI sheet is present but "Tổng số" row is missing.
// The overall parse should still succeed; BlocSplit.FDI.IsEstimate must be true.
func TestParseTradeBalanceFromExcel_FDIMissingFailClosed(t *testing.T) {
	// FDI sheet exists but has NO "Tổng số" row.
	fdiRowsMissing := [][]string{
		{"Hà Nội", "Tỉnh", "3200", "2100"},
		{"TP.HCM", "Tỉnh", "5000", "3500"},
	}

	excelBytes, err := buildTradeTestExcel(minExportRows, minImportRows, fdiRowsMissing)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	// Should NOT return an error — FDI parse failure is non-fatal (fail-closed).
	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseTradeBalanceFromExcel: unexpected error on FDI miss: %v", err)
	}

	// Fail-closed: BlocSplit still has is_estimate=true even with zero FDI.
	if !record.BlocSplit.FDI.IsEstimate {
		t.Error("BlocSplit.FDI.IsEstimate must be true even when FDI parse fails (fail-closed)")
	}
	if !record.BlocSplit.Domestic.IsEstimate {
		t.Error("BlocSplit.Domestic.IsEstimate must be true even when FDI parse fails (fail-closed)")
	}
}

// ---------------------------------------------------------------------------
// FIX-NSO-TRADE-VALUE-SCALE — plausibility guard tests
// ---------------------------------------------------------------------------

// TestParseTradeBalanceFromExcel_PlausibilityGuard_MonthlyExceedsYTD verifies that
// the parser fails loudly when monthly > YTD (impossible — single month cannot exceed cumulative).
// This is the primary FIX-NSO-TRADE-VALUE-SCALE guard condition that would have caught
// the original implausible values (June import 212000mn = 59% of YTD 358000mn).
func TestParseTradeBalanceFromExcel_PlausibilityGuard_MonthlyExceedsYTD(t *testing.T) {
	// Export monthly (80000) > YTD (50000) — impossible.
	exportBadRows := [][]string{
		makeTradeRow("TỔNG TRỊ GIÁ", "", "80000", "50000", "110.0"),
	}
	excelBytes, err := buildTradeTestExcel(exportBadRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	_, err = ParseTradeBalanceFromExcel(excelBytes, "2026-06")
	if err == nil {
		t.Error("expected plausibility error when export_total > export_ytd (monthly > cumulative)")
	}
}

// TestParseTradeBalanceFromExcel_PlausibilityGuard_ValueOutOfBand verifies that
// the parser fails loudly when a monthly value is implausibly large (> 200000 M USD = $200bn).
// The original bug produced 212000 M USD import (=$212bn) — this guard catches it.
func TestParseTradeBalanceFromExcel_PlausibilityGuard_ValueOutOfBand(t *testing.T) {
	// Import = 212000 M USD ($212bn) — implausibly large (the old bug value).
	importBadRows := [][]string{
		makeTradeRow("TỔNG TRỊ GIÁ", "", "212000", "358000", "130.0"),
	}
	excelBytes, err := buildTradeTestExcel(minExportRows, importBadRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	_, err = ParseTradeBalanceFromExcel(excelBytes, "2026-06")
	if err == nil {
		t.Error("expected plausibility error when import_total=212000 M USD (> 200000 M USD upper bound)")
	}
}

// TestParseTradeBalanceFromExcel_PlausibilityGuard_BalanceOutOfBand verifies that
// the parser fails loudly when |balance| > 50000 M USD ($50bn).
func TestParseTradeBalanceFromExcel_PlausibilityGuard_BalanceOutOfBand(t *testing.T) {
	// Export=8000, Import=70000 -> balance=-62000 M USD (|$62bn| > $50bn limit).
	exportSmall := [][]string{makeTradeRow("TỔNG TRỊ GIÁ", "", "8000", "40000", "110.0")}
	importLarge := [][]string{makeTradeRow("TỔNG TRỊ GIÁ", "", "70000", "200000", "130.0")}
	excelBytes, err := buildTradeTestExcel(exportSmall, importLarge, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	_, err = ParseTradeBalanceFromExcel(excelBytes, "2026-06")
	if err == nil {
		t.Error("expected plausibility error when |trade_balance|=62000 M USD > 50000 M USD sane band")
	}
}

// TestParseTradeBalanceFromExcel_PlausibilityGuard_ValidValues verifies that
// plausible monthly values pass the guard without error.
// VN monthly trade ~$25-60bn (25000-60000 M USD): both must be within [5000, 200000].
func TestParseTradeBalanceFromExcel_PlausibilityGuard_ValidValues(t *testing.T) {
	excelBytes, err := buildTradeTestExcel(minExportRows, minImportRows, minFDIRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	record, err := ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("plausibility guard rejected valid values: %v", err)
	}

	// Verify values are within plausible band.
	if record.ExportTotalMnUSD < plausibilityMinMnUSD || record.ExportTotalMnUSD > plausibilityMaxMnUSD {
		t.Errorf("ExportTotalMnUSD %.0f outside [%.0f, %.0f]",
			record.ExportTotalMnUSD, plausibilityMinMnUSD, plausibilityMaxMnUSD)
	}
	if record.ImportTotalMnUSD < plausibilityMinMnUSD || record.ImportTotalMnUSD > plausibilityMaxMnUSD {
		t.Errorf("ImportTotalMnUSD %.0f outside [%.0f, %.0f]",
			record.ImportTotalMnUSD, plausibilityMinMnUSD, plausibilityMaxMnUSD)
	}
	if record.ExportTotalMnUSD > record.ExportYTDMnUSD {
		t.Errorf("ExportTotalMnUSD %.0f > ExportYTDMnUSD %.0f (impossible)",
			record.ExportTotalMnUSD, record.ExportYTDMnUSD)
	}
	if record.ImportTotalMnUSD > record.ImportYTDMnUSD {
		t.Errorf("ImportTotalMnUSD %.0f > ImportYTDMnUSD %.0f (impossible)",
			record.ImportTotalMnUSD, record.ImportYTDMnUSD)
	}
}

// ---------------------------------------------------------------------------
// FIX-NSO-TRADE-SHEET — content-based sheet selection tests (unchanged from prior fix)
// ---------------------------------------------------------------------------

// TestSelectSheetsByContent verifies that selectSheetsByContent correctly identifies
// export/import/FDI sheets by A1 header content, not by sheet name.
//
// This is the primary gate for FIX-NSO-TRADE-SHEET: the actual 2026-06 NSO Excel
// uses "14. XK" and "15. NK" (SPACE after period) which would NOT match the old
// hardcoded "14.XK" / "15.NK" constants.
func TestSelectSheetsByContent(t *testing.T) {
	f := excelize.NewFile()

	// Build sheets with ACTUAL 2026-06 NSO names (space after period).
	_, _ = f.NewSheet("14. XK")
	_ = f.SetCellValue("14. XK", "A1", "14. Hàng hóa xuất khẩu")

	_, _ = f.NewSheet("15. NK")
	_ = f.SetCellValue("15. NK", "A1", "15. Hàng hóa nhập khẩu")

	_, _ = f.NewSheet("12.FDI")
	_ = f.SetCellValue("12.FDI", "A1", "12. Đầu tư nước ngoài vào Việt Nam được cấp phép từ 01/01- 31/5/2026")

	// Add noise sheets that should NOT be selected.
	_, _ = f.NewSheet("1.Nong nghiep")
	_ = f.SetCellValue("1.Nong nghiep", "A1", "1. Nông nghiệp, lâm nghiệp và thủy sản")
	_, _ = f.NewSheet("16.CPI")
	_ = f.SetCellValue("16.CPI", "A1", "16. Chỉ số giá tiêu dùng")

	_ = f.DeleteSheet("Sheet1")

	exportSheet, importSheet, fdiSheet, err := selectSheetsByContent(f)
	if err != nil {
		t.Fatalf("selectSheetsByContent: unexpected error: %v", err)
	}

	if exportSheet != "14. XK" {
		t.Errorf("exportSheet=%q, want '14. XK' (space after period — actual NSO 2026-06 name)", exportSheet)
	}
	if importSheet != "15. NK" {
		t.Errorf("importSheet=%q, want '15. NK' (space after period — actual NSO 2026-06 name)", importSheet)
	}
	if fdiSheet != "12.FDI" {
		t.Errorf("fdiSheet=%q, want '12.FDI'", fdiSheet)
	}
}

// TestSelectSheetsByContent_OldNamesNoSpaceAlsoWork verifies that the OLD sheet names
// without spaces ("14.XK", "15.NK") still work IF the A1 headers contain the keywords.
// This ensures forward compatibility when NSO reverts to the old naming convention.
func TestSelectSheetsByContent_OldNamesNoSpaceAlsoWork(t *testing.T) {
	f := excelize.NewFile()

	_, _ = f.NewSheet("14.XK")
	_ = f.SetCellValue("14.XK", "A1", "14. Hàng hóa xuất khẩu")

	_, _ = f.NewSheet("15.NK")
	_ = f.SetCellValue("15.NK", "A1", "15. Hàng hóa nhập khẩu")

	_, _ = f.NewSheet("12.FDI")
	_ = f.SetCellValue("12.FDI", "A1", "12. Đầu tư nước ngoài vào Việt Nam")

	_ = f.DeleteSheet("Sheet1")

	exportSheet, importSheet, fdiSheet, err := selectSheetsByContent(f)
	if err != nil {
		t.Fatalf("selectSheetsByContent: unexpected error with old names (no space): %v", err)
	}

	if exportSheet != "14.XK" {
		t.Errorf("exportSheet=%q, want '14.XK'", exportSheet)
	}
	if importSheet != "15.NK" {
		t.Errorf("importSheet=%q, want '15.NK'", importSheet)
	}
	if fdiSheet != "12.FDI" {
		t.Errorf("fdiSheet=%q, want '12.FDI'", fdiSheet)
	}
}

// TestSelectSheetsByContent_FailLoudOnMissingPattern verifies fail-loud behavior
// when one of the required patterns is not found in any sheet's A1 header.
func TestSelectSheetsByContent_FailLoudOnMissingPattern(t *testing.T) {
	f := excelize.NewFile()

	// Export sheet present, import sheet present, FDI sheet MISSING.
	_, _ = f.NewSheet("14. XK")
	_ = f.SetCellValue("14. XK", "A1", "14. Hàng hóa xuất khẩu")
	_, _ = f.NewSheet("15. NK")
	_ = f.SetCellValue("15. NK", "A1", "15. Hàng hóa nhập khẩu")
	// No FDI sheet.
	_ = f.DeleteSheet("Sheet1")

	_, _, _, err := selectSheetsByContent(f)
	if err == nil {
		t.Error("expected error when FDI pattern ('đầu tư') is not found — fail-loud required")
	}
}
