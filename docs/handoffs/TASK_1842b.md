# TASK 1842b — OHLCV Historical Backfill + Repository Interfaces

> **Sprint:** 1842 | **Task ID:** 1842b | **Type:** SPRINT-M
> **Owner:** developer | **Created by:** pm | **Date:** 2026-05-03
> **Priority:** P0 — blocks 1842c, 1842d, 1842e
> **Depends on:** 1842a (DONE)

---

## Context

The architect's data audit (1842a) confirmed that `daily_ohlcv` contains only 2 days of data (2026-04-23 to 2026-04-24, 111 tickers). No 2025 history exists. All backtesting is blocked until a historical OHLCV backfill is executed.

This is the critical-path task for U-8. Nothing in 1842c, 1842d, or 1842e can be validated until this task produces >50,000 rows in `daily_ohlcv`.

Architecture reference: `docs/architecture/1842a-backtesting-engine.md`

---

## Scope

### Files to Create

```
apps/mcp-server/src/
  domain/
    repositories/
      IBacktestSignalRepository.ts      — port: fetch signals by strategy + date range
      IBacktestPriceRepository.ts       — port: fetch OHLCV candles + getClosePriceOnOrAfter
      IBacktestResultRepository.ts      — port: persist + query backtest run records
    backtesting/
      signalNormalizer.ts               — VI→EN signal normalization (pure function)
  infrastructure/
    db/
      backtestPriceRepo.ts              — SQLite impl of IBacktestPriceRepository
      backtestSignalRepo.ts             — SQLite impl of IBacktestSignalRepository (with VI→EN normalization)
      backtestResultRepo.ts             — SQLite impl of IBacktestResultRepository
      schema-backtesting.ts             — DDL: backtest_runs table
    fetchers/
      ohlcvBackfill.ts                  — VNDirect historical OHLCV fetcher + backfill orchestrator
  __tests__/
    1842b-ohlcv-backfill.test.ts        — unit + integration tests (in-memory SQLite)
```

### Files to Modify

```
apps/mcp-server/src/domain/repositories/index.ts   — export the 3 new interfaces
apps/mcp-server/src/infrastructure/db/index.ts     — export the 3 new repo impls (if barrel exists)
```

---

## Detailed Specifications

### 1. Domain Interfaces

Copy exact TypeScript interfaces from `docs/architecture/1842a-backtesting-engine.md` Sections 2.1, 2.2, and 2.3. Do not deviate — these are the contracts 1842d will import.

Key notes:
- `IBacktestPriceRepository.getCandles()` returns `DailyCandle[]` sorted ASC — empty array when no data (not null, not error)
- `IBacktestPriceRepository.getClosePriceOnOrAfter()` returns `{ date, close } | null`
- `IBacktestSignalRepository.getSignals()` returns signals with `direction` already normalised to English
- `IBacktestResultRepository` is Phase 1 interface only — SQLite impl must be written but will be wired into the use case in 1842d/1842e

### 2. Signal Normalizer (`signalNormalizer.ts`)

Pure function — zero imports from infrastructure. Location: `domain/backtesting/signalNormalizer.ts`.

```typescript
export type TradingSignalDirection = "BUY" | "SELL" | "HOLD" | "WAIT";

export function normalizeSignal(raw: string): TradingSignalDirection {
  const upper = raw.toUpperCase().trim();
  if (upper.startsWith("MUA")) return "BUY";
  if (upper.startsWith("BAN")) return "SELL";
  if (upper.startsWith("GIU")) return "HOLD";
  if (upper.startsWith("THAN TRONG")) return "WAIT";
  if (upper.startsWith("CHO")) return "WAIT";
  // pass-through for already-English signals
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
  if (upper === "HOLD") return "HOLD";
  if (upper === "WAIT") return "WAIT";
  return "WAIT"; // fallback — unknown signals become WAIT (no trade generated)
}
```

### 3. Schema — `schema-backtesting.ts`

DDL for `backtest_runs` table. Must use `CREATE TABLE IF NOT EXISTS`. The schema must be idempotent — safe to run on startup every time.

```sql
CREATE TABLE IF NOT EXISTS backtest_runs (
  id TEXT PRIMARY KEY,
  strategy TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  run_at TEXT NOT NULL,
  total_return REAL NOT NULL,
  benchmark_return REAL,
  max_drawdown REAL NOT NULL,
  sharpe_ratio REAL,
  win_rate REAL NOT NULL,
  trade_count INTEGER NOT NULL,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy ON backtest_runs(strategy);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_run_at ON backtest_runs(run_at DESC);
```

