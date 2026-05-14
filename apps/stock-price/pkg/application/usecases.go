// Package application contains use case orchestration.
package application

import (
	"strings"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
)

// FetchPriceRequest is the inbound DTO for price fetch.
type FetchPriceRequest struct {
	Code string `json:"code"`
}

// FetchPriceResponse is the outbound DTO — byte-identical to TS FetchPriceResponse.
type FetchPriceResponse struct {
	Code          string             `json:"code"`
	Price         float64            `json:"price"`
	Volume        float64            `json:"volume"`
	Change        float64            `json:"change"`
	ChangePercent float64            `json:"changePercent"`
	Source        domain.PriceSource `json:"source"`
	LatencyMs     int64              `json:"latencyMs"`
	FetchedAt     string             `json:"fetchedAt"`
}

// PriceHistoryRequest is the inbound DTO for history fetch.
type PriceHistoryRequest struct {
	Code string
	Days int
}

// PriceHistoryResponse is the outbound DTO for history.
type PriceHistoryResponse struct {
	Code    string             `json:"code"`
	History []domain.DailyOHLCV `json:"history"`
}

// FetchPriceUseCase orchestrates price resolution.
type FetchPriceUseCase struct {
	service *domain.ResolvePriceService
}

// NewFetchPriceUseCase constructs the use case.
func NewFetchPriceUseCase(service *domain.ResolvePriceService) *FetchPriceUseCase {
	return &FetchPriceUseCase{service: service}
}

// Execute uppercases the code then delegates to ResolvePriceService.
func (uc *FetchPriceUseCase) Execute(req FetchPriceRequest) (*FetchPriceResponse, error) {
	code := strings.ToUpper(req.Code)
	quote, err := uc.service.FetchPrice(code)
	if err != nil {
		return nil, err
	}
	return &FetchPriceResponse{
		Code:          quote.Code,
		Price:         quote.Price,
		Volume:        quote.Volume,
		Change:        quote.Change,
		ChangePercent: quote.ChangePercent,
		Source:        quote.Source,
		LatencyMs:     quote.LatencyMs,
		FetchedAt:     quote.FetchedAt,
	}, nil
}

// PriceHistoryUseCase orchestrates price history retrieval.
type PriceHistoryUseCase struct {
	historyRepo domain.PriceHistoryPort
}

// NewPriceHistoryUseCase constructs the use case.
func NewPriceHistoryUseCase(historyRepo domain.PriceHistoryPort) *PriceHistoryUseCase {
	return &PriceHistoryUseCase{historyRepo: historyRepo}
}

// Execute uppercases the code then fetches history.
func (uc *PriceHistoryUseCase) Execute(req PriceHistoryRequest) (*PriceHistoryResponse, error) {
	code := strings.ToUpper(req.Code)
	history, err := uc.historyRepo.GetHistory(code, req.Days)
	if err != nil {
		return nil, err
	}
	if history == nil {
		history = []domain.DailyOHLCV{}
	}
	return &PriceHistoryResponse{Code: code, History: history}, nil
}
