# SPIKE-1945 — verdictResolutionJob: No-Baseline-Price Root Cause

**Date:** 2026-05-18
**Author:** Architect (SPIKE-1945)
**Timebox:** 120 min (completed)
**Zone:** `apps/mcp-server/`
**Status:** FIXABLE — child task 1945a scoped below

---

## Mission

Diagnose why `verdictResolutionJob` marks ~520 signal verdicts as `false_positive` with
`detail: "price-fetch-failed:unresolvable"`, leaving `alert_accuracy.scored_pct` stuck at ~36%.

Questions to answer:
1. What table does the job read baselines from?
2. Is this unresolvable (no data) or a fixable bug?
3. Is Sprint 1926a's `false_positive` marking correct or masking an upstream lag?

---

## Verdict

**FIXABLE BUG.** The ~520 unknown verdicts are NOT due to missing price data. They are caused
by a **response shape mismatch** between the TypeScript `defaultFetchHistory()` adapter and the
Go stock-price microservice `/price/history` endpoint. Every baseline fetch fails with a
TypeError, which is silently caught, returning `null`, triggering the "unresolvable" guard.

---

## Root Cause Analysis

### Bug 1 — Response Shape Mismatch (CRITICAL — explains 100% of the failures)

**File:** `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts` lines 111–126

**File:** `apps/mcp-server/src/infrastructure/microservices/clients.ts` lines 270–279

**The mismatch:**

`clients.ts getPriceHistory()` is typed as returning `Promise<PriceSnapshot[]>` (a flat array),
but the Go stock-price service returns a wrapper object:

```json
{ "code": "VNM", "history": [ { "date": "2026-05-16", "open": 70.0, "high": 71.5, "low": 69.5, "close": 70.8, "volume": 500000 } ] }
```

Go source: `apps/stock-price/pkg/application/usecases.go` lines 33–37:
```go
type PriceHistoryResponse struct {
    Code    string              `json:"code"`
    History []domain.DailyOHLCV `json:"history"`
}
```

`DailyOHLCV` fields: `{date, open, high, low, close, volume}` — no `.price` field.

**Failure trace in `defaultFetchHistory()`:**
```typescript
const snaps = await getPriceHistory({ code: ticker, days });
// snaps at runtime = { code: "VNM", history: [...] }  ← an object, not an array
if (!snaps || snaps.length === 0) return null;
// snaps.length = undefined (property missing on plain object)
// undefined === 0  → false  → passes the guard
return (snaps[0] as { price: number }).price;
// snaps[0] = undefined (indexing an object with 0)
// undefined.price  → TypeError: Cannot read properties of undefined
// catch block fires → returns null
```

The catch at line 123 silently swallows the TypeError and returns `null`. This `null` triggers:
```typescript
if (priceAtFire === null) {
    await store.updateVerdict(row.id, {
        verdict: "false_positive",
        detail: "price-fetch-failed:unresolvable",
        resolvedAt: now.toISOString(),
    });
    result.errors++;
    continue;
}
```

Every pending verdict that calls `fetchHistory()` hits this path. Since `writeOutcomeFn` is
only called for rows that reach the direction-match computation (lines 256–259), no
`alerts.outcome` value is ever written for these rows. Hence `scored_pct` stays at ~36%.

### Bug 2 — No UNKNOWN Written to `alerts.outcome` (secondary consequence)

When the baseline fetch fails, the job marks the verdict store entry as `false_positive` but
does NOT call `writeOutcomeFn`. The `alerts` table row keeps `outcome = NULL`. The `scored_pct`
metric in `formatAccuracyReport()` counts `scoredFromDb` only when `outcome IS NOT NULL`, so
these rows stay in the `unknowns` bucket and drag `scored_pct` to ~36%.

This is a downstream consequence of Bug 1, not an independent bug.

### Why 1926a's `false_positive` Marking Is Wrong

Sprint 1926a added the idempotency guard (correct intent: stop hourly retry storm). However,
the root cause it was treating as "unresolvable" was actually a silent TypeError, not genuine
absence of price data. The `false_positive` label is incorrect for these rows — they have not
been evaluated for direction accuracy at all. They should either:
- Be successfully resolved once Bug 1 is fixed (most cases), or
- Remain genuinely unresolvable if `daily_ohlcv` has no data for the ticker/window.

