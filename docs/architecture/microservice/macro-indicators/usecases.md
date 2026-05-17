# macro-indicators — Use Cases

## ComputeMacroUseCase
- **File:** `apps/macro-indicators/src/application/usecases.ts`
- **Input:** `MacroSnapshotRequest {}` (empty, future extensibility)
- **Output:** `MacroSnapshotResponse`

```typescript
interface MacroSnapshotResponse {
  vnIndex: number | null
  oilUsd: number | null
  goldUsd: number | null
  usdVnd: number | null
  signals: PriceSignal[]
  fetchedAt: string
}
```

**Flow:** Orchestrates `MacroScoreService.buildSnapshot()`, maps all fields through as-is.

## FetchExternalMacroUseCase
- **File:** `apps/macro-indicators/src/application/fetch-external-macro.ts`
- **Route:** `POST /external` / `GET /external`
- **Input:** none
- **Output:** `ExternalMacroEnvelope`

```typescript
interface ExternalMacroEnvelope {
  sources: {
    worldBank:        SourceResult<Record<string, WorldBankDataPoint[]>>;
    yahoo:            SourceResult<Record<string, YahooQuote | null>>;
    cnbc:             SourceResult<Record<string, CnbcQuote | null>>;
    tradingEconomics: SourceResult<Record<string, TradingEconomicsIndicator | null>>;
    fred:             SourceResult<Record<string, FredSeriesResult | null>>;
    calendar:         SourceResult<EconomicCalendarEvent[]>;
  };
  fetchedAt: string;    // ISO timestamp
  summary: { ok: number; failed: number; totalLatencyMs: number };
}
type SourceResult<T> = { status: 'ok' | 'failed' | 'timeout'; data?: T; error?: string; latencyMs: number };
```

**Flow:** Fans out 6 scraper ports concurrently via `Promise.all(withTimeout(...))`. Each source races against a per-source timer — slow/stalled adapters are cut off and marked `status: 'timeout'` without blocking the other 5. `execute()` never throws.

**HTTP contract:** HTTP 200 when `summary.ok >= 1` (partial data still useful); HTTP 502 only when all 6 sources fail.

### Per-source timeout budgets (`DEFAULT_TIMEOUTS`)

| Source | Budget | Notes |
|--------|--------|-------|
| `worldBank` | 8 000ms | World Bank API, 7 parallel indicators |
| `yahoo` | 50 000ms | Python subprocess + 11 parallel symbol fetches |
| `cnbc` | 35 000ms | Python subprocess + 6 parallel quote fetches |
| `tradingEconomics` | 65 000ms | Python subprocess + 7 parallel TE pages |
| `fred` | 8 000ms | FRED REST API, 8 parallel series |
| `calendar` | **10 000ms** | Hard cap (2026-05-17): reduced from 30s after 63s hang observed (`totalLatencyMs: 62700ms`). CF subprocess can stall far beyond estimated warmup. |

Budgets are overridable via constructor `timeouts?` parameter (used in tests). `DEFAULT_TIMEOUTS` is exported for test assertions.
