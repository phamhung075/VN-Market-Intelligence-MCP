// Package domain — liquidity-state domain models for VMT-5a.
//
// Blocs:
//   1. policy_rates — refi_rate_pct, discount_rate_pct, lombard_rate_pct.
//      Source: www.sbv.gov.vn Liferay HTML (same domain as BOP — direct, no VPS proxy).
//      Existing sbv_rates table holds refi + discount; lombard from HTML parse.
//
//   2. sjc_gold_gap — sjc_gap_mn_vnd = sjc_price_mn_vnd - world_price_mn_vnd.
//      Source: EXISTING market.db reads (commodity_prices table for world gold + SJC table).
//      DD-7: no new fetch, no new crawl. Safe-degrade: sjc = 0 → gap = 0.
//
//   3. fx_coupling — usd_vnd_center +/- band % from EXISTING market.db reads
//      (sbv_rates + commodity_prices). CNY/DXY from commodity_prices (yahoo source).
//
//   4. irs — is_estimate=true PERMANENT (DD-6, HNX OTC IRS not machine-readable).
//
// INVARIANT (fail-closed): IRS.IsEstimate MUST be true on ALL paths including error paths.
// NEVER flip IRS.IsEstimate to false. Same pattern as VMT-1b bloc_split + VMT-4 CPI weights.
//
// Zero imports from application, infrastructure, or interface layers (DDD Fence-A).
package domain