Wire the DDL into the existing schema initialisation sequence (wherever `CREATE TABLE IF NOT EXISTS` statements are executed on startup for `market.db`).

### 4. OHLCV Backfill Fetcher (`ohlcvBackfill.ts`)

**Data source:** VNDirect API — same API already used by `hose.ts`. Check how `hose.ts` calls VNDirect and use the same base URL + auth pattern.

**VNDirect OHLCV endpoint pattern (confirmed working in codebase):**
```
GET https://finfo-api.vndirect.com.vn/v4/stock_prices?
  code=<TICKER>
  &sort=date&size=<N>&page=1
  &fromDate=<YYYY-MM-DD>&toDate=<YYYY-MM-DD>
```

**Backfill parameters:**
- Tickers: all tickers currently in `daily_ohlcv` (111 tickers) + `VNINDEX`
- Date range: 2024-01-01 to today
- Upsert strategy: `INSERT OR IGNORE INTO daily_ohlcv` (idempotent — safe to re-run)
- Rate limiting: 200ms delay between ticker requests to avoid VNDirect 429
- Resume logic: before fetching a ticker, check `SELECT MIN(date), MAX(date), COUNT(*) FROM daily_ohlcv WHERE code = ?`. If count > 100 and MIN(date) <= '2024-01-15', skip (already backfilled). This allows restart without re-fetching completed tickers.
- VNI: fetch `VNINDEX` with same parameters, store under `code = 'VNINDEX'`

**Exported function signature:**
```typescript
export async function runOhlcvBackfill(db: Database, options?: {
  fromDate?: string;  // default "2024-01-01"
  toDate?: string;    // default today YYYY-MM-DD
  delayMs?: number;   // default 200
}): Promise<{ fetched: number; skipped: number; errors: string[] }>
```

**Error handling:**
- Per-ticker errors are caught and added to `errors[]` — one bad ticker does not abort the whole backfill
- Log progress every 10 tickers: `console.log(`[ohlcvBackfill] ${i}/${total} — ${ticker}`)`
- Final summary logged: `[ohlcvBackfill] Complete: ${fetched} fetched, ${skipped} skipped, ${errors.length} errors`

### 5. SQLite Repository Implementations

**`backtestPriceRepo.ts`** — implements `IBacktestPriceRepository`:
- Constructor: `constructor(private db: Database)` — no `getDb()` calls
- `getCandles(code, startDate, endDate)`: `SELECT date, open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date >= ? AND date <= ? ORDER BY date ASC`
- `getClosePriceOnOrAfter(code, targetDate)`: `SELECT date, close FROM daily_ohlcv WHERE code = ? AND date >= ? ORDER BY date ASC LIMIT 1`

**`backtestSignalRepo.ts`** — implements `IBacktestSignalRepository`:
- Constructor: `constructor(private db: Database)`
- `getSignals(strategy, startDate, endDate)`: queries `kinhdich_readings`, applies `normalizeSignal()` on the direction/signal field, returns only `BUY` and `SELL` after normalization (skip HOLD/WAIT at this layer), sorted by timestamp ASC
- Signal field in `kinhdich_readings`: check the actual schema to confirm column name for the signal direction. Use `Grep` or `mcp__semble__search` to find the column name before writing the query.

**`backtestResultRepo.ts`** — implements `IBacktestResultRepository`:
- Constructor: `constructor(private db: Database)`
- `saveRun(record)`: `INSERT INTO backtest_runs VALUES (...)` using `record.id` as primary key
- `getRunsByStrategy(strategy, limit)`: `SELECT * FROM backtest_runs WHERE strategy = ? ORDER BY run_at DESC LIMIT ?`
- `getRunById(id)`: `SELECT * FROM backtest_runs WHERE id = ?`

---

## Tests — `1842b-ohlcv-backfill.test.ts`

All tests use in-memory SQLite (`:memory:` — set automatically by test setup via `Bun.env`).

### Required Test Cases

