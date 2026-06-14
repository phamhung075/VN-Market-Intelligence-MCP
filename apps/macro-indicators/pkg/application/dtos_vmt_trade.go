// Package application — trade-balance DTOs for VMT-1a + VMT-1b HTTP/use-case boundary.
//
// DTOs translate between the HTTP request/response and the domain model.
// Field names match the BA spec FR-2 output schema and the live_contract in
// orch-state.json tasks VMT-1a-TRADE-BALANCE-TOTAL-HS + VMT-1b-TRADE-BALANCE-BLOC-SPLIT.
//
// VMT-1a fields: trade totals + hs_attribution — is_estimate=false (primary NSO source).
// VMT-1b field: bloc_split — is_estimate=true PERMANENT (ARCH Decision A).
//
// No domain logic in this file — pure data containers only.
package application

// TradeBalanceRequest is the input DTO for the trade-balance use case (POST /trade-balance).
// Empty body {} is valid and triggers a fresh fetch of the most recent monthly data.
type TradeBalanceRequest struct {
	// Period is an optional override (YYYY-MM) to request a specific month.
	// When empty, the use case fetches the most recent available monthly release.
	Period string `json:"period,omitempty"`
}

// HSSectorDTO carries trade data for one HS sector/commodity row in the HTTP response.
type HSSectorDTO struct {
	// NameVI is the original Vietnamese label from the NSO Excel sheet.
	NameVI string `json:"name_vi"`
	// AbsoluteBnUSD is the current-month absolute value in billion USD.
	AbsoluteBnUSD float64 `json:"absolute_bn_usd"`
	// YoYPct is the YoY % change vs same period prior year.
	YoYPct float64 `json:"yoy_pct"`
	// IsEstimate is false for trade totals and HS rows (primary NSO source, VMT-1a).
	IsEstimate bool `json:"is_estimate"`
}

// BlocShareDTO carries one side (FDI or domestic) of the bloc split.
// IsEstimate is always true (ARCH Decision A — PERMANENT).
type BlocShareDTO struct {
	// SharePct is the estimated share percentage.
	SharePct float64 `json:"share_pct"`
	// IsEstimate is always true for bloc_split (ARCH Decision A).
	IsEstimate bool `json:"is_estimate"`
}

// BlocSplitDTO is the VMT-1b bloc-split sub-object in the HTTP response.
// All IsEstimate fields are true permanently.
type BlocSplitDTO struct {
	// FDI is the FDI-sector share estimate.
	FDI BlocShareDTO `json:"fdi"`
	// Domestic is the domestic-sector share estimate.
	Domestic BlocShareDTO `json:"domestic"`
	// FDIRegisteredMnUSD is the raw FDI registered capital (M USD) from NSO 12.FDI.
	FDIRegisteredMnUSD float64 `json:"fdi_registered_mn_usd"`
	// Note explains the cross-join estimate methodology.
	Note string `json:"note"`
}

// TradeBalanceResponse is the output DTO returned by TradeBalanceUseCase.Execute.
type TradeBalanceResponse struct {
	// Status is "ok" on success; "error" when fetch/parse fails.
	Status string `json:"status"`

	// Period is the reference month (YYYY-MM).
	Period string `json:"period"`

	// ExportTotalMnUSD is total exports in M USD (VMT-1a, anchor May-2026: ~27400).
	ExportTotalMnUSD float64 `json:"export_total_mn_usd"`

	// ImportTotalMnUSD is total imports in M USD (VMT-1a, anchor May-2026: ~24100).
	ImportTotalMnUSD float64 `json:"import_total_mn_usd"`

	// TradeBalanceMnUSD = export - import in M USD (VMT-1a, anchor May-2026: ~+3300).
	TradeBalanceMnUSD float64 `json:"trade_balance_mn_usd"`

	// ExportYTDMnUSD is the YTD cumulative export (M USD).
	ExportYTDMnUSD float64 `json:"export_ytd_mn_usd"`

	// ImportYTDMnUSD is the YTD cumulative import (M USD).
	ImportYTDMnUSD float64 `json:"import_ytd_mn_usd"`

	// ExportYoYPct is the export YoY % change.
	ExportYoYPct float64 `json:"export_yoy_pct"`

	// ImportYoYPct is the import YoY % change.
	ImportYoYPct float64 `json:"import_yoy_pct"`

	// HSExports holds the HS sector breakdown rows from sheet '14.XK'.
	HSExports []HSSectorDTO `json:"hs_exports"`

	// HSImports holds the HS sector breakdown rows from sheet '15.NK'.
	HSImports []HSSectorDTO `json:"hs_imports"`

	// BlocSplit is the VMT-1b FDI vs domestic bloc-split estimate.
	// Always is_estimate=true (ARCH Decision A — PERMANENT).
	BlocSplit BlocSplitDTO `json:"bloc_split"`

	// IsEstimate is false for trade totals and HS rows (VMT-1a primary source).
	// BlocSplit sub-fields have their own always-true IsEstimate.
	IsEstimate bool `json:"is_estimate"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// Error is non-empty when Status="error" (nil-provider / wiring fault — genuine 500).
	Error string `json:"error,omitempty"`

	// BlockedReason is non-empty when Status="degraded" (upstream-fetch/parse failure).
	// Names the unreachable source (e.g. "NSO customs Excel unreachable via VPS proxy 125.212.251.27:3128").
	// HTTP 200 is returned on degraded paths — all bloc IsEstimate fields are true.
	BlockedReason string `json:"blocked_reason,omitempty"`
}
