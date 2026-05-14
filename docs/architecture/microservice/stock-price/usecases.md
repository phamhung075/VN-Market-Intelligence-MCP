# stock-price — Use Cases

**Package:** `pkg/application/`

## FetchPriceUseCase

**File:** `pkg/application/usecases.go`

- **Constructor:** `NewFetchPriceUseCase(service *domain.ResolvePriceService) *FetchPriceUseCase`
- **Input:** `FetchPriceRequest { Code string }`
- **Output:** `FetchPriceResponse { Code, Price, Volume, Change, ChangePercent, Source, LatencyMs, FetchedAt }`
- Uppercases Code before passing to `ResolvePriceService.FetchPrice()`
- Maps `PriceQuote` to response DTO

## PriceHistoryUseCase

**File:** `pkg/application/usecases.go`

- **Constructor:** `NewPriceHistoryUseCase(repo domain.PriceHistoryPort) *PriceHistoryUseCase`
- **Input:** `PriceHistoryRequest { Code string, Days int }`
- **Output:** `PriceHistoryResponse { Code string, History []domain.DailyOHLCV }`
- Uppercases Code, calls `historyRepo.GetHistory(code, days)`
- Returns history wrapped in response DTO

## DTOs

**File:** `pkg/application/usecases.go`

```go
type FetchPriceRequest struct {
    Code string
}

type FetchPriceResponse struct {
    Code          string  `json:"code"`
    Price         float64 `json:"price"`
    Volume        float64 `json:"volume"`
    Change        float64 `json:"change"`
    ChangePercent float64 `json:"changePercent"`
    Source        string  `json:"source"`
    LatencyMs     int64   `json:"latencyMs"`
    FetchedAt     string  `json:"fetchedAt"`
}

type PriceHistoryRequest struct {
    Code string
    Days int
}

type PriceHistoryResponse struct {
    Code    string              `json:"code"`
    History []domain.DailyOHLCV `json:"history"`
}
```
