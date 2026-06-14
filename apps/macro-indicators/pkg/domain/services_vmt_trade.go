// Package domain — trade-balance domain service functions for VMT-1a + VMT-1b.
//
// Pure functions: no imports from application, infrastructure, or interface layers.
// All trade-balance domain logic lives here.
//
// Key functions:
//   - ComputeTradeBalance: trade_balance = export_total - import_total.
//   - ComputeBlocSplit: FDI share = fdi_registered / total_export * 100.
//     Always returns is_estimate=true (ARCH Decision A, PERMANENT).
//   - IsHSDataRow: filter predicate — skips header/subtotal/blank rows.
//
// VN number format is parsed upstream (infrastructure layer uses ParseVNNumber from
// services_vmt_bop.go).  Domain functions receive already-parsed float64 values.
//
// Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

const (
	// blocSplitNote is the permanent note for all BlocSplitEstimate values.
	// Explains the cross-join methodology and the Customs SPA blocker.
	blocSplitNote = "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"
)

// ComputeTradeBalance returns export_total_mn_usd - import_total_mn_usd.
// Both inputs are in M USD (parsed from NSO Excel VN format → / 1000 conversion done upstream).
func ComputeTradeBalance(exportTotalMnUSD, importTotalMnUSD float64) float64 {
	return exportTotalMnUSD - importTotalMnUSD
}

// ComputeBlocSplit builds the BlocSplitEstimate from FDI registered capital and total exports.
//
// fdi_export_share_pct = fdiRegisteredMnUSD / totalExportMnUSD * 100.
// domestic_share_pct = 100 - fdi_export_share_pct.
//
// ARCH Decision A (PERMANENT): both FDI and domestic is_estimate=true.
// Customs SPA (dttktt.customs.gov.vn) is JS-rendered, HTTP400, inaccessible.
// This is a cross-join ESTIMATE, never a primary source measurement.
// Fail-closed: if totalExportMnUSD == 0, returns zero shares with is_estimate=true.
//
// NOTE: is_estimate=true is set even on error paths (fail-closed, same pattern as
// VMT-4 CPI WeightsIsEstimate). NEVER flip to false without machine-readable
// Customs enterprise-type column.
func ComputeBlocSplit(fdiRegisteredMnUSD, totalExportMnUSD float64) BlocSplitEstimate {
	if totalExportMnUSD == 0 {
		return BlocSplitEstimate{
			FDI: BlocShareEstimate{
				SharePct:   0,
				IsEstimate: true,
			},
			Domestic: BlocShareEstimate{
				SharePct:   0,
				IsEstimate: true,
			},
			FDIRegisteredMnUSD: fdiRegisteredMnUSD,
			Note:               blocSplitNote,
		}
	}

	fdiSharePct := fdiRegisteredMnUSD / totalExportMnUSD * 100
	domesticSharePct := 100 - fdiSharePct

	return BlocSplitEstimate{
		FDI: BlocShareEstimate{
			SharePct:   fdiSharePct,
			IsEstimate: true, // PERMANENT — ARCH Decision A
		},
		Domestic: BlocShareEstimate{
			SharePct:   domesticSharePct,
			IsEstimate: true, // PERMANENT — ARCH Decision A
		},
		FDIRegisteredMnUSD: fdiRegisteredMnUSD,
		Note:               blocSplitNote,
	}
}
