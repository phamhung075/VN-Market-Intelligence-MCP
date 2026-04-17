# TECH-107: fix(ta): defaultComputeTa reads daily_ohlcv instead of market_prices_history

status: APPROVED_BY_ARCHITECT
req_ref: REQ-107

## Brownfield Impact

- Files modified: `src/application/usecases/assembleBriefing.ts`
- Files created: `src/__tests__/1330-ta-daily-ohlcv.test.ts`
- Files deleted: none
- Breaking changes: no — function signature `(code, db) → TaSignal | null` is unchanged; `CandleRow` is internal; column aliases `day` / `close_price` are preserved in the SELECT so no downstream destructuring breaks

## Architecture Decision

`defaultComputeTa` currently aggregates intraday ticks from `market_prices_history` (`AVG(price) GROUP BY date(fetched_at)`) to simulate a daily close, but production only holds ~1 day of ticks, so the 15-row guard always fires and `taSummary` is always empty. The fix swaps the source to `daily_ohlcv`, which is populated by the VPS price-fetch service and already holds official daily close prices, eliminating the aggregation entirely. All TA math (`computeRSI`, `computeMA`) and downstream consumers (`assembleEveningSummary`, `eveningSummaryJob`) are untouched.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `defaultComputeTa` query | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| `CandleRow` jsdoc comment | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| TDD test suite (task 1331) | test | `src/__tests__/1330-ta-daily-ohlcv.test.ts` | NEW |

## Interface Contracts

### `CandleRow` (internal alias — no change to shape, only comment update)

```typescript
/** Internal: one daily price row — day TEXT, close_price REAL. */
interface CandleRow {
  day: string;
  close_price: number;
}
```

The SELECT aliases (`AS day`, `AS close_price`) are preserved so the interface requires zero change.

### `defaultComputeTa` — production query replacement

Old query (remove):
```sql
SELECT date(fetched_at) AS day, AVG(price) AS close_price
  FROM market_prices_history
 WHERE code = ?
   AND fetched_at >= datetime('now', ?)
 GROUP BY date(fetched_at)
 ORDER BY day ASC
```
Called with params `[code, "-60 days"]`, type `[string, string]`.

New query (replace with):
```sql
SELECT date AS day, close AS close_price
  FROM daily_ohlcv
 WHERE code = ?
 ORDER BY date ASC
 LIMIT 60
```
Called with params `[code]`, type `[string]`. Change generic type on `db.query<CandleRow, [string]>`.

No change to: null guard `rows.length < 15`, `computeRSI`, `computeMA`, classification logic, return type.

## Task Breakdown (for PM)

Dependency order — task 1331 MUST land (tests red) before task 1330 applies the fix:

| Order | Task | Description | Depends on |
|---|---|---|---|
| 1 | 1331 | Create `src/__tests__/1330-ta-daily-ohlcv.test.ts` with TC-1..TC-4; confirm TC-3 and TC-4 are RED | — |
| 2 | 1330 | Replace query in `defaultComputeTa`; update `CandleRow` jsdoc; confirm all 4 TC green | 1331 |

Both tasks share branch `task/1330-1331-ta-daily-ohlcv`.

## Test Specification (task 1331)

File: `src/__tests__/1330-ta-daily-ohlcv.test.ts`

Setup helper:
- In-memory SQLite with `daily_ohlcv` table matching production schema: `(code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, updated_at TEXT, PRIMARY KEY(code, date))`
- Seed helper: insert N rows for a given code with deterministic close prices

| TC | Precondition | Input | Expected | Red before fix? |
|---|---|---|---|---|
| TC-1 | `daily_ohlcv` has 0 rows for `VCB` | `defaultComputeTa("VCB", db)` | `null` | no — current code also returns null (guard hits from wrong table) |
| TC-2 | `daily_ohlcv` has 14 rows for `VCB` | `defaultComputeTa("VCB", db)` | `null` | no — same |
| TC-3 | `daily_ohlcv` has 20 rows for `VCB`, `close` values `80000..90000` | `defaultComputeTa("VCB", db)` | non-null `TaSignal`, all fields defined | YES — current code queries wrong table, returns null |
| TC-4 | Last close > MA20 across 20 rows (strictly increasing series) | `defaultComputeTa("VCB", db)` | `priceVsMa20 === "above"` | YES — same reason |

TC-3 and TC-4 must be confirmed RED before task 1330 is applied (run `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts`).

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `daily_ohlcv` empty in production on a non-trading day | Low | Low | Guard `rows.length < 15` already returns null cleanly; no crash |
| Index `idx_daily_ohlcv_code_date` is on `(code, date DESC)` but query uses `ORDER BY date ASC` | None | None | Index still covers the WHERE; SQLite uses it for the equality scan on `code`, sort is cheap on 60 rows |
| Generic type parameter change `[string, string]` → `[string]` missed | Low | High (TS error) | `bun tsc --noEmit` gate catches at CI |
| TC-1/TC-2 not going red (they were already passing via the wrong table) | Certain | Low | REQ-107 explicitly notes only TC-3/TC-4 must be confirmed red; TC-1/TC-2 pass for the wrong reason pre-fix and the right reason post-fix |

## Security Review

- SQL parameterized? Yes — `db.query<CandleRow, [string]>(...).all(code)` uses prepared statement binding
- File paths validated (no `../`)? N/A — no file I/O in this path
- External HTTP rate-limited? N/A — pure SQLite read
- Secrets via Bun.env only? N/A — no secrets touched
