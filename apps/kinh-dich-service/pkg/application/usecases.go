// Package application contains the application layer DTOs and use cases.
package application

import (
	"errors"
	"time"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/module/reading_composer"
)

// ErrNotImplemented is returned when a use case is not yet wired to real implementation.
var ErrNotImplemented = errors.New("kinh-dich ReadingUseCase not implemented — wire reading_composer.ComposeReading before use")

// ErrInsufficientData is returned when there is not enough price data to compute a reading.
var ErrInsufficientData = errors.New("insufficient price data for market reading — requires at least 7 price points")

// ReadingUseCase orchestrates the reading flow.
type ReadingUseCase struct {
	service *domain.ReadingService
}

// NewReadingUseCase creates a new ReadingUseCase.
func NewReadingUseCase(svc *domain.ReadingService) *ReadingUseCase {
	return &ReadingUseCase{
		service: svc,
	}
}

// Execute performs the reading use case.
// Returns ErrNotImplemented until wired to reading_composer.ComposeReading().
// This fail-loud behavior prevents silent fabrication of fake readings.
func (uc *ReadingUseCase) Execute(req ReadingRequest) (*ReadingResponse, error) {
	return nil, ErrNotImplemented
}

// markovAdapter wraps domain.MarkovPort to satisfy reading_composer.MarkovPort.
// This adapter bridges the module-tier MarkovData shape (blending weights) from
// the domain-tier MarkovPort (next-hexagram prediction).
type markovAdapter struct {
	port domain.MarkovPort
}

// GetMarkovData implements reading_composer.MarkovPort.
func (a *markovAdapter) GetMarkovData(hexagramNumber int) (*reading_composer.MarkovData, error) {
	// The domain MarkovPort returns prediction data (nextMostLikely, probability)
	// For now, we return nil since the stub returns nil anyway.
	// In Phase 2, this would convert domain.MarkovData to reading_composer.MarkovData
	// using historicalConfidence derived from prediction accuracy.
	data := a.port.GetMarkovData(hexagramNumber)
	if data == nil {
		return nil, nil
	}
	// Convert domain MarkovData (prediction shape) to module MarkovData (blending shape)
	// Use Probability as both TransitionProb and HistoricalConfidence for now.
	return &reading_composer.MarkovData{
		TransitionProb:       data.Probability,
		HistoricalConfidence: data.Probability,
	}, nil
}

// ErrInvalidCode is returned when a stock code is empty.
var ErrInvalidCode = errors.New("stock code cannot be empty")

// ErrInvalidHexagram is returned when hexagram number is out of range [1,64].
var ErrInvalidHexagram = errors.New("hexagram number must be between 1 and 64")

