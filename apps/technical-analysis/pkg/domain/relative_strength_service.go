// Package domain — RelativeStrengthService: pure calculation for IND-P1-RELATIVE-STRENGTH.
//
// FR-1: Mansfield RS per horizon = stock_%change - index_%change.
// FR-2: VNINDEX sourced from daily_ohlcv (code="VNINDEX"); no runtime API call.
// FR-3: Cross-sectional percentile rank per horizon = (rank/N)*100.
// FR-4: RSPosture labels per horizon: LEADING(pct>=75), LAGGING(pct<=25), IN_LINE(26–74).
// FR-5: Composite RS = arithmetic mean of 3 horizon percentiles; STRONG(>=70)/WEAK(<=30)/NEUTRAL.
// FR-6: Partial RS: <63 bars → all null; >=63 <126 → 63d real + 126d/252d null; >=126 <252 → 63d/126d real + 252d null.
// FR-7: VNINDEX absent → all tickers null + null_reason:"index_data_absent".
package domain

// RelativeStrengthService provides pure calculation for cross-sectional RS.
type RelativeStrengthService struct{}

// NewRelativeStrengthService constructs a RelativeStrengthService.
func NewRelativeStrengthService() *RelativeStrengthService {
	return &RelativeStrengthService{}
}

const (
	// vnIndexCode is the SSOT code for VN-Index in daily_ohlcv (ARCH-RATIFY-RS-1).
	vnIndexCode = "VNINDEX"
)

// RS horizon bar requirements.
const (
	horizonBars63  = 63
	horizonBars126 = 126
	horizonBars252 = 252
)

// ComputeCrossSection computes cross-sectional RS for all tickers vs VNINDEX.
// allBars must include the "VNINDEX" entry (sourced from daily_ohlcv.code='VNINDEX').
func (s *RelativeStrengthService) ComputeCrossSection(
	allBars map[string][]OHLCVBar,
	tickers []string,
) RelativeStrengthCrossSection {
	// FR-7: VNINDEX absent → all tickers null.
	indexBars := allBars[vnIndexCode]
	if len(indexBars) == 0 {
		reason := "index_data_absent"
		results := make([]CompositeRSResult, len(tickers))
		for i, code := range tickers {
			results[i] = CompositeRSResult{
				Code:       code,
				H63:        nullHorizon(63, reason),
				H126:       nullHorizon(126, reason),
				H252:       nullHorizon(252, reason),
				NullReason: &reason,
			}
		}
		return RelativeStrengthCrossSection{
			Tickers:    results,
			NullReason: &reason,
		}
	}

	// Compute raw RS per ticker per horizon.
	horizons := []int{horizonBars63, horizonBars126, horizonBars252}
	rawRS := make(map[string][3]*float64) // [h63, h126, h252] per ticker
	for _, code := range tickers {
		bars := allBars[code]
		var trio [3]*float64
		for hi, h := range horizons {
			rs := s.computeMansfield(bars, indexBars, h)
			trio[hi] = rs
		}
		rawRS[code] = trio
	}

	// Compute cross-sectional percentiles per horizon.
	pcts := make(map[string][3]*float64) // percentile per horizon per ticker
	for hi := range horizons {
		// collect valid RS values for this horizon.
		type codeRS struct {
			code string
			rs   float64
		}
		var valids []codeRS
		for _, code := range tickers {
			if rawRS[code][hi] != nil {
				valids = append(valids, codeRS{code, *rawRS[code][hi]})
			}
		}
		N := len(valids)
		for _, code := range tickers {
			if rawRS[code][hi] == nil {
				continue // leave nil
			}
			myRS := *rawRS[code][hi]
			below := 0
			for _, v := range valids {
				if v.rs < myRS {
					below++
				}
			}
			pctVal := 0.0
			if N > 0 {
				pctVal = float64(below) / float64(N) * 100.0
			}
			entry := pcts[code]
			entry[hi] = &pctVal
			pcts[code] = entry
		}
	}

	// Count tickers with at least 63 bars (for low_sample_warning).
	validCount := 0
	for _, code := range tickers {
		if rawRS[code][0] != nil {
			validCount++
		}
	}
	lowSampleWarning := validCount < 5

	// Assemble per-ticker results.
	results := make([]CompositeRSResult, len(tickers))
	for i, code := range tickers {
		bars := allBars[code]
		nBars := len(bars)
		result := CompositeRSResult{Code: code}

		// Horizon 63d.
		result.H63 = s.buildHorizonResult(63, nBars, rawRS[code][0], pcts[code][0])
		// Horizon 126d.
		result.H126 = s.buildHorizonResult(126, nBars, rawRS[code][1], pcts[code][1])
		// Horizon 252d.
		result.H252 = s.buildHorizonResult(252, nBars, rawRS[code][2], pcts[code][2])

		// Composite score = mean of non-nil percentiles.
		var pctSum float64
		var pctCount int
		for _, h := range []*RSHorizonResult{&result.H63, &result.H126, &result.H252} {
			if h.Percentile != nil {
				pctSum += *h.Percentile
				pctCount++
			}
		}
		if pctCount > 0 {
			comp := pctSum / float64(pctCount)
			result.CompositeScore = &comp
			lbl := compositeLabel(comp)
			result.CompositeLabel = &lbl
		} else {
			r := "insufficient_history"
			result.NullReason = &r
		}

		results[i] = result
	}

	// Feed-forward scalar: mean composite RS across watchlist.
	var marketRS *float64
	var compSum float64
	var compCount int
	for _, r := range results {
		if r.CompositeScore != nil {
			compSum += *r.CompositeScore
			compCount++
		}
	}
	if compCount >= 5 {
		mv := compSum / float64(compCount)
		marketRS = &mv
	}

	return RelativeStrengthCrossSection{
		Tickers:           results,
		MarketRSComposite: marketRS,
		LowSampleWarning:  lowSampleWarning,
	}
}

