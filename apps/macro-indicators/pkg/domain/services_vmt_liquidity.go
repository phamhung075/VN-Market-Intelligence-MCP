// Package domain — liquidity-state domain service functions for VMT-5a + VMT-5b.
//
// Pure functions: no imports from application, infrastructure, or interface layers.
//
// Key functions:
//   - ComputeSJCGoldGap: sjc_gap = sjc_price_mn_vnd - world_price_mn_vnd.
//   - ConvertWorldGoldToMnVND: world gold USD/oz → million VND/tael (1 tael = 37.5g ≈ 1.2057 troy oz).
//   - BuildIRSField: always returns IsEstimate=true (DD-6, PERMANENT).
//   - BuildFXCoupling: assembles FXCoupling from raw DB values.
//   - BuildInterbankRate: always returns IsEstimate=true + Rate1WPct=nil (architect Decision B, PERMANENT).
//   - BuildOMOFailed: returns OMOOutstanding with IsEstimate=true (parse failure fail-closed).
//   - BuildOMOSuccess: returns OMOOutstanding with IsEstimate=false from parsed values.
//
// INVARIANTS:
//   - IRS.IsEstimate MUST be true on ALL paths (DD-6 PERMANENT).
//   - InterbankRate.IsEstimate MUST be true on ALL paths (architect Decision B PERMANENT).
//   - InterbankRate.Rate1WPct MUST be nil on ALL paths.
//   - OMOOutstanding.IsEstimate=true on parse failure (fail-closed).
//
// Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

const (
	// irsNote is the permanent note explaining why IRS is_estimate=true.
	irsNote = "HNX OTC IRS market data not machine-readable (DD-6, permanent)"

	// sjcAbsentNote is used when the SJC price is absent from the DB.
	sjcAbsentNote = "SJC price absent from DB (no SJC crawler row); gap = 0"

	// sjcPresentNote is used when SJC price is available.
	sjcPresentNote = "market.db read (commodity_prices for world gold, SJC source for domestic)"

	// troyOzPerTael is the number of troy ounces in one Vietnamese tael (lượng/chỉ * 10).
	// 1 Vietnamese tael = 37.5g; 1 troy oz = 31.1035g → 37.5 / 31.1035 ≈ 1.20565.
	troyOzPerTael = 1.20565

	// sbvBandPct is the current SBV +/- deviation band from the central rate.
	// VN FX policy: ±5% from daily central rate.
	sbvBandPct = 5.0

	// interbankBlockedReason is the permanent blocked_reason for interbank_1w.
	// architect Decision B: dttktt.sbv.gov.vn 100% packet loss from Vinahost VPS — PERMANENT.
	interbankBlockedReason = "dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)"

	// omoSource is the source label for OMO data parsed from SBV Liferay HTML.
	omoSource = "www.sbv.gov.vn nghiep-vu-thi-truong-mo Liferay HTML (direct, no VPS proxy)"
)

// BuildIRSField returns an IRSField with IsEstimate=true PERMANENTLY.
//
// DD-6 (PERMANENT): HNX OTC IRS market data is not machine-readable.
// This function ALWAYS returns IsEstimate=true regardless of inputs.
// NEVER modify this function to return false.
func BuildIRSField() IRSField {
	return IRSField{
		IsEstimate: true, // PERMANENT — DD-6 — NEVER flip to false
		Note:       irsNote,
	}
}

// ConvertWorldGoldToMnVND converts world gold price (USD/troy oz) to million VND/tael.
//
// Formula: (goldUSDPerOz * usdVNDRate / 1_000_000) * troyOzPerTael
// Returns 0 if either input is 0 or negative (safe-degrade).
func ConvertWorldGoldToMnVND(goldUSDPerOz, usdVNDRate float64) float64 {
	if goldUSDPerOz <= 0 || usdVNDRate <= 0 {
		return 0
	}
	// goldUSDPerOz * usdVNDRate = gold price in VND per troy oz.
	// Multiply by troyOzPerTael to convert to VND per tael.
	// Divide by 1_000_000 to express in million VND.
	return (goldUSDPerOz * usdVNDRate / 1_000_000) * troyOzPerTael
}

