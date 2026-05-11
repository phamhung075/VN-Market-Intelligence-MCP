# stock-price — Testing

## Unit Tests
**File:** `apps/stock-price/src/__tests__/unit/resolve-price-service.test.ts`

| Test | What it verifies |
|------|-----------------|
| tier1 succeeds | Source is 'hose' |
| tier1 null, tier2 succeeds | Fallback to 'hnx' |
| tier1+2 null, tier3 succeeds | Fallback to 'cache' |
| all tiers null | Throws PriceNotAvailableError |
| all tiers throw | Throws PriceNotAvailableError |
| saveQuote called | Fire-and-forget persistence after success |
| code preserved | Input code matches output |

**Mock helpers:**
- `makeQuote(code, source)`: Returns PriceQuote with price=75000, volume=1M
- `makeFetcher(result)`: Mock PriceFetcherPort
- `makeHistory()`: Mock PriceHistoryPort with getHistory+saveQuote

## Integration Tests
**File:** `apps/stock-price/src/__tests__/integration/fetch-price-usecase.test.ts`

| Test | What it verifies |
|------|-----------------|
| FetchPriceResponse shape | All DTO fields present |
| code uppercased | Input normalization |
| PriceNotAvailableError propagated | Error passthrough |
| history correct length | Returns expected days |
| history code uppercased | Input normalization |
| empty array for unknown | Graceful degradation |

## Run Commands
```bash
cd apps/stock-price && bun test
cd apps/stock-price && bun tsc --noEmit
```
