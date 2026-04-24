# TECH-121: TaDiag Observability Block in Evening Summary

status: APPROVED_BY_ARCHITECT
req_ref: REQ-121

## Brownfield Impact

- Files modified: `src/application/usecases/assembleEveningSummary.ts`
- Files created: `src/__tests__/1356-ta-diag.test.ts`
- Files deleted: none
- Breaking changes: no — additive only. `EveningSummary` gains one required field `taDiag: TaDiag`; callers that destructure the full interface need to handle the new field but no existing field changes shape.

## Architecture Decision

`TaDiag` is a pure diagnostic struct collected as a side-effect of the existing Step 4 ticker loop — no new loop, no new DB round-trips beyond one `COUNT(*)` per ticker. The pattern mirrors `predictionDiag` (Sprint 120): declare a zero-default before the outer try, populate inside the loop, assign to `EveningSummary`, write to JSON only — Telegram formatter untouched. `getOhlcvRowCountFn` is injectable so tests never touch real SQLite OHLCV data.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `TaDiag` interface | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| `EveningSummary.taDiag` field | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| `AssembleEveningSummaryOptions.getOhlcvRowCountFn` | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| Step 4 loop extension | application | `src/application/usecases/assembleEveningSummary.ts` | MODIFY |
| TDD test file | test | `src/__tests__/1356-ta-diag.test.ts` | NEW |

## Interface Contracts

### New exported interface (add to `assembleEveningSummary.ts`)

```typescript
/** Diagnostic counts for TA pipeline observability — JSON report only, NOT sent to Telegram */
export interface TaDiag {
  /** Watchlist tickers where computeTaFn returned a non-null TaSignal */
  tickersWithSignal: number;
  /** Watchlist tickers where daily_ohlcv row count < 8 (defaultComputeTa guard threshold) */
  tickersBelowThreshold: number;
  /** Minimum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMin: number;
  /** Maximum daily_ohlcv row count across all watchlist tickers (0 if empty watchlist) */
  ohlcvRowsMax: number;
}
```

### EveningSummary addition

```typescript
/** Diagnostic counts for TA pipeline observability — JSON report only, NOT sent to Telegram */
taDiag: TaDiag;
```

### AssembleEveningSummaryOptions addition

```typescript
/** Override OHLCV row count query for tests — avoids real DB dependency */
getOhlcvRowCountFn?: (code: string, db: Database) => number;
```

### Default production implementation (inline in Step 4)

```typescript
function defaultGetOhlcvRowCount(code: string, db: Database): number {
  const row = db
    .prepare<{ cnt: number }, [string]>(
      "SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?",
    )
    .get(code);
  return row?.cnt ?? 0;
}
```

## Step 4 Loop — Exact Change Plan

Before (current):

```typescript
const taFn = options.computeTaFn ?? defaultComputeTa;
let taSummary: TaSignal[] = [];
try {
  const watchlistRows = db
    .prepare<WatchlistCodeRow, []>("SELECT code FROM watchlist")
    .all();
  const signals: TaSignal[] = [];
  for (const { code } of watchlistRows) {
    try {
      const sig = taFn(code, db);
      if (sig !== null) signals.push(sig);
    } catch {
      /* per-ticker: swallow, continue */
    }
  }
  taSummary = signals;
} catch (err) {
  logger.warn("[assembleEveningSummary] TA step failed", { ... });
}
```

After (additive changes only — no structural rewrite):

```typescript
const taFn = options.computeTaFn ?? defaultComputeTa;
const rowCountFn = options.getOhlcvRowCountFn ?? defaultGetOhlcvRowCount;
let taSummary: TaSignal[] = [];
let taDiag: TaDiag = { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 };
try {
  const watchlistRows = db
    .prepare<WatchlistCodeRow, []>("SELECT code FROM watchlist")
    .all();
  const signals: TaSignal[] = [];
  const rowCounts: number[] = [];
  let withSignal = 0;
  let belowThreshold = 0;
  for (const { code } of watchlistRows) {
    try {
      const cnt = rowCountFn(code, db);
      rowCounts.push(cnt);
      if (cnt < 8) belowThreshold++;
      const sig = taFn(code, db);
      if (sig !== null) { signals.push(sig); withSignal++; }
    } catch {
      rowCounts.push(0);
      /* per-ticker: swallow, continue */
    }
  }
  taSummary = signals;
  taDiag = {
    tickersWithSignal: withSignal,
    tickersBelowThreshold: belowThreshold,
    ohlcvRowsMin: rowCounts.length > 0 ? Math.min(...rowCounts) : 0,
    ohlcvRowsMax: rowCounts.length > 0 ? Math.max(...rowCounts) : 0,
  };
} catch (err) {
  logger.warn("[assembleEveningSummary] TA step failed", { ... });
  // taDiag stays at zero-default — no crash
}
```