// ComputeSJCGoldGap computes the SJC gold gap.
//
// sjcGapMnVND = sjcPriceMnVND - worldPriceMnVND.
// Positive = domestic SJC premium over world gold.
//
// Fail-closed: when sjcPriceMnVND == 0 (SJC absent from DB):
//   - SJCPriceMnVND = 0
//   - SJCGapMnVND = 0
//   - IsEstimate = true (safe-degrade, cannot compute gap without SJC price)
//
// When sjcPriceMnVND > 0 and worldPriceMnVND > 0:
//   - SJCGapMnVND = sjcPriceMnVND - worldPriceMnVND
//   - IsEstimate = false (both values from DB)
func ComputeSJCGoldGap(sjcPriceMnVND, worldPriceMnVND float64, fetchedAt string) SJCGoldGap {
	if sjcPriceMnVND <= 0 {
		// SJC data absent — fail-closed with is_estimate=true.
		return SJCGoldGap{
			SJCPriceMnVND:  0,
			WorldPriceMnVND: worldPriceMnVND,
			SJCGapMnVND:    0,
			IsEstimate:     true, // fail-closed: SJC absent → cannot compute gap
			Note:           sjcAbsentNote,
			FetchedAt:      fetchedAt,
		}
	}

	gap := sjcPriceMnVND - worldPriceMnVND
	return SJCGoldGap{
		SJCPriceMnVND:  sjcPriceMnVND,
		WorldPriceMnVND: worldPriceMnVND,
		SJCGapMnVND:    gap,
		IsEstimate:     false, // both values present from DB
		Note:           sjcPresentNote,
		FetchedAt:      fetchedAt,
	}
}

// BuildFXCoupling assembles the FXCoupling from raw DB values.
//
// usdVNDCenter: from sbv_rates.usd_vnd_official (WHERE source='sbv').
// dxy: from commodity_prices.dxy (yahoo source).
// cnyVNDRate: from commodity_prices.cny_vnd_rate (yahoo source).
//
// IsEstimate: false when usdVNDCenter > 0 (center rate from DB).
// True when DB is absent or stale (safe-degrade → center rate = 0).
//
// BandPct is always sbvBandPct (±5%, current SBV policy — not parse-derived).
func BuildFXCoupling(usdVNDCenter, usdVNDBuy, usdVNDSell, dxy, cnyVNDRate float64, fetchedAt string) FXCoupling {
	isEstimate := usdVNDCenter <= 0 // no live center rate → safe-degrade estimate
	return FXCoupling{
		USDVNDCenter: usdVNDCenter,
		USDVNDBuy:    usdVNDBuy,
		USDVNDSell:   usdVNDSell,
		BandPct:      sbvBandPct,
		DXY:          dxy,
		CNYVNDRate:   cnyVNDRate,
		IsEstimate:   isEstimate,
		FetchedAt:    fetchedAt,
	}
}

// BuildInterbankRate returns an InterbankRate with IsEstimate=true PERMANENTLY.
//
// Architect Decision B (PERMANENT): dttktt.sbv.gov.vn (Oracle WebCenter, 202.58.245.101)
// is permanently unreachable from Vinahost VPS (100% packet loss). No public alternative
// exists (WiData off-limits, NSO narrative unreliable, no Bloomberg/Refinitiv).
//
// This function ALWAYS returns:
//   - Rate1WPct = nil (no live source)
//   - IsEstimate = true (permanent)
//   - BlockedReason = interbankBlockedReason
//
// NEVER modify to return false or a non-nil Rate1WPct without a confirmed replacement source.
func BuildInterbankRate() InterbankRate {
	return InterbankRate{
		Rate1WPct:     nil, // PERMANENT — no machine-readable source (architect Decision B)
		IsEstimate:    true, // PERMANENT — NEVER flip to false
		BlockedReason: interbankBlockedReason,
	}
}

// BuildOMOSuccess returns an OMOOutstanding from successfully parsed SBV HTML.
//
// Called when the OMO HTML parse succeeds (is_estimate=false, primary source).
// netOutstandingBnVND = totalAddBnVND - totalAbsorbBnVND.
// auctionDate is the most-recent auction date string from the SBV HTML (DD/MM/YYYY).
func BuildOMOSuccess(totalAddBnVND, totalAbsorbBnVND float64, auctionDate, fetchedAt string) OMOOutstanding {
	net := totalAddBnVND - totalAbsorbBnVND
	return OMOOutstanding{
		NetOutstandingBnVND: &net,
		TotalAddBnVND:       totalAddBnVND,
		TotalAbsorbBnVND:    totalAbsorbBnVND,
		AuctionDate:         auctionDate,
		IsEstimate:          false, // primary SBV HTML source — not an estimate
		Source:              omoSource,
		FetchedAt:           fetchedAt,
	}
}

// BuildOMOFailed returns an OMOOutstanding with IsEstimate=true (fail-closed).
//
// Called when the OMO HTML fetch or parse fails.
// NetOutstandingBnVND is nil — no value could be determined.
// blockedReason should describe the failure (e.g. HTTP error or parse error message).
func BuildOMOFailed(blockedReason, fetchedAt string) OMOOutstanding {
	return OMOOutstanding{
		NetOutstandingBnVND: nil, // fail-closed: cannot determine net outstanding
		IsEstimate:          true, // fail-closed invariant
		BlockedReason:       blockedReason,
		Source:              omoSource,
		FetchedAt:           fetchedAt,
	}
}
