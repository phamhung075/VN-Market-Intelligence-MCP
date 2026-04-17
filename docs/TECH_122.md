# TECH-122: ohlcvDailyAggregatorJob — Daily OHLCV Aggregation Cron

status: APPROVED_BY_ARCHITECT
req_ref: REQ-122

---

## Brownfield Impact

- Files created: `src/scheduler/ohlcvDailyAggregatorJob.ts`, `src/__tests__/1358-ohlcv-daily-aggregator.test.ts`
- Files modified: `src/scheduler/jobs.ts`, `docs/data/cron-registry.json`, `docs/data/project-stats.json`
- Files deleted: none
- Breaking changes: no

---

## Architecture Decision

The job lives entirely in the `scheduler` layer — it reads from `market_prices_history` and writes to `daily_ohlcv` via direct SQLite calls, following the identical dependency-injection pattern established by `ohlcvStartupProbe.ts`. No new domain service or repository interface is needed: the aggregation logic (3 SQL queries per ticker + 1 upsert) is a pure data transformation on existing tables, not domain business logic warranting a separate layer. `ON CONFLICT(code, date) DO UPDATE` is preferred over `INSERT OR REPLACE` to avoid the implicit delete that would cause a brief read-gap on `daily_ohlcv` during the upsert.

---

## Timezone Verification (Edge Case from REQ)

`fetched_at` in `market_prices_history` is written as `new Date().toISOString()` (confirmed in `src/infrastructure/fetchers/hose.ts` line 400, 651). This produces UTC ISO 8601 strings (e.g., `2026-04-17T08:30:00.000Z`). The VN midnight boundary must therefore be computed from UTC epoch arithmetic, not from SQLite `DATE()` (which also uses UTC). The ISO string comparison approach in the REQ SQL contract is correct and safe.

---

## VN Midnight UTC Boundary Algorithm

```
vnDateString  = today in VN (UTC+7):
                  new Date(nowMs + 7*3600*1000).toISOString().slice(0,10)

vnMidnightMs  = Date.parse(vnDateString + "T00:00:00+07:00")
             = Date.parse(vnDateString + "T17:00:00.000Z") (prev UTC day)

windowStart   = new Date(vnMidnightMs).toISOString()    // e.g. "2026-04-16T17:00:00.000Z"
windowEnd     = new Date(nowMs).toISOString()            // e.g. "2026-04-17T09:00:00.000Z"
```

Both boundary strings are compared directly against `fetched_at TEXT` — lexicographic ordering of ISO 8601 UTC strings is identical to chronological ordering, so no `DATE()` SQLite function is needed.

---

## DDD Layer Plan

| Component                  | Layer     | File Path                                              | New/Modify |
| -------------------------- | --------- | ------------------------------------------------------ | ---------- |
| `runOhlcvDailyAggregator`  | scheduler | `src/scheduler/ohlcvDailyAggregatorJob.ts`             | NEW        |
| Cron registration          | scheduler | `src/scheduler/jobs.ts`                                | MODIFY     |
| Cron registry entry        | interface | `docs/data/cron-registry.json`                         | MODIFY     |
| Project stats counter      | interface | `docs/data/project-stats.json`                         | MODIFY     |
| TDD test file              | test      | `src/__tests__/1358-ohlcv-daily-aggregator.test.ts`    | NEW        |

---

## Interface Contracts

### `OhlcvAggregatorDeps` (injectable)

```typescript
export interface OhlcvAggregatorDeps {
  db?:         () => Database;               // factory — returns existing DB instance
  nowMsFn?:    () => number;                 // default: Date.now()
  sendWorkFn?: (msg: string) => Promise<boolean>;
}
```

Note: `db` is a factory `() => Database` (not a `Database` instance directly), consistent with production usage via `getDb()`. Tests pass a factory wrapping an in-memory `Database`.

### `OhlcvAggregatorResult` (return type)

