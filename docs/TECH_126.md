# TECH-126: feat(pipeline-health-tool): get_pipeline_health MCP tool

status: APPROVED_BY_ARCHITECT
req_ref: REQ_126 (Sprint 126)

## Brownfield Impact

- Files modified: `src/interface/mcp/tools/registry.ts`
- Files created:
  - `src/__tests__/1366-pipeline-health-tool.test.ts`
  - `src/application/usecases/getOhlcvPipelineHealth.ts`
  - `src/interface/mcp/tools/pipelineHealthTools.ts`
- Files deleted: none
- Breaking changes: no

## Architecture Decision

**Name collision**: `src/application/usecases/getPipelineHealth.ts` already exists and covers the news/RAG pipeline (TECH_075 / task 1189). The new use case must be named `getOhlcvPipelineHealth.ts` to prevent import ambiguity and preserve the news pipeline tool's separate identity.

The MCP tool is named `get_pipeline_health` (OHLCV context) per the task spec — this is unambiguous because no existing tool uses that name (the news-pipeline use case was never wired to an MCP tool). The use-case function name is `getOhlcvPipelineHealth` throughout to stay collision-free.

DDD pattern: use case receives `db: Database` as a parameter (same injection pattern as `defaultComputeTa`, `getCronJobHealthSummary`). Zero infra imports inside the use case — DB is passed from the interface layer caller.

## DDD Layer Plan

| Component                 | Layer       | File Path                                                      | New/Modify |
| ------------------------- | ----------- | -------------------------------------------------------------- | ---------- |
| getOhlcvPipelineHealth    | application | `src/application/usecases/getOhlcvPipelineHealth.ts`           | NEW        |
| pipelineHealthTools       | interface   | `src/interface/mcp/tools/pipelineHealthTools.ts`               | NEW        |
| registry                  | interface   | `src/interface/mcp/tools/registry.ts`                          | MODIFY     |
| 1366 TDD test             | test        | `src/__tests__/1366-pipeline-health-tool.test.ts`              | NEW        |

## Interface Contracts

### New use case — `src/application/usecases/getOhlcvPipelineHealth.ts`

```typescript
import type { Database } from "bun:sqlite";
import { defaultComputeTa } from "./assembleBriefing.js";

export interface OhlcvPipelineHealthOptions {
  db: Database;
  /** List of tickers to check. Defaults to all codes in watchlist table. */
  tickers?: string[];
  /** Injectable TA computation fn — for TDD. Defaults to defaultComputeTa. */
  computeTaFn?: (code: string, db: Database) => { rsiStatus: string; rsi14: number | null } | null;
}

export interface TickerHealthStatus {
  code: string;
  ohlcvRows: number;          // COUNT(*) FROM daily_ohlcv WHERE code = ?
  taReady: boolean;           // ohlcvRows >= 8
  taSignal?: string;          // "overbought" | "oversold" | "neutral" | "error"
  rsi14?: number;
}

export interface BackfillQueueStatus {
  pending: boolean;
  lastRequestedAt?: string;   // MAX(queued_at) among pending (done=0) rows
  lastCompletedAt?: string;   // MAX(queued_at) among done (done=1) rows
}

export interface OhlcvPipelineHealthResult {
  generatedAt: string;            // ISO timestamp
  tickerStatus: TickerHealthStatus[];
  backfillQueue: BackfillQueueStatus;
  aggregatorLastRun?: string;     // MAX(date) across all daily_ohlcv rows
  taSummaryCount: number;         // count of non-neutral taSignal entries
}

export async function getOhlcvPipelineHealth(
  options: OhlcvPipelineHealthOptions,
): Promise<OhlcvPipelineHealthResult>
```

**Key implementation rules for task 1367:**

- `tickers` defaults to `SELECT code FROM watchlist` when not provided.
- Row count query: `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?` — one query per ticker.
- `taReady = ohlcvRows >= 8`.
- TA computation: only run `computeTaFn` when `taReady === true`. Wrap in try/catch — on error set `taSignal = "error"`.
- Non-neutral signal: `rsiStatus === "overbought" || rsiStatus === "oversold"`.
- `taSummaryCount` = count of entries where `taSignal` is `"overbought"` or `"oversold"`.
- `backfillQueue.lastRequestedAt` = `SELECT MAX(queued_at) FROM ohlcv_backfill_queue WHERE done = 0` (null → omit field).
- `backfillQueue.lastCompletedAt` = `SELECT MAX(queued_at) FROM ohlcv_backfill_queue WHERE done = 1` (null → omit field).
- `aggregatorLastRun` = `SELECT MAX(date) FROM daily_ohlcv` (null → omit field).
- Wrap backfill queue queries in try/catch (table may not exist in :memory: tests that only seed daily_ohlcv).

### MCP tool — `src/interface/mcp/tools/pipelineHealthTools.ts`

```typescript
export function registerPipelineHealthTools(server: McpServer, _db?: Database): void
```

Tool name: `get_pipeline_health`
No input parameters (tool takes no arguments — snapshot is always over the full watchlist).
Returns: plain-text formatted output of `OhlcvPipelineHealthResult`.

**Tool description string** (exact — required per AC):
> "Returns per-ticker OHLCV row counts, TA readiness (rows >= 8), RSI signal, backfill queue status, and total non-neutral signal count. Use this for instant pipeline verification without waiting for the next evening report."

