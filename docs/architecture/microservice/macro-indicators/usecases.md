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
| `calendar` | **5 000ms** | Hard cap (2026-05-17): reduced from 30s → 10s → 5s. Endpoint permanently unreachable; 5s cap cuts page-load wait to ≤5s. CF subprocess stalls observed up to 63s. |

Budgets are overridable via constructor `timeouts?` parameter (used in tests). `DEFAULT_TIMEOUTS` is exported for test assertions.

## LiquidityStateUseCase (Go pilot)
- **File:** `apps/macro-indicators/pkg/application/usecases_vmt_liquidity.go`
- **Route:** `POST /liquidity-state`
- **Orchestrates (sequential):** `policy_rates` (SBV HTML) → `sjc_gold_gap` + `fx_coupling` (market.db reads) → `irs` (permanent `is_estimate=true`, DD-6) → `omo` (SBV HTML) → `interbank_1w` (permanently blocked, architect Decision B) → `omo_curve` (persist + 5d rolling, when `omoDailyRepo` wired).
- **Fetch budget (FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE, 2026-08-11):** the two upstream SBV HTML fetches — `policyRatesProvider.FetchPolicyRates` and `omoProvider.FetchOMO` — share a SINGLE `context.WithTimeout(ctx, domain.FetchBudgetSec*time.Second)` window (8s combined, NOT 8s each), mirroring the BOP/NSO-chain "whole chain, one shared budget" pattern (`pkg/domain/ports.go:24`, see `usecases_vmt_bop.go` `fetchRecord`). Previously each fetch ran against the raw handler ctx (60s, `pkg/interface/http/handlers_vmt_liquidity.go:35`) with only its own generous `http.Client.Timeout` (30s / 45s) as a backstop — a slow-but-not-hanging SBV origin could take >15s combined and blow the mcp-server cron's 15s deadline (`apps/mcp-server/src/scheduler/macro/sbvOmoLiquidityCronJob.ts:63`) even though each individual fetch eventually returned, silently starving `sbv_omo_daily` accrual for >=2 days.
- **Non-fatal degrade (differs from BOP/NSO-chain):** a bounded-out fetch here does NOT flip the whole response to `Status="degraded"` — only the affected bloc's `is_estimate` flips to `true` (partial-success design; `Status` stays `"ok"`). Regression tests: `pkg/application/fetch_deadline_test.go` `TestFetchDeadline_LiquidityState_*`.
