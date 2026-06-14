// Package domain — BOP (Balance of Payments) domain models for VMT-2.
//
// Source: SBV Liferay headless article API (PROBE-2 PASS).
// Unit: Million USD (M USD) throughout — NOT billions.
// Sign convention: IMF BPM6 confirmed by PROBE-2.
//   loiVaSaiSot (E&O) negative = unexplained outflows (NO sign flip required).
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// BOPCurrentAccount holds the current-account sub-components.
// All monetary values in M USD (Triệu USD).
type BOPCurrentAccount struct {
	// Total current-account balance (M USD).
	TotalMnUSD float64 `json:"current_account_total_mn_usd"`

	// Goods sub-balance.
	GoodsExportsMnUSD float64 `json:"goods_exports_mn_usd"`
	GoodsImportsMnUSD float64 `json:"goods_imports_mn_usd"`
	GoodsNetMnUSD     float64 `json:"goods_net_mn_usd"`

	// Services sub-balance.
	ServicesExportsMnUSD float64 `json:"services_exports_mn_usd"`
	ServicesImportsMnUSD float64 `json:"services_imports_mn_usd"`
	ServicesNetMnUSD     float64 `json:"services_net_mn_usd"`

	// Primary income (investment income) net.
	PrimaryIncomeNetMnUSD float64 `json:"primary_income_net_mn_usd"`

	// Secondary income (remittances, transfers) net.
	SecondaryIncomeNetMnUSD float64 `json:"secondary_income_net_mn_usd"`
}

// BOPFinancialAccount holds financial-account sub-components.
// All monetary values in M USD.
type BOPFinancialAccount struct {
	// Total financial-account balance (M USD).
	TotalMnUSD float64 `json:"financial_account_mn_usd"`

	// FDI net (direct investment net).
	FDINetMnUSD float64 `json:"fdi_net_mn_usd"`

	// Portfolio investment net.
	PortfolioNetMnUSD float64 `json:"portfolio_investment_net_mn_usd"`

	// Other investment net.
	OtherNetMnUSD float64 `json:"other_investment_net_mn_usd"`
}

// FXIncidenceLabel is the discriminator output for the BOP FX-incidence signal.
// The label classifies the nature of the E&O residual within the BOP context.
//
// DD-5: computed in domain service ComputeFXIncidence; never fabricated.
type FXIncidenceLabel string

const (
	// FXIncidenceFDIBenign indicates a large negative E&O residual consistent with
	// FDI-related outflows (> -1000 M USD threshold, BPM6 convention).
	// Interpretation: unexplained outflows likely represent FDI profit repatriation
	// or trade finance timing, not capital flight.
	FXIncidenceFDIBenign FXIncidenceLabel = "FDI_BENIGN"

	// FXIncidenceCapitalFlight indicates a large positive E&O residual suggesting
	// unexplained inflows that do not match the financial account narrative.
	FXIncidenceCapitalFlight FXIncidenceLabel = "CAPITAL_FLIGHT_SIGNAL"

	// FXIncidenceNeutral indicates the E&O residual is within the ±1000 M USD band
	// — normal measurement noise, no directional signal warranted.
	FXIncidenceNeutral FXIncidenceLabel = "NEUTRAL"

	// FXIncidenceUnknown is the fail-closed value when E&O is absent or unparseable.
	FXIncidenceUnknown FXIncidenceLabel = "UNKNOWN"
)

// FXIncidenceResult is the output of ComputeFXIncidence.
// Holds the classified label plus the raw E&O input used for traceability.
type FXIncidenceResult struct {
	// Label is the discriminator classification (DD-5).
	Label FXIncidenceLabel `json:"label"`

	// ErrorsOmissionsMnUSD is the raw E&O value used to produce the label.
	// Retained for traceability (callers can verify the discriminator inputs).
	ErrorsOmissionsMnUSD float64 `json:"errors_omissions_mn_usd"`

	// IsEstimate is always false for VMT-2 (E&O is a primary BOP field).
	// Included for schema consistency with other VMT tools.
	IsEstimate bool `json:"is_estimate"`
}

