// Package infrastructure — unit tests for VMT-3b GSO/IIP Excel parser.
//
// Test strategy: build a minimal in-memory Excel workbook using excelize,
// populate sheet "2.IIPthang" with anchor data from the live PROBE-3 sample
// (scripts/probes/vmt-3-sample.json), then verify ParseIIPFromExcel output.
//
// Live anchor May-2026 (from vmt-3-sample.json):
//   ["Toàn ngành công nghiệp", "109.3", "103.27", "108.79", "109.08"]
//   → iip_all_industry: YoYPct=103.27, YTDYoYPct=108.79, MoMPct=109.08
//
// Fence-C: this test is in pkg/infrastructure — allowed to import excelize directly.
package infrastructure

import (
	"bytes"
	"testing"

	"github.com/xuri/excelize/v2"
)

// buildIIPTestExcel creates a minimal in-memory Excel workbook with sheet "2.IIPthang"
// populated with the anchor rows from scripts/probes/vmt-3-sample.json.
func buildIIPTestExcel(t *testing.T) []byte {
	t.Helper()
	f := excelize.NewFile()

	// Rename the default "Sheet1" to "2.IIPthang".
	if err := f.SetSheetName("Sheet1", nsoIIPSheetName); err != nil {
		t.Fatalf("buildIIPTestExcel: rename sheet: %v", err)
	}

	// Header row (col indices 0..4 — matches live sheet structure).
	_ = f.SetCellValue(nsoIIPSheetName, "A1", "Sector/subsector name")
	_ = f.SetCellValue(nsoIIPSheetName, "B1", "Tháng 04 vs cùng kỳ năm trước")
	_ = f.SetCellValue(nsoIIPSheetName, "C1", "Tháng 05 vs cùng kỳ năm trước")
	_ = f.SetCellValue(nsoIIPSheetName, "D1", "05 tháng vs cùng kỳ năm trước")
	_ = f.SetCellValue(nsoIIPSheetName, "E1", "Tháng 05 vs tháng trước")

	// Row 2: non-target sub-category (should be skipped by parser).
	_ = f.SetCellValue(nsoIIPSheetName, "A2", "Chia theo ngành")
	_ = f.SetCellValue(nsoIIPSheetName, "B2", "")
	_ = f.SetCellValue(nsoIIPSheetName, "C2", "")
	_ = f.SetCellValue(nsoIIPSheetName, "D2", "")
	_ = f.SetCellValue(nsoIIPSheetName, "E2", "")

	// Row 3: Toàn ngành công nghiệp (all_industry) — LIVE ANCHOR
	// Live sample: ["Toàn ngành công nghiệp", "109.3", "103.27", "108.79", "109.08"]
	_ = f.SetCellValue(nsoIIPSheetName, "A3", "Toàn ngành công nghiệp")
	_ = f.SetCellValue(nsoIIPSheetName, "B3", "109.3")
	_ = f.SetCellValue(nsoIIPSheetName, "C3", "103.27")
	_ = f.SetCellValue(nsoIIPSheetName, "D3", "108.79")
	_ = f.SetCellValue(nsoIIPSheetName, "E3", "109.08")

	// Row 4: Công nghiệp khai khoáng (mining)
	_ = f.SetCellValue(nsoIIPSheetName, "A4", "Công nghiệp khai khoáng")
	_ = f.SetCellValue(nsoIIPSheetName, "B4", "98.0")
	_ = f.SetCellValue(nsoIIPSheetName, "C4", "95.5")
	_ = f.SetCellValue(nsoIIPSheetName, "D4", "97.2")
	_ = f.SetCellValue(nsoIIPSheetName, "E4", "102.3")

	// Row 5: Công nghiệp chế biến, chế tạo (manufacturing)
	_ = f.SetCellValue(nsoIIPSheetName, "A5", "Công nghiệp chế biến, chế tạo")
	_ = f.SetCellValue(nsoIIPSheetName, "B5", "110.5")
	_ = f.SetCellValue(nsoIIPSheetName, "C5", "104.1")
	_ = f.SetCellValue(nsoIIPSheetName, "D5", "109.3")
	_ = f.SetCellValue(nsoIIPSheetName, "E5", "110.0")

	// Row 6: Sản xuất và phân phối điện (electricity)
	_ = f.SetCellValue(nsoIIPSheetName, "A6", "Sản xuất và phân phối điện")
	_ = f.SetCellValue(nsoIIPSheetName, "B6", "112.0")
	_ = f.SetCellValue(nsoIIPSheetName, "C6", "108.5")
	_ = f.SetCellValue(nsoIIPSheetName, "D6", "110.2")
	_ = f.SetCellValue(nsoIIPSheetName, "E6", "105.9")

	// Row 7: another non-target row
	_ = f.SetCellValue(nsoIIPSheetName, "A7", "Cung cấp nước; hoạt động quản lý")
	_ = f.SetCellValue(nsoIIPSheetName, "B7", "101.0")
	_ = f.SetCellValue(nsoIIPSheetName, "C7", "99.8")
	_ = f.SetCellValue(nsoIIPSheetName, "D7", "100.5")
	_ = f.SetCellValue(nsoIIPSheetName, "E7", "101.2")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("buildIIPTestExcel: write: %v", err)
	}
	return buf.Bytes()
}

