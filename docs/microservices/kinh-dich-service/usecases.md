# kinh-dich-service — Use Cases

## ReadingUseCase
- **File:** `apps/kinh-dich-service/src/application/usecases.ts`
- **Input:** `ReadingRequest { stockCode: string, days?: number }`
- **Output:** `ReadingResponse`

```typescript
interface ReadingResponse {
  stock: string
  hexagram: number         // 1-64
  name: string
  trend: string
  signal: string           // MUA, BAN, GIU, CHO, THAN TRONG
  confidence: number       // 0-1
  actionNote: string
  overallReading: string
  timestamp: string
}
```

**Flow:**
1. Default days=30, normalize stockCode to uppercase
2. Try `priceScorePort.computeScores()` for live 6-dimension scores
3. If no scores, fall back to `repo.getLatestReading()` (stored reading)
4. Both paths call `computeReading()` for full hexagram analysis
5. Throws `HexagramNotFoundError` if no data available

## MarketHexagramUseCase
- **File:** `apps/kinh-dich-service/src/application/usecases.ts`
- **Input:** none
- **Output:** `MarketReadingResponse`

```typescript
interface MarketReadingResponse {
  hexagram: number
  name: string
  trend: string
  signal: string
  confidence: number
  timestamp: string
}
```

**Flow:**
1. Fixed code='VNINDEX', 30-day scores
2. Fall back to stored reading
3. Throws `InsufficientDataError` if no data