// PolicyRates holds the three SBV key policy interest rates.
// Source: www.sbv.gov.vn Liferay HTML (same domain as BOP — no VPS proxy needed).
type PolicyRates struct {
	// RefiRatePct is the SBV refinancing rate (lãi suất tái cấp vốn) in % per year.
	RefiRatePct float64 `json:"refi_rate_pct"`

	// DiscountRatePct is the SBV discount rate (lãi suất chiết khấu) in % per year.
	DiscountRatePct float64 `json:"discount_rate_pct"`

	// LombardRatePct is the SBV Lombard rate (lãi suất cầm cố) in % per year.
	// Parsed from SBV HTML; 0 if absent (safe-degrade).
	LombardRatePct float64 `json:"lombard_rate_pct"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp (RFC3339) of the policy rates fetch.
	FetchedAt string `json:"fetched_at"`

	// IsEstimate is false when rates are sourced directly from SBV HTML.
	// Set to true when values come from DB fallback or when HTML parse fails.
	IsEstimate bool `json:"is_estimate"`
}

// SJCGoldGap holds the SJC domestic vs world gold price gap.
// Source: EXISTING market.db reads — no new crawl.
//
// sjc_gap_mn_vnd = sjc_price_mn_vnd - world_price_mn_vnd
// world_price_mn_vnd = gold_usd_per_oz (commodity_prices) * usd_vnd_rate (sbv_rates) / 1e6
// SJC price: from market.db SJC source row (if present); 0 = absent (safe-degrade).
//
// DD-7: existing crawlers write these — NO new fetch added.
type SJCGoldGap struct {
	// SJCPriceMnVND is the SJC domestic gold buy price in million VND per tael (10 chỉ).
	// 0 if the SJC row is absent from the DB.
	SJCPriceMnVND float64 `json:"sjc_price_mn_vnd"`

	// WorldPriceMnVND is the world gold price converted to million VND per tael.
	// Computed from commodity_prices.gold_usd_per_oz * usd_vnd_rate, scaled to tael.
	WorldPriceMnVND float64 `json:"world_price_mn_vnd"`

	// SJCGapMnVND = sjc_price_mn_vnd - world_price_mn_vnd.
	// Positive = domestic premium; 0 if SJC data absent.
	SJCGapMnVND float64 `json:"sjc_gap_mn_vnd"`

	// IsEstimate is true when SJC price is absent (DB read returns 0 = safe-degrade).
	// False only when both SJC and world prices are present from DB.
	IsEstimate bool `json:"is_estimate"`

	// Note explains the gap or any limitation (e.g. SJC data absent).
	Note string `json:"note"`

	// FetchedAt is the UTC timestamp (RFC3339) of the DB read.
	FetchedAt string `json:"fetched_at"`
}

// FXCoupling holds the SBV USD/VND central rate with band information.
// Source: EXISTING market.db reads — sbv_rates + commodity_prices.
//
// CNY/DXY from existing main-server FX fetch (commodity_prices yahoo source).
type FXCoupling struct {
	// USDVNDCenter is the SBV official USD/VND central rate.
	// Source: sbv_rates.usd_vnd_official (WHERE source='sbv').
	USDVNDCenter float64 `json:"usd_vnd_center"`

	// USDVNDBuy is the SBV buy rate (if available from DB).
	// Falls back to 0 when not stored (safe-degrade).
	USDVNDBuy float64 `json:"usd_vnd_buy"`

	// USDVNDSell is the SBV sell rate (if available from DB).
	// Falls back to 0 when not stored (safe-degrade).
	USDVNDSell float64 `json:"usd_vnd_sell"`

	// BandPct is the +/- allowed deviation band percentage.
	// SBV +/- 5% from central rate (current VN FX policy).
	BandPct float64 `json:"band_pct"`

	// DXY is the US Dollar Index from commodity_prices (yahoo source).
	// 0 if absent from DB.
	DXY float64 `json:"dxy"`

	// CNYVNDRate is the CNY/VND rate from commodity_prices (yahoo source).
	// 0 if absent from DB.
	CNYVNDRate float64 `json:"cny_vnd_rate"`

	// IsEstimate is false when center rate comes from sbv_rates DB read.
	// True when DB is absent or stale (safe-degrade).
	IsEstimate bool `json:"is_estimate"`

	// FetchedAt is the UTC timestamp (RFC3339) of the DB read.
	FetchedAt string `json:"fetched_at"`
}

// IRSField holds the Interest Rate Swap (IRS) estimate marker.
//
// DD-6 PERMANENT: HNX OTC IRS market data is not machine-readable.
// is_estimate MUST be true on ALL paths, including error paths.
// NEVER flip IsEstimate to false without a confirmed machine-readable IRS source.
type IRSField struct {
	// IsEstimate is PERMANENTLY true (DD-6).
	// HNX OTC IRS fixing is not available via machine-readable API.
	// NEVER flip to false.
	IsEstimate bool `json:"is_estimate"`

	// Note explains why is_estimate is permanently true.
	Note string `json:"note"`
}

// OMOOutstanding holds the SBV Open Market Operation (OMO) net outstanding.
//
// Source: www.sbv.gov.vn nghiep-vu-thi-truong-mo Liferay HTML (same SBV domain as BOP —
// direct fetch, no VPS proxy). Parsed from the auction results table.
//
// net_outstanding_bn_vnd = sum(Mua kỳ hạn / reverse-repo add) - sum(Bán kỳ hạn / absorb) - sum(Tín phiếu).
// Maturity-date aware: only unexpired positions count in the rolling tally.
//
// INVARIANT: IsEstimate=false when parsed from live SBV HTML (primary source).
// IsEstimate=true on parse failure (fail-closed).
type OMOOutstanding struct {
	// NetOutstandingBnVND is the net OMO liquidity injection in billion VND.
	// Positive = net add (reverse-repo dominates); negative = net drain.
	// null / nil = data unavailable (parse failure).
	NetOutstandingBnVND *float64 `json:"net_outstanding_bn_vnd"`

	// TotalAddBnVND is the total Mua kỳ hạn (reverse-repo add) volume in billion VND.
	TotalAddBnVND float64 `json:"total_add_bn_vnd"`

	// TotalAbsorbBnVND is the total Bán kỳ hạn (absorb) + Tín phiếu volume in billion VND.
	TotalAbsorbBnVND float64 `json:"total_absorb_bn_vnd"`

	// AuctionDate is the date of the most-recent OMO auction (DD/MM/YYYY from SBV HTML).
	AuctionDate string `json:"auction_date"`

	// IsEstimate is false when parsed from live SBV HTML (primary source).
	// True on parse failure (fail-closed).
	IsEstimate bool `json:"is_estimate"`

	// BlockedReason is non-empty only when IsEstimate=true due to a parse/fetch error.
	BlockedReason string `json:"blocked_reason,omitempty"`

	// Source identifies the data origin.
	Source string `json:"source"`

	// FetchedAt is the UTC timestamp (RFC3339) of the fetch.
	FetchedAt string `json:"fetched_at"`
}

// InterbankRate holds the SBV interbank 1-week tenor rate.
//
// PERMANENT INVARIANT (architect Decision B):
// dttktt.sbv.gov.vn (Oracle WebCenter, 202.58.245.101) is permanently blocked —
// 100% packet loss from Vinahost VPS. No public alternative exists.
// is_estimate MUST be true on ALL paths, including error paths.
// rate_1w_pct MUST be null. blocked_reason MUST be set.
// NEVER flip IsEstimate to false without a confirmed machine-readable replacement source.
type InterbankRate struct {
	// Rate1WPct is ALWAYS nil (no machine-readable source).
	// dttktt.sbv.gov.vn 100% packet loss from VPS — permanently blocked.
	Rate1WPct *float64 `json:"rate_1w_pct"` // always null

	// IsEstimate is PERMANENTLY true (architect Decision B).
	// NEVER flip to false.
	IsEstimate bool `json:"is_estimate"`

	// BlockedReason explains why rate_1w_pct is always null.
	BlockedReason string `json:"blocked_reason"`
}

// LiquidityStateRecord holds the full liquidity-state snapshot.
// Produced by the domain service and consumed by the use case.
type LiquidityStateRecord struct {
	// PolicyRates holds the three SBV key policy rates.
	PolicyRates PolicyRates `json:"policy_rates"`

	// SJCGoldGap holds the domestic vs world gold price gap.
	SJCGoldGap SJCGoldGap `json:"sjc_gold_gap"`

	// FXCoupling holds the SBV USD/VND central rate + band + CNY/DXY.
	FXCoupling FXCoupling `json:"fx_coupling"`

	// IRS is the permanent estimate marker for the IRS field.
	// is_estimate=true ALWAYS (DD-6).
	IRS IRSField `json:"irs"`

	// OMO holds the SBV OMO net outstanding parsed from Liferay HTML.
	// is_estimate=false on parse success; is_estimate=true on parse failure.
	OMO OMOOutstanding `json:"omo"`

	// Interbank holds the SBV interbank 1-week tenor rate.
	// is_estimate=true PERMANENTLY (architect Decision B — dttktt.sbv.gov.vn blocked).
	Interbank InterbankRate `json:"interbank_1w"`

	// FetchedAt is the UTC timestamp (RFC3339) of the overall snapshot.
	FetchedAt string `json:"fetched_at"`
}
