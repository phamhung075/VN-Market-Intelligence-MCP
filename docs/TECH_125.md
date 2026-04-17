# TECH-125: France Morning Briefing — TA Signal Detail

status: APPROVED_BY_ARCHITECT
req_ref: REQ-125

## Brownfield Impact

- Files modified: `src/scheduler/franceSummaryJob.ts`
- Files created: `src/__tests__/1364-france-ta-detail.test.ts`
- Files deleted: none
- Breaking changes: yes — `formatFranceSummaryVI` signature changes (4th arg `taCount: number` → `taSignals: TaSignalRow[]`); `FranceSummaryResult.taCount` replaced by `FranceSummaryResult.taSignals: TaSignalRow[]`. Only internal callers exist (no external MCP tool calls this formatter), so no API surface breaks.

## Architecture Decision

`franceSummaryJob.ts` lives in the scheduler/interface layer and already imports from `infrastructure/` (DB, logger). `defaultComputeTa` and `TaSignal` live in `application/usecases/assembleBriefing.ts`. The scheduler layer may import from application, so pulling `TaSignal` and `defaultComputeTa` into `franceSummaryJob.ts` via a direct import is DDD-legal. A thin local `TaSignalRow` type (subset of `TaSignal`) avoids a runtime dependency on the full `assembleBriefing` module at cron init time — only `defaultComputeTa` is imported as a function reference, lazily.

`fetchTaSignals()` replaces `fetchTaSignalCount()` as the sole TA query path: it reads the `watchlist` table for codes, calls `defaultComputeTa` per ticker (same fallback logic already in assembleBriefing), filters non-neutral, sorts by RSI deviation from 50 descending, and caps at 3. `formatFranceSummaryVI` replaces the count line with a 1-line-per-ticker block using Vietnamese terms ("qua mua" / "qua ban").

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `TaSignalRow` type | scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `fetchTaSignals()` | scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY (replaces `fetchTaSignalCount`) |
| `formatFranceSummaryVI` | scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `FranceSummaryResult` | scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| `runFranceSummary` | scheduler | `src/scheduler/franceSummaryJob.ts` | MODIFY |
| TDD test file | test | `src/__tests__/1364-france-ta-detail.test.ts` | NEW |

Import chain (legal): `scheduler/franceSummaryJob.ts` → `application/usecases/assembleBriefing.js` (dynamic import of `defaultComputeTa`) + `domain/services/technicalIndicators.js` (via assembleBriefing — transitive, not direct).

## Interface Contracts

### Modified: `TaSignalRow` (new local type in franceSummaryJob.ts)

```typescript
/** Subset of TaSignal — only fields needed for France briefing display. */
export interface TaSignalRow {
  code: string
  rsi14: number | null
  rsiStatus: "overbought" | "oversold" | "neutral"
  priceVsMa20: "above" | "below" | "neutral"
  ma20: number | null
}
```

### Modified: `FranceSummaryResult`

```typescript
export interface FranceSummaryResult {
  sent: boolean
  moverCount: number
  alertCount: number
  /** Top-3 non-neutral TA signals (replaces taCount). */
  taSignals: TaSignalRow[]
}
```

### Modified: `formatFranceSummaryVI` signature

```typescript
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[],   // was: taCount: number
): string
```

TA section output:

- When `taSignals.length > 0`:
  ```
  Tin hieu ky thuat (top 3):
    VHM: qua mua (RSI 78.2) — gia tren MA20
    HPG: qua ban (RSI 24.5) — gia duoi MA20
  ```
- When `taSignals.length === 0`: `Khong co tin hieu ky thuat`

Vietnamese label mapping:

| rsiStatus | label |
|-----------|-------|
| overbought | "qua mua" |
| oversold | "qua ban" |
| neutral | (omit RSI label; show MA20 only) |

| priceVsMa20 | label |
|-------------|-------|
| above | "gia tren MA20" |
| below | "gia duoi MA20" |
| neutral | (omit MA20 label) |

### New: `fetchTaSignals()` helper (private)

```typescript
function fetchTaSignals(
  db: Database,
  computeTaFn?: (code: string, db: Database) => TaSignal | null,
): TaSignalRow[]
```

