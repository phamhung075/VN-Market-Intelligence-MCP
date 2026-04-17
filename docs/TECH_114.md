# TECH-114: TA Fallback — Intraday History When Daily OHLCV Insufficient

status: APPROVED_BY_ARCHITECT
req_ref: REQ-114

## Brownfield Impact

- Files modified: `src/application/usecases/assembleBriefing.ts`
- Files created: `src/__tests__/1342-ta-fallback-intraday.test.ts`
- Files deleted: none
- Breaking changes: no — function signature of `defaultComputeTa(code, db)` and return type `TaSignal | null` are unchanged; `computeTaFn` injection point in `assembleBriefing` options is unchanged

## Architecture Decision

The entire change is confined to `defaultComputeTa()` in `assembleBriefing.ts`. Adding a second SELECT branch inside an existing application-layer function is the minimum-surface fix: it reuses the existing `CandleRow` interface, the existing `computeRSI` / `computeMA` helpers, and the existing `idx_mph_code_fetched` index. No new types, no new files outside of the mandatory TDD test file, no new domain services.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
| --- | --- | --- | --- |
| `defaultComputeTa` fallback branch | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| TDD test 1342 | test | `src/__tests__/1342-ta-fallback-intraday.test.ts` | NEW |

## Interface Contracts

### No new interfaces

`CandleRow` (already declared in `assembleBriefing.ts` at line 291) is reused as-is:

```typescript
interface CandleRow {
  day: string;
  close_price: number;
}
```

The fallback SQL aliases `DATE(fetched_at) AS day` and `MAX(price) AS close_price` to produce the identical shape without a new type.

### Modified function: `defaultComputeTa`

Signature unchanged:

```typescript
export function defaultComputeTa(code: string, db: Database): TaSignal | null
```

Two-path logic after modification:

```
1. Query daily_ohlcv ORDER BY date ASC LIMIT 60
2. IF rows.length >= 15  →  primary path (current behaviour, unchanged)
3. ELSE
   a. Query market_prices_history GROUP BY DATE(fetched_at) ORDER BY day ASC LIMIT 60
   b. IF distinct day count < 15  →  return null
   c. ELSE  →  fallback path: compute RSI + MA on synthetic closes
              currentPrice = last row's close_price
              return TaSignal (same shape as primary path)
```

### Fallback SQL (parameterized, single argument)

```sql
SELECT DATE(fetched_at) AS day,
       MAX(price)       AS close_price
  FROM market_prices_history
 WHERE code = ?
 GROUP BY DATE(fetched_at)
 ORDER BY day ASC
 LIMIT 60
```

Notes:
- `MAX(price)` is the close proxy (REQ business rule — not AVG).
- `DATE(fetched_at)` on UTC ISO-8601 text is correct for VN trading hours (09:00–14:30 ICT = 02:00–07:30 UTC, all intra-day ticks share the same UTC calendar date).
- `LIMIT 60` mirrors the primary path cap.
- The existing `idx_mph_code_fetched` index on `(code, fetched_at DESC)` covers the `WHERE code = ?` + `GROUP BY DATE(fetched_at)` plan — no new index needed.

## Task Breakdown

Dependency order is non-negotiable (TDD-first):

| # | Task ID | Description | Depends on |
| --- | --- | --- | --- |
| 1 | 1342 | Write `src/__tests__/1342-ta-fallback-intraday.test.ts` with TC-1..TC-4 all FAILING | — |
| 2 | 1343 | Modify `defaultComputeTa` in `assembleBriefing.ts` to add fallback branch | 1342 committed |

### TC matrix for task 1342

| TC | daily_ohlcv rows | market_prices_history days | Expected |
| --- | --- | --- | --- |
| TC-1 | 15+ | any | Primary path; non-null TaSignal |
| TC-2 | 14 | 15+ distinct dates | Fallback path; non-null TaSignal |
| TC-3 | 0 | 0 | null |
| TC-4 | 0 | 14 distinct dates | null |

Seeding contract for TC-2: 14 rows in `daily_ohlcv` + 15 synthetic days in `market_prices_history` (multiple ticks per day, strictly increasing `price` across days so RSI > 70 → overbought → signal is non-neutral and appears in `taSummary`).

Seeding contract for TC-1: seed `daily_ohlcv` with 20 rows (strictly increasing closes), assert `market_prices_history` is never needed (leave it empty).

### Test file structure

Follow the pattern established in `src/__tests__/1330-ta-daily-ohlcv.test.ts`:
- `process.env["DB_PATH"] = ":memory:"` at top
- `buildDb()` helper creates all required tables including `market_prices_history` with schema `(code TEXT, price REAL, fetched_at TEXT, PRIMARY KEY (code, fetched_at))`
- `seedOhlcv(db, code, n)` helper for `daily_ohlcv`
- New `seedIntradayTicks(db, code, days, ticksPerDay)` helper for `market_prices_history`
- Import and call `defaultComputeTa` directly (not through `assembleBriefing`) for surgical assertions
- `describe("1342 — defaultComputeTa fallback to market_prices_history", ...)`

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| `market_prices_history` table absent in some test DB setups | Low | Medium | Existing `1330-ta-daily-ohlcv.test.ts` already includes the table in `buildDb()` — confirm new test mirrors it |
| Fallback branch silently taken even after `daily_ohlcv` reaches 15 rows | Low | High | Guard is `< 15` strict — once `daily_ohlcv` hits exactly 15 the primary path runs; TC-1 explicitly covers this boundary |
| `DATE(fetched_at)` on non-ISO text yields NULL groups | Low | Medium | VPS writes ISO-8601 UTC — covered by edge-case note in REQ-114; no additional guard needed |
| RSI computed on < 15 fallback rows slipping through | Low | High | `if (fallbackRows.length < 15) return null` guard mirrors primary path guard exactly |
| New branch triggers TypeScript `strict` error | Low | Low | `CandleRow` type is already inferred via `.query<CandleRow, [string]>` — same pattern reused |

## Security Review

- [ ] SQL parameterized? **Yes** — `WHERE code = ?` with `.all(code)`
- [ ] File paths validated (no `../`)? **N/A** — no file I/O in this change
- [ ] External HTTP rate-limited? **N/A** — read-only SQLite query
- [ ] Secrets via Bun.env only? **N/A** — no secrets involved
