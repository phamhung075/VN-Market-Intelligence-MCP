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

## Scraper Unit Tests

### FredMacroAdapter
**File:** `apps/macro-indicators/__tests__/unit/scrapers/fred-macro.test.ts`

| Test group | Cases |
|------------|-------|
| `isAvailable` | key absent → false / key short → false / key 32-char → true |
| `fetchSeries` (key absent) | returns null + console.warn |
| `fetchSeries` (mocked) | parses observations / API error body / HTTP 500 / network throw |
| `fetchAllMacro` (key absent) | all 8 keys present, all values null |
| `fetchAllMacro` (parallel) | all-ok: 8 results / one-fail: null for VIXCLS, others non-null / timing: all 8 dispatched within 30ms window |
| `FRED_SERIES` catalog | 8 entries, known IDs present |

### WorldBankMacroAdapter
**File:** `apps/macro-indicators/__tests__/unit/scrapers/world-bank-macro.test.ts`

Covers: successful parse of WB API v2 format, HTTP 404, network throw, batch with 7 indicators.

## Run Commands
```bash
cd apps/macro-indicators && bun test
cd apps/macro-indicators && bun tsc --noEmit
```

## Current counts (2026-05-13)
- Total tests: 102 (90 pass, 12 skip, 0 fail)
- `bun test` runtime: ~600ms (all unit, parallel mock execution)
