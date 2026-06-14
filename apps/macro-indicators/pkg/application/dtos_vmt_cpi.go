// Package application — CPI DTOs for VMT-4 HTTP/use-case boundary.
//
// DTOs translate between the HTTP request/response and the domain model.
// Field names match the BA spec FR-2 output schema and the CPI field map
// from docs/handoffs/ARCH-VN-MACRO-TOOLING.md § VMT-4.
//
// CRITICAL weights policy: all weight_pct fields are null (nil).
// Weights live in the CPI methodology PDF — never in the monthly Excel.
// is_estimate=true on the weights sub-field is non-negotiable per architect handoff.
//
// No domain logic in this file — pure data containers only.
package application

// CPIComponentsRequest is the input DTO for the CPI use case (POST /cpi-components).
// Empty body {} is valid and triggers a fresh fetch of the most recent monthly data.
type CPIComponentsRequest struct {
	// Period is an optional override (YYYY-MM) to request a specific month.
	// When empty, the use case fetches the most recent available monthly release.
	Period string `json:"period,omitempty"`
}

// CPIBasketDTO carries CPI data for one basket category in the HTTP response.
type CPIBasketDTO struct {
	// Key is the machine-readable basket identifier (e.g. "cpi_total", "food_dining").
	Key string `json:"key"`
	// NameVI is the original Vietnamese label from the NSO Excel sheet.
	NameVI string `json:"name_vi"`
	// MoMPct is the month-on-month change % (col 4).
	MoMPct float64 `json:"mom_pct"`
	// AvgYTDYoYPct is the YTD average YoY % (col 5).
	AvgYTDYoYPct float64 `json:"avg_ytd_yoy_pct"`
	// YoYPct is the current-month YoY %.
	// Anchor May-2026 total: 5.60
	YoYPct float64 `json:"yoy_pct"`
	// WeightPct is always nil — weights NOT available from monthly Excel.
	// Source: CPI methodology PDF (updated ~every 5 years).
	WeightPct *float64 `json:"weight_pct"` // always null
	// IsEstimate is false for index values (primary source, PROBE-3 confirmed).
	IsEstimate bool `json:"is_estimate"`
}

// CPIComponentsResponse is the output DTO returned by CPIComponentsUseCase.Execute.
type CPIComponentsResponse struct {
	// Status is "ok" on success; "error" when the fetch/parse fails.
	Status string `json:"status"`

	// Period is the reference month (YYYY-MM).
	Period string `json:"period"`

	// Headline is the total CPI basket ("CHỈ SỐ GIÁ TIÊU DÙNG").
	// Anchors May-2026: YoYPct=5.60, MoMPct=0.29, AvgYTDYoYPct=4.31
	Headline CPIBasketDTO `json:"headline"`

	// Baskets holds all recognized basket-level CPI rows (11 main + sub-baskets).
	Baskets []CPIBasketDTO `json:"baskets"`

	// WeightsIsEstimate is always true — weights not available from monthly Excel.
	WeightsIsEstimate bool `json:"weights_is_estimate"`

	// WeightsNote explains why all weight_pct fields are null.
	WeightsNote string `json:"weights_note"`

	// Source identifies the data origin (NSO monthly Excel, sheet "16.CPI").
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the NSO Excel fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false — all CPI index values are primary source (PROBE-3 confirmed).
	// weights_is_estimate is separate and always true.
	IsEstimate bool `json:"is_estimate"`

	// Error is non-empty when Status="error" (nil-provider / wiring fault — genuine 500).
	Error string `json:"error,omitempty"`

	// BlockedReason is non-empty when Status="degraded" (upstream-fetch/parse failure).
	// Names the unreachable source (e.g. "NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128").
	// HTTP 200 is returned on degraded paths — WeightsIsEstimate=true + all basket IsEstimate=true.
	BlockedReason string `json:"blocked_reason,omitempty"`
}
