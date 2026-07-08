# mcp-server — Domain Model

## Core Market Data Types
**File:** `apps/mcp-server/src/domain/models/shared-types.ts`

### VnstockIntradayTick
```typescript
{ code, time (ISO), price (VND), volume, matchType: "Buy"|"Sell"|"Unknown" }
```

### VnstockEvent
```typescript
{ code, eventName, eventDate (YYYY-MM-DD), eventType: "Dividend"|"AGM"|"Share Issuance"|..., description }
```

### VnstockOrderBook
```typescript
{ code, bids: Array<{price, volume}> (top 10), asks (top 10), bidTotal, askTotal, imbalanceRatio }
```

### ShippingIndex
```typescript
{ name: "BDI"|"FBX_ASIA_US"|"SCFI", value, change, changePct, date }
```

### WeatherEvent
```typescript
{ type: "typhoon"|"flood"|"drought"|..., severity: "low"|"medium"|"high"|"critical", regions[], forecastDate, impactDuration, description }
```

### ForeignFlowUpsertItem
```typescript
{ code, date (YYYY-MM-DD), foreign_volume, foreign_room: number|null, holding_ratio: number|null, fetched_at }
```

## Signal Domain
**File:** `apps/mcp-server/src/domain/signals/`

### Signal Builder Pattern (Fluent API + Zod validation)

| Builder | Required Fields | Purpose |
|---------|----------------|---------|
| **ChainCatalystBuilder** | event_type, direction, confidence, affected_stocks[], affected_sectors[], headline, source | Cascade catalyst signals |
| **PriceConfirmationBuilder** | price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence | Price move confirmation |
| **UrgentNewsBuilder** | headline, source, severity | Breaking news alerts |
| **CrossValidateBuilder** | direction, confidence, summary | Multi-source validation |

**event_type enum:** credit_policy, trade_war, earnings, macro, legal, crisis, sector_event
**direction enum:** bullish, bearish, neutral

## Domain Services (85+)
**File:** `apps/mcp-server/src/domain/services/`

### Alert & Signal
| Service | Key Logic |
|---------|-----------|
| `alertGenerator.ts` | Severity escalation: 1 signal→inherit, 2→"high", 3+→"critical" |
| `alertDedup.ts` | Fingerprint-based deduplication |
| `alertCooldown.ts` | Rate limiting per stock |
| `signalDetector.ts` | Core signal detection engine |
| `priceAlertChecker.ts` | Price threshold monitoring |
| `customAlertEvaluator.ts` | User-defined rule evaluation |
| `alertConfidenceScorer.ts` | `deriveConfidenceFromStrength({strength, base, ceiling})` — linear interpolation between `base` (strength=0) and `ceiling` (strength=1), clamped. Pure, no I/O. Used by all 4 alert scan jobs below instead of a frozen confidence literal (FACTORY-SCHEDULER-alert-confidence-literals). |
| `bbBreakoutStrength.ts` | `computeBbBreakoutStrength({close, upper, lower})` — band-penetration ratio in [0,1]: how far `close` moved past the BB20 edge relative to the band's own width. Feeds `bbAlertScanJob`'s confidence via `BB_BREAKOUT_CONFIDENCE_{BASE,CEILING}` (alertThresholds.ts: 0.55–0.85). |
| `rsiExtremityStrength.ts` | `computeRsiExtremityStrength({rsi, direction})` — distance past the 70/30 RSI threshold, normalised to [0,1] against the remaining span to saturation (100 or 0). Feeds `taAlertScanJob`'s confidence via `RSI_EXTREME_CONFIDENCE_{BASE,CEILING}` (alertThresholds.ts: 0.55–0.85). |
| `alertThresholds.ts` | Tunable constants for alert scan jobs: `MIN_DAILY_VOLUME_FOR_ALERTS=100_000`, `NEUTRAL_BAND_PCT=2.0`, plus 4 confidence base/ceiling pairs (`FOREIGN_FLOW_*`=0.55–0.95, `INSIDER_STREAK_*`=0.60–0.95, `BB_BREAKOUT_*`=0.55–0.85, `RSI_EXTREME_*`=0.55–0.85) consumed by `alertConfidenceScorer.ts`. |

### Financial Analysis
| Service | Key Logic |
|---------|-----------|
| `baseRateComputer.ts` | Risk-free rate computation |
| `correlationCalculator.ts` | Stock correlation matrices |
| `foreignFlowAnalyzer.ts` | Foreign investor flow analysis — `DailyForeignFlow.holdingRatio: number \| null` (null = absent, VPS API does not return this field; DSI-U5 fix 2026-06-13); `ForeignFlowSignal.is_holding_ratio_fabricated: boolean` guards all render paths |
| `intradayAnalyzer.ts` | Minute-level price movement |
| `orderBookAnalyzer.ts` | Bid/ask imbalance detection |
| `sectorRotationDetector.ts` | Sector leadership rotation |
| `volatilityCalculator.ts` | Historical volatility |

### Macro & Economic
| Service | Key Logic |
|---------|-----------|
| `macroIndicatorScorer.ts` | IMF/FRED/TE SLA tracking |
| `macroIndicatorSla.ts` | Data freshness monitoring |
| `macro/carryTradeSignal.ts` | Carry trade spread signals |
| `macro/yieldSpreadSignal.ts` | US 10Y-2Y spread tracking |
| `macro/macroCalendar.ts` | Economic event calendar |

### Specialized
| Service | Key Logic |
|---------|-----------|
| `kinhDich/` (7 services) | Hexagram backtesting, I-Ching mapping |
| `financial-reports/` | bctcValidator, ratioComputer, earningsCalendar |
| `tradingWindow.ts` | VN market hours: 09:00-15:30 GMT+7 Mon-Fri |
| `sparkline.ts` | ASCII price visualization |
| `stockSearch.ts` | Ticker normalization + search |

## Cron Domain (DASH-CRON-RECHECK-TABLE, TASK-DASH-CRON-1)
**Files:** `apps/mcp-server/src/domain/cron/` — zero imports, pure (Fence-A compliant)

| Module | Export | Logic |
|--------|--------|-------|
| `cronLivenessClassifier.ts` | `classifyCronLiveness(nowMs, lastFireMs, cadenceMs, thresholdMultiplier): CronLivenessStatus` | 4-branch ladder: `null`→NEVER_FIRED; `age<=cadenceMs`→ON_TIME; `age<=cadenceMs×threshold`→LATE; `age<=cadenceMs×3`→MISSED; else STALE. Strict refinement of `schedulerWatchdogJob`'s binary healthy/alert split — guarantees AC-9 PARITY by construction. |
| `humanScheduleFormatter.ts` | `buildHumanSchedule(cronExpr): string` | Hand-rolled formatter for the ~10 cron-expression shapes in `cronConfig.ts` (every-N-min, restricted-hour window, every-N-hour, hourly-at-:MM, comma-list, daily/weekdays/weekly/monthly/quarterly HH:MM). Unrecognized shape → honest raw-expression passthrough (NFR-1, never fabricates). |

`CronLivenessStatus = "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED"`

## Repository Interfaces
- `IWatchlistRepository`, `IMarketPriceRepository`
- `IKinhDichScoreRepository`, `IHexagramRepository`
- `IJobRunRepository`

## Key Business Constants
- Trading window: 09:00-15:30 GMT+7 Monday-Friday
- Pre-market: 08:30 GMT+7
- VN timezone offset: 7 hours (GMT+7)
- Price drop alert default: -3%
- Price rise alert default: +5%
- Volume spike threshold: 2x 20-day average