// TestParseIIPFromExcel_LiveAnchors verifies the live May-2026 anchor values.
// Anchor: "Toàn ngành công nghiệp" → YoYPct=103.27, YTDYoYPct=108.79, MoMPct=109.08
func TestParseIIPFromExcel_LiveAnchors(t *testing.T) {
	excelBytes := buildIIPTestExcel(t)

	record, err := ParseIIPFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseIIPFromExcel: unexpected error: %v", err)
	}

	// Period must be set.
	if record.Period != "2026-05" {
		t.Errorf("Period=%q, want '2026-05'", record.Period)
	}

	// IsEstimate must be false (primary source, PROBE-3 confirmed).
	if record.IsEstimate {
		t.Errorf("record.IsEstimate=true, want false (primary source)")
	}

	// Source must be non-empty.
	if record.Source == "" {
		t.Errorf("record.Source is empty — provenance required")
	}

	// Must have exactly 4 target sectors.
	if len(record.Sectors) != 4 {
		t.Errorf("len(Sectors)=%d, want 4", len(record.Sectors))
	}

	// Find iip_all_industry and verify live anchor values.
	found := false
	for _, s := range record.Sectors {
		if s.Key != "iip_all_industry" {
			continue
		}
		found = true

		// PRIMARY live anchor: YoYPct = 103.27
		if s.YoYPct != 103.27 {
			t.Errorf("iip_all_industry.YoYPct=%.2f, want 103.27 (live PROBE-3 anchor)", s.YoYPct)
		}
		// YTD YoY anchor: 108.79
		if s.YTDYoYPct != 108.79 {
			t.Errorf("iip_all_industry.YTDYoYPct=%.2f, want 108.79 (live PROBE-3 anchor)", s.YTDYoYPct)
		}
		// MoM anchor: 109.08
		if s.MoMPct != 109.08 {
			t.Errorf("iip_all_industry.MoMPct=%.2f, want 109.08 (live PROBE-3 anchor)", s.MoMPct)
		}
		// IsEstimate must be false.
		if s.IsEstimate {
			t.Errorf("iip_all_industry.IsEstimate=true, want false")
		}
		// NameVI must be preserved.
		if s.NameVI != "Toàn ngành công nghiệp" {
			t.Errorf("iip_all_industry.NameVI=%q, want 'Toàn ngành công nghiệp'", s.NameVI)
		}
	}

	if !found {
		t.Errorf("iip_all_industry sector not found in result (expected key 'iip_all_industry')")
	}
}

// TestParseIIPFromExcel_AllFourSectors verifies all 4 target sector keys are present.
func TestParseIIPFromExcel_AllFourSectors(t *testing.T) {
	excelBytes := buildIIPTestExcel(t)

	record, err := ParseIIPFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseIIPFromExcel: unexpected error: %v", err)
	}

	wantKeys := map[string]bool{
		"iip_all_industry": false,
		"iip_manufacturing": false,
		"iip_mining":       false,
		"iip_electricity":  false,
	}

	for _, s := range record.Sectors {
		if _, ok := wantKeys[s.Key]; ok {
			wantKeys[s.Key] = true
		}
	}

	for key, found := range wantKeys {
		if !found {
			t.Errorf("sector key %q not found in result", key)
		}
	}
}

// TestParseIIPFromExcel_MissingSheet returns an error when the sheet is absent.
func TestParseIIPFromExcel_MissingSheet(t *testing.T) {
	// Build an Excel with a DIFFERENT sheet name (not "2.IIPthang").
	f := excelize.NewFile()
	_ = f.SetCellValue("Sheet1", "A1", "header")
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("build wrong-sheet Excel: %v", err)
	}

	_, err := ParseIIPFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Errorf("expected error for missing sheet %q, got nil", nsoIIPSheetName)
	}
}

// TestParseIIPFromExcel_NoTargetRows returns an error when no target sectors are found.
func TestParseIIPFromExcel_NoTargetRows(t *testing.T) {
	f := excelize.NewFile()
	if err := f.SetSheetName("Sheet1", nsoIIPSheetName); err != nil {
		t.Fatalf("rename sheet: %v", err)
	}
	// Only put non-target rows.
	_ = f.SetCellValue(nsoIIPSheetName, "A1", "Header")
	_ = f.SetCellValue(nsoIIPSheetName, "B1", "Col2")
	_ = f.SetCellValue(nsoIIPSheetName, "C1", "Col3")
	_ = f.SetCellValue(nsoIIPSheetName, "D1", "Col4")
	_ = f.SetCellValue(nsoIIPSheetName, "E1", "Col5")
	_ = f.SetCellValue(nsoIIPSheetName, "A2", "Cung cấp nước")
	_ = f.SetCellValue(nsoIIPSheetName, "B2", "100")
	_ = f.SetCellValue(nsoIIPSheetName, "C2", "101")
	_ = f.SetCellValue(nsoIIPSheetName, "D2", "102")
	_ = f.SetCellValue(nsoIIPSheetName, "E2", "103")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, err := ParseIIPFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Errorf("expected error when no target sectors found, got nil")
	}
}