```typescript
export interface OhlcvAggregatorResult {
  tickersProcessed: number;   // watchlist tickers attempted
  rowsWritten:      number;   // daily_ohlcv rows upserted
  tickersSkipped:   number;   // tickers with 0 ticks (holiday / data gap)
  sent:             boolean;  // WORK channel notify sent
}
```

### `runOhlcvDailyAggregator` signature

```typescript
export async function runOhlcvDailyAggregator(
  deps?: OhlcvAggregatorDeps
): Promise<OhlcvAggregatorResult>
```

---

## SQL Contract (parameterized, no string interpolation)

All three queries per ticker share the same `[code, windowStart, windowEnd]` binding pattern.

**Query A — aggregate (MIN/MAX/COUNT):**
```sql
SELECT MIN(price) AS low, MAX(price) AS high, COUNT(*) AS ticks
FROM market_prices_history
WHERE code = ? AND fetched_at >= ? AND fetched_at < ?
```

**Query B — open (earliest tick):**
```sql
SELECT price FROM market_prices_history
WHERE code = ? AND fetched_at >= ? AND fetched_at < ?
ORDER BY fetched_at ASC LIMIT 1
```

**Query C — close (latest tick):**
```sql
SELECT price FROM market_prices_history
WHERE code = ? AND fetched_at >= ? AND fetched_at < ?
ORDER BY fetched_at DESC LIMIT 1
```

**Upsert — preferred form (avoids implicit delete):**
```sql
INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(code, date) DO UPDATE SET
  open       = excluded.open,
  high       = excluded.high,
  low        = excluded.low,
  close      = excluded.close,
  volume     = excluded.volume,
  updated_at = excluded.updated_at
```

Rationale: `INSERT OR REPLACE` deletes then inserts, causing a brief window where concurrent readers see 0 rows. `ON CONFLICT DO UPDATE` is an atomic in-place update. `daily_ohlcv` PRIMARY KEY is `(code, date)`.

---

## Implementation Skeleton

```typescript
// src/scheduler/ohlcvDailyAggregatorJob.ts
import { Database } from "bun:sqlite";

export interface OhlcvAggregatorDeps { ... }
export interface OhlcvAggregatorResult { ... }

export async function runOhlcvDailyAggregator(
  deps?: OhlcvAggregatorDeps
): Promise<OhlcvAggregatorResult> {
  // 1. Resolve db, nowMsFn, sendWorkFn (dynamic import() for production defaults)
  // 2. Compute vnDateString + windowStart + windowEnd from nowMs
  // 3. SELECT code FROM watchlist
  // 4. For each ticker: try { run A/B/C, skip if ticks===0, upsert } catch { warn, continue }
  // 5. Send WORK summary
  // 6. Return OhlcvAggregatorResult
}
```

---

## `jobs.ts` Wiring

```typescript
// Add to imports:
import { runOhlcvDailyAggregator } from './ohlcvDailyAggregatorJob.js'

// Add to CRONS object:
/** ohlcv daily aggregator: 16:00 UTC Mon-Fri (23:00 VN) — task 1359, Sprint 122 */
ohlcvDailyAggregator: Bun.env.CRON_OHLCV_DAILY_AGGREGATOR ?? '0 16 * * 1-5',

// Add cron registration in startScheduler():
cron.schedule(CRONS.ohlcvDailyAggregator, async () => {
  await recordJobRun(getDb(), 'ohlcvDailyAggregatorJob', async () => {
    const result = await runOhlcvDailyAggregator()
    log(`[ohlcv-aggregator] processed=${result.tickersProcessed} written=${result.rowsWritten} skipped=${result.tickersSkipped}`)
    return { rowsWritten: result.rowsWritten }
  })
}, { timezone: 'UTC' })
```

Note: `timezone: 'UTC'` is correct — the cron expression `0 16 * * 1-5` is already expressed in UTC. The job itself handles the VN-timezone date string internally.

---

## `cron-registry.json` Entry (append to `jobs` array)

