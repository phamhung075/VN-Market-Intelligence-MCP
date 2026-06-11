package application

import (
	"testing"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// stubPriceScorePort implements PriceScorePort for testing.
type stubPriceScorePort struct {
	scores map[string][]float64
}

func (s *stubPriceScorePort) ComputeScores(stockCode string, days int) []float64 {
	if s.scores == nil {
		return nil
	}
	return s.scores[stockCode]
}

// stubMarkovPort implements MarkovPort for testing.
type stubMarkovPort struct {
	data map[int]*domain.MarkovData
}

func (s *stubMarkovPort) GetMarkovData(hexagramNumber int) *domain.MarkovData {
	if s.data == nil {
		return nil
	}
	return s.data[hexagramNumber]
}

func TestMarketReading_Golden(t *testing.T) {
	// Golden path: sufficient price data -> valid market reading
	pricePort := &stubPriceScorePort{
		scores: map[string][]float64{
			"VNINDEX": {0.5, -0.3, 0.4, 0.2, -0.1, 0.6},
		},
	}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.MarketReading()
	if err != nil {
		t.Fatalf("MarketReading failed: %v", err)
	}

	// Verify response has populated fields
	if resp.Hexagram == 0 {
		t.Error("expected non-zero hexagram number")
	}
	if resp.Name == "" {
		t.Error("expected non-empty hexagram name")
	}
	if resp.Trend == "" {
		t.Error("expected non-empty trend")
	}
	if resp.Signal == "" {
		t.Error("expected non-empty signal")
	}
	if resp.Confidence < 0 || resp.Confidence > 1 {
		t.Errorf("confidence out of range [0,1]: %f", resp.Confidence)
	}
	if resp.Timestamp == "" {
		t.Error("expected non-empty timestamp")
	}
}

func TestMarketReading_InsufficientData(t *testing.T) {
	// Edge case: no price data -> ErrInsufficientData
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.MarketReading()
	if err != ErrInsufficientData {
		t.Errorf("expected ErrInsufficientData, got %v", err)
	}
}

func TestMarketReading_WrongScoreCount(t *testing.T) {
	// Edge case: wrong number of scores -> ErrInsufficientData
	pricePort := &stubPriceScorePort{
		scores: map[string][]float64{
			"VNINDEX": {0.5, 0.3}, // Only 2 scores
		},
	}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.MarketReading()
	if err != ErrInsufficientData {
		t.Errorf("expected ErrInsufficientData, got %v", err)
	}
}

func TestMarketReading_NilPriceScorePort(t *testing.T) {
	// Edge case: nil PriceScorePort -> ErrInsufficientData
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, nil)
	uc := NewReadingUseCase(svc)

	_, err := uc.MarketReading()
	if err != ErrInsufficientData {
		t.Errorf("expected ErrInsufficientData, got %v", err)
	}
}

func TestMarketReading_WithMarkovBlending(t *testing.T) {
	// Test that Markov data is used for blending
	pricePort := &stubPriceScorePort{
		scores: map[string][]float64{
			"VNINDEX": {0.8, -0.3, 0.6, 0.1, -0.7, 0.4},
		},
	}
	// Hexagram 30 from these scores (per reading_composer_test.go)
	markovPort := &stubMarkovPort{
		data: map[int]*domain.MarkovData{
			30: {NextMostLikely: 56, NextName: "Lu", Probability: 0.75},
		},
	}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.MarketReading()
	if err != nil {
		t.Fatalf("MarketReading with Markov failed: %v", err)
	}

	// Verify confidence is blended (should be influenced by Markov data)
	if resp.Confidence < 0 || resp.Confidence > 1 {
		t.Errorf("blended confidence out of range [0,1]: %f", resp.Confidence)
	}
}

func TestMarketReading_TableDriven(t *testing.T) {
	// Table-driven test for multiple scenarios
	testCases := []struct {
		name        string
		scores      []float64
		wantErr     bool
		wantHexMin  int // Minimum expected hexagram (1)
		wantHexMax  int // Maximum expected hexagram (64)
	}{
		{
			name:       "all_positive",
			scores:     []float64{0.9, 0.9, 0.9, 0.9, 0.9, 0.9},
			wantErr:    false,
			wantHexMin: 1,
			wantHexMax: 64,
		},
		{
			name:       "all_negative",
			scores:     []float64{-0.9, -0.9, -0.9, -0.9, -0.9, -0.9},
			wantErr:    false,
			wantHexMin: 1,
			wantHexMax: 64,
		},
		{
			name:       "mixed_alternating",
			scores:     []float64{0.5, -0.5, 0.5, -0.5, 0.5, -0.5},
			wantErr:    false,
			wantHexMin: 1,
			wantHexMax: 64,
		},
		{
			name:       "near_zero",
			scores:     []float64{0.1, -0.1, 0.1, -0.1, 0.1, -0.1},
			wantErr:    false,
			wantHexMin: 1,
			wantHexMax: 64,
		},
		{
			name:    "nil_scores",
			scores:  nil,
			wantErr: true,
		},
		{
			name:    "empty_scores",
			scores:  []float64{},
			wantErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var pricePort domain.PriceScorePort
			if tc.scores != nil {
				pricePort = &stubPriceScorePort{
					scores: map[string][]float64{"VNINDEX": tc.scores},
				}
			} else {
				pricePort = &stubPriceScorePort{scores: nil}
			}
			markovPort := &stubMarkovPort{data: nil}

			svc := domain.NewReadingService(markovPort, pricePort)
			uc := NewReadingUseCase(svc)

			resp, err := uc.MarketReading()

			if tc.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if resp.Hexagram < tc.wantHexMin || resp.Hexagram > tc.wantHexMax {
				t.Errorf("hexagram %d out of range [%d, %d]", resp.Hexagram, tc.wantHexMin, tc.wantHexMax)
			}
		})
	}
}
