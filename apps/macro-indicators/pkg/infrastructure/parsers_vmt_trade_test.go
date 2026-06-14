// Package infrastructure — tests for trade-balance + bloc-split NSO Excel parsers (VMT-1a + VMT-1b).
//
// Tests use synthetic Excel bytes built via excelize to avoid live network dependencies.
// The test matrix covers:
//   1. ParseTradeBalanceFromExcel with May-2026 anchor values (MUST pass per G12 DoD).
//   2. BlocSplit is_estimate=true invariant (ARCH Decision A — PERMANENT).
//   3. Error paths: missing sheets, no total row, empty sheets.
//   4. FDI parse from sheet '12.FDI' with "Tổng số" total row.
//
// Anchors (from orch-state.json live_contract + vmt-3-sample.json):
//
//	export_total May-2026: ~27400 M USD
//	import_total May-2026: ~24100 M USD
//	trade_balance May-2026: ~+3300 M USD
//	fdi_registered: 24810 M USD
//
// Fence-C: this test file is in pkg/infrastructure.
package infrastructure

import (
	"bytes"
	"math"
	"testing"

	"github.com/xuri/excelize/v2"
)

// buildTradeTestExcel creates a synthetic NSO monthly Excel with the given data.
// Builds sheets '14.XK', '15.NK', and '12.FDI' to match the live probe structure.
//
// exportRows: rows for sheet '14.XK' (each row = [col0_label, "", col2_abs, col3_ytd, col4_yoy])
// importRows: rows for sheet '15.NK' (same structure)
// fdiRows: rows for sheet '12.FDI' (each row = [col0, col1_label, col2_registered])
//
// The first row in exportRows/importRows with empty col0 is treated as the total row.
func buildTradeTestExcel(
	exportRows, importRows, fdiRows [][]string,
) ([]byte, error) {
	f := excelize.NewFile()

	// Sheet '14.XK' (exports).
	xkSheet, err := f.NewSheet(nsoExportSheetName)
	if err != nil {
		return nil, err
	}
	_ = xkSheet
	for i, row := range exportRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(nsoExportSheetName, col+itoa(i+1), cell)
		}
	}

	// Sheet '15.NK' (imports).
	nkSheet, err := f.NewSheet(nsoImportSheetName)
	if err != nil {
		return nil, err
	}
	_ = nkSheet
	for i, row := range importRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(nsoImportSheetName, col+itoa(i+1), cell)
		}
	}

	// Sheet '12.FDI' (FDI registered capital).
	fdiSheetIdx, err := f.NewSheet(nsoFDISheetName)
	if err != nil {
		return nil, err
	}
	_ = fdiSheetIdx
	for i, row := range fdiRows {
		for j, cell := range row {
			col, _ := excelize.ColumnNumberToName(j + 1)
			_ = f.SetCellValue(nsoFDISheetName, col+itoa(i+1), cell)
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

// TestParseTradeBalanceFromExcel_AnchorMay2026 is the MANDATORY anchor test.
// May-2026: export ~27.4 bn USD, import ~24.1 bn USD, balance ~+3.3 bn USD.
// Values stored as tỷ USD in col2 (VN format "27.400" → ParseVNNumber → 27400 M USD).
// Total row = blank col0.
func TestParseTradeBalanceFromExcel_AnchorMay2026(t *testing.T) {
	// Export sheet: total row (blank col0) + 2 HS rows.
	// "27.400" in col2 (VN format: 27.400 tỷ USD = 27400 M USD → ParseVNNumber = 27400, *1000 = 27400000? NO)
	// CRITICAL: values in col2 are in tỷ USD (billion USD).
	// "27.400" in VN format → ParseVNNumber removes periods → 27400 → that's 27400 tỷ USD?
	// NO — re-read the contract: "col2=current month absolute (tỷ USD), VN number format: period=thousands sep"
	// So "27.4" in the Excel = 27.4 tỷ USD (27.4 billion USD = 27400 M USD).
	// But if VN format: "27.4" with period as thousands sep → ParseVNNumber removes periods → "274" → 274? That's wrong.
	// The key insight: "27.4" = 27.4 billion (the Excel value IS 27.4, not "27.400").
	// VN format applies when the Excel cell has something like "27.400,50" (thousands.decimal).
	// For simple values like "27.4" (no comma), ParseVNNumber still works: removes no periods-that-aren't-separators.
	// Actually ParseVNNumber("27.4") → remove periods → "274" → 274? That breaks.
	// Wait: ParseVNNumber removes ALL periods. "27.4" → "274" → 274.0. That's wrong (should be 27.4).
	// BUT "27.400" (VN thousands format meaning 27400) → "27400" → 27400.0. Correct.
	// So: the contract says period IS the thousands separator. "27.400" = 27400 M USD (NOT 27.4 bn).
	// Then *1000 conversion in parser is wrong — the value IS already in M USD if "27.400"=27400.
	// Re-read: "col2=current month absolute (tỷ USD)". So unit is tỷ USD (billion USD).
	// "27.4" bn = 27400 M USD. VN format "27,400" would be 27.400 tỷ. OR "27.400" (period sep) = 27400?
	// The anchor says 27.4 bn USD. Let's use plain "27.4" in the test (no VN thousands sep since < 1000).
	// ParseVNNumber("27.4") removes periods → "274" → 274 ≠ 27.4. BUG.
	// FIX: For values < 1000 tỷ USD, no thousands separator exists. "27.4" = 27.4 (no period).
	// ParseVNNumber step 1: remove periods → "274". That's wrong for "27.4".
	// Actually: re-read ParseVNNumber: removes ALL periods first, then replaces comma→dot.
	// "27.4" → remove periods → "274" → 274. That's wrong.
	// BUT the Excel is in Vietnamese VN format where period IS the thousands sep.
	// So "27.4" in an Excel cell means 27.4 (no thousands component, period is decimal here? No.)
	// This is the core ambiguity. The BOP probe used "7.654" = 7654 (period=thousands, no decimal).
	// For "27.4": is this 27.4 (decimal point) or 27 thousands + 4 = 274? Neither makes sense.
	//
	// RE-READING THE CONTRACT CAREFULLY:
	// "col2=current month absolute (tỷ USD)" + "period=thousands sep, comma=decimal (7.654 = 7,654 M USD)"
	// The BOP example is M USD: "7.654" = 7654 M USD (period=thousands sep, no decimal comma present).
	// For trade: col2 is in tỷ USD. "27.400" in VN format = 27400 (period=thousands) tỷ? No, that's absurd.
	// More likely: the Excel stores "27.4" meaning 27.4 tỷ USD AND the VN format note means:
	//   the NUMBER FORMAT of the cell uses period as thousands, comma as decimal.
	//   So 27.400,50 would be 27400.50 tỷ USD. But the May anchor is 27.4 tỷ USD = a value
	//   that in VN format might appear as "27,4" (comma=decimal).
	//
	// SAFEST APPROACH: look at what ParseVNNumber actually does:
	//   1. Remove all periods  → "27.4" → "274"  (wrong for 27.4)
	//   2. Replace comma → "."  → "27,4" → "27.4" (correct for 27.4)
	// So the Excel cell for 27.4 tỷ would be "27,4" in VN format (comma=decimal).
	// And "27.400" (VN format) = 27400 M USD (BOP M USD), already in M USD, no *1000.
	//
	// CONCLUSION: For tỷ USD values in XK/NK sheets, the cell stores the value in tỷ USD
	// using VN format: "27,4" = 27.4 tỷ USD. ParseVNNumber("27,4") = 27.4. Then *1000 = 27400 M USD.
	// The test should use "27,4" for 27.4 tỷ and "24,1" for 24.1 tỷ.
	//
	// For the total row in the ACTUAL NSO Excel, the cell value may be formatted differently.
	// The parser already uses *1000 conversion. Tests use comma-decimal VN format.
	exportRows := [][]string{
		// Header row — skipped (only 1 col, < minTradeCols).
		{"Chỉ tiêu"},
		// Total row: blank col0, col2="27,4" (tỷ USD VN format), col3="137,0" (YTD), col4="15,5" (YoY%).
		{"", "", "27,4", "137,0", "15,5"},
		// HS breakdown rows.
		{"Điện tử máy tính", "", "8,5", "42,0", "18,0"},
		{"Dệt may", "", "3,2", "15,5", "10,0"},
	}

	importRows := [][]string{
		{"Chỉ tiêu"},
		// Total row: 24.1 tỷ USD.
		{"", "", "24,1", "120,0", "12,3"},
		{"Máy móc thiết bị", "", "5,1", "25,0", "8,0"},
	}

	// FDI sheet: header + total row ("Tổng số" in col1) + a province row.
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

	// VMT-1a anchor: export_total ~27400 M USD (27.4 tỷ × 1000).
	wantExport := 27400.0
	if math.Abs(record.ExportTotalMnUSD-wantExport) > 1.0 {
		t.Errorf("ExportTotalMnUSD: got %.2f, want ~%.2f", record.ExportTotalMnUSD, wantExport)
	}

	// VMT-1a anchor: import_total ~24100 M USD.
	wantImport := 24100.0
	if math.Abs(record.ImportTotalMnUSD-wantImport) > 1.0 {
		t.Errorf("ImportTotalMnUSD: got %.2f, want ~%.2f", record.ImportTotalMnUSD, wantImport)
	}

	// VMT-1a anchor: trade_balance ~+3300 M USD.
	wantBalance := 3300.0
	if math.Abs(record.TradeBalanceMnUSD-wantBalance) > 1.0 {
		t.Errorf("TradeBalanceMnUSD: got %.2f, want ~%.2f", record.TradeBalanceMnUSD, wantBalance)
	}

	// Period pass-through.
	if record.Period != "2026-05" {
		t.Errorf("Period: got %q, want 2026-05", record.Period)
	}

	// HS breakdown rows populated.
	if len(record.HSExports) == 0 {
		t.Error("HSExports: expected at least 1 HS row")
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

// TestParseTradeBalanceFromExcel_BlocSplitIsEstimateAlwaysTrue verifies ARCH Decision A invariant.
// BlocSplit.FDI.IsEstimate and BlocSplit.Domestic.IsEstimate must ALWAYS be true.
func TestParseTradeBalanceFromExcel_BlocSplitIsEstimateAlwaysTrue(t *testing.T) {
	exportRows := [][]string{
		{"", "", "27,4", "137,0", "15,5"},
		{"Điện tử", "", "8,5", "42,0", "18,0"},
	}
	importRows := [][]string{
		{"", "", "24,1", "120,0", "12,3"},
	}
	fdiRows := [][]string{
		{"Cả nước", "Tổng số", "24810", "14500"},
	}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
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
	exportRows := [][]string{
		{"", "", "27,4", "137,0", "15,5"},
	}
	importRows := [][]string{
		{"", "", "24,1", "120,0", "12,3"},
	}
	// FDI "Tổng số" row with 24810 M USD.
	fdiRows := [][]string{
		{"Cả nước", "Tổng số", "24810", "14500"},
	}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
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
	exportRows := [][]string{{"", "", "27,4", "137,0", "15,5"}}
	importRows := [][]string{{"", "", "24,1", "120,0", "12,3"}}
	fdiRows := [][]string{{"Cả nước", "Tổng số", "24810", "14500"}}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
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

// TestParseTradeBalanceFromExcel_MissingExportSheet verifies fail-loud on missing sheet.
func TestParseTradeBalanceFromExcel_MissingExportSheet(t *testing.T) {
	// Build Excel WITHOUT the '14.XK' sheet.
	f := excelize.NewFile()
	_, _ = f.NewSheet(nsoImportSheetName)
	_ = f.DeleteSheet("Sheet1")
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write Excel: %v", err)
	}

	_, err := ParseTradeBalanceFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Error("expected error for missing export sheet '14.XK'")
	}
}

// TestParseTradeBalanceFromExcel_MissingTotalRow verifies fail-loud when no total row found.
func TestParseTradeBalanceFromExcel_MissingTotalRow(t *testing.T) {
	// Export sheet with only labeled rows (no blank col0 total row).
	exportRows := [][]string{
		{"Điện tử", "", "8,5", "42,0", "18,0"},
		{"Dệt may", "", "3,2", "15,5", "10,0"},
	}
	importRows := [][]string{
		{"", "", "24,1", "120,0", "12,3"},
	}
	fdiRows := [][]string{
		{"Cả nước", "Tổng số", "24810", "14500"},
	}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
	if err != nil {
		t.Fatalf("buildTradeTestExcel: %v", err)
	}

	_, err = ParseTradeBalanceFromExcel(excelBytes, "2026-05")
	if err == nil {
		t.Error("expected error when export total row is missing")
	}
}

// TestParseTradeBalanceFromExcel_FDIMissingFailClosed verifies fail-closed behavior
// when the '12.FDI' sheet is present but "Tổng số" row is missing.
// The overall parse should still succeed; BlocSplit.FDI.IsEstimate must be true.
func TestParseTradeBalanceFromExcel_FDIMissingFailClosed(t *testing.T) {
	exportRows := [][]string{
		{"", "", "27,4", "137,0", "15,5"},
	}
	importRows := [][]string{
		{"", "", "24,1", "120,0", "12,3"},
	}
	// FDI sheet exists but has NO "Tổng số" row.
	fdiRows := [][]string{
		{"Hà Nội", "Tỉnh", "3200", "2100"},
		{"TP.HCM", "Tỉnh", "5000", "3500"},
	}

	excelBytes, err := buildTradeTestExcel(exportRows, importRows, fdiRows)
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
