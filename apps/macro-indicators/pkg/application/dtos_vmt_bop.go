// Package application — BOP DTOs for VMT-2 HTTP/use-case boundary.
//
// DTOs translate between the HTTP request/response and the domain model.
// Field names match the BA spec FR-2 output schema and the SBV field map
// from docs/handoffs/ARCH-VN-MACRO-TOOLING.md § VMT-2.
//
// No domain logic in this file — pure data containers only.
package application

// BOPRequest is the input DTO for the BOP use case (POST /bop).
// Accepts an optional quarter_start / quarter_end override for back-fill queries.
// When both fields are empty the use case defaults to the most recent available quarter.
type BOPRequest struct {
	// QuarterStart is the first day of the target quarter (YYYY-MM-DD).
	// Optional. Defaults to the current quarter start when empty.
	QuarterStart string `json:"quarter_start"`

	// QuarterEnd is the last day of the target quarter (YYYY-MM-DD).
	// Optional. Defaults to the current quarter end when empty.
	QuarterEnd string `json:"quarter_end"`
}

// BOPCurrentAccountDTO is the current-account section of the BOP response.
// All values in M USD (Triệu USD).
type BOPCurrentAccountDTO struct {
	TotalMnUSD              float64 `json:"current_account_total_mn_usd"`
	GoodsExportsMnUSD       float64 `json:"goods_exports_mn_usd"`
	GoodsImportsMnUSD       float64 `json:"goods_imports_mn_usd"`
	GoodsNetMnUSD           float64 `json:"goods_net_mn_usd"`
	ServicesExportsMnUSD    float64 `json:"services_exports_mn_usd"`
	ServicesImportsMnUSD    float64 `json:"services_imports_mn_usd"`
	ServicesNetMnUSD        float64 `json:"services_net_mn_usd"`
	PrimaryIncomeNetMnUSD   float64 `json:"primary_income_net_mn_usd"`
	SecondaryIncomeNetMnUSD float64 `json:"secondary_income_net_mn_usd"`
}

// BOPFinancialAccountDTO is the financial-account section of the BOP response.
// All values in M USD.
type BOPFinancialAccountDTO struct {
	TotalMnUSD        float64 `json:"financial_account_mn_usd"`
	FDINetMnUSD       float64 `json:"fdi_net_mn_usd"`
	PortfolioNetMnUSD float64 `json:"portfolio_investment_net_mn_usd"`
	OtherNetMnUSD     float64 `json:"other_investment_net_mn_usd"`
}

// FXIncidenceDTO carries the FX-incidence discriminator result.
type FXIncidenceDTO struct {
	Label                string  `json:"label"`
	ErrorsOmissionsMnUSD float64 `json:"errors_omissions_mn_usd"`
	IsEstimate           bool    `json:"is_estimate"`
}

// OffshoreParkedDTO carries the offshore-parking heuristic estimate.
// is_estimate is always true.
type OffshoreParkedDTO struct {
	OffshoreParkedMnUSD *float64 `json:"offshore_parked_mn_usd"` // null when preconditions not met
	IsEstimate          bool     `json:"is_estimate"`            // always true
	Note                string   `json:"note"`
}

// BOPResponse is the output DTO returned by BOPUseCase.Execute.
// Shape mirrors domain.BOPSnapshot adapted for JSON serialization.
type BOPResponse struct {
	// Status is "ok" on success; "error" when the fetch/parse fails.
	Status string `json:"status"`

	// Quarter label (quyI / quyII / quyIII / quyIV).
	Quarter string `json:"quarter"`

	// Period is the last calendar day of the quarter (YYYY-MM-DD).
	Period string `json:"period"`

	// CurrentAccount holds the current-account sub-components.
	CurrentAccount BOPCurrentAccountDTO `json:"current_account"`

	// CapitalAccountMnUSD is the capital-account balance (M USD).
	CapitalAccountMnUSD float64 `json:"capital_account_mn_usd"`

	// FinancialAccount holds the financial-account sub-components.
	FinancialAccount BOPFinancialAccountDTO `json:"financial_account"`

	// ErrorsOmissionsMnUSD is the net E&O residual (BPM6, negative = outflows).
	ErrorsOmissionsMnUSD float64 `json:"errors_omissions_mn_usd"`

	// OverallBalanceMnUSD is the total BOP balance.
	OverallBalanceMnUSD float64 `json:"overall_balance_mn_usd"`

	// ReserveAssetsMnUSD is the change in reserve assets.
	ReserveAssetsMnUSD float64 `json:"reserve_assets_mn_usd"`

	// FXIncidence is the DD-5 discriminator result.
	FXIncidence FXIncidenceDTO `json:"fx_incidence"`

	// OffshoreParked is the offshore-parking heuristic.
	// is_estimate=true always.
	OffshoreParked OffshoreParkedDTO `json:"offshore_parked"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp of the fetch (RFC3339).
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false — all BOP fields are primary source (PROBE-2 confirmed).
	IsEstimate bool `json:"is_estimate"`

	// Error is non-empty when Status="error".
	Error string `json:"error,omitempty"`
}
