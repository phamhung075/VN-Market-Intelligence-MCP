package reading_scorer

import (
	"reflect"
	"testing"
)

// TestReadingScorer_Golden tests the happy path with well-known inputs.
// Matches scenario: reading-scorer-golden.json
func TestReadingScorer_Golden(t *testing.T) {
	// Outcome texts
	outcomeTexts := []string{"Dai CAT — Hanh thong", "HUNG — Hung han", "VO CUU"}
	expectedOutcomeScores := []float64{0.3, -0.3, 0.0}

	for i, text := range outcomeTexts {
		score := ExtractOutcomeScore(text)
		if score != expectedOutcomeScores[i] {
			t.Errorf("ExtractOutcomeScore(%q): expected %f, got %f", text, expectedOutcomeScores[i], score)
		}
	}

	// Trend texts
	trendTexts := []string{"Thuan Loi — Thi truong tang", "BAT LOI — Thi truong giam"}
	expectedTrendScores := []float64{0.5, -0.5}

	for i, text := range trendTexts {
		score := ExtractTrendScore(text)
		if score != expectedTrendScores[i] {
			t.Errorf("ExtractTrendScore(%q): expected %f, got %f", text, expectedTrendScores[i], score)
		}
	}

	// Action texts
	actionTexts := []string{"Tien — Mua vao", "Lui — Ban ra", "Giu vung"}
	expectedActions := []string{"MUA", "BAN", "GIU"}

	for i, text := range actionTexts {
		action := ExtractAction(text)
		if action != expectedActions[i] {
			t.Errorf("ExtractAction(%q): expected %s, got %s", text, expectedActions[i], action)
		}
	}

	// Majority vote
	voteInput := []string{"MUA", "MUA", "GIU", "BAN"}
	majorityAction := MajorityVote(voteInput)
	if majorityAction != "MUA" {
		t.Errorf("MajorityVote: expected MUA, got %s", majorityAction)
	}
}

// TestReadingScorer_Edge tests edge cases with mixed forms and ties.
// Matches scenario: reading-scorer-edge.json
func TestReadingScorer_Edge(t *testing.T) {
	// Outcome texts with ASCII forms
	outcomeTexts := []string{"HOI — Nho hoi", "LE", "CAT"}
	expectedOutcomeScores := []float64{-0.15, -0.1, 0.3}

	for i, text := range outcomeTexts {
		score := ExtractOutcomeScore(text)
		if score != expectedOutcomeScores[i] {
			t.Errorf("ExtractOutcomeScore(%q): expected %f, got %f", text, expectedOutcomeScores[i], score)
		}
	}

	// Trend texts with unknown
	trendTexts := []string{"TRUNG TINH — Khong ro", "UNKNOWN TREND"}
	expectedTrendScores := []float64{0.0, 0.0}

	for i, text := range trendTexts {
		score := ExtractTrendScore(text)
		if score != expectedTrendScores[i] {
			t.Errorf("ExtractTrendScore(%q): expected %f, got %f", text, expectedTrendScores[i], score)
		}
	}

	// Action texts: empty string defaults to GIU
	actionTexts := []string{"", "CHO — cho doi"}
	expectedActions := []string{"GIU", "CHO"}

	for i, text := range actionTexts {
		action := ExtractAction(text)
		if action != expectedActions[i] {
			t.Errorf("ExtractAction(%q): expected %s, got %s", text, expectedActions[i], action)
		}
	}

	// Majority vote with tie: GIU vs CHO (both count=1), insertion-order tie-break returns GIU (first inserted)
	voteInput := []string{"GIU", "CHO"}
	majorityAction := MajorityVote(voteInput)
	// With insertion-order tie-breaking: GIU appears first
	if majorityAction != "GIU" {
		t.Errorf("MajorityVote tie: expected GIU (first inserted), got %s", majorityAction)
	}
}

// TestReadingScorer_Failure tests failure/boundary inputs with safe defaults.
// Matches scenario: reading-scorer-failure.json
func TestReadingScorer_Failure(t *testing.T) {
	// Unknown outcome texts
	outcomeTexts := []string{"", "UNKNOWN_OUTCOME_XYZ_999"}
	for _, text := range outcomeTexts {
		score := ExtractOutcomeScore(text)
		if score != 0.0 {
			t.Errorf("ExtractOutcomeScore(%q): expected 0.0, got %f", text, score)
		}
	}

	// Unknown trend texts
	trendTexts := []string{"", "GIBBERISH TREND TEXT 9999"}
	for _, text := range trendTexts {
		score := ExtractTrendScore(text)
		if score != 0.0 {
			t.Errorf("ExtractTrendScore(%q): expected 0.0, got %f", text, score)
		}
	}

	// Unknown action text defaults to GIU
	action := ExtractAction("GIBBERISH_ACTION_TEXT_999")
	if action != "GIU" {
		t.Errorf("ExtractAction(unknown): expected GIU, got %s", action)
	}

	// Empty vote input returns GIU
	majorityAction := MajorityVote([]string{})
	if majorityAction != "GIU" {
		t.Errorf("MajorityVote(empty): expected GIU, got %s", majorityAction)
	}
}

// TestExtractActionSignature verifies the authentic contract: actionText is string.
// The handoff spec error `extractAction(score float64)` is REJECTED.
func TestExtractActionSignature(t *testing.T) {
	// Verify ExtractAction accepts string and returns string
	fn := ExtractAction
	fnType := reflect.TypeOf(fn)

	if fnType.NumIn() != 1 {
		t.Errorf("ExtractAction should have 1 parameter, got %d", fnType.NumIn())
	}
	if fnType.In(0).Kind() != reflect.String {
		t.Errorf("ExtractAction parameter should be string, got %s", fnType.In(0).Kind())
	}
	if fnType.NumOut() != 1 {
		t.Errorf("ExtractAction should return 1 value, got %d", fnType.NumOut())
	}
	if fnType.Out(0).Kind() != reflect.String {
		t.Errorf("ExtractAction return should be string, got %s", fnType.Out(0).Kind())
	}
}

// TestAllActionKeywords verifies all action keywords are recognized.
func TestAllActionKeywords(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"TIEN len", "MUA"},
		{"TIẾN len", "MUA"},
		{"LUI xuong", "BAN"},
		{"GIU vung", "GIU"},
		{"GIỮ vung", "GIU"},
		{"CHO doi", "CHO"},
		{"CHỜ doi", "CHO"},
		{"THAN trong", "THAN TRONG"},
		{"THẬN trong", "THAN TRONG"},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := ExtractAction(tc.input)
			if result != tc.expected {
				t.Errorf("ExtractAction(%q): expected %s, got %s", tc.input, tc.expected, result)
			}
		})
	}
}

// TestMajorityVoteClear verifies clear majority wins.
func TestMajorityVoteClear(t *testing.T) {
	tests := []struct {
		input    []string
		expected string
	}{
		{[]string{"MUA", "MUA", "MUA", "BAN"}, "MUA"},
		{[]string{"BAN", "BAN", "GIU"}, "BAN"},
		{[]string{"GIU"}, "GIU"},
		{[]string{"CHO", "CHO", "THAN TRONG", "THAN TRONG", "CHO"}, "CHO"},
	}

	for _, tc := range tests {
		t.Run("", func(t *testing.T) {
			result := MajorityVote(tc.input)
			if result != tc.expected {
				t.Errorf("MajorityVote(%v): expected %s, got %s", tc.input, tc.expected, result)
			}
		})
	}
}
