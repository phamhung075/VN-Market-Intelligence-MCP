# stock-price — Domain Model

## Types

### PriceSource
```typescript
type PriceSource = 'hose' | 'hnx' | 'upcom' | 'vndirect' | 'cache'
```

### PriceQuote (core value object)
```typescript
interface PriceQuote {
  code: string           // Stock symbol (always uppercased)
  price: number          // Price in VND
  volume: number         // Trading volume
  change: number         // Absolute VND change
  changePercent: number  // Percentage change
  source: PriceSource    // Which tier returned this
  latencyMs: number      // Response time in ms
  fetchedAt: string      // ISO 8601 timestamp
}
```

### DailyOHLCV
```typescript
interface DailyOHLCV {
  date: string    // "YYYY-MM-DD"
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

### TierResult
```typescript
interface TierResult {
  success: boolean
  quote: PriceQuote | null
  error?: string
}
```

## Repository Ports

### PriceFetcherPort
```typescript
interface PriceFetcherPort {
  fetchPrice(code: string): Promise<PriceQuote | null>
}
```
Used by all 3 tiers. Returns `null` on any error (not exceptions).

### PriceHistoryPort
```typescript
interface PriceHistoryPort {
  getHistory(code: string, days: number): Promise<DailyOHLCV[]>
  saveQuote(quote: PriceQuote): Promise<void>
}
```

## Domain Service

### ResolvePriceService
- **File:** `apps/stock-price/src/domain/services.ts`
- Constructor: `(tier1: PriceFetcherPort, tier2: PriceFetcherPort, tier3: PriceFetcherPort, history: PriceHistoryPort)`

**Method: `fetchPrice(code: string): Promise<PriceQuote>`**
- Runs all 3 tiers **concurrently** via `Promise.allSettled()`
- Returns **first successful (non-null) result** from any tier
- Persists result via `history.saveQuote(quote)` — fire-and-forget (not awaited)
- Throws `PriceNotAvailableError` if all tiers fail

### PriceNotAvailableError
```typescript
class PriceNotAvailableError extends Error {
  constructor(code: string) // message: "Price not available for {code}"
}
```

## Key Design Decisions
- **No retry logic**: Single attempt per tier, 3000ms timeout
- **No circuit breaker**: Tiers are stateless, every request attempts all 3
- **Concurrent fallback**: All tiers run simultaneously, first success wins
- **Code normalization**: Always `.toUpperCase()` before tier fetches
