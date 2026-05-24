package hao_encoder

import (
	"strings"
	"testing"
)

// TestEncodeHaos_Golden tests the happy path with typical scores across all four states.
// Matches scenario: hao-encoder-golden.json
func TestEncodeHaos_Golden(t *testing.T) {
	scores := []float64{0.8, 0.4, -0.8, 0.1, -0.5, 0.6}

	result, err := EncodeHaos(scores)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result) != 6 {
		t.Fatalf("expected length 6, got %d", len(result))
	}

	expectedStates := []HaoState{LAO_DUONG, THIEU_DUONG, LAO_AM, THIEU_DUONG, THIEU_AM, THIEU_DUONG}
	expectedBinaries := []int{1, 1, 0, 1, 0, 1}

	for i, r := range result {
		if r.State != expectedStates[i] {
			t.Errorf("position %d: expected state %s, got %s", i+1, expectedStates[i], r.State)
		}
		if r.Binary != expectedBinaries[i] {
			t.Errorf("position %d: expected binary %d, got %d", i+1, expectedBinaries[i], r.Binary)
		}
		if r.Label == "" {
			t.Errorf("position %d: label should not be empty", i+1)
		}
	}
}

// TestEncodeHaos_Edge tests boundary conditions at exact thresholds.
// Matches scenario: hao-encoder-edge.json
func TestEncodeHaos_Edge(t *testing.T) {
	// 0.75 is NOT > 0.75 so THIEU_DUONG
	// 0.10 >= 0.10 so THIEU_DUONG
	// -0.75 is NOT < -0.75 so THIEU_AM
	// 0.76 > 0.75 so LAO_DUONG
	// -0.76 < -0.75 so LAO_AM
	scores := []float64{0.75, 0.10, -0.75, 0.0, 0.76, -0.76}

	result, err := EncodeHaos(scores)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedStates := []HaoState{THIEU_DUONG, THIEU_DUONG, THIEU_AM, THIEU_AM, LAO_DUONG, LAO_AM}
	expectedBinaries := []int{1, 1, 0, 0, 1, 0}

	for i, r := range result {
		if r.State != expectedStates[i] {
			t.Errorf("position %d: expected state %s, got %s (score=%.2f)", i+1, expectedStates[i], r.State, scores[i])
		}
		if r.Binary != expectedBinaries[i] {
			t.Errorf("position %d: expected binary %d, got %d", i+1, expectedBinaries[i], r.Binary)
		}
	}

	// Verify all have boolean isChanging (implicit in struct) and non-empty states
	for i, r := range result {
		if r.State == "" {
			t.Errorf("position %d: state should not be empty", i+1)
		}
	}
}

// TestEncodeHaos_Failure tests error case when input length != 6.
// Matches scenario: hao-encoder-failure.json
func TestEncodeHaos_Failure(t *testing.T) {
	scores := []float64{0.8, 0.4, -0.8, 0.1, -0.5} // length 5, not 6

	result, err := EncodeHaos(scores)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if result != nil {
		t.Error("expected nil result on error")
	}

	// Error message should contain "length" and "6"
	errMsg := err.Error()
	if !strings.Contains(errMsg, "length") || !strings.Contains(errMsg, "6") {
		t.Errorf("error message should mention length and 6, got: %s", errMsg)
	}
}

// TestClassifyHao verifies single-score classification across all state boundaries.
func TestClassifyHao(t *testing.T) {
	tests := []struct {
		score    float64
		expected HaoState
	}{
		{0.9, LAO_DUONG},       // > 0.75
		{0.76, LAO_DUONG},      // just above threshold
		{0.75, THIEU_DUONG},    // exactly at threshold (inclusive upper bound)
		{0.5, THIEU_DUONG},     // middle of THIEU_DUONG range
		{0.10, THIEU_DUONG},    // exactly at threshold (inclusive lower bound)
		{0.09, THIEU_AM},       // just below THIEU_DUONG threshold
		{0.0, THIEU_AM},        // middle of THIEU_AM range
		{-0.5, THIEU_AM},       // lower THIEU_AM
		{-0.75, THIEU_AM},      // exactly at threshold (exclusive)
		{-0.76, LAO_AM},        // just below threshold
		{-0.9, LAO_AM},         // deep LAO_AM
	}

	for _, tc := range tests {
		t.Run("", func(t *testing.T) {
			result := ClassifyHao(tc.score)
			if result.State != tc.expected {
				t.Errorf("ClassifyHao(%.2f): expected %s, got %s", tc.score, tc.expected, result.State)
			}
		})
	}
}

// TestThresholdConstants verifies the critical domain contracts.
func TestThresholdConstants(t *testing.T) {
	// CRITICAL: Verify THIEU_DUONG_THRESHOLD is 0.10, NOT 0.25 (handoff spec error)
	if THIEU_DUONG_THRESHOLD != 0.10 {
		t.Errorf("CRITICAL CONTRACT VIOLATION: THIEU_DUONG_THRESHOLD should be 0.10, got %v", THIEU_DUONG_THRESHOLD)
	}

	if LAO_DUONG_THRESHOLD != 0.75 {
		t.Errorf("LAO_DUONG_THRESHOLD should be 0.75, got %v", LAO_DUONG_THRESHOLD)
	}

	if LAO_AM_THRESHOLD != -0.75 {
		t.Errorf("LAO_AM_THRESHOLD should be -0.75, got %v", LAO_AM_THRESHOLD)
	}
}

// TestIsChangingFlags verifies the isChanging flag is set correctly for each state.
func TestIsChangingFlags(t *testing.T) {
	tests := []struct {
		state      HaoState
		isChanging bool
	}{
		{LAO_DUONG, true},
		{THIEU_DUONG, false},
		{THIEU_AM, false},
		{LAO_AM, true},
	}

	for _, tc := range tests {
		if stateToChanging[tc.state] != tc.isChanging {
			t.Errorf("state %s: expected isChanging=%v, got %v", tc.state, tc.isChanging, stateToChanging[tc.state])
		}
	}
}
