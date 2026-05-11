# macro-indicators — Testing

## Unit Tests
**File:** `apps/macro-indicators/src/__tests__/unit/macro-score-service.test.ts`

**Mock helpers:**
- `makeMockCommodity(overrides)`: defaults oil=85, gold=2100, usdVnd=24500
- `makeMockSBV(overrides)`: defaults vnIndex=1200.5, sbvRates={'USD/VND': 24500}

| Test | Assertion |
|------|-----------|
| buildSnapshot values | oil=85, gold=2100, usdVnd=24500, vnIndex=1200.5 |
| signal generation | Produces oil_usd, gold_usd, usd_vnd signals |
| oil > 100 → BEARISH | oil=120 |
| oil < 60 → BULLISH | oil=50 |
| USD/VND > 25000 → BEARISH | usdVnd=26000 |
| all null handling | Empty signals array, null values |
| exception handling | fetchOilUsd throws → null result |
| scoreIndicator VN_DIRECT | 'Vietnam GDP' → score 8-10 |
| scoreIndicator REGIONAL | 'Crude Oil' → score 5-7 |
| scoreIndicator US_DOMESTIC | 'US housing' → score 2-4 |

## Integration Tests
**File:** `apps/macro-indicators/src/__tests__/integration/compute-macro-usecase.test.ts`

- Full DTO mapping through use case
- All sources fail → empty signals, null values
- Signal structure validation (required fields + valid enums)
- Direction calculation: USD/VND 25500 → BEARISH

## Run Commands
```bash
cd apps/macro-indicators && bun test
cd apps/macro-indicators && bun tsc --noEmit
```
