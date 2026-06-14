// Package domain — CPI domain models for VMT-4.
//
// Source: NSO monthly Excel, sheet "16.CPI" (PROBE-3 PASS).
// Contract derived from live payload in scripts/probes/vmt-3-sample.json (GA-7).
//
// CPI = Consumer Price Index — monthly index values as percentages relative to
// various reference periods. All values are index percentages, NOT absolute price levels.
//
// CRITICAL weights policy (from PROBE-3 + architect handoff § VMT-4):
//   - CPI weights (trọng số) are NOT in the Excel table.
//   - Weights live in the CPI methodology PDF (updated ~every 5 years).
//   - All Weight fields MUST be nil; is_estimate=true for weights sub-field.
//   - NEVER infer or fabricate weights from index values.
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// CPIBasket holds CPI data for one basket category.
//
// Column mapping from sheet "16.CPI" (live PROBE-3 sample):
//   col 0: basket name (Vietnamese string)
//   col 1: T{N-1}/{YYYY-1} vs kỳ gốc (prior year same month vs base period)
//   col 2: T{N}/{YYYY-1} vs kỳ gốc
//   col 3: T{N}/{YYYY} vs kỳ gốc (current month absolute index vs base) — reference only
//   col 4: T{N}/{YYYY} vs T{N-1}/{YYYY} (MoM change %)   — PRIMARY for vs_prev_month_pct
//   col 5: BQ NT/{YYYY} vs BQ NT/{YYYY-1} (YTD avg YoY %) — PRIMARY for avg_ytd_yoy_pct
type CPIBasket struct {
	// Key is the machine-readable basket identifier.
	// Headline: "cpi_total"; baskets: "food_dining", "beverages_tobacco", etc.
	Key string `json:"key"`

	// NameVI is the original Vietnamese label from the Excel sheet.
	NameVI string `json:"name_vi"`

	// MoMPct is the month-on-month change % (col 4): current month vs prior month.
	// Anchor May-2026 total: 0.29
	MoMPct float64 `json:"mom_pct"`

	// AvgYTDYoYPct is the YTD average YoY % (col 5): average of current year months
	// vs average of same months in prior year.
	// Anchor May-2026 total (5m avg): 4.31
	AvgYTDYoYPct float64 `json:"avg_ytd_yoy_pct"`

	// YoYPct is the current-month YoY % — derived from Excel col 3 vs col 2 context.
	// Anchor May-2026 total: 5.60
	// This is the headline CPI YoY figure from the NSO press release.
	YoYPct float64 `json:"yoy_pct"`

	// WeightPct is always nil — weights are NOT in the Excel table (methodology PDF only).
	// NEVER set this to a non-nil value without a confirmed machine-readable source.
	// is_estimate=true applies to the weights sub-field at the record level.
	WeightPct *float64 `json:"weight_pct"` // always nil

	// IsEstimate is false for index values (primary source); true for WeightPct (always nil).
	// This field reflects the index value estimate status, NOT the weight.
	IsEstimate bool `json:"is_estimate"`
}

// CPIRecord holds the full CPI snapshot for one monthly period.
// Produced by the NSO Excel CPI parser and consumed by the CPI use case.
type CPIRecord struct {
	// Period is the reference month (YYYY-MM) derived from the Excel column headers.
	Period string `json:"period"`

	// Headline is the total CPI basket ("CHỈ SỐ GIÁ TIÊU DÙNG").
	// key: "cpi_total"
	// Anchors May-2026: YoYPct=5.60, MoMPct=0.29, AvgYTDYoYPct=4.31
	Headline CPIBasket `json:"headline"`

	// Baskets holds the 11 official CPI basket categories.
	// Sub-baskets under "Hàng ăn và dịch vụ ăn uống" (food_dining) are included
	// as listed in the sheet but grouped under the main basket key prefix.
	Baskets []CPIBasket `json:"baskets"`

	// WeightsIsEstimate is always true — weights not available from monthly Excel.
	// Note explains: "Weights from CPI methodology PDF (updated ~every 5 years);
	// not in monthly Excel. All weight_pct fields are null."
	WeightsIsEstimate bool   `json:"weights_is_estimate"`
	WeightsNote       string `json:"weights_note"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false for index values (primary source, PROBE-3 confirmed).
	// weights_is_estimate is separate and always true.
	IsEstimate bool `json:"is_estimate"`
}