```json
{
  "schedule": "16:00 UTC M-F (23:00 VN)",
  "name": "ohlcvDailyAggregatorJob",
  "desc": "Aggregate intraday market_prices_history ticks into daily_ohlcv after market close — closes taSummary data gap without manual VPS backfill"
}
```

Update: `schedulerFileCount: 33`

---

## `project-stats.json` Update

```json
"schedulerFileCount": 33
```

---

## TDD Test File: `src/__tests__/1358-ohlcv-daily-aggregator.test.ts`

**Line 1 mandatory:** `process.env["DB_PATH"] = ":memory:";`

**In-memory DB DDL required:**
```sql
CREATE TABLE watchlist (code TEXT PRIMARY KEY);
CREATE TABLE market_prices_history (
  code TEXT, price REAL, volume REAL, exchange TEXT, fetched_at TEXT,
  PRIMARY KEY (code, fetched_at)
);
CREATE TABLE daily_ohlcv (
  code TEXT, date TEXT, open REAL, high REAL, low REAL,
  close REAL, volume REAL, updated_at TEXT,
  PRIMARY KEY (code, date)
);
```

**`nowMsFn` injection:** Pin `nowMs` to a fixed UTC epoch (e.g., `2026-04-17T09:00:00.000Z`) so `vnDateString = "2026-04-17"` and `windowStart = "2026-04-16T17:00:00.000Z"`. Insert ticks with `fetched_at` inside that window.

**4 required test cases (AC-1 through AC-4 from REQ):**

| TC | Given | When | Then |
|----|-------|------|------|
| AC-1 | VCB+FPT each 3 ticks in window | `runOhlcvDailyAggregator()` | 2 rows, correct O/H/L/C/V, date="2026-04-17", result={2,2,0} |
| AC-2 | 1 ticker, 0 ticks in window | `runOhlcvDailyAggregator()` | 0 rows, no throw, result={1,0,1} |
| AC-3 | Existing row for VCB, add 1 later tick | second `runOhlcvDailyAggregator()` | still 1 row, close updated, no UNIQUE error |
| AC-4 | Ticks only in yesterday's window | `runOhlcvDailyAggregator()` with today's nowMs | 0 rows today, result={1,0,1} |

**`sendWorkFn` stub:** Capture calls array. Assert called once when rowsWritten > 0.

---

## Task Breakdown

| Task | Title | Role | Files |
|------|-------|------|-------|
| 1358 | TDD: 4 failing tests (RED phase) | QA | `src/__tests__/1358-ohlcv-daily-aggregator.test.ts` |
| 1359 | Implement job + wire (GREEN phase) | Dev | `src/scheduler/ohlcvDailyAggregatorJob.ts`, `src/scheduler/jobs.ts`, `docs/data/cron-registry.json`, `docs/data/project-stats.json` |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `fetched_at` stored as VN local time (not UTC) | Low | High | Confirmed UTC via hose.ts line 400/651 `new Date().toISOString()`. No action needed. |
| VPS data gap on market holiday — 0 ticks for all tickers | Medium | Low | Handled: all tickers skip, WORK message says "0 rows written (possible holiday)" |
| `ON CONFLICT` clause fails if `daily_ohlcv` schema has no explicit UNIQUE on (code,date) | Low | High | PRIMARY KEY on (code,date) already implies UNIQUE — confirmed from REQ schema. Test in AC-3 covers this. |
| Cron collision: `evidenceAccumulator` also runs at 16:00 UTC | Low | Low | Independent jobs, no shared write lock. SQLite WAL mode handles concurrent readers. |
| Per-ticker try/catch swallows silent errors in production | Low | Medium | `console.warn` + WORK summary message lists any skipped-due-to-error tickers separately from holiday skips |

---

## Security Review

- SQL parameterized: yes — all queries use `?` binding, ticker codes from DB not user input
- File paths validated: N/A — no file I/O
- External HTTP rate-limited: N/A — no external HTTP
- Secrets via `Bun.env` only: yes — Telegram token accessed via dynamic import of existing notifier
