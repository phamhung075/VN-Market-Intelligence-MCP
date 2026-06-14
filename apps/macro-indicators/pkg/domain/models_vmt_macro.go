// Package domain — macro-indicators (GSO/IIP) domain models for VMT-3b.
//
// Source: NSO monthly Excel, sheet "2.IIPthang" (PROBE-3 PASS).
// Contract derived from live payload in scripts/probes/vmt-3-sample.json (GA-7).
//
// IIP = Industrial Production Index — monthly index values as % (index vs same period
// prior year, or vs prior month). All values are percentages, NOT absolute production
// volumes.
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// IIPSector holds IIP (Industrial Production Index) data for one sector.
// Values are percentage indices relative to the reference period.
//
// Column mapping from sheet "2.IIPthang" (live PROBE-3 sample):
//   col 0: sector name (Vietnamese string)
//   col 1: prior month YoY (tháng N-1 vs cùng kỳ năm trước, %)  — NOT used as primary
//   col 2: current month YoY (tháng N vs cùng kỳ năm trước, %)   — PRIMARY
//   col 3: YTD YoY (N tháng vs cùng kỳ năm trước, %)
//   col 4: MoM (tháng N vs tháng trước, %)
type IIPSector struct {
	// Key is the machine-readable sector identifier (e.g. "iip_all_industry").
	Key string `json:"key"`

	// NameVI is the original Vietnamese label from the Excel sheet.
	NameVI string `json:"name_vi"`

	// YoYPct is the current-month YoY change (col 2): tháng N vs cùng kỳ năm trước (%).
	// Anchor May-2026: "Toàn ngành công nghiệp" → 103.27
	YoYPct float64 `json:"yoy_pct"`

	// YTDYoYPct is the year-to-date YoY (col 3): N tháng vs cùng kỳ năm trước (%).
	// Anchor May-2026: "Toàn ngành công nghiệp" → 108.79
	YTDYoYPct float64 `json:"ytd_yoy_pct"`

	// MoMPct is the month-on-month change (col 4): tháng N vs tháng trước (%).
	// Anchor May-2026: "Toàn ngành công nghiệp" → 109.08
	MoMPct float64 `json:"mom_pct"`

	// IsEstimate is false for IIP (primary source, PROBE-3 confirmed).
	IsEstimate bool `json:"is_estimate"`
}

// MacroIndicatorsGSORecord holds the full GSO IIP snapshot for one monthly period.
// Produced by the NSO Excel parser and consumed by the MacroIndicatorsGSO use case.
type MacroIndicatorsGSORecord struct {
	// Period is the reference month (YYYY-MM) derived from the Excel column headers.
	Period string `json:"period"`

	// Sectors holds IIP data for the 4 target sectors (ordered by target row precedence).
	// Target sectors (stable Vietnamese labels from PROBE-3):
	//   "Toàn ngành công nghiệp"         → key: "iip_all_industry"
	//   "Công nghiệp chế biến, chế tạo"  → key: "iip_manufacturing"
	//   "Công nghiệp khai khoáng"         → key: "iip_mining"
	//   "Sản xuất và phân phối điện"      → key: "iip_electricity"
	Sectors []IIPSector `json:"sectors"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false — all IIP values are primary source (PROBE-3 confirmed).
	IsEstimate bool `json:"is_estimate"`
}