// OffshoreParkedEstimate models the informal "offshore parking" heuristic.
//
// This is a DERIVED ESTIMATE — never a primary source field.
// Definition: offshore_parked ≈ ABS(loiVaSaiSot) when E&O < 0 AND overall_balance > 0.
// Rationale: a large negative E&O residual co-existing with a positive overall balance
// suggests that some portion of the FDI/trade settlement is parked offshore before
// formal repatriation, rather than recorded as a reserve asset movement.
//
// IsEstimate MUST always be true — this heuristic is never a direct measurement.
// Fail-closed: if the preconditions are not met, OffshoreParkedMnUSD = nil.
type OffshoreParkedEstimate struct {
	// OffshoreParkedMnUSD is the estimated magnitude of offshore-parked flows (M USD).
	// Nil when the preconditions (E&O < 0, overall_balance > 0) are not met.
	OffshoreParkedMnUSD *float64 `json:"offshore_parked_mn_usd"`

	// IsEstimate MUST always be true. See type doc above.
	IsEstimate bool `json:"is_estimate"`

	// Note explains the derivation methodology for consumers.
	Note string `json:"note"`
}

// BOPRecord is the full BOP observation for one quarter.
// Produced by the BOP parser (parsers_vmt_bop.go) and consumed by the BOP use case.
type BOPRecord struct {
	// Quarter label (quyI / quyII / quyIII / quyIV) from SBV field Select02257401.
	Quarter string `json:"quarter"`

	// Period is the last calendar day of the quarter (YYYY-MM-DD),
	// from SBV field Date48362898. E.g. "2025-12-25" for Q4-2025.
	Period string `json:"period"`

	// CurrentAccount holds the current-account sub-components.
	CurrentAccount BOPCurrentAccount `json:"current_account"`

	// CapitalAccountMnUSD is the capital-account balance (M USD).
	// Usually zero or near-zero for Vietnam (grants, debt forgiveness).
	CapitalAccountMnUSD float64 `json:"capital_account_mn_usd"`

	// FinancialAccount holds the financial-account sub-components.
	FinancialAccount BOPFinancialAccount `json:"financial_account"`

	// ErrorsOmissionsMnUSD is the net errors and omissions (E&O) residual.
	// Sign convention: BPM6 — negative = unexplained outflows (confirmed by PROBE-2).
	// Q4-2025 anchor: loiVaSaiSot = -12375 M USD (negative = unexplained outflow).
	// NO sign flip applied. See docs/handoffs/ARCH-VN-MACRO-TOOLING.md § VMT-2.
	ErrorsOmissionsMnUSD float64 `json:"errors_omissions_mn_usd"`

	// OverallBalanceMnUSD is the total BOP balance.
	OverallBalanceMnUSD float64 `json:"overall_balance_mn_usd"`

	// ReserveAssetsMnUSD is the reserve-asset change (sign: increase = negative under BPM6).
	ReserveAssetsMnUSD float64 `json:"reserve_assets_mn_usd"`
}

// BOPSnapshot is the response model returned by the BOP use case.
// Wraps the latest BOPRecord with derived signals and provenance metadata.
type BOPSnapshot struct {
	// Latest is the most recent quarterly BOP observation.
	Latest BOPRecord `json:"latest"`

	// FXIncidence is the discriminator result (DD-5, domain service).
	FXIncidence FXIncidenceResult `json:"fx_incidence"`

	// OffshoreParked is the offshore-parking heuristic estimate.
	// is_estimate=true always (fail-closed, never fabricated confidence).
	OffshoreParked OffshoreParkedEstimate `json:"offshore_parked"`

	// Source identifies the data origin for provenance (SBV Liferay JSON API).
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the live fetch.
	// ISO-8601 string; empty when the record came from cache only.
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false — all BOP fields are primary source (PROBE-2 confirmed).
	// Included for schema parity with other VMT tools.
	IsEstimate bool `json:"is_estimate"`
}
