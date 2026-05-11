# technical-analysis — Use Cases

## ComputeTAUseCase
- **File:** `apps/technical-analysis/src/application/usecases.ts`
- **Input:** `ComputeTARequest { code: string, days: number }`
- **Output:** `ComputeTAResponse`

```typescript
interface ComputeTAResponse {
  code: string
  rsi: number | null
  macd: { line: number, signal: number, histogram: number } | null
  movingAverages: { ma5: number | null, ma20: number | null, ma50: number | null }
  bollingerBands: { upper: number, mid: number, lower: number } | null
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  computedAt: string  // ISO 8601 timestamp added by use case
}
```

**Flow:**
1. Calls `CalculateTAService.compute(code, days)`
2. Maps domain `TechnicalIndicators` to response DTO
3. Adds `computedAt: new Date().toISOString()`
