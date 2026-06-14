// Package infrastructure — unit tests for VMT-4 CPI Excel parser.
//
// Test strategy: build a minimal in-memory Excel workbook using excelize,
// populate sheet "16.CPI" with anchor data from the live PROBE-3 sample
// (scripts/probes/vmt-3-sample.json), then verify ParseCPIFromExcel output.
//
// Live anchor May-2026 (from vmt-3-sample.json sample_cpi_may2026):
//   cpi_total: total_cpi_vs_prev_month_pct = 0.29  (col 4, MoM)
//              avg_5m2026_yoy_pct            = 4.31  (col 5, YTD avg YoY)
//   YoY derived from col3 - col2:            = 5.60
//
// CRITICAL weights rule: all WeightPct fields in the parsed result MUST be nil.
// WeightsIsEstimate MUST be true. HeadlineFound MUST be true (fail-loud otherwise).
//
// Fence-C: this test is in pkg/infrastructure — allowed to import excelize directly.
package infrastructure

import (
	"bytes"
	"testing"

	"github.com/xuri/excelize/v2"
)

// cpiAnchorCol2 is the simulated "T05/2025 vs kỳ gốc" value for the headline row.
// cpiAnchorCol3 is "T05/2026 vs kỳ gốc".
// YoY derivation: col3 - col2 = 5.60 (live anchor).
// To satisfy: col3 - col2 = 5.60 → use col2=100.00, col3=105.60.
const (
	cpiHeadlineCol2  = 100.00
	cpiHeadlineCol3  = 105.60
	cpiHeadlineMoM   = 0.29 // col4: T05/2026 vs T04/2026
	cpiHeadlineAvgYTD = 4.31 // col5: BQ 5T/2026 vs BQ 5T/2025
)

// buildCPITestExcel creates a minimal in-memory Excel workbook with sheet "16.CPI"
// populated with the anchor rows from scripts/probes/vmt-3-sample.json.
func buildCPITestExcel(t *testing.T) []byte {
	t.Helper()
	f := excelize.NewFile()

	// Rename the default "Sheet1" to "16.CPI".
	if err := f.SetSheetName("Sheet1", nsoCPISheetName); err != nil {
		t.Fatalf("buildCPITestExcel: rename sheet: %v", err)
	}

	// Header row (6 columns — indices 0..5).
	_ = f.SetCellValue(nsoCPISheetName, "A1", "Basket name")
	_ = f.SetCellValue(nsoCPISheetName, "B1", "T04/2025 vs T04 kỳ gốc")
	_ = f.SetCellValue(nsoCPISheetName, "C1", "T05/2025 vs kỳ gốc")
	_ = f.SetCellValue(nsoCPISheetName, "D1", "T05/2026 vs kỳ gốc")
	_ = f.SetCellValue(nsoCPISheetName, "E1", "T05/2026 vs T04/2026")
	_ = f.SetCellValue(nsoCPISheetName, "F1", "BQ 5T/2026 vs BQ 5T/2025")

	// Row 2: Headline — CHỈ SỐ GIÁ TIÊU DÙNG (cpi_total) — LIVE ANCHOR
	_ = f.SetCellValue(nsoCPISheetName, "A2", "CHỈ SỐ GIÁ TIÊU DÙNG")
	_ = f.SetCellValue(nsoCPISheetName, "B2", "99.50")
	_ = f.SetCellValue(nsoCPISheetName, "C2", cpiHeadlineCol2)  // 100.00
	_ = f.SetCellValue(nsoCPISheetName, "D2", cpiHeadlineCol3)  // 105.60 → YoY = 105.60 - 100.00 = 5.60
	_ = f.SetCellValue(nsoCPISheetName, "E2", cpiHeadlineMoM)   // 0.29
	_ = f.SetCellValue(nsoCPISheetName, "F2", cpiHeadlineAvgYTD) // 4.31

	// Row 3: food_dining basket
	_ = f.SetCellValue(nsoCPISheetName, "A3", "Hàng ăn và dịch vụ ăn uống")
	_ = f.SetCellValue(nsoCPISheetName, "B3", "101.0")
	_ = f.SetCellValue(nsoCPISheetName, "C3", "102.0")
	_ = f.SetCellValue(nsoCPISheetName, "D3", "108.0")
	_ = f.SetCellValue(nsoCPISheetName, "E3", "0.50")
	_ = f.SetCellValue(nsoCPISheetName, "F3", "5.10")

	// Row 4: transport basket
	_ = f.SetCellValue(nsoCPISheetName, "A4", "Giao thông")
	_ = f.SetCellValue(nsoCPISheetName, "B4", "100.0")
	_ = f.SetCellValue(nsoCPISheetName, "C4", "98.0")
	_ = f.SetCellValue(nsoCPISheetName, "D4", "100.5")
	_ = f.SetCellValue(nsoCPISheetName, "E4", "0.10")
	_ = f.SetCellValue(nsoCPISheetName, "F4", "2.50")

	// Row 5: non-target note row (should be skipped)
	_ = f.SetCellValue(nsoCPISheetName, "A5", "Ghi chú: số liệu sơ bộ")
	_ = f.SetCellValue(nsoCPISheetName, "B5", "")
	_ = f.SetCellValue(nsoCPISheetName, "C5", "")
	_ = f.SetCellValue(nsoCPISheetName, "D5", "")
	_ = f.SetCellValue(nsoCPISheetName, "E5", "")
	_ = f.SetCellValue(nsoCPISheetName, "F5", "")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("buildCPITestExcel: write: %v", err)
	}
	return buf.Bytes()
}

