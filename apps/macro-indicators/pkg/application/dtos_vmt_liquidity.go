// Package application — liquidity-state DTOs for VMT-5a + VMT-5b HTTP/use-case boundary.
//
// DTOs translate between the HTTP request/response and the domain model.
// Field names match the BA spec FR-5 output schema from orch-state.json task
// VMT-5a-LIQUIDITY-STATE-NO-GATE + VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO.
//
// Blocs:
//   - policy_rates (refi + discount + lombard): source=SBV HTML or DB fallback.
//   - sjc_gold_gap: world gold vs SJC domestic price gap from market.db reads.
//   - fx_coupling: USD/VND center + band + CNY/DXY from market.db reads.
//   - irs: is_estimate=true PERMANENT (DD-6, HNX OTC IRS not machine-readable).
//   - omo: SBV OMO net outstanding from nghiep-vu-thi-truong-mo Liferay HTML (VMT-5b).
//   - interbank_1w: PERMANENTLY blocked (architect Decision B, dttktt.sbv.gov.vn unreachable).
//
// INVARIANTS (fail-closed):
//   - LiquidityStateIRSDTO.IsEstimate MUST be true on ALL paths (DD-6 PERMANENT).
//   - InterbankRateDTO.IsEstimate MUST be true on ALL paths (architect Decision B PERMANENT).
//   - InterbankRateDTO.Rate1WPct MUST be nil on ALL paths.
//   - OMOOutstandingDTO.IsEstimate=true on parse failure (fail-closed).
//
// No domain logic in this file — pure data containers only.
package application

// LiquidityStateRequest is the input DTO for the liquidity-state use case (POST /liquidity-state).
// Empty body {} is valid and triggers a fresh read of market.db + SBV HTML fetch.
type LiquidityStateRequest struct{}

// PolicyRatesDTO carries the three SBV key policy interest rates.
// Source: www.sbv.gov.vn Liferay HTML (direct, no VPS proxy) or sbv_rates DB fallback.
type PolicyRatesDTO struct {
	// RefiRatePct is the SBV refinancing rate (lãi suất tái cấp vốn) in % per year.
	RefiRatePct float64 `json:"refi_rate_pct"`
	// DiscountRatePct is the SBV discount rate (lãi suất chiết khấu) in % per year.
	DiscountRatePct float64 `json:"discount_rate_pct"`
	// LombardRatePct is the SBV Lombard rate (lãi suất cầm cố) in % per year.
	// 0 when HTML parse fails and DB fallback has no lombard row.
	LombardRatePct float64 `json:"lombard_rate_pct"`
	// Source identifies the data origin.
	Source string `json:"source"`
	// FetchedAt is the UTC timestamp (RFC3339) of the data fetch.
	FetchedAt string `json:"fetched_at"`
	// IsEstimate is false when rates are sourced directly from SBV HTML.
	// True when values come from DB fallback or when HTML parse fails.
	IsEstimate bool `json:"is_estimate"`
}

// SJCGoldGapDTO carries the SJC domestic vs world gold price gap.
// Source: EXISTING market.db reads — no new crawl (DD-7).
type SJCGoldGapDTO struct {
	// SJCPriceMnVND is the SJC domestic gold buy price in million VND per tael.
	// 0 when the SJC crawler row is absent from market.db.
	SJCPriceMnVND float64 `json:"sjc_price_mn_vnd"`
	// WorldPriceMnVND is the world gold price converted to million VND per tael.
	// Computed: commodity_prices.gold_usd_per_oz * sbv_rates.usd_vnd / 1e6 * troyOzPerTael.
	WorldPriceMnVND float64 `json:"world_price_mn_vnd"`
	// SJCGapMnVND = sjc_price_mn_vnd - world_price_mn_vnd.
	// 0 when SJC price is absent (fail-closed).
	SJCGapMnVND float64 `json:"sjc_gap_mn_vnd"`
	// IsEstimate is true when SJC price is absent (DB read returns 0 = safe-degrade).
	// False only when both SJC and world prices are present from DB.
	IsEstimate bool `json:"is_estimate"`
	// Note explains the gap or any limitation.
	Note string `json:"note"`
	// FetchedAt is the UTC timestamp (RFC3339) of the DB read.
	FetchedAt string `json:"fetched_at"`
}

// FXCouplingDTO carries the SBV USD/VND central rate with band information.
// Source: EXISTING market.db reads — sbv_rates + commodity_prices.
type FXCouplingDTO struct {
	// USDVNDCenter is the SBV official USD/VND central rate.
	// From sbv_rates.usd_vnd_official WHERE source='sbv'.
	USDVNDCenter float64 `json:"usd_vnd_center"`
	// USDVNDBuy is the SBV buy rate. 0 when not in DB.
	USDVNDBuy float64 `json:"usd_vnd_buy"`
	// USDVNDSell is the SBV sell rate. 0 when not in DB.
	USDVNDSell float64 `json:"usd_vnd_sell"`
	// BandPct is the ±5% SBV deviation band (current VN FX policy).
	BandPct float64 `json:"band_pct"`
	// DXY is the US Dollar Index. 0 if absent.
	DXY float64 `json:"dxy"`
	// CNYVNDRate is the CNY/VND rate. 0 if absent.
	CNYVNDRate float64 `json:"cny_vnd_rate"`
	// IsEstimate is false when center rate is live from sbv_rates DB.
	// True when DB is absent or stale.
	IsEstimate bool `json:"is_estimate"`
	// FetchedAt is the UTC timestamp (RFC3339) of the DB read.
	FetchedAt string `json:"fetched_at"`
}

