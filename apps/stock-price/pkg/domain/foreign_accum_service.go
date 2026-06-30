// Package domain — Foreign Accumulation Rank service (pure domain logic).
// Zero I/O — uses repository ports injected at construction.
package domain

import (
	"math"
	"sort"
)

// ForeignAccumService computes foreign accumulation rank for a set of tickers.
type ForeignAccumService struct {
	flowRepo  ForeignFlowRepository
	roomRepo  RoomEventRepository
}

// NewForeignAccumService constructs the service with injected repositories.
func NewForeignAccumService(flowRepo ForeignFlowRepository, roomRepo RoomEventRepository) *ForeignAccumService {
	return &ForeignAccumService{
		flowRepo:  flowRepo,
		roomRepo:  roomRepo,
	}
}

// ComputeRank calculates foreign accumulation rank for the given codes.
// Implements FR-1 through FR-13 from the handoff spec.
func (s *ForeignAccumService) ComputeRank(codes []string) (*ForeignAccumRankResult, error) {
	// FR-1: Fetch trailing 20 daily rows per ticker
	flowData, err := s.flowRepo.GetForeignFlow(codes, 20)
	if err != nil {
		return nil, err
	}

	// Track the latest date across all data for computed_as_of
	var latestDate string

	// Phase 1: Per-ticker computation
	type tickerCalc struct {
		code                    string
		barCount                int
		netFlow5dRaw            *float64
		netFlow20dRaw           *float64
		cumNetFlow5dNormalized  *float64
		cumNetFlow20dNormalized *float64
		nullReason              *string
		nullReason20d           *string
		nullReasonNormalize     *string
	}
	calcs := make([]tickerCalc, 0, len(codes))

	for _, code := range codes {
		bars := flowData[code]
		calc := tickerCalc{code: code, barCount: len(bars)}

		// Track latest date
		if len(bars) > 0 && bars[0].Date > latestDate {
			latestDate = bars[0].Date
		}

		// FR-10: <5 bars = null + reason
		if len(bars) < 5 {
			reason := "insufficient_flow_history"
			calc.nullReason = &reason
			calcs = append(calcs, calc)
			continue
		}

		// FR-2: net_foreign_flow_vol = foreign_buy_vol - foreign_sell_vol
		// FR-3: ADTV (shares) = mean(volume) over available window
		// FR-4: normalized_flow_d = net_foreign_flow_vol_d / adtv

		// Compute ADTV from all available bars
		var volumeSum float64
		var volumeCount int
		for _, bar := range bars {
			volumeSum += bar.Volume
			volumeCount++
		}
		adtv := volumeSum / float64(volumeCount)

		// FR-12: zero ADTV = undefined normalized flow
		if adtv == 0 {
			reason := "zero_adtv"
			calc.nullReasonNormalize = &reason
			// Still compute raw flows
			calc.netFlow5dRaw, calc.netFlow20dRaw = s.computeRawFlows(bars)
			calcs = append(calcs, calc)
			continue
		}

		// Compute raw and normalized flows
		calc.netFlow5dRaw, calc.netFlow20dRaw = s.computeRawFlows(bars)

		// FR-5: Cumulative normalized flow
		// 5d window
		var sum5d float64
		for i := 0; i < 5 && i < len(bars); i++ {
			netFlow := s.netFlowFromBar(bars[i])
			if netFlow != nil {
				sum5d += *netFlow / adtv
			}
		}
		cumNorm5d := sum5d
		calc.cumNetFlow5dNormalized = &cumNorm5d

		// FR-11: >=5 but <20 bars: 5d real, 20d null
		if len(bars) < 20 {
			reason := "insufficient_20d_history"
			calc.nullReason20d = &reason
		} else {
			// 20d window
			var sum20d float64
			for i := 0; i < 20 && i < len(bars); i++ {
				netFlow := s.netFlowFromBar(bars[i])
				if netFlow != nil {
					sum20d += *netFlow / adtv
				}
			}
			cumNorm20d := sum20d
			calc.cumNetFlow20dNormalized = &cumNorm20d
		}

		calcs = append(calcs, calc)
	}

	// FR-6 & FR-13: Cross-sectional z-score
	// Only include tickers with >=5 bars and valid cumNetFlow5dNormalized
	var validForZScore []int
	for i, c := range calcs {
		if c.cumNetFlow5dNormalized != nil {
			validForZScore = append(validForZScore, i)
		}
	}

	// FR-13: <3 tickers with >=5 bars = degenerate population
	var zScores []float64
	degenerateZScore := len(validForZScore) < 3
	if !degenerateZScore {
		// Compute mean and stddev
		var sum float64
		for _, idx := range validForZScore {
			sum += *calcs[idx].cumNetFlow5dNormalized
		}
		mean := sum / float64(len(validForZScore))

		var varianceSum float64
		for _, idx := range validForZScore {
			diff := *calcs[idx].cumNetFlow5dNormalized - mean
			varianceSum += diff * diff
		}
		stddev := math.Sqrt(varianceSum / float64(len(validForZScore)))

		// Compute z-scores
		zScores = make([]float64, len(calcs))
		for _, idx := range validForZScore {
			if stddev > 0 {
				z := (*calcs[idx].cumNetFlow5dNormalized - mean) / stddev
				zScores[idx] = z
			}
		}
	}

	// FR-7: Rank by z-score descending
	type rankEntry struct {
		idx int
		z   float64
	}
	var rankEntries []rankEntry
	for _, idx := range validForZScore {
		if !degenerateZScore {
			rankEntries = append(rankEntries, rankEntry{idx: idx, z: zScores[idx]})
		}
	}
	sort.Slice(rankEntries, func(i, j int) bool {
		return rankEntries[i].z > rankEntries[j].z // descending
	})
	ranks := make(map[int]int)
	for rank, entry := range rankEntries {
		ranks[entry.idx] = rank + 1
	}

	// Build results
	results := make([]ForeignAccumTickerResult, 0, len(codes))

	for i, calc := range calcs {
		result := ForeignAccumTickerResult{
			Code:                    calc.code,
			NetFlow5dRaw:            calc.netFlow5dRaw,
			NetFlow20dRaw:           calc.netFlow20dRaw,
			CumNetFlow5dNormalized:  calc.cumNetFlow5dNormalized,
			CumNetFlow20dNormalized: calc.cumNetFlow20dNormalized,
			NullReason:              calc.nullReason,
			NullReason20d:           calc.nullReason20d,
			NullReasonNormalize:     calc.nullReasonNormalize,
		}

		// Z-score
		if calc.cumNetFlow5dNormalized != nil {
			if degenerateZScore {
				reason := "insufficient_cross_section"
				result.NullReasonZScore = &reason
			} else {
				z := zScores[i]
				result.ZScore5d = &z

				// FR-7: Rank
				if rank, ok := ranks[i]; ok {
					result.Rank = &rank
				}

				// FR-8: Label
				label := classifyLabel(z)
				result.Label = &label
			}
		}

		// FR-9: Room exhaustion
		roomEvent, err := s.roomRepo.GetLatestRoomEvent(calc.code)
		if err != nil {
			// Infrastructure failure — leave null with reason
			reason := "room_lookup_error"
			result.NullReasonRoom = &reason
		} else if roomEvent == nil {
			// No event row — honest-null
			reason := "room_event_not_found"
			result.NullReasonRoom = &reason
			// result.RoomExhaustion remains nil (NOT false)
		} else {
			// Determine exhaustion: true iff latest event is ROOM_FULL
			exhausted := roomEvent.EventType == RoomEventFull
			result.RoomExhaustion = &exhausted
		}

		results = append(results, result)
	}

	// Compute aggregate scalar for Fear & Greed
	var foreignAccumZMarket *float64
	if !degenerateZScore && len(validForZScore) > 0 {
		var sumZ float64
		for _, idx := range validForZScore {
			sumZ += zScores[idx]
		}
		meanZ := sumZ / float64(len(validForZScore))
		foreignAccumZMarket = &meanZ
	}

	return &ForeignAccumRankResult{
		Tickers:             results,
		ADTVUnit:            "shares",
		ComputedAsOf:        latestDate,
		ForeignAccumZMarket: foreignAccumZMarket,
	}, nil
}

