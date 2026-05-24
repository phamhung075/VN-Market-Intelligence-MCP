package reading_composer

import (
	"testing"
)

// stubMarkovPort implements MarkovPort for testing.
type stubMarkovPort struct {
	data map[int]*MarkovData
}

func (s *stubMarkovPort) GetMarkovData(hexagramNumber int) (*MarkovData, error) {
	if s.data == nil {
		return nil, nil
	}
	return s.data[hexagramNumber], nil
}

func TestComposeReading_Golden(t *testing.T) {
	// Golden path test: known scores -> expected hexagram structure
	// Input: [0.8, -0.3, 0.6, 0.1, -0.7, 0.4]
	// Haos: LAO_DUONG(1), THIEU_AM(0), THIEU_DUONG(1), THIEU_DUONG(1), THIEU_AM(0), THIEU_DUONG(1)
	// Signals: [1,0,1,1,0,1] -> lower=Li, upper=Li -> hexagram 30 (Ly)
	scores := []float64{0.8, -0.3, 0.6, 0.1, -0.7, 0.4}

	deps := &ReadingComposerDependencies{
		Markov: &stubMarkovPort{data: nil}, // No Markov data
	}

	reading, err := ComposeReading("VCB", scores, deps)
	if err != nil {
		t.Fatalf("ComposeReading failed: %v", err)
	}

	// Verify hexagram numbers match actual primitive outputs
	// Per corrected reading-composer-golden.json: queChinhNumber=30, hoQueNumber=28, bienQueNumber=56
	if reading.QueChinh.Number != 30 {
		t.Errorf("queChinhNumber: got %d, want 30", reading.QueChinh.Number)
	}
	if reading.HoQue.Number != 28 {
		t.Errorf("hoQueNumber: got %d, want 28", reading.HoQue.Number)
	}
	if reading.BienQue.Number != 56 {
		t.Errorf("bienQueNumber: got %d, want 56", reading.BienQue.Number)
	}

	// Verify haos length
	if len(reading.Haos) != 6 {
		t.Errorf("haos length: got %d, want 6", len(reading.Haos))
	}

	// Verify confidence in range [0, 1]
	if reading.QueChinh.Confidence < 0 || reading.QueChinh.Confidence > 1 {
		t.Errorf("confidence out of range: %f", reading.QueChinh.Confidence)
	}
}

func TestComposeReading_WithMarkov(t *testing.T) {
	// Edge case: Markov data affects confidence blending
	// Hexagram 30 is produced from these scores
	scores := []float64{0.8, -0.3, 0.6, 0.1, -0.7, 0.4}

	deps := &ReadingComposerDependencies{
		Markov: &stubMarkovPort{
			data: map[int]*MarkovData{
				30: {TransitionProb: 0.75, HistoricalConfidence: 0.8},
			},
		},
	}

	reading, err := ComposeReading("VCB", scores, deps)
	if err != nil {
		t.Fatalf("ComposeReading failed: %v", err)
	}

	// Per corrected reading-composer-edge.json: confidenceRangeWithMarkov=[0.4, 0.85]
	// Formula: blended = base * 0.7 + avg(transitionProb, historicalConfidence) * 0.3
	// With avg(0.75, 0.8) = 0.775, contribution is 0.775 * 0.3 = 0.2325
	if reading.QueChinh.Confidence < 0.4 || reading.QueChinh.Confidence > 0.85 {
		t.Errorf("confidence with Markov out of expected range [0.4, 0.85]: got %f", reading.QueChinh.Confidence)
	}
}

func TestComposeReading_MultiPrimitive(t *testing.T) {
	// Multi-primitive test: exercises all 5 primitives in sequence
	testCases := []struct {
		name           string
		scores         []float64
		wantQueChinh   int // Expected hexagram number
		wantHaosLen    int
		wantSignalSet  map[string]bool // Valid trading signals
	}{
		{
			name:          "all_yang_scores",
			scores:        []float64{0.9, 0.9, 0.9, 0.9, 0.9, 0.9},
			wantQueChinh:  1, // Qian (all yang)
			wantHaosLen:   6,
			wantSignalSet: map[string]bool{"MUA": true, "BAN": true, "GIU": true, "CHO": true, "THAN TRONG": true},
		},
		{
			name:          "all_yin_scores",
			scores:        []float64{-0.9, -0.9, -0.9, -0.9, -0.9, -0.9},
			wantQueChinh:  2, // Kun (all yin)
			wantHaosLen:   6,
			wantSignalSet: map[string]bool{"MUA": true, "BAN": true, "GIU": true, "CHO": true, "THAN TRONG": true},
		},
		{
			name:          "mixed_scores",
			scores:        []float64{0.5, -0.5, 0.5, -0.5, 0.5, -0.5},
			wantQueChinh:  63, // [1,0,1,0,1,0] -> lower=Li, upper=Kan -> hexagram 63 (Ky Te)
			wantHaosLen:   6,
			wantSignalSet: map[string]bool{"MUA": true, "BAN": true, "GIU": true, "CHO": true, "THAN TRONG": true},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			deps := &ReadingComposerDependencies{
				Markov: &stubMarkovPort{data: nil},
			}

			reading, err := ComposeReading("TEST", tc.scores, deps)
			if err != nil {
				t.Fatalf("ComposeReading failed: %v", err)
			}

			if reading.QueChinh.Number != tc.wantQueChinh {
				t.Errorf("queChinhNumber: got %d, want %d", reading.QueChinh.Number, tc.wantQueChinh)
			}

			if len(reading.Haos) != tc.wantHaosLen {
				t.Errorf("haos length: got %d, want %d", len(reading.Haos), tc.wantHaosLen)
			}

			// Extract base signal (before suffix)
			baseSignal := extractBaseSignal(reading.QueChinh.TradingSignal)
			if !tc.wantSignalSet[baseSignal] {
				t.Errorf("tradingSignal %q not in valid set", baseSignal)
			}

			// Verify confidence range
			if reading.QueChinh.Confidence < 0 || reading.QueChinh.Confidence > 1 {
				t.Errorf("confidence out of range: %f", reading.QueChinh.Confidence)
			}
		})
	}
}

func TestComposeReading_InvalidScores(t *testing.T) {
	// Failure case: wrong number of scores
	deps := &ReadingComposerDependencies{
		Markov: &stubMarkovPort{data: nil},
	}

	_, err := ComposeReading("VCB", []float64{0.5, 0.5}, deps)
	if err == nil {
		t.Error("expected error for wrong number of scores, got nil")
	}

	_, err = ComposeReading("VCB", []float64{}, deps)
	if err == nil {
		t.Error("expected error for empty scores, got nil")
	}
}

func TestComposeReading_NilDeps(t *testing.T) {
	// Edge case: nil dependencies (should still work, just no Markov blending)
	scores := []float64{0.5, 0.5, 0.5, 0.5, 0.5, 0.5}

	reading, err := ComposeReading("VCB", scores, nil)
	if err != nil {
		t.Fatalf("ComposeReading with nil deps failed: %v", err)
	}

	if reading.QueChinh.Number == 0 {
		t.Error("expected valid hexagram number, got 0")
	}
}

// extractBaseSignal removes the suffix from trading signal (e.g., "MUA (tich cuc)" -> "MUA")
func extractBaseSignal(signal string) string {
	for i, c := range signal {
		if c == ' ' {
			return signal[:i]
		}
	}
	return signal
}