// TestParseCPIFromExcel_LiveAnchors verifies the live May-2026 headline anchor values.
// Live anchors: cpi_total YoYPct=5.60, MoMPct=0.29, AvgYTDYoYPct=4.31.
func TestParseCPIFromExcel_LiveAnchors(t *testing.T) {
	excelBytes := buildCPITestExcel(t)

	record, err := ParseCPIFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseCPIFromExcel: unexpected error: %v", err)
	}

	// Period must be set.
	if record.Period != "2026-05" {
		t.Errorf("Period=%q, want '2026-05'", record.Period)
	}

	// IsEstimate must be false (index values are primary source, PROBE-3 confirmed).
	if record.IsEstimate {
		t.Errorf("record.IsEstimate=true, want false (index values are primary source)")
	}

	// WeightsIsEstimate MUST always be true (weights not in monthly Excel).
	if !record.WeightsIsEstimate {
		t.Errorf("record.WeightsIsEstimate=false, want true ALWAYS (weights not in monthly Excel)")
	}

	// WeightsNote must be non-empty.
	if record.WeightsNote == "" {
		t.Errorf("record.WeightsNote is empty — weights provenance note required")
	}

	// Source must be non-empty.
	if record.Source == "" {
		t.Errorf("record.Source is empty — provenance required")
	}

	// Headline must be cpi_total with live anchor values.
	h := record.Headline

	if h.Key != "cpi_total" {
		t.Errorf("Headline.Key=%q, want 'cpi_total'", h.Key)
	}

	// LIVE ANCHOR: MoM = 0.29 (col4)
	if h.MoMPct != cpiHeadlineMoM {
		t.Errorf("cpi_total.MoMPct=%.4f, want %.4f (live PROBE-3 anchor)", h.MoMPct, cpiHeadlineMoM)
	}

	// LIVE ANCHOR: AvgYTDYoY = 4.31 (col5)
	if h.AvgYTDYoYPct != cpiHeadlineAvgYTD {
		t.Errorf("cpi_total.AvgYTDYoYPct=%.4f, want %.4f (live PROBE-3 anchor)", h.AvgYTDYoYPct, cpiHeadlineAvgYTD)
	}

	// LIVE ANCHOR: YoY = 5.60 (derived: col3 - col2 = 105.60 - 100.00)
	const wantYoY = 5.60
	if h.YoYPct < wantYoY-0.01 || h.YoYPct > wantYoY+0.01 {
		t.Errorf("cpi_total.YoYPct=%.4f, want %.4f (live PROBE-3 anchor, tolerance ±0.01)", h.YoYPct, wantYoY)
	}

	// WeightPct MUST be nil (weights not in monthly Excel — critical policy).
	if h.WeightPct != nil {
		t.Errorf("cpi_total.WeightPct is non-nil: %v — MUST be nil (weights not in monthly Excel)", *h.WeightPct)
	}

	// IsEstimate on the basket level must be false (index values are primary source).
	if h.IsEstimate {
		t.Errorf("cpi_total.IsEstimate=true, want false (index value is primary source)")
	}
}

// TestParseCPIFromExcel_WeightsAlwaysNil verifies all WeightPct fields are nil.
// This is the critical weights policy test — no weight values may ever be populated.
func TestParseCPIFromExcel_WeightsAlwaysNil(t *testing.T) {
	excelBytes := buildCPITestExcel(t)

	record, err := ParseCPIFromExcel(excelBytes, "2026-05")
	if err != nil {
		t.Fatalf("ParseCPIFromExcel: unexpected error: %v", err)
	}

	// Headline WeightPct must be nil.
	if record.Headline.WeightPct != nil {
		t.Errorf("Headline.WeightPct is non-nil: %v — MUST be nil (weights not in monthly Excel)", *record.Headline.WeightPct)
	}

	// All basket WeightPct fields must be nil.
	for _, b := range record.Baskets {
		if b.WeightPct != nil {
			t.Errorf("basket %q WeightPct is non-nil: %v — MUST be nil", b.Key, *b.WeightPct)
		}
	}
}

// TestParseCPIFromExcel_MissingSheet returns an error when the sheet is absent.
func TestParseCPIFromExcel_MissingSheet(t *testing.T) {
	f := excelize.NewFile()
	_ = f.SetCellValue("Sheet1", "A1", "header")
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("build wrong-sheet Excel: %v", err)
	}

	_, err := ParseCPIFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Errorf("expected error for missing sheet %q, got nil", nsoCPISheetName)
	}
}

// TestParseCPIFromExcel_HeadlineRequired returns an error when headline row is absent.
func TestParseCPIFromExcel_HeadlineRequired(t *testing.T) {
	f := excelize.NewFile()
	if err := f.SetSheetName("Sheet1", nsoCPISheetName); err != nil {
		t.Fatalf("rename sheet: %v", err)
	}
	// Only put basket rows (no headline).
	_ = f.SetCellValue(nsoCPISheetName, "A1", "Giao thông")
	_ = f.SetCellValue(nsoCPISheetName, "B1", "100")
	_ = f.SetCellValue(nsoCPISheetName, "C1", "100")
	_ = f.SetCellValue(nsoCPISheetName, "D1", "100")
	_ = f.SetCellValue(nsoCPISheetName, "E1", "0.5")
	_ = f.SetCellValue(nsoCPISheetName, "F1", "3.0")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, err := ParseCPIFromExcel(buf.Bytes(), "2026-05")
	if err == nil {
		t.Errorf("expected error when headline 'CHỈ SỐ GIÁ TIÊU DÙNG' is absent, got nil")
	}
}
