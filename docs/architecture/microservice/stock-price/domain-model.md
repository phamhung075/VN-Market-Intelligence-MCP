# stock-price — Domain Model

**Package:** `pkg/domain/`

## Types

### PriceSource
```go
type PriceSource string

const (
    PriceSourceHose  PriceSource = "hose"
    PriceSourceHnx   PriceSource = "hnx"
    PriceSourceUpcom PriceSource = "upcom"
    PriceSourceCache PriceSource = "cache"
)
```

### PriceQuote (core value object)
```go
type PriceQuote struct {
    Code          string      // Stock symbol (always uppercased)
    Price         float64     // Price in VND
    Volume        float64     // Trading volume
    Change        float64     // Absolute VND change
    ChangePercent float64     // Percentage change
    Source        PriceSource // Which tier returned this
    LatencyMs     int64       // Response time in ms
    FetchedAt     string      // ISO 8601 timestamp (RFC3339)
}
```

### DailyOHLCV
```go
type DailyOHLCV struct {
    Date   string  // "YYYY-MM-DD"
    Open   float64
    High   float64
    Low    float64
    Close  float64
    Volume float64
}
```

## Repository Ports (interfaces)

**File:** `pkg/domain/ports.go`

### PriceFetcherPort
```go
type PriceFetcherPort interface {
    FetchPrice(ctx context.Context, code string) (*PriceQuote, error)
}
```
Returns `nil, nil` on tier miss (not an error). Returns non-nil error only on infrastructure failure.

### PriceHistoryPort
```go
type PriceHistoryPort interface {
    GetHistory(code string, days int) ([]DailyOHLCV, error)
    SaveQuote(quote PriceQuote) error
}
```

## Domain Service

### ResolvePriceService

**File:** `pkg/domain/services.go`

Constructor: `NewResolvePriceService(tier1, tier2, tier3 PriceFetcherPort, history PriceHistoryPort) *ResolvePriceService`

**Method: `FetchPrice(ctx context.Context, code string) (PriceQuote, error)`**
- Runs all 3 tiers **concurrently** via goroutines + channel
- Returns **first successful (non-nil) result** from any tier
- Persists result via `history.SaveQuote(quote)` — fire-and-forget (goroutine, error discarded)
- Returns `*PriceNotAvailableError` if all tiers return nil or error

### PriceNotAvailableError
```go
type PriceNotAvailableError struct {
    Code string
}
func (e *PriceNotAvailableError) Error() string // "Price not available for {code}"
```

## Key Design Decisions
- **No retry logic**: Single attempt per tier, 3000ms timeout per tier HTTP call
- **No circuit breaker**: Tiers are stateless, every request attempts all 3 concurrently
- **Concurrent fallback**: All tiers run simultaneously, first success wins
- **Code normalization**: Always `strings.ToUpper()` before tier fetches