// computeMansfield computes Mansfield RS for one ticker against the index for horizon h.
// RS = stock_%change - index_%change
// stock_%change = (stock_close[last] / stock_close[last-h]) - 1
// Returns nil when either stock or index has insufficient bars.
func (s *RelativeStrengthService) computeMansfield(
	stockBars []OHLCVBar,
	indexBars []OHLCVBar,
	h int,
) *float64 {
	// Need h+1 bars (current + h bars back).
	if len(stockBars) < h+1 || len(indexBars) < h+1 {
		return nil
	}
	sN := len(stockBars)
	iN := len(indexBars)

	stockNow := stockBars[sN-1].Close
	stockPrev := stockBars[sN-1-h].Close
	indexNow := indexBars[iN-1].Close
	indexPrev := indexBars[iN-1-h].Close

	if stockPrev <= 0 || indexPrev <= 0 {
		return nil
	}

	stockChg := stockNow/stockPrev - 1.0
	indexChg := indexNow/indexPrev - 1.0
	rs := stockChg - indexChg
	return &rs
}

// buildHorizonResult constructs an RSHorizonResult applying FR-6 partial RS rules.
func (s *RelativeStrengthService) buildHorizonResult(
	horizon int,
	nBars int,
	rs *float64,
	pct *float64,
) RSHorizonResult {
	if rs == nil || pct == nil {
		reason := "insufficient_history"
		if nBars < horizon {
			// More specific reason per horizon.
			switch horizon {
			case horizonBars126:
				r := "insufficient_bars_126d"
				reason = r
			case horizonBars252:
				r := "insufficient_bars_252d"
				reason = r
			}
		}
		return nullHorizon(horizon, reason)
	}
	pctVal := *pct
	lbl := horizonLabel(pctVal)
	return RSHorizonResult{
		Horizon:    horizon,
		RS:         rs,
		Percentile: &pctVal,
		Label:      &lbl,
	}
}

// nullHorizon returns an RSHorizonResult with all value fields nil and a null_reason set.
func nullHorizon(horizon int, reason string) RSHorizonResult {
	r := reason
	return RSHorizonResult{
		Horizon:    horizon,
		NullReason: &r,
	}
}

// horizonLabel classifies percentile into RSLabel.
func horizonLabel(pct float64) RSLabel {
	switch {
	case pct >= 75:
		return RSLeading
	case pct <= 25:
		return RSLagging
	default:
		return RSInLine
	}
}

// compositeLabel classifies composite score into RSCompositeLabel.
func compositeLabel(score float64) RSCompositeLabel {
	switch {
	case score >= 70:
		return RSStrong
	case score <= 30:
		return RSWeak
	default:
		return RSNeutral
	}
}
