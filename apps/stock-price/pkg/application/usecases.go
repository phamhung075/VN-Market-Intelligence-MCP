// Package application contains use case orchestration.
package application

import (
	"strings"

	"github.com/vn-market-intelligence/stock-price/pkg/domain"
	priceresolution "github.com/vn-market-intelligence/stock-price/pkg/module/price_resolution"
)

// PriceResolverPort is the port the FetchPriceUseCase depends on.
// pkg/module/price_resolution.PriceResolutionModule satisfies this interface.
// Defined here (application layer) so the use case never imports infrastructure.
type PriceResolverPort interface {
	Resolve(code string) (*priceresolution.ResolvedQuote, error)
}

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
	Code    string              `json:"code"`
	History []domain.DailyOHLCV `json:"history"`
}

// FetchPriceUseCase orchestrates price resolution via the module tier.
type FetchPriceUseCase struct {
	resolver PriceResolverPort
}

// NewFetchPriceUseCase constructs the use case with an injected PriceResolverPort.
// At the composition root (cmd/server/main.go), pass *price_resolution.PriceResolutionModule.
func NewFetchPriceUseCase(resolver PriceResolverPort) *FetchPriceUseCase {
	return &FetchPriceUseCase{resolver: resolver}
}

// Execute uppercases the code then delegates to the price_resolution module.
func (uc *FetchPriceUseCase) Execute(req FetchPriceRequest) (*FetchPriceResponse, error) {
	code := strings.ToUpper(req.Code)
	rq, err := uc.resolver.Resolve(code)
	if err != nil {
		return nil, err
	}
	return &FetchPriceResponse{
		Code:          rq.Code,
		Price:         rq.Price,
		Volume:        rq.Volume,
		Change:        rq.Change,
		ChangePercent: rq.ChangePercent,
		Source:        rq.Source,
		LatencyMs:     rq.LatencyMs,
		FetchedAt:     rq.FetchedAt,
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