Logic:
1. `SELECT code FROM watchlist ORDER BY code` — same pattern as `assembleBriefing` watchlist query.
2. For each code: call `computeTaFn(code, db)` (defaults to `defaultComputeTa` — dynamic import).
3. Filter: keep rows where `rsiStatus !== "neutral" || priceVsMa20 !== "neutral"`.
4. Sort: `Math.abs((rsi14 ?? 50) - 50)` descending (most extreme first).
5. Slice top 3.
6. Returns `TaSignalRow[]` (cast from `TaSignal` subset).
7. Entire function wrapped in try/catch — returns `[]` on any error (per-query isolation pattern).

### Modified: `runFranceSummary` options

```typescript
export interface FranceSummaryOptions {
  db?: Database
  sendFn?: SendFn
  nowFn?: () => Date
  /** Injectable TA compute fn for TDD (defaults to defaultComputeTa). */
  computeTaFn?: (code: string, db: Database) => TaSignalRow | null
}
```

Silent-skip condition update: `movers.length === 0 && alerts.length === 0 && taSignals.length === 0` — same semantics, field name changes.

## Task Breakdown

| Task | Description | Depends on |
|------|-------------|------------|
| 1364 | TDD: write `src/__tests__/1364-france-ta-detail.test.ts` — 4 AC tests, all RED | none |
| 1365 | Impl: modify `franceSummaryJob.ts` per contracts above — all 4 AC tests go GREEN | 1364 RED |

### Task 1364 — Test file structure

File: `src/__tests__/1364-france-ta-detail.test.ts`

```
Line 1: process.env["DB_PATH"] = ":memory:"
```

DB helper must create tables: `market_prices`, `alerts`, `market_messages`, `watchlist`, `daily_ohlcv`.

`watchlist` DDL (min):
```sql
CREATE TABLE IF NOT EXISTS watchlist (
  code TEXT PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT 'unknown'
)
```

`daily_ohlcv` DDL (matches schema.ts):
```sql
CREATE TABLE IF NOT EXISTS daily_ohlcv (
  code TEXT NOT NULL, date TEXT NOT NULL,
  open REAL NOT NULL, high REAL NOT NULL,
  low REAL NOT NULL, close REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (code, date)
)
```

Four test cases:

| AC | Test description | Setup | Assert |
|----|-----------------|-------|--------|
| AC-1 | `formatFranceSummaryVI` with 1 overbought signal | call directly with `taSignals=[{code:"VHM",rsiStatus:"overbought",rsi14:78.2,priceVsMa20:"above",ma20:null}]` | `msg.includes("VHM")` && `msg.includes("qua mua")` |
| AC-2 | `formatFranceSummaryVI` with empty signals | call directly with `taSignals=[]` | `msg.includes("Khong co tin hieu ky thuat")` |
| AC-3 | `runFranceSummary` with ≥8 daily_ohlcv rows for VHM | seed watchlist(VHM) + 10 daily_ohlcv rows ascending close 50000..59000; inject `computeTaFn` returning overbought signal | sent message contains "VHM" + ("qua mua" or "qua ban" or "tren MA20" or "duoi MA20") |
| AC-4 | `runFranceSummary` with empty daily_ohlcv | seed market_prices mover; inject `computeTaFn` returning null | no crash, `result.sent === true`, message contains "Khong co tin hieu ky thuat" |

AC-3 and AC-4 must inject `computeTaFn` via `FranceSummaryOptions` to avoid depending on `daily_ohlcv` RSI math in the scheduler test — the TA math is already tested in assembleBriefing tests. The test verifies the plumbing, not the indicator math.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Old test AC5 (`taCount`) breaks — 1316 test checks `result.taCount` shape | High | Medium | Task 1365 must update `FranceSummaryResult` and the 1316 test's AC1/AC5/AC11 references from `taCount` to `taSignals.length` |
| `watchlist` table absent in prod on first boot | Low | Low | `fetchTaSignals` wrapped in try/catch, returns `[]` fail-open |
| Dynamic import of `defaultComputeTa` adds latency | Low | None | Import is cached by Bun after first call; cron runs once/day |
| `computeTaFn` type mismatch (`TaSignal` vs `TaSignalRow`) | Medium | Medium | `TaSignal` is a superset — cast is safe; define `TaSignalRow` to extend the same fields |

## Security Review

- [ ] SQL parameterized? Yes — `watchlist` SELECT uses no user input; `defaultComputeTa` uses `db.query(...).all(code)` parameterized binding
- [ ] File paths validated (no `../`)? n/a — no file I/O in this change
- [ ] External HTTP rate-limited? n/a — no HTTP calls
- [ ] Secrets via Bun.env only? n/a — no secrets touched
