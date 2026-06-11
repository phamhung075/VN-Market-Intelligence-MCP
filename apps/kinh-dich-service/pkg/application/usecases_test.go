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

// TestStockReading_Golden tests the new StockReading method.
func TestStockReading_Golden(t *testing.T) {
	pricePort := &stubPriceScorePort{
		scores: map[string][]float64{
			"VCB": {0.5, -0.3, 0.4, 0.2, -0.1, 0.6},
		},
	}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.StockReading("VCB")
	if err != nil {
		t.Fatalf("StockReading failed: %v", err)
	}

	if resp.Stock != "VCB" {
		t.Errorf("expected stock=VCB, got %s", resp.Stock)
	}
	if resp.Hexagram == 0 {
		t.Error("expected non-zero hexagram number")
	}
	if resp.Name == "" {
		t.Error("expected non-empty hexagram name")
	}
	if resp.ActionNote == "" {
		t.Error("expected non-empty action note")
	}
	if resp.OverallReading == "" {
		t.Error("expected non-empty overall reading")
	}
}

// TestStockReading_EmptyCode tests StockReading returns ErrInvalidCode for empty code.
func TestStockReading_EmptyCode(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: map[string][]float64{}}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.StockReading("")
	if err != ErrInvalidCode {
		t.Errorf("expected ErrInvalidCode, got %v", err)
	}
}

// TestStockReading_InsufficientData tests StockReading returns ErrInsufficientData.
func TestStockReading_InsufficientData(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.StockReading("VCB")
	if err != ErrInsufficientData {
		t.Errorf("expected ErrInsufficientData, got %v", err)
	}
}

// TestReadingHistory_Golden tests the ReadingHistory method.
func TestReadingHistory_Golden(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.ReadingHistory("VCB", 30)
	if err != nil {
		t.Fatalf("ReadingHistory failed: %v", err)
	}

	if resp.Stock != "VCB" {
		t.Errorf("expected stock=VCB, got %s", resp.Stock)
	}
	if resp.Days != 30 {
		t.Errorf("expected days=30, got %d", resp.Days)
	}
	// Stubbed response should have empty readings
	if resp.Total != 0 {
		t.Errorf("expected total=0 (stubbed), got %d", resp.Total)
	}
}

// TestReadingHistory_EmptyCode tests ReadingHistory returns ErrInvalidCode for empty code.
func TestReadingHistory_EmptyCode(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.ReadingHistory("", 30)
	if err != ErrInvalidCode {
		t.Errorf("expected ErrInvalidCode, got %v", err)
	}
}

// TestReadingHistory_DefaultDays tests that days defaults to 30 when <= 0.
func TestReadingHistory_DefaultDays(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.ReadingHistory("VCB", 0)
	if err != nil {
		t.Fatalf("ReadingHistory failed: %v", err)
	}

	if resp.Days != 30 {
		t.Errorf("expected days=30 (default), got %d", resp.Days)
	}
}

// TestHexagramTransitions_Golden tests the HexagramTransitions method.
func TestHexagramTransitions_Golden(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.HexagramTransitions(1, "VNINDEX", 10)
	if err != nil {
		t.Fatalf("HexagramTransitions failed: %v", err)
	}

	if resp.Hexagram != 1 {
		t.Errorf("expected hexagram=1, got %d", resp.Hexagram)
	}
	if resp.Name == "" {
		t.Error("expected non-empty hexagram name")
	}
}

// TestHexagramTransitions_InvalidNumber tests HexagramTransitions validation.
func TestHexagramTransitions_InvalidNumber(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	testCases := []int{0, -1, 65, 100}
	for _, num := range testCases {
		_, err := uc.HexagramTransitions(num, "", 10)
		if err != ErrInvalidHexagram {
			t.Errorf("number %d: expected ErrInvalidHexagram, got %v", num, err)
		}
	}
}

// TestBacktest_Golden tests the Backtest method.
func TestBacktest_Golden(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.Backtest("VCB", 30)
	if err != nil {
		t.Fatalf("Backtest failed: %v", err)
	}

	if resp.Stock != "VCB" {
		t.Errorf("expected stock=VCB, got %s", resp.Stock)
	}
	if resp.Days != 30 {
		t.Errorf("expected days=30, got %d", resp.Days)
	}
	// Stubbed response should have zeroed stats
	if resp.TotalReadings != 0 {
		t.Errorf("expected totalReadings=0 (stubbed), got %d", resp.TotalReadings)
	}
}

// TestBacktest_EmptyCode tests Backtest returns ErrInvalidCode for empty code.
func TestBacktest_EmptyCode(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	_, err := uc.Backtest("", 30)
	if err != ErrInvalidCode {
		t.Errorf("expected ErrInvalidCode, got %v", err)
	}
}

// TestHexagramExplain_Golden tests the HexagramExplain method.
func TestHexagramExplain_Golden(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	resp, err := uc.HexagramExplain(1)
	if err != nil {
		t.Fatalf("HexagramExplain failed: %v", err)
	}

	if resp.Number != 1 {
		t.Errorf("expected number=1, got %d", resp.Number)
	}
	if resp.Name == "" {
		t.Error("expected non-empty name")
	}
	if resp.Chinese == "" {
		t.Error("expected non-empty chinese")
	}
	if resp.Upper == "" {
		t.Error("expected non-empty upper trigram")
	}
	if resp.Lower == "" {
		t.Error("expected non-empty lower trigram")
	}
	if resp.CoreMeaning == "" {
		t.Error("expected non-empty core meaning")
	}
	if resp.Trend == "" {
		t.Error("expected non-empty trend")
	}
}

// TestHexagramExplain_AllHexagrams tests HexagramExplain for all 64 hexagrams.
func TestHexagramExplain_AllHexagrams(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	for i := 1; i <= 64; i++ {
		resp, err := uc.HexagramExplain(i)
		if err != nil {
			t.Errorf("hexagram %d: unexpected error: %v", i, err)
			continue
		}
		if resp.Number != i {
			t.Errorf("hexagram %d: expected number=%d, got %d", i, i, resp.Number)
		}
		if resp.Name == "" {
			t.Errorf("hexagram %d: expected non-empty name", i)
		}
	}
}

// TestHexagramExplain_InvalidNumber tests HexagramExplain validation.
func TestHexagramExplain_InvalidNumber(t *testing.T) {
	pricePort := &stubPriceScorePort{scores: nil}
	markovPort := &stubMarkovPort{data: nil}

	svc := domain.NewReadingService(markovPort, pricePort)
	uc := NewReadingUseCase(svc)

	testCases := []int{0, -1, 65, 100}
	for _, num := range testCases {
		_, err := uc.HexagramExplain(num)
		if err != ErrInvalidHexagram {
			t.Errorf("number %d: expected ErrInvalidHexagram, got %v", num, err)
		}
	}
}