// netFlowFromBar computes net foreign flow from a single bar.
// Uses ForeignBuyVol - ForeignSellVol if both available, else ForeignNetVol.
func (s *ForeignAccumService) netFlowFromBar(bar ForeignFlowBar) *float64 {
	// Prefer computing from buy/sell for consistency
	if bar.ForeignBuyVol != nil && bar.ForeignSellVol != nil {
		net := *bar.ForeignBuyVol - *bar.ForeignSellVol
		return &net
	}
	// Fallback to pre-computed net vol
	return bar.ForeignNetVol
}

// computeRawFlows computes raw 5d and 20d net flows (not normalized).
func (s *ForeignAccumService) computeRawFlows(bars []ForeignFlowBar) (*float64, *float64) {
	var sum5d, sum20d float64
	var has5d, has20d bool

	for i, bar := range bars {
		netFlow := s.netFlowFromBar(bar)
		if netFlow == nil {
			continue
		}

		if i < 5 {
			sum5d += *netFlow
			has5d = true
		}
		if i < 20 {
			sum20d += *netFlow
			has20d = true
		}
	}

	var raw5d, raw20d *float64
	if has5d && len(bars) >= 5 {
		raw5d = &sum5d
	}
	if has20d && len(bars) >= 20 {
		raw20d = &sum20d
	}

	return raw5d, raw20d
}

// classifyLabel returns the AccumLabel based on z-score (FR-8).
func classifyLabel(z float64) AccumLabel {
	if z >= 1.5 {
		return AccumLabelAccumulating
	}
	if z <= -1.5 {
		return AccumLabelDistributing
	}
	return AccumLabelNeutral
}
