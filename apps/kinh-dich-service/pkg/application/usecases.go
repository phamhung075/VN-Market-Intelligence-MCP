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