// LiquidityStateIRSDTO is the IRS permanent-estimate marker.
//
// INVARIANT: IsEstimate MUST be true in ALL instances of this DTO.
// DD-6 PERMANENT: HNX OTC IRS market data is not machine-readable.
// NEVER set IsEstimate to false.
type LiquidityStateIRSDTO struct {
	// IsEstimate is PERMANENTLY true (DD-6).
	// NEVER flip to false.
	IsEstimate bool `json:"is_estimate"`
	// Note explains the permanent estimate status.
	Note string `json:"note"`
}

// OMOOutstandingDTO carries the SBV OMO net outstanding parsed from Liferay HTML.
// Source: www.sbv.gov.vn nghiep-vu-thi-truong-mo (direct, no VPS proxy).
//
// INVARIANT: IsEstimate=false on parse success; IsEstimate=true on parse failure (fail-closed).
type OMOOutstandingDTO struct {
	// NetOutstandingBnVND is the net OMO liquidity injection in billion VND.
	// null when parse failed (fail-closed).
	NetOutstandingBnVND *float64 `json:"net_outstanding_bn_vnd"`
	// TotalAddBnVND is the sum of Mua kỳ hạn (reverse-repo add) in billion VND.
	TotalAddBnVND float64 `json:"total_add_bn_vnd"`
	// TotalAbsorbBnVND is the sum of Bán kỳ hạn + Tín phiếu (absorb) in billion VND.
	TotalAbsorbBnVND float64 `json:"total_absorb_bn_vnd"`
	// AuctionDate is the most-recent auction date (DD/MM/YYYY).
	AuctionDate string `json:"auction_date"`
	// IsEstimate is false on parse success (primary SBV HTML); true on parse failure.
	IsEstimate bool `json:"is_estimate"`
	// BlockedReason is non-empty only when IsEstimate=true due to fetch/parse error.
	BlockedReason string `json:"blocked_reason,omitempty"`
	// Source identifies the data origin.
	Source string `json:"source"`
	// FetchedAt is the UTC timestamp (RFC3339) of the fetch.
	FetchedAt string `json:"fetched_at"`
}

// InterbankRateDTO carries the SBV interbank 1-week tenor rate.
//
// PERMANENT INVARIANT (architect Decision B):
//   - IsEstimate MUST be true on ALL paths.
//   - Rate1WPct MUST be nil on ALL paths.
//   - BlockedReason MUST be set on ALL paths.
//
// dttktt.sbv.gov.vn (Oracle WebCenter, 202.58.245.101) = 100% packet loss from Vinahost VPS.
// No public alternative exists (WiData off-limits, NSO narrative unreliable, no Bloomberg/Refinitiv).
// NEVER set IsEstimate=false or Rate1WPct to a non-nil value.
type InterbankRateDTO struct {
	// Rate1WPct is ALWAYS nil. No machine-readable source exists.
	Rate1WPct *float64 `json:"rate_1w_pct"` // always null
	// IsEstimate is PERMANENTLY true (architect Decision B). NEVER flip to false.
	IsEstimate bool `json:"is_estimate"`
	// BlockedReason explains the permanent null rate.
	BlockedReason string `json:"blocked_reason"`
}

// LiquidityStateResponse is the output DTO returned by LiquidityStateUseCase.Execute.
type LiquidityStateResponse struct {
	// Status is "ok" on success; "error" when any fetch/parse fails.
	Status string `json:"status"`

	// PolicyRates holds the three SBV key policy rates.
	PolicyRates PolicyRatesDTO `json:"policy_rates"`

	// SJCGoldGap holds the domestic vs world gold price gap.
	SJCGoldGap SJCGoldGapDTO `json:"sjc_gold_gap"`

	// FXCoupling holds the SBV USD/VND center rate + band + CNY/DXY.
	FXCoupling FXCouplingDTO `json:"fx_coupling"`

	// IRS is the permanent estimate marker.
	// IRS.IsEstimate MUST be true ALWAYS (DD-6 — fail-closed invariant).
	IRS LiquidityStateIRSDTO `json:"irs"`

	// OMO holds the SBV OMO net outstanding from nghiep-vu-thi-truong-mo Liferay HTML.
	// is_estimate=false on parse success; is_estimate=true on parse failure (fail-closed).
	OMO OMOOutstandingDTO `json:"omo"`

	// Interbank1W holds the SBV interbank 1-week tenor rate.
	// PERMANENTLY blocked: is_estimate=true, rate_1w_pct=null (architect Decision B).
	Interbank1W InterbankRateDTO `json:"interbank_1w"`

	// FetchedAt is the UTC timestamp (RFC3339) of the overall snapshot.
	FetchedAt string `json:"fetched_at"`

	// Source summarises the data origins.
	Source string `json:"source"`

	// Error is non-empty when Status="error" (nil-provider / wiring fault — genuine 500).
	Error string `json:"error,omitempty"`

	// BlockedReason is non-empty when Status="degraded" (upstream-fetch/parse failure).
	// HTTP 200 is returned on degraded paths — all bloc IsEstimate fields are true.
	// Note: the individual bloc DTOs (PolicyRates, OMO, etc.) carry their own BlockedReason
	// fields; this top-level field covers the whole-response degrade case.
	BlockedReason string `json:"blocked_reason,omitempty"`
}
