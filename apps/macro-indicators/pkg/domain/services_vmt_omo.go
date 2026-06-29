// Package domain — OMO curve domain services for P0-3-OMO-CURVE.
//
// Pure functions: no I/O, no randomness, no side effects. All inputs explicit.
//
// ComputeImpliedShortRates: derives volume-weighted implied short rates per tenor
// from the slice of parsed tenor rows (add rows only per BA spec FR-3).
//
// DeriveStressResult: classifies liquidity stress from 5d net injection + rate trend.
// Returns the label (DRAIN/TIGHT/NEUTRAL/EASY) and gauge-ready score (0–1, null <5 days).
//
// DDD Fence-A: zero imports from application, infrastructure, or interface layers.
package domain

// ComputeImpliedShortRates derives per-tenor and cross-tenor volume-weighted implied
// short rates from the slice of parsed OMO auction rows.
//
// Per BA spec FR-3: only "mua ky han" (add) rows contribute to implied short rates.
// Absorb rows ("ban ky han", "tin phieu") are included in the full cross-tenor average
// when they carry rate data, but the per-tenor buckets (7d/14d/28d) are add-only.
//
// Volume weighting: for each tenor bucket, ImpliedRate = sum(rate*vol) / sum(vol).
// Rows with WinningRatePct == 0 are excluded from rate computation (parse warning upstream).
//
// MemberWinRatio: simple mean of MemberWinRatio across all add rows with MemberWinRatio > 0.
func ComputeImpliedShortRates(tenors []OMOTenorEntry) OMOImpliedRates {
	type bucket struct {
		volWeightedRate float64
		totalVol        float64
		count           int
	}

	buckets := map[int]*bucket{
		7:  {},
		14: {},
		28: {},
	}
	var allVol, allRateVol float64
	var memberRatioSum float64
	memberCount := 0

	for _, t := range tenors {
		isAdd := t.OperationType == "mua ky han"

		// Cross-tenor weighted avg: include all rows with valid rate.
		if t.WinningRatePct > 0 {
			allRateVol += t.WinningRatePct * t.VolumeBnVND
			allVol += t.VolumeBnVND
		}

		// Per-tenor buckets: add rows only.
		if isAdd && t.WinningRatePct > 0 {
			b, ok := buckets[t.TenorDays]
			if ok {
				b.volWeightedRate += t.WinningRatePct * t.VolumeBnVND
				b.totalVol += t.VolumeBnVND
				b.count++
			}
		}

		// Member win ratio: add rows only, ignore zero (absent data).
		if isAdd && t.MemberWinRatio > 0 {
			memberRatioSum += t.MemberWinRatio
			memberCount++
		}
	}

	makeRate := func(b *bucket) *float64 {
		if b.totalVol <= 0 {
			return nil
		}
		r := b.volWeightedRate / b.totalVol
		return &r
	}

	var weightedAvg *float64
	if allVol > 0 {
		r := allRateVol / allVol
		weightedAvg = &r
	}

	var memberRatio *float64
	if memberCount > 0 {
		r := memberRatioSum / float64(memberCount)
		memberRatio = &r
	}

	return OMOImpliedRates{
		Rate7dPct:          makeRate(buckets[7]),
		Rate14dPct:         makeRate(buckets[14]),
		Rate28dPct:         makeRate(buckets[28]),
		WeightedAvgRatePct: weightedAvg,
		MemberWinRatio:     memberRatio,
	}
}

// DeriveStressResult classifies liquidity stress from 5-day rolling net injection and
// rate trend, returning a discrete label and a gauge-ready continuous score.
//
// Labels (from BA spec FR-5):
//   - DRAIN   — 5d net < -20,000 BnVND (heavy absorption)
//   - TIGHT   — 5d net < 0 AND current rate > previous session rate (rising rate + drain)
//   - NEUTRAL — within ±20,000 BnVND and no rate-rising signal
//   - EASY    — 5d net > +20,000 BnVND (heavy injection)
//
// Score: float 0.0–1.0 where 0=EASY, 0.5=NEUTRAL, 1.0=DRAIN.
// Linear interpolation: score = clamp(0.5 - net5d/40000, 0, 1).
// Score is nil when daysInWindow < 5 (insufficient history, per BA spec FR-5 gauge contract).
//
// net5dBnVND: nil → NEUTRAL label, nil score (no data at all).
// avgRatePct: current session weighted avg rate (nil → rate trend unknown, TIGHT never triggered).
// prevAvgRatePct: previous session's weighted avg rate (nil → rate trend unknown).
func DeriveStressResult(
	net5dBnVND *float64,
	daysInWindow int,
	avgRatePct *float64,
	prevAvgRatePct *float64,
) (label string, score *float64) {
	if net5dBnVND == nil {
		// No data: honest NEUTRAL, no score.
		return "NEUTRAL", nil
	}

	net := *net5dBnVND

	// Label classification.
	switch {
	case net < -20_000:
		label = "DRAIN"
	case net > 20_000:
		label = "EASY"
	case net < 0:
		// Net drain but within ±20,000 threshold.
		// TIGHT when rate is confirmed rising; NEUTRAL otherwise.
		if avgRatePct != nil && prevAvgRatePct != nil && *avgRatePct > *prevAvgRatePct {
			label = "TIGHT"
		} else {
			label = "NEUTRAL"
		}
	default:
		// net in [0, +20,000]
		label = "NEUTRAL"
	}

	// Score: null when fewer than 5 auction dates in window (BA spec gauge-readiness contract).
	if daysInWindow < 5 {
		return label, nil
	}

	raw := 0.5 - net/40_000.0
	if raw < 0 {
		raw = 0
	}
	if raw > 1 {
		raw = 1
	}
	return label, &raw
}
