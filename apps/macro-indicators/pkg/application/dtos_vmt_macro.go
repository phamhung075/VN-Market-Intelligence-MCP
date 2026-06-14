// Package application — GSO/IIP DTOs for VMT-3b HTTP/use-case boundary.
//
// DTOs translate between the HTTP request/response and the domain model.
// Field names match the BA spec FR-2 output schema and the IIP field map
// from docs/handoffs/ARCH-VN-MACRO-TOOLING.md § VMT-3b.
//
// No domain logic in this file — pure data containers only.
package application

// MacroIndicatorsGSORequest is the input DTO for the GSO/IIP use case (POST /macro-indicators).
// Empty body {} is valid and triggers a fresh fetch of the most recent monthly data.
type MacroIndicatorsGSORequest struct {
	// Period is an optional override (YYYY-MM) to request a specific month.
	// When empty, the use case fetches the most recent available monthly release.
	Period string `json:"period,omitempty"`
}

// IIPSectorDTO carries IIP data for one sector in the HTTP response.
type IIPSectorDTO struct {
	// Key is the machine-readable sector identifier.
	Key string `json:"key"`
	// NameVI is the original Vietnamese label from the NSO Excel sheet.
	NameVI string `json:"name_vi"`
	// YoYPct is the current-month YoY % (col 2): tháng N vs cùng kỳ năm trước.
	YoYPct float64 `json:"yoy_pct"`
	// YTDYoYPct is the YTD YoY % (col 3): N tháng vs cùng kỳ năm trước.
	YTDYoYPct float64 `json:"ytd_yoy_pct"`
	// MoMPct is the MoM % (col 4): tháng N vs tháng trước.
	MoMPct float64 `json:"mom_pct"`
	// IsEstimate is false (primary source, PROBE-3 confirmed).
	IsEstimate bool `json:"is_estimate"`
}

// MacroIndicatorsGSOResponse is the output DTO returned by MacroIndicatorsGSOUseCase.Execute.
type MacroIndicatorsGSOResponse struct {
	// Status is "ok" on success; "error" when the fetch/parse fails.
	Status string `json:"status"`

	// Period is the reference month (YYYY-MM).
	Period string `json:"period"`

	// IIP holds the 4 target IIP sectors in order:
	//   iip_all_industry, iip_manufacturing, iip_mining, iip_electricity
	IIP []IIPSectorDTO `json:"iip"`

	// Source identifies the data origin (NSO monthly Excel, sheet "2.IIPthang").
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false — all IIP values are primary source (PROBE-3 confirmed).
	IsEstimate bool `json:"is_estimate"`

	// Error is non-empty when Status="error".
	Error string `json:"error,omitempty"`
}