// MarketReading computes a market reading for VNINDEX.
// Returns the current market hexagram, trend, and trading signal.
// Returns ErrInsufficientData if price history is not available.
func (uc *ReadingUseCase) MarketReading() (*MarketReadingResponse, error) {
	const stockCode = "VNINDEX"
	const days = 30

	// Get price scores from PriceScorePort
	priceScorePort := uc.service.GetPriceScore()
	if priceScorePort == nil {
		return nil, ErrInsufficientData
	}

	scores := priceScorePort.ComputeScores(stockCode, days)
	if scores == nil || len(scores) != 6 {
		return nil, ErrInsufficientData
	}

	// Create Markov adapter for reading_composer
	deps := &reading_composer.ReadingComposerDependencies{
		Markov: &markovAdapter{port: uc.service.GetMarkov()},
	}

	// Compose the reading
	reading, err := reading_composer.ComposeReading(stockCode, scores, deps)
	if err != nil {
		return nil, err
	}

	// Map KinhDichReading to MarketReadingResponse
	return &MarketReadingResponse{
		Hexagram:   reading.QueChinh.Number,
		Name:       reading.QueChinh.Name,
		Trend:      reading.QueChinh.Trend,
		Signal:     reading.QueChinh.TradingSignal,
		Confidence: reading.QueChinh.Confidence,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// StockReading computes a hexagram reading for a specific stock.
// Returns the current hexagram, trend, and trading signal for the given stock code.
// Returns ErrInvalidCode if code is empty.
// Returns ErrInsufficientData if price history is not available.
func (uc *ReadingUseCase) StockReading(code string) (*ReadingResponse, error) {
	if code == "" {
		return nil, ErrInvalidCode
	}

	const days = 30

	// Get price scores from PriceScorePort
	priceScorePort := uc.service.GetPriceScore()
	if priceScorePort == nil {
		return nil, ErrInsufficientData
	}

	scores := priceScorePort.ComputeScores(code, days)
	if scores == nil || len(scores) != 6 {
		return nil, ErrInsufficientData
	}

	// Create Markov adapter for reading_composer
	deps := &reading_composer.ReadingComposerDependencies{
		Markov: &markovAdapter{port: uc.service.GetMarkov()},
	}

	// Compose the reading
	reading, err := reading_composer.ComposeReading(code, scores, deps)
	if err != nil {
		return nil, err
	}

	// Map KinhDichReading to ReadingResponse
	return &ReadingResponse{
		Stock:          code,
		Hexagram:       reading.QueChinh.Number,
		Name:           reading.QueChinh.Name,
		Trend:          reading.QueChinh.Trend,
		Signal:         reading.QueChinh.TradingSignal,
		Confidence:     reading.QueChinh.Confidence,
		ActionNote:     reading.ActionNote,
		OverallReading: reading.OverallReading,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ReadingHistory returns the reading history for a stock.
// NOTE: This use-case is currently stubbed because the underlying repository
// GetReadingsHistory method is not yet wired to real database access.
// Returns ErrInvalidCode if code is empty.
// Returns empty history (not an error) until DB layer is wired.
func (uc *ReadingUseCase) ReadingHistory(code string, days int) (*HistoryResponse, error) {
	if code == "" {
		return nil, ErrInvalidCode
	}
	if days <= 0 {
		days = 30 // default
	}

	// TODO: Wire to repository when DB layer is complete
	// For now, return empty history (valid response, just no historical data)
	return &HistoryResponse{
		Stock:        code,
		Days:         days,
		Total:        0,
		Readings:     []HistoryEntryDTO{},
		MostFrequent: "",
	}, nil
}

// HexagramTransitions returns transition probabilities from a given hexagram.
// NOTE: This use-case is currently stubbed because the underlying repository
// GetTopTransitions method is not yet wired to real database access.
// Returns ErrInvalidHexagram if number is out of range [1,64].
// Returns empty transitions (not an error) until DB layer is wired.
func (uc *ReadingUseCase) HexagramTransitions(number int, stockCode string, topN int) (*TransitionsResponse, error) {
	if number < 1 || number > 64 {
		return nil, ErrInvalidHexagram
	}
	if stockCode == "" {
		stockCode = "VNINDEX" // default
	}
	if topN <= 0 {
		topN = 10 // default
	}

	// Get hexagram metadata for the name
	ref := reading_composer.GetQueReference(number)
	name := ""
	if ref != nil {
		name = ref.Name
	}

	// TODO: Wire to repository when DB layer is complete
	// For now, return empty transitions (valid response, just no historical data)
	return &TransitionsResponse{
		Hexagram:    number,
		Name:        name,
		Stock:       stockCode,
		Transitions: []TransitionEntryDTO{},
	}, nil
}

// Backtest returns backtest statistics for a stock's hexagram readings.
// NOTE: This use-case is currently stubbed because the underlying repository
// and backtest computation are not yet implemented.
// Returns ErrInvalidCode if code is empty.
// Returns zeroed stats (not an error) until backtest engine is wired.
func (uc *ReadingUseCase) Backtest(code string, days int) (*BacktestResponse, error) {
	if code == "" {
		return nil, ErrInvalidCode
	}
	if days <= 0 {
		days = 30 // default
	}

	// TODO: Wire to backtest engine when computation is complete
	// For now, return zeroed response (valid response, just no backtest data)
	return &BacktestResponse{
		Stock:         code,
		Days:          days,
		TotalReadings: 0,
		Accuracy:      0,
		AvgReturn5d:   0,
		BestHexagram:  nil,
		WorstHexagram: nil,
	}, nil
}

// HexagramExplain returns detailed explanation for a hexagram.
// Returns ErrInvalidHexagram if number is out of range [1,64].
func (uc *ReadingUseCase) HexagramExplain(number int) (*ExplainResponse, error) {
	if number < 1 || number > 64 {
		return nil, ErrInvalidHexagram
	}

	ref := reading_composer.GetQueReference(number)
	if ref == nil {
		return nil, ErrInvalidHexagram
	}

	// Map trend enum to Vietnamese display
	trend := ref.MarketTrendLabel.Vi
	if trend == "" {
		trend = ref.MarketTrend
	}

	return &ExplainResponse{
		Number:         number,
		Name:           ref.Name,
		Chinese:        ref.Chinese,
		Upper:          ref.Upper,
		Lower:          ref.Lower,
		CoreMeaning:    ref.CoreMeaning.Vi,
		Trend:          trend,
		TradingContext: ref.StateInterpretation.Vi,
	}, nil
}
