# TECH-116: fix(ta-adaptive): Adaptive RSI/MA Periods in defaultComputeTa

status: APPROVED_BY_ARCHITECT
req_ref: REQ-116

## Brownfield Impact

- Files modified: `src/application/usecases/assembleBriefing.ts`
- Files created: `src/__tests__/1346-ta-adaptive-period.test.ts`
- Files deleted: none
- Breaking changes: no — `defaultComputeTa` return type `TaSignal | null` is unchanged; consumers (`assembleBriefing`, `assembleEveningSummary`) pass through without modification

## Architecture Decision

`defaultComputeTa` is a pure application-layer function that delegates math to `computeRSI` and `computeMA` (domain layer). Both domain functions already accept an arbitrary `period` argument and guard internally (`prices.length < period + 1` for RSI, `prices.length < period` for MA) — no domain changes needed. The fix is entirely a call-site change in the application layer: lower the outer guard from 15 to 8 and pass clamped periods instead of hard-coded constants. This is the minimal, lowest-risk change that unblocks production signals on day 8.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| `defaultComputeTa` guard + adaptive periods (primary path) | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| `defaultComputeTa` guard + adaptive periods (fallback path) | application | `src/application/usecases/assembleBriefing.ts` | MODIFY |
| TDD test suite for adaptive logic | application (test) | `src/__tests__/1346-ta-adaptive-period.test.ts` | NEW |

No changes to:
- `src/domain/services/technicalIndicators.ts` — `computeRSI(prices, period)` and `computeMA(prices, period)` already accept any period; their internal guards remain correct
- `src/application/usecases/assembleEveningSummary.ts` — imports `defaultComputeTa` by reference; inherits fix automatically
- All scheduler, interface, and infrastructure files

## Interface Contracts

### `defaultComputeTa` — existing signature, unchanged

```typescript
export function defaultComputeTa(code: string, db: Database): TaSignal | null
```

### Internal logic change (primary path — task 1347)

```typescript
// BEFORE
if (rows.length < 15) { /* fallback */ }
const rsi14 = computeRSI(prices, 14);
const ma20  = computeMA(prices, 20);

// AFTER
if (rows.length < 8) { /* fallback */ }
const rsi14 = computeRSI(prices, Math.min(14, rows.length - 1));
const ma20  = computeMA(prices, Math.min(20, rows.length));
```

### Internal logic change (fallback path — task 1347)

```typescript
// BEFORE
if (fallbackRows.length < 15) return null;
rows = fallbackRows;
// ... then uses hard-coded periods 14 / 20

// AFTER
if (fallbackRows.length < 8) return null;
rows = fallbackRows;
// ... then uses Math.min(14, rows.length - 1) / Math.min(20, rows.length)
```

Note: the adaptive period expressions are evaluated **after** `rows` is assigned (either primary or fallback), so a single pair of `Math.min` expressions covers both paths.

### Period boundary table

| `rows.length` | RSI period (`Math.min(14, n-1)`) | MA period (`Math.min(20, n)`) | Result |
|---|---|---|---|
| < 8 | — | — | `null` |
| 8 | 7 | 8 | `TaSignal` |
| 9 | 8 | 9 | `TaSignal` |
| 14 | 13 | 14 | `TaSignal` |
| 15 | 14 | 15 | `TaSignal` |
| >= 20 | 14 | 20 | `TaSignal` (standard — unchanged) |

## Task Breakdown (for PM)

Dependency order — task 1346 must be committed to main before task 1347 begins (TDD red-green cycle):

| Task | Title | Layer | Depends on |
|---|---|---|---|
| 1346 | test(ta-adaptive): write `1346-ta-adaptive-period.test.ts` against pre-fix code — TC-2 and TC-3 must fail | application (test) | — |
| 1347 | fix(ta-adaptive): lower guard to 8, apply adaptive `Math.min` for RSI + MA periods in `defaultComputeTa` | application | 1346 |

### Task 1346 — test file specification

File: `src/__tests__/1346-ta-adaptive-period.test.ts`

Test structure mirrors `1342-ta-fallback-intraday.test.ts`:
- `buildDb()` helper: in-memory SQLite, same DDL as 1342 (includes `daily_ohlcv`, `market_prices_history`)
- `seedOhlcv(db, code, n, basePrice, step)` helper: inserts `n` rows with strictly increasing closes
- Import: `import { defaultComputeTa } from "../application/usecases/assembleBriefing.js"`

| TC | Seed | Pre-fix behaviour | Post-fix behaviour |
|---|---|---|---|
| TC-1 | 10 rows in `daily_ohlcv` | `null` (< 15 guard) — FAILS | non-null `TaSignal`, RSI period 9, MA period 10 |
| TC-2 | 7 rows in `daily_ohlcv` | `null` (< 15 guard) — FAILS | non-null `TaSignal`, RSI period 6, MA period 7 |
| TC-3 | 6 rows in `daily_ohlcv` | `null` | `null` (below 8 guard) |
| TC-4 | 20 rows in `daily_ohlcv` | non-null `TaSignal` | non-null `TaSignal` (identical — regression guard) |

TC-1 and TC-2 fail before the fix (pre-fix guard is `< 15`), pass after.
TC-3 and TC-4 pass both before and after.

### Task 1347 — exact code change

Only two lines change in `defaultComputeTa` in `src/application/usecases/assembleBriefing.ts`:

1. Line `if (rows.length < 15)` → `if (rows.length < 8)`
2. Line `if (fallbackRows.length < 15) return null;` → `if (fallbackRows.length < 8) return null;`
3. Line `const rsi14 = computeRSI(prices, 14);` → `const rsi14 = computeRSI(prices, Math.min(14, rows.length - 1));`
4. Line `const ma20 = computeMA(prices, 20);` → `const ma20 = computeMA(prices, Math.min(20, rows.length));`

Update JSDoc on `defaultComputeTa`: change "fewer than 15 candles" to "fewer than 8 candles".

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| TC-3 in task 1342 currently asserts `null` for 5-day fallback — new guard (< 8) keeps that assertion true, but must verify 5 < 8 holds | Low | Low | 5 < 8 — confirmed safe; no change to 1342 tests |
| TC-2 in task 1330 asserts `null` for 14-row `daily_ohlcv` — after fix, 14 >= 8 → non-null; that test will now FAIL | Medium | Medium | Task 1347 must update TC-2 in `1330-ta-daily-ohlcv.test.ts` to expect non-null (14 rows is valid after fix). Add to task 1347 scope. |
| RSI computed with period 7 on monotone-increasing data → returns 100 (all gains); rsiStatus = "overbought" on new tickers — correct but may surprise users | Low | Low | Documented in REQ-116 edge cases; no action needed |
| `Math.min(14, rows.length - 1)` when `rows.length = 8` gives period 7; `wilderEma` needs 7 deltas from 8 prices — confirmed sufficient | Low | None | Verified against `computeRSI` internal guard: `prices.length < period + 1` → `8 < 8` = false — passes |

## Security Review

- SQL parameterized: yes — existing `db.query<CandleRow, [string]>(…).all(code)` unchanged
- File paths validated: N/A — no file I/O in this function
- External HTTP: N/A — no network calls
- Secrets via Bun.env: N/A