Note: when `getOhlcvRowCountFn` throws inside the per-ticker `try/catch`, `rowCounts.push(0)` is the catch path — so `belowThreshold` increments via the catch line. The REQ says "treat as row count = 0" which means it will count as below threshold. Dev must push(0) in the catch block and let the outer counters remain accurate.

Correction to the above: the inner `try/catch` currently wraps only `taFn`. It must be widened to wrap both `rowCountFn` and `taFn` calls so that a throw from `rowCountFn` does not skip the `taFn` call for that ticker. The per-ticker catch should push `0` to `rowCounts` and continue (same semantics as current per-ticker swallow).

## Task Breakdown (for PM)

Dependency order:

| Task | Title | Depends on |
|---|---|---|
| 1356 | test(ta-diag): TDD `1356-ta-diag.test.ts` — written FIRST, must be RED | none |
| 1357 | feat(ta-diag): implement `TaDiag` + `getOhlcvRowCountFn` in `assembleEveningSummary.ts` | 1356 |

## Test File Specification (`src/__tests__/1356-ta-diag.test.ts`)

Line 1 must be: `process.env["DB_PATH"] = ":memory:";`

`setupTestDb()` must include:
- `watchlist` table (same schema as 1354 test)
- `market_prices` table (same schema as 1354 test)
- `rag_analyses` table (same schema as 1354 test)
- `alerts` table (same schema as 1354 test)
- `prediction_signals` table (same schema as 1354 test)
- `daily_ohlcv` table — required new addition:

```sql
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  date       TEXT NOT NULL,
  open       REAL,
  high       REAL,
  low        REAL,
  close      REAL NOT NULL,
  volume     REAL,
  UNIQUE(code, date)
);
```

Injection pattern: mirrors 1354 (`getPredictionSignalsFn`). Inject both `computeTaFn` and `getOhlcvRowCountFn` as pure functions — no `mock.module`.

AC mapping to test cases:

| AC | Test description | `getOhlcvRowCountFn` | `computeTaFn` | Expected |
|---|---|---|---|---|
| AC-1 | 2 tickers, 15+ rows, both signal | returns 15 | returns non-null | `tickersWithSignal:2, tickersBelowThreshold:0, ohlcvRowsMin>=15, ohlcvRowsMax>=15` |
| AC-2 | 2 tickers, 3 rows each, no signal | returns 3 | returns null | `tickersWithSignal:0, tickersBelowThreshold:2, ohlcvRowsMin:3, ohlcvRowsMax:3` |
| AC-3 | ticker A: 20 rows + signal; ticker B: 5 rows + null | returns 20/5 | returns signal/null | `tickersWithSignal:1, tickersBelowThreshold:1, ohlcvRowsMin:5, ohlcvRowsMax:20` |
| AC-4 | `computeTaFn` always throws | returns 0 | throws | `taDiag` all zeros, no crash, `taSummary:[]` |

AC-5 (Telegram untouched) is a code-review AC — no test case needed in this file.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Inner try/catch scope mismatch — `rowCountFn` throw skips signal count | Medium | Medium | Widen inner try to wrap both calls; push(0) to rowCounts in catch |
| `Math.min(...rowCounts)` throws when rowCounts is empty (spread of empty array) | Low | Low | Guard with `rowCounts.length > 0` before spread — return 0 otherwise |
| `taDiag` field absent from `EveningSummary` JSON if object literal not updated | Low | High | Add `taDiag` to the `summary` object literal in Step 6 alongside `predictionDiag` |
| `bun tsc` fails if `TaDiag` not exported | Low | High | Export keyword on interface declaration from day 1 |

## Security Review

- SQL parameterized: yes — `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?` uses `.get(code)`
- File paths validated: n/a — no new file paths introduced
- External HTTP: n/a — SQLite only
- Secrets via `Bun.env`: n/a — no new env vars
