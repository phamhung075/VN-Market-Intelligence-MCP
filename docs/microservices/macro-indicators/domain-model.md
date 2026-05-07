# macro-indicators — Domain Model

## Types

### SignalDirection
```typescript
type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL'
```

### PriceSignal
```typescript
interface PriceSignal {
  indicator: string        // "oil_usd", "gold_usd", "usd_vnd"
  value: number
  unit: string             // "USD/barrel", "USD/oz", "VND/USD"
  direction: SignalDirection
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

### MacroSnapshot
```typescript
interface MacroSnapshot {
  vnIndex: number | null
  oilUsd: number | null
  goldUsd: number | null
  usdVnd: number | null
  signals: PriceSignal[]
  fetchedAt: string        // ISO timestamp
}
```

### MacroTier & ScoredIndicator
```typescript
type MacroTier = 'VN_DIRECT' | 'REGIONAL' | 'US_DOMESTIC'

interface ScoredIndicator {
  name: string
  value: number
  tier: MacroTier
  impactScore: number      // 2-10
}
```

## Repository Ports

### CommodityFetcherPort
```typescript
interface CommodityFetcherPort {
  fetchOilUsd(): Promise<number | null>
  fetchGoldUsd(): Promise<number | null>
  fetchUsdVnd(): Promise<number | null>
}
```

### SBVRatePort
```typescript
interface SBVRatePort {
  fetchVnIndex(): Promise<number | null>
  fetchSBVRates(): Promise<Record<string, number>>
}
```

### MacroIndicatorRepository
```typescript
interface MacroIndicatorRepository {
  getLatest(limit: number): Promise<ScoredIndicator[]>
}
```

## Domain Service

### MacroScoreService
- **File:** `apps/macro-indicators/src/domain/services.ts`
- Constructor: `(commodity: CommodityFetcherPort, sbv: SBVRatePort)`

**Method: `buildSnapshot(): Promise<MacroSnapshot>`**
- Fetches all 4 sources in parallel
- Builds `PriceSignal[]` dynamically (only for non-null values)
- Timestamps with ISO string

### Direction Thresholds

| Indicator | BULLISH | BEARISH | NEUTRAL |
|-----------|---------|---------|---------|
| **Oil (USD/barrel)** | < 60 | > 100 | 60-100 |
| **Gold (USD/oz)** | > 2200 | < 1800 | 1800-2200 |
| **USD/VND** | < 23000 | > 25000 | 23000-25000 |

**Impact levels:** Oil=HIGH, Gold=MEDIUM, USD/VND=HIGH

### Tier Scoring (scoreIndicator)

| Tier | Keywords | Score Range |
|------|----------|-------------|
| VN_DIRECT | vietnam, vn gdp, sbv, nhnn, vnd, vnindex, hose, hnx | 8-10 |
| REGIONAL | federal reserve, fed rate, oil, crude, gold, china, pboc | 5-7 |
| US_DOMESTIC | everything else | 2-4 |