The BUG Telegram messages ("verdictResolutionJob no-baseline-price loop — 19 dup BUG msgs in
21h" from TNB c68 Finding #7) confirm this fires on every run because the idempotency guard was
added AFTER the false_positive write, so the retry storm was partially mitigated (rows are no
longer re-evaluated after being marked), but the initial evaluation always fails.

### Did Sprint 1336 SQLite Isolation Change the Queried Path?

No. Sprint 1336 isolated `alert-engine.db` and `stock_price.db` using named Docker volumes.
The relevant tables here are:
- `daily_ohlcv` in `market.db` (read by stock-price Go service via `DB_PATH=/app/data/market.db`)
- `alerts.outcome` in `market.db` (written by mcp-server via `writeAlertOutcome`)

Both paths remained on the `market_data` named volume throughout Sprint 1336. The 1336 change
did not affect the `verdictResolutionJob` data path.

### `signal_emitted_at` Distribution of the ~520 Unknowns

The `alert-verdicts.json` file in the repository is currently empty (`[]`) — all verdict rows
have been either resolved or pruned by the 30-day TTL. This means the ~520 figure from the
task brief reflects the `alerts.outcome IS NULL` count in the production Docker `market.db`
(not accessible for direct query here). Given that:
- The retry storm sends 19 BUG msgs per 21h = ~1 per hour, matching the job's `0 * * * *` cron
- The 30-day window is the `get_alert_accuracy` lookback default
- `scored_pct ≈ 36%` = ~870 total alerts, ~520 unscored

These 520 unscored alerts are not "pending" verdict rows — they are `alerts` table rows that
never had `writeOutcomeFn` called because baseline fetch always fails.

---

## Files Involved

| File | Role | Change Needed |
|------|------|---------------|
| `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts` L111–126 | `defaultFetchHistory()` — wrong shape assumption | Fix response unwrapping |
| `apps/mcp-server/src/infrastructure/microservices/clients.ts` L270–279 | `getPriceHistory()` — wrong return type | Fix return type + unwrapping |
| `apps/stock-price/pkg/application/usecases.go` L33–37 | Go response envelope | Read-only (source of truth) |
| `apps/stock-price/pkg/domain/models.go` L28–35 | `DailyOHLCV` shape | Read-only (source of truth) |

---

## Fix Design for Task 1945a

### Option A — Fix `clients.ts getPriceHistory()` (preferred, single fix point)

Change the return type and unwrapping logic in `clients.ts` to match the actual Go response:

```typescript
// apps/mcp-server/src/infrastructure/microservices/clients.ts

export interface PriceHistoryEnvelope {
  code: string;
  history: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export async function getPriceHistory(
  req: PriceHistoryRequest
): Promise<PriceHistoryEnvelope> {
  const url = `${BASE_URLS.stockPrice}/price/history?code=${req.code}&days=${req.days ?? 30}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`[Stock Price Service] ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<PriceHistoryEnvelope>;
}
```

Then fix `defaultFetchHistory()` in `verdictResolutionJob.ts` to use the envelope:

```typescript
async function defaultFetchHistory(
  ticker: string,
  days: number
): Promise<number | null> {
  const { getPriceHistory } = await import(
    "../../infrastructure/microservices/clients.js"
  );
  try {
    const envelope = await getPriceHistory({ code: ticker, days });
    const history = envelope.history;
    if (!history || history.length === 0) return null;
    // Oldest first (Go returns ASC by date) — use first element's close as baseline
    return history[0]!.close;
  } catch {
    return null;
  }
}
```

### Callers of `getPriceHistory` to audit

`getPriceHistory` is used in at least 2 other files (grep confirmed):
- `apps/mcp-server/src/interface/mcp/tools/registry.ts`
- `apps/mcp-server/src/domain/services/portfolioRiskCalculator.ts`

Both must be updated to use `envelope.history` instead of treating the result as a flat array.

### Acceptance Criteria for 1945a

- AC-1: `getPriceHistory()` in `clients.ts` returns `PriceHistoryEnvelope` with `.history: DailyOHLCV[]`
- AC-2: `defaultFetchHistory()` reads `envelope.history[0].close` as baseline (oldest date)
- AC-3: All callers of `getPriceHistory` updated to use `.history` property
- AC-4: Unit test added: `fetchHistory` stub now returns `{code, history:[{close:100,...}]}` shape — job resolves correctly
- AC-5: New integration path: when `history` is empty, `null` is returned (genuine no-data case)
- AC-6: `tsc` reports 0 errors post-fix
- AC-7: After fix deploys, `scored_pct` in `get_alert_accuracy` reaches ≥60% within 48h (one full verdict resolution cycle)

---

## Risk Flags

- R-1 (HIGH): Any caller currently treating `getPriceHistory()` result as `PriceSnapshot[]` will break at TypeScript compile time after the type change — that is the intended detection mechanism. Do NOT use `as any` to suppress.
- R-2 (MEDIUM): `history[0]` is the oldest date (Go query: `ORDER BY date ASC`) — this is correct as baseline. Verify Go `ORDER BY date ASC` in `fetchers.go` L223 before merging.
- R-3 (LOW): The `false_positive` rows already written to `alert-verdicts.json` (verdict store) for the ~520 signals will NOT be retroactively re-evaluated — they have `verdict: "false_positive"` and are filtered out by `row.verdict !== "pending"` on next run. The `alerts.outcome IS NULL` rows in the DB will be scored on the next `verdictResolutionJob` run after the fix deploys, but only for NEW verdicts going forward. Historical unscored rows require a separate backfill task (out of scope for 1945a).
- R-4 (LOW): Daily OHLCV data coverage — `daily_ohlcv` in `market.db` only has candles for dates when the VnDirect fetcher ran successfully. Tickers with no OHLCV history (e.g. MACRO_GOLD, non-HOSE watchlist items) will still return `null` from `defaultFetchHistory` — this is now genuinely unresolvable, and the `false_positive` label is correct for those cases.

---

## DDD Layer Assignment

| Fix | Layer | Notes |
|-----|-------|-------|
| `clients.ts getPriceHistory` type fix | infrastructure | HTTP adapter — correct layer |
| `verdictResolutionJob.ts defaultFetchHistory` fix | scheduler (interface) | scheduler MAY import from infrastructure |
| New unit test | `__tests__/` | No DDD layer violation |

---

## Summary

| Question | Answer |
|----------|--------|
| What table does the job read baselines from? | `daily_ohlcv` via Go stock-price service `/price/history` endpoint |
| Is this unresolvable or fixable? | FIXABLE — TypeError in `defaultFetchHistory()` caused by shape mismatch |
| Is 1926a `false_positive` marking correct? | Partially: idempotency intent is correct, but the label is wrong (true unknown, not direction-evaluated) |
| Did Sprint 1336 cause this? | No — different DB isolation path |
| Fix location | `clients.ts` L270 (return type) + `verdictResolutionJob.ts` L119–123 (unwrapping) |

**Child task:** 1945a — FIX, dev-mcp-server, goal: `scored_pct >= 60%`
