# kinh-dich-service — Testing

## Unit Tests
**File:** `apps/kinh-dich-service/src/__tests__/unit/kinh-dich-service.test.ts`

- `computeReading()` with mocked ports — full hexagram computation
- `classifyNguHanh()` element interaction logic (TUONG_SINH, TUONG_KHAC, SAME)
- `ReadingUseCase.execute()` with mock repos — happy path + fallback
- `MarketHexagramUseCase.execute()` error scenarios (InsufficientDataError)

## Integration Tests
**File:** `apps/kinh-dich-service/src/__tests__/integration/kinh-dich-handlers.test.ts`

| Test | Assertion |
|------|-----------|
| GET /health | 200 |
| GET /reading/:code | 200 with valid reading |
| GET /reading/:code?days=invalid | 400 |
| GET /reading/:code (no data) | 404 |
| GET /market | 200 or 422 |
| Stock code normalization | Input uppercased |

## Run Commands
```bash
cd apps/kinh-dich-service && bun test
cd apps/kinh-dich-service && bun tsc --noEmit
```
