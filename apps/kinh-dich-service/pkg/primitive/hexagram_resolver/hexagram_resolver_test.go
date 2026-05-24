package hexagram_resolver

import (
	"strings"
	"testing"
)

// TestResolveHexagram_Golden tests the happy path: all-yang signals → hexagram 1.
// Matches scenario: hexagram-resolver-golden.json
func TestResolveHexagram_Golden(t *testing.T) {
	signals := []int{1, 1, 1, 1, 1, 1}

	result, err := ResolveHexagram(signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != 1 {
		t.Errorf("expected hexagram 1 (Thuan Can), got %d", result)
	}
}

// TestResolveHexagram_Edge tests the edge case: all-zero signals → hexagram 2.
// Matches scenario: hexagram-resolver-edge.json
func TestResolveHexagram_Edge(t *testing.T) {
	signals := []int{0, 0, 0, 0, 0, 0}

	result, err := ResolveHexagram(signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result != 2 {
		t.Errorf("expected hexagram 2 (Thuan Khon), got %d", result)
	}
}

// TestResolveHexagram_Failure tests error case: signals array length != 6.
// Matches scenario: hexagram-resolver-failure.json
func TestResolveHexagram_Failure(t *testing.T) {
	signals := []int{1, 0} // length 2, not 6

	result, err := ResolveHexagram(signals)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if result != 0 {
		t.Error("expected result 0 on error")
	}

	// Error message should match: "resolveHexagram requires exactly 6 signals, got 2"
	expectedMsg := "resolveHexagram requires exactly 6 signals, got 2"
	if err.Error() != expectedMsg {
		t.Errorf("expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

// TestHexagramCount verifies that all 64 hexagrams are in the lookup table.
func TestHexagramCount(t *testing.T) {
	count := HexagramCount()
	if count != 64 {
		t.Errorf("expected 64 hexagrams, got %d", count)
	}
}

// TestResolveHexagram_AllTrigrams verifies a sampling of known hexagram mappings.
func TestResolveHexagram_AllTrigrams(t *testing.T) {
	tests := []struct {
		name     string
		signals  []int
		expected int
	}{
		{"Qian/Qian → 1", []int{1, 1, 1, 1, 1, 1}, 1},
		{"Kun/Kun → 2", []int{0, 0, 0, 0, 0, 0}, 2},
		{"Kan/Kan → 29", []int{0, 1, 0, 0, 1, 0}, 29},
		{"Li/Li → 30", []int{1, 0, 1, 1, 0, 1}, 30},
		{"Dui/Dui → 58", []int{1, 1, 0, 1, 1, 0}, 58},
		{"Gen/Gen → 52", []int{0, 0, 1, 0, 0, 1}, 52},
		{"Zhen/Zhen → 51", []int{1, 0, 0, 1, 0, 0}, 51},
		{"Xun/Xun → 57", []int{0, 1, 1, 0, 1, 1}, 57},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := ResolveHexagram(tc.signals)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result != tc.expected {
				t.Errorf("expected hexagram %d, got %d", tc.expected, result)
			}
		})
	}
}

// TestResolveHexagram_InvalidSignalValue tests behavior with invalid signal values.
func TestResolveHexagram_InvalidSignalValue(t *testing.T) {
	// Signal value 2 is not a valid binary, should result in unknown trigram
	signals := []int{2, 0, 0, 0, 0, 0}

	_, err := ResolveHexagram(signals)
	if err == nil {
		t.Fatal("expected error for invalid signal value")
	}

	if !strings.Contains(err.Error(), "unknown") {
		t.Errorf("expected error message to contain 'unknown', got: %s", err.Error())
	}
}
