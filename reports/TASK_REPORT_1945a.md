# TASK REPORT — 1945a

**Task:** Fix `verdictResolutionJob` baseline-price shape mismatch
**Sprint:** 1945
**Priority:** HIGH
**Type:** FIX
**Owner:** dev-mcp-server
**Completed:** 2026-05-18
**Branch:** task/calendar-source-10s-timeout (current working branch)

---

## Problem

`verdictResolutionJob.ts::defaultFetchHistory()` was calling `getPriceHistory()` from `clients.ts` and treating the result as `PriceSnapshot[]` (a flat array). The Go stock-price service actually returns a wrapper object:

```json
{ "code": "VNM", "history": [{ "date": "...", "open": ..., "close": 70.8, ... }] }
```

The old code:
```typescript
const snaps = await getPriceHistory({ code: ticker, days });
if (!snaps || snaps.length === 0) return null;
return (snaps[0] as { price: number }).price;
```

At runtime `snaps` is an object (not an array), so `snaps.length` is `undefined` (guard passes), `snaps[0]` is `undefined` (indexing object with 0), and `undefined.price` throws a `TypeError`. The catch block swallows it and returns `null`. Every baseline fetch returns `null`, triggering the 1926a "unresolvable" guard → `false_positive:unresolvable` for every pending verdict → ~520 alerts never scored → `scored_pct ≈ 36%`.

---

## Fix

### File 1: `apps/mcp-server/src/infrastructure/microservices/clients.ts`

- Added `PriceHistoryEnvelope` interface (exported) matching Go `PriceHistoryResponse` shape: `{ code: string; history: Array<{date, open, high, low, close, volume?}> }`
- Changed `getPriceHistory()` return type from `Promise<PriceSnapshot[]>` to `Promise<PriceHistoryEnvelope>`
- Updated the function body to return the envelope as-is (`response.json() as Promise<PriceHistoryEnvelope>`)

### File 2: `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts`

- Updated `defaultFetchHistory()` to unwrap the envelope correctly:
  ```typescript
  const envelope = await getPriceHistory({ code: ticker, days });
  const history = envelope.history;
  if (!history || history.length === 0) return null;
  return history[0]!.close;
  ```
- Added JSDoc noting the fix and the root cause

### Caller Audit

Grepped all callers of `getPriceHistory` in `apps/mcp-server/src/`:

| File | Uses `getPriceHistory` from clients.ts? | Action |
|------|-----------------------------------------|--------|
| `verdictResolutionJob.ts` | YES | Fixed |
| `portfolioRiskCalculator.ts` | NO — pure domain service, reads `DailyPriceRow[]` from SQLite via tool layer | No change |
| `portfolioRiskTool.ts` | NO — reads `market_prices_history` via SQLite query | No change |
| `priceHistoryTools.ts` | NO — reads `daily_ohlcv` via SQLite query | No change |
| `signalOutcomeStore.ts` | Has own direct `fetch()` call to `/price/history` (separate from `getPriceHistory`) | Out of scope |

---

## Tests

New test file: `apps/mcp-server/src/__tests__/1945a-verdict-resolution-envelope.test.ts`

| Test | Description | AC |
|------|-------------|-----|
| T1 | Envelope `{code, history:[{close:100}]}` → bullish +2% → confirmed | AC-2, AC-4 |
| T2 | Envelope → bearish -2% → confirmed | AC-4 |
| T3 | Empty `history: []` → null → unresolvable (genuine no-data) | AC-5 |
| T4 | Null envelope (network error) → null → unresolvable | AC-5 |
| T5 | `history[0].close=200` used as baseline (not `.price`) → pctMove correct | AC-2 |
| T6 | `PriceHistoryEnvelope` type has correct runtime shape | AC-1 |

Results: 6/6 GREEN. Existing 1863b-verdict-resolution-job.test.ts: 19/19 GREEN.

---

## Acceptance Criteria

| AC | Result |
|----|--------|
| AC-1: `getPriceHistory()` returns `PriceHistoryEnvelope` | PASS |
| AC-2: `defaultFetchHistory()` reads `envelope.history[0].close` | PASS |
| AC-3: All callers audited — only `verdictResolutionJob.ts` uses `getPriceHistory` | PASS |
| AC-4: Unit test: envelope shape → job resolves correctly | PASS |
| AC-5: Empty history → null (genuine no-data) | PASS |
| AC-6 (tsc): 0 errors post-fix | PASS |
| AC-7: `scored_pct ≥ 60%` within 48h of deploy | PENDING (runtime metric) |

---

## Files Changed

- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — `PriceHistoryEnvelope` type + `getPriceHistory` return type fix
- `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts` — `defaultFetchHistory` envelope unwrap fix
- `apps/mcp-server/src/__tests__/1945a-verdict-resolution-envelope.test.ts` — NEW: 6 unit tests
- `docs/TASKS.md` — 1945a moved Todo → Done
