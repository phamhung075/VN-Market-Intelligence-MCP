# stock-price — Use Cases

## FetchPriceUseCase
- **File:** `apps/stock-price/src/application/usecases.ts`
- **Input:** `FetchPriceRequest { code: string }`
- **Output:** `FetchPriceResponse { code, price, volume, change, changePercent, source, latencyMs, fetchedAt }`
- Uppercases code before passing to `ResolvePriceService.fetchPrice()`
- Maps `PriceQuote` to response DTO

## PriceHistoryUseCase
- **File:** `apps/stock-price/src/application/usecases.ts`
- **Input:** `PriceHistoryRequest { code: string, days: number }`
- **Output:** `PriceHistoryResponse { code: string, history: DailyOHLCV[] }`
- Uppercases code, calls `historyRepo.getHistory(code, days)`
- Returns history wrapped in response DTO

## DTOs
- **File:** `apps/stock-price/src/application/dtos.ts`

```typescript
interface FetchPriceRequest { code: string }
interface FetchPriceResponse {
  code: string, price: number, volume: number,
  change: number, changePercent: number,
  source: PriceSource, latencyMs: number, fetchedAt: string
}
interface PriceHistoryRequest { code: string, days: number }
interface PriceHistoryResponse { code: string, history: DailyOHLCV[] }
```
