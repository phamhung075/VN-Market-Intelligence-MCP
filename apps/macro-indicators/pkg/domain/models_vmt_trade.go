// Package domain — trade-balance domain models for VMT-1a + VMT-1b.
//
// Source: NSO monthly Excel, sheets '14.XK' (exports) + '15.NK' (imports) + '12.FDI'.
// Contract derived from live payload in scripts/probes/vmt-3-sample.json and the
// authoritative live_contract in orch-state.json tasks VMT-1a-TRADE-BALANCE-TOTAL-HS
// and VMT-1b-TRADE-BALANCE-BLOC-SPLIT.
//
// VN number format: period = thousands separator, comma = decimal.
// Example: "27.400" in Excel → 27400 M USD (parse via ParseVNNumber from services_vmt_bop.go).
//
// VMT-1b bloc_split ALWAYS is_estimate=true (ARCH Decision A, PROBE-FOLD 2026-06-14):
// Customs SPA inaccessible (JS-render 100%, dttktt.customs.gov.vn HTTP400).
// Cross-join ESTIMATE: FDI registered capital from NSO 12.FDI vs total exports NSO 14.XK.
// NEVER flip is_estimate=false without a direct machine-readable Customs enterprise-type column.
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// HSSector holds trade data (absolute + YoY%) for one HS commodity / sector row.
// Populated from sheets '14.XK' (exports) or '15.NK' (imports).
//
// Column mapping from live_contract parse_rules:
//
//	col 0: HS code / sector name (Vietnamese string)
//	col 2: current-month absolute value (tỷ USD, VN format)
//	col 4: YoY% vs same period prior year
type HSSector struct {
	// NameVI is the original Vietnamese label from the Excel sheet.
	NameVI string `json:"name_vi"`

	// AbsoluteBnUSD is the current-month absolute value in billion USD.
	// Parsed from col2 via ParseVNNumber (VN thousands-sep format → / 1000 from M USD).
	AbsoluteBnUSD float64 `json:"absolute_bn_usd"`

	// YoYPct is the YoY % change vs same period prior year (col 4).
	YoYPct float64 `json:"yoy_pct"`

	// IsEstimate is false for trade totals and HS rows (primary NSO source, VMT-1a).
	IsEstimate bool `json:"is_estimate"`
}

// BlocShareEstimate holds one side of the FDI/domestic bloc split.
// Always is_estimate=true (ARCH Decision A, PERMANENT).
type BlocShareEstimate struct {
	// SharePct is the estimated share percentage.
	// For FDI: fdi_registered_mn_usd / total_export_mn_usd * 100.
	// For domestic: 100 - fdi_share_pct.
	SharePct float64 `json:"share_pct"`

	// IsEstimate is ALWAYS true for bloc_split (Customs SPA inaccessible).
	// NEVER flip false without a direct machine-readable Customs enterprise-type column.
	IsEstimate bool `json:"is_estimate"`
}

// BlocSplitEstimate holds the FDI vs domestic split of trade activity.
// Both sub-fields carry is_estimate=true permanently (ARCH Decision A).
//
// Source: NSO 12.FDI registered capital vs NSO 14.XK total exports (cross-join).
// This is an approximation; Customs SPA (dttktt.customs.gov.vn) which provides
// the enterprise-type breakdown is JS-rendered and inaccessible.
type BlocSplitEstimate struct {
	// FDI is the FDI-sector share estimate.
	FDI BlocShareEstimate `json:"fdi"`

	// Domestic is the domestic-sector share estimate (100 - FDI.SharePct).
	Domestic BlocShareEstimate `json:"domestic"`

	// FDIRegisteredMnUSD is the raw FDI registered capital from NSO 12.FDI.
	// Used to compute fdi_export_share_pct.
	FDIRegisteredMnUSD float64 `json:"fdi_registered_mn_usd"`

	// Note explains the estimate methodology and why it is permanent.
	Note string `json:"note"`
}

// TradeBalanceRecord holds the full trade-balance snapshot for one monthly period.
// Produced by the NSO Excel parser and consumed by the TradeBalance use case.
//
// VMT-1a fields (is_estimate=false): ExportTotal, ImportTotal, TradeBalance, HSAttribution.
// VMT-1b field (is_estimate=true PERMANENT): BlocSplit.
type TradeBalanceRecord struct {
	// Period is the reference month (YYYY-MM) derived from the Excel URL path.
	Period string `json:"period"`

	// ExportTotalMnUSD is the total export value from sheet '14.XK' row totals (M USD).
	// Anchor May-2026: ~27400 M USD (27.4 bn USD).
	ExportTotalMnUSD float64 `json:"export_total_mn_usd"`

	// ImportTotalMnUSD is the total import value from sheet '15.NK' row totals (M USD).
	// Anchor May-2026: ~24100 M USD (24.1 bn USD).
	ImportTotalMnUSD float64 `json:"import_total_mn_usd"`

	// TradeBalanceMnUSD = ExportTotalMnUSD - ImportTotalMnUSD.
	// Anchor May-2026: ~3300 M USD (+3.3 bn USD surplus).
	TradeBalanceMnUSD float64 `json:"trade_balance_mn_usd"`

	// ExportYTDMnUSD is the YTD cumulative export value (col3 of '14.XK', M USD).
	ExportYTDMnUSD float64 `json:"export_ytd_mn_usd"`

	// ImportYTDMnUSD is the YTD cumulative import value (col3 of '15.NK', M USD).
	ImportYTDMnUSD float64 `json:"import_ytd_mn_usd"`

	// ExportYoYPct is the export YoY % (col4 of '14.XK').
	ExportYoYPct float64 `json:"export_yoy_pct"`

	// ImportYoYPct is the import YoY % (col4 of '15.NK').
	ImportYoYPct float64 `json:"import_yoy_pct"`

	// HSExports holds the sector/HS breakdown rows from sheet '14.XK'.
	HSExports []HSSector `json:"hs_exports"`

	// HSImports holds the sector/HS breakdown rows from sheet '15.NK'.
	HSImports []HSSector `json:"hs_imports"`

	// BlocSplit is the FDI vs domestic bloc-split estimate (VMT-1b).
	// Always is_estimate=true (ARCH Decision A, PERMANENT).
	BlocSplit BlocSplitEstimate `json:"bloc_split"`

	// IsEstimate is false for the trade totals and HS rows (VMT-1a primary source).
	// BlocSplit has its own always-true IsEstimate fields.
	IsEstimate bool `json:"is_estimate"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`
}
