// Package hao_encoder provides pure functions for encoding 6 raw float scores
// into HaoReading objects (state + binary + isChanging + label).
//
// Fence-A: pure compute only — all lookup tables embedded inline, no I/O.
// Zero imports from application, interface, infrastructure, or module layers.
//
// CRITICAL CONTRACT (Key Risk 2):
//   THIEU_DUONG_THRESHOLD = 0.10 (NOT 0.25 — handoff spec error REJECTED)
//   LAO_DUONG_THRESHOLD   = 0.75
//   LAO_AM_THRESHOLD      = -0.75
// Source: TS domain implementation apps/kinh-dich-service/src/primitive/hao-encoder/index.ts L28-L34
package hao_encoder

import (
	"fmt"
	"math"
)

// HaoState represents the four possible states of a hao (line).
type HaoState string

const (
	LAO_DUONG   HaoState = "LAO_DUONG"   // Old yang, changing yang line (binary=1, isChanging=true)
	THIEU_DUONG HaoState = "THIEU_DUONG" // Young yang, stable yang line (binary=1, isChanging=false)
	THIEU_AM    HaoState = "THIEU_AM"    // Young yin, stable yin line (binary=0, isChanging=false)
	LAO_AM      HaoState = "LAO_AM"      // Old yin, changing yin line (binary=0, isChanging=true)
)

// Threshold constants for hao classification.
// CRITICAL: THIEU_DUONG_THRESHOLD = 0.10 is the AUTHENTIC contract.
// The handoff spec listed 0.25 which was WRONG — corrected in TS pilot.
const (
	LAO_DUONG_THRESHOLD   = 0.75  // score > 0.75 → LAO_DUONG
	THIEU_DUONG_THRESHOLD = 0.10  // 0.10 <= score <= 0.75 → THIEU_DUONG (NOT 0.25)
	LAO_AM_THRESHOLD      = -0.75 // score < -0.75 → LAO_AM
)

// HaoReading represents the encoded state of a single hao (line).
type HaoReading struct {
	State      HaoState `json:"state"`
	Binary     int      `json:"binary"`     // 0 or 1
	IsChanging bool     `json:"isChanging"`
	Label      string   `json:"label"`
}

// stateToBinary maps HaoState to binary value (0 or 1).
var stateToBinary = map[HaoState]int{
	LAO_DUONG:   1,
	THIEU_DUONG: 1,
	THIEU_AM:    0,
	LAO_AM:      0,
}

// stateToChanging maps HaoState to isChanging flag.
var stateToChanging = map[HaoState]bool{
	LAO_DUONG:   true,
	THIEU_DUONG: false,
	THIEU_AM:    false,
	LAO_AM:      true,
}

// haoLabels provides positional labels (1-indexed, Vietnamese descriptors).
var haoLabels = map[int]string{
	1: "So hao — Tam ly / Tin tuc",
	2: "Nhi hao — Co ban / BCTC",
	3: "Tam hao — Gia / Ky thuat",
	4: "Tu hao — Dong tien ngoai",
	5: "Ngu hao — Nganh / Sector",
	6: "Thuong hao — Vi mo / Macro",
}

// ClassifyHao classifies a single hao score into its four-state bucket.
//
// Thresholds:
//
//	score > 0.75          → LAO_DUONG  (binary=1, isChanging=true)
//	0.10 <= score <= 0.75 → THIEU_DUONG (binary=1, isChanging=false)
//	-0.75 <= score < 0.10 → THIEU_AM   (binary=0, isChanging=false)
//	score < -0.75         → LAO_AM     (binary=0, isChanging=true)
//
// Note: This function returns a position-agnostic HaoReading with a default label.
// Use EncodeHaos for positionally-labeled readings.
func ClassifyHao(score float64) HaoReading {
	clamped := math.Max(-1, math.Min(1, score))

	var state HaoState
	if clamped > LAO_DUONG_THRESHOLD {
		state = LAO_DUONG
	} else if clamped >= THIEU_DUONG_THRESHOLD {
		state = THIEU_DUONG
	} else if clamped < LAO_AM_THRESHOLD {
		state = LAO_AM
	} else {
		state = THIEU_AM
	}

	return HaoReading{
		State:      state,
		Binary:     stateToBinary[state],
		IsChanging: stateToChanging[state],
		Label:      haoLabels[1], // Default to position 1
	}
}

// EncodeHaos encodes 6 hao scores into an array of HaoReading objects.
//
// Each score is clamped to [-1, +1] before threshold classification.
// The label for each reading is set by its 1-indexed position (1-6).
//
// Returns an error if len(scores) != 6.
func EncodeHaos(scores []float64) ([]HaoReading, error) {
	if len(scores) != 6 {
		return nil, fmt.Errorf("encodeHaos requires exactly 6 scores (length=6), got length=%d", len(scores))
	}

	result := make([]HaoReading, 6)
	for i, raw := range scores {
		clamped := math.Max(-1, math.Min(1, raw))
		position := i + 1 // 1-indexed

		var state HaoState
		if clamped > LAO_DUONG_THRESHOLD {
			state = LAO_DUONG
		} else if clamped >= THIEU_DUONG_THRESHOLD {
			state = THIEU_DUONG
		} else if clamped < LAO_AM_THRESHOLD {
			state = LAO_AM
		} else {
			state = THIEU_AM
		}

		label := haoLabels[position]
		if label == "" {
			label = fmt.Sprintf("Hao %d", position)
		}

		result[i] = HaoReading{
			State:      state,
			Binary:     stateToBinary[state],
			IsChanging: stateToChanging[state],
			Label:      label,
		}
	}

	return result, nil
}