**signalNormalizer (unit, no DB):**
- AC-1: `normalizeSignal("MUA (tich cuc)")` returns `"BUY"`
- AC-2: `normalizeSignal("BAN (tich cuc)")` returns `"SELL"`
- AC-3: `normalizeSignal("GIU (tich cuc)")` returns `"HOLD"`
- AC-4: `normalizeSignal("THAN TRONG (tich cuc)")` returns `"WAIT"`
- AC-5: `normalizeSignal("CHO (tich cuc)")` returns `"WAIT"`
- AC-6: `normalizeSignal("BUY")` returns `"BUY"` (pass-through)
- AC-7: `normalizeSignal("SELL")` returns `"SELL"` (pass-through)
- AC-8: `normalizeSignal("UNKNOWN_SIGNAL")` returns `"WAIT"` (fallback)

**backtestPriceRepo (integration, in-memory SQLite):**
- AC-9: Insert 5 candles for `VCB`, call `getCandles("VCB", "2024-01-01", "2024-12-31")` — returns all 5 sorted ASC
- AC-10: `getCandles` with date range that excludes all rows returns `[]` (no error)
- AC-11: `getClosePriceOnOrAfter("VCB", "2024-06-15")` returns the correct next available date
- AC-12: `getClosePriceOnOrAfter("VCB", "2099-01-01")` returns `null` (no future data)

**backtestSignalRepo (integration, in-memory SQLite):**
- AC-13: Insert 3 `kinhdich_readings` rows with Vietnamese signals, call `getSignals("kinh-dich-high-confidence", startDate, endDate)` — returns rows with English directions
- AC-14: `HOLD`/`WAIT` signals are not returned by `getSignals` (filtered at repo layer)

**backtestResultRepo (integration, in-memory SQLite):**
- AC-15: `saveRun(record)` + `getRunById(record.id)` returns the same record
- AC-16: `getRunsByStrategy("kinh-dich-high-confidence", 5)` returns most-recent-first

**Total: 16 ACs**

---

## Acceptance Criteria

- [ ] AC-1..8: signalNormalizer handles all Vietnamese variants + pass-through + fallback
- [ ] AC-9..12: backtestPriceRepo returns correct candle ranges and handles sparse data
- [ ] AC-13..14: backtestSignalRepo normalises Vietnamese signals + filters HOLD/WAIT
- [ ] AC-15..16: backtestResultRepo round-trip save/retrieve works
- [ ] AC-17: `SELECT COUNT(*) FROM daily_ohlcv` returns > 50,000 rows after `runOhlcvBackfill` completes (verify via a manual MCP call or a one-off script — not a test assertion, a post-deploy validation)
- [ ] AC-18: Zero `getDb()` calls in any new domain or infrastructure file
- [ ] AC-19: `bun test` passes with 16/16 new tests + total suite unchanged fail count
- [ ] AC-20: `tsc --noEmit` passes clean

---

## Constraints

- Zero `getDb()` calls in new code — follow U-4 pattern (inject `Database` via constructor)
- Read-only path for all non-backfill code — `IBacktestPriceRepository` and `IBacktestSignalRepository` have no write methods
- VNDirect fetch: always use browser User-Agent header (Vietnamese sites block bots)
- Upsert must be idempotent (`INSERT OR IGNORE`) — safe to re-run backfill multiple times
- MCP tool return format: `{ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }`

---

## Dev Notes

- Check `hose.ts` (infrastructure/fetchers/) for the exact VNDirect API call pattern + headers before writing `ohlcvBackfill.ts`
- Check `kinhdich_readings` schema before writing `backtestSignalRepo.ts` (confirm column name for signal direction)
- The `daily_ohlcv` table DDL is in `schema-market-data.ts` — confirm column names before writing queries
- Tool #120 is reserved for `run_backtest` — do NOT register any new MCP tool in this task (that is 1842d's job)

---

## Commit Message

```
task(1842b): OHLCV backfill + 3 repository interfaces + signal normalizer

- ohlcvBackfill.ts: VNDirect 2-year history fetch, 200ms delay, idempotent upsert
- schema-backtesting.ts: backtest_runs DDL
- IBacktestSignalRepository, IBacktestPriceRepository, IBacktestResultRepository
- backtestPriceRepo, backtestSignalRepo, backtestResultRepo (SQLite impls)
- signalNormalizer: VI→EN (MUA→BUY, BAN→SELL, GIU→HOLD, etc.)
- 16 tests pass
```

---

## Return Format

```
DONE: [files created, test count, backfill row count]
NEXT: qa | review 1842b
HANDOFF: docs/handoffs/TASK_1842b.md
PIPELINE: continue
PIPELINE_STATE_WRITE: written — status=in_progress, nextAgent=qa, activeTaskId=1842b
```