### Registry modification — `src/interface/mcp/tools/registry.ts`

Add after `registerTechnicalIndicatorTools` line:

```typescript
import { registerPipelineHealthTools } from "./pipelineHealthTools.js";
// ...
registerPipelineHealthTools,  // Task 1367: get_pipeline_health (+1 tool → 100)
```

## Test Strategy — Task 1366

File: `src/__tests__/1366-pipeline-health-tool.test.ts`
Line 1 must be: `process.env["DB_PATH"] = ":memory:";`

### DB setup helper

The test must create its own in-memory DB with three tables:

```typescript
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE IF NOT EXISTS watchlist (code TEXT PRIMARY KEY)`);
  db.exec(`CREATE TABLE IF NOT EXISTS daily_ohlcv (
    code TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL,
    low REAL, close REAL NOT NULL, volume REAL, updated_at TEXT,
    PRIMARY KEY (code, date)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queued_at TEXT NOT NULL DEFAULT (datetime('now')),
    done INTEGER NOT NULL DEFAULT 0
  )`);
  return db;
}
```

### Test cases (all RED until 1367)

**AC-1 — OHLCV row count reflected**

```
Setup: INSERT 10 rows into daily_ohlcv for code="VIC"
       INSERT "VIC" into watchlist
Call:  getOhlcvPipelineHealth({ db, tickers: ["VIC"] })
Assert: result.tickerStatus[0].code === "VIC"
        result.tickerStatus[0].ohlcvRows === 10
        result.tickerStatus[0].taReady === true
```

**AC-2 — Empty OHLCV: ohlcvRows=0, taReady=false**

```
Setup: INSERT "FPT" into watchlist, no daily_ohlcv rows
Call:  getOhlcvPipelineHealth({ db, tickers: ["FPT"] })
Assert: result.tickerStatus[0].ohlcvRows === 0
        result.tickerStatus[0].taReady === false
```

**AC-3 — Pending backfill queue: pending=true**

```
Setup: INSERT row into ohlcv_backfill_queue (done=0)
Call:  getOhlcvPipelineHealth({ db, tickers: [] })
Assert: result.backfillQueue.pending === true
```

**AC-4 — No queue entries: pending=false**

```
Setup: ohlcv_backfill_queue is empty
Call:  getOhlcvPipelineHealth({ db, tickers: [] })
Assert: result.backfillQueue.pending === false
```

**AC-5 — TA computation does not crash with >= 8 rows**

```
Setup: INSERT "HPG" into watchlist
       INSERT 10 rows into daily_ohlcv for "HPG" (distinct dates, valid close prices)
       Pass computeTaFn stub: returns { rsiStatus: "neutral", rsi14: 55 }
Call:  getOhlcvPipelineHealth({ db, tickers: ["HPG"], computeTaFn: stub })
Assert: result.tickerStatus[0].taReady === true
        typeof result.taSummaryCount === "number"   // >= 0, no crash
```

### Test approach: direct function test (not HTTP)

Import `getOhlcvPipelineHealth` from `../application/usecases/getOhlcvPipelineHealth.js` directly. No HTTP server needed — this reduces test latency and avoids port conflicts with 1360's server tests.

The function is pure: all side effects injectable. `computeTaFn` stub lets AC-5 pass without needing real price data for RSI.

## DB Queries Reference

| Purpose | SQL |
| ------- | --- |
| Row count per ticker | `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = ?` |
| Backfill pending | `SELECT COUNT(*) AS cnt FROM ohlcv_backfill_queue WHERE done = 0` |
| Backfill lastRequestedAt | `SELECT MAX(queued_at) AS ts FROM ohlcv_backfill_queue WHERE done = 0` |
| Backfill lastCompletedAt | `SELECT MAX(queued_at) AS ts FROM ohlcv_backfill_queue WHERE done = 1` |
| Aggregator last run | `SELECT MAX(date) AS last FROM daily_ohlcv` |
| Default tickers | `SELECT code FROM watchlist` |

All queries use parameterized bindings. No string interpolation.

## Task Breakdown (dependency order)

| Task | Title | Depends on |
| ---- | ----- | ---------- |
| 1366 | test(pipeline-health-tool): TDD — write test file RED | none |
| 1367 | feat(pipeline-health-tool): getOhlcvPipelineHealth + pipelineHealthTools + registry | 1366 |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| Name collision with existing `getPipelineHealth` | High (already exists) | High | Use `getOhlcvPipelineHealth` name for use case; tool name `get_pipeline_health` is safe (not yet registered) |
| `ohlcv_backfill_queue` absent in :memory: test DBs | Medium | Low | Wrap queue queries in try/catch; return `pending: false` on catch |
| `defaultComputeTa` triggers market_prices_history fallback in tests | Medium | Medium | Inject `computeTaFn` stub in AC-5; do not call `defaultComputeTa` directly in tests |
| Tool count drift | Low | Low | Update registry.ts comment to `→ 100` after adding 1 tool |

## Security Review

- SQL parameterized? Yes — all `db.query<T, [string]>(sql).get(param)` pattern
- File paths validated? N/A — no filesystem access in this use case
- External HTTP rate-limited? N/A — pure DB reads
- Secrets via Bun.env only? N/A
