// Package application — Data Transfer Objects for HTTP/use-case boundaries.
package application

import "time"

// MacroSnapshotRequest is the input DTO for the ComputeMacroUseCase.
// Phase 1: empty body accepted (placeholder for future filter parameters).
// TODO(P1-B1): add optional IndicatorFilter []string when snapshot wiring lands.
type MacroSnapshotRequest struct {
	// Placeholder: Phase 1 accepts an empty request body ({}).
}

// MacroSnapshotResponse is the output DTO returned by ComputeMacroUseCase.Execute.
// Mirrors domain.MacroSnapshot but adds HTTP-level metadata (Status, FetchedAt).
type MacroSnapshotResponse struct {
	Status    string    `json:"status"`
	VNIndex   float64   `json:"vn_index"`
	OilUSD    float64   `json:"oil_usd"`
	GoldUSD   float64   `json:"gold_usd"`
	USDVnd    float64   `json:"usd_vnd"`
	FetchedAt time.Time `json:"fetched_at"`
}
