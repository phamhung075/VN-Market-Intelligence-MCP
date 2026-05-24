// Package nuclear_hexagram provides pure functions for computing nuclear (ho que)
// and transformed (bien que) hexagram numbers.
//
// Cross-primitive imports (Fence-A exempt — not application/module/infra/interface):
//   - ResolveHexagram from hexagram_resolver (sister primitive)
//   - HaoReading type from hao_encoder (sister primitive)
//
// Sister primitive imports (hexagram_resolver, hao_encoder) are exempt from Fence-A.
// They are pure-function siblings in the same primitive layer, not higher-layer imports.
// depguard allowlist must include `pkg/primitive/*` -> `pkg/primitive/*`.
//
// Zero imports from module, application, interface, or infrastructure layers.
package nuclear_hexagram

import (
	"fmt"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hao_encoder"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/primitive/hexagram_resolver"
)

// HaoReading is re-exported from hao_encoder for convenience.
type HaoReading = hao_encoder.HaoReading

// ComputeHoQue computes the nuclear hexagram (ho que) from 6 binary line signals.
//
// The nuclear hexagram is formed by extracting the 4 inner lines (positions 2-5,
// i.e. indices 1-4) of the original hexagram and constructing a new 6-line figure:
//
//	lower trigram = signals[1], signals[2], signals[3]
//	upper trigram = signals[2], signals[3], signals[4]
//
// Parameters:
//   - signals: Exactly 6 binary values (0 | 1), bottom-to-top order.
//
// Returns:
//   - Hexagram number in range 1-64.
//   - Error if signals.length != 6 or resulting trigram is unknown.
func ComputeHoQue(signals []int) (int, error) {
	if len(signals) != 6 {
		return 0, fmt.Errorf("computeHoQue requires exactly 6 signals, got %d", len(signals))
	}

	// Nuclear hexagram: inner 4 lines -> new 6-line figure.
	hoSignals := []int{
		signals[1], // lower-1
		signals[2], // lower-2
		signals[3], // lower-3
		signals[2], // upper-1 (overlap with inner lines)
		signals[3], // upper-2
		signals[4], // upper-3
	}

	return hexagram_resolver.ResolveHexagram(hoSignals)
}

// ComputeBienQue computes the transformed hexagram (bien que) from 6 HaoReading objects.
//
// Changing lines are flipped:
//
//	LAO_DUONG (old yang, binary=1, isChanging=true) -> becomes yin (0)
//	LAO_AM    (old yin,  binary=0, isChanging=true) -> becomes yang (1)
//
// Stable lines retain their current binary value.
//
// When no lines are changing, the transformed hexagram equals the original (que chinh).
//
// Parameters:
//   - haos: Exactly 6 HaoReading objects (output of EncodeHaos).
//
// Returns:
//   - Hexagram number in range 1-64.
//   - Error if haos.length != 6 or resulting trigram is unknown.
func ComputeBienQue(haos []HaoReading) (int, error) {
	if len(haos) != 6 {
		return 0, fmt.Errorf("computeBienQue requires exactly 6 HaoReading objects, got %d", len(haos))
	}

	transformed := make([]int, 6)
	for i, h := range haos {
		switch h.State {
		case hao_encoder.LAO_DUONG:
			transformed[i] = 0 // old yang flips to yin
		case hao_encoder.LAO_AM:
			transformed[i] = 1 // old yin flips to yang
		default:
			transformed[i] = h.Binary // stable line: unchanged
		}
	}

	return hexagram_resolver.ResolveHexagram(transformed)
}
