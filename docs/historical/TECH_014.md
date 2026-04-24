# TECH-014: Sprint 014 — Alert Pipeline Fix, VN-Index Feed, WAL Checkpoint, Circuit Breaker Wiring, System Health Enhancement

status: APPROVED_BY_ARCHITECT
req_ref: REQ-014

---

## Brownfield Analysis — Key Findings

Before designing, the following files were read in full:

| File | Finding |
|------|---------|
| `src/infrastructure/circuitBreaker.ts` | **Already exists.** `CircuitBreaker` class with state machine `"closed"/"open"/"half-open"` (lowercase). `CircuitOpenError` is named `CircuitOpenError` not `CircuitBreakerOpenError`. |
| `src/infrastructure/circuitBreakerRegistry.ts` | **Already exists.** Singletons `breakers.cafef`, `breakers.hose`, `breakers.ssc`, etc. `getAllBreakerStats()` exported. |
| `src/interface/mcp/tools/systemTools.ts` | **Already exists.** Registers `get_system_health`, `get_global_log`, `get_tool_log`, `get_error_summary` — imports from `circuitBreakerRegistry.js`. |
| `src/interface/mcp/server.ts` | Already imports and calls `registerSystemTools(server)`. Tool count is already 21+. |
| `src/interface/mcp/tools/index.ts` | Already exports `registerSystemTools`. |
| `src/infrastructure/config.ts` | `McpConfig` type does NOT include `circuitBreaker`. The section exists in `mcp.config.json` but is not typed. Circuit breaker singletons in the registry use hardcoded defaults instead. |
| `src/infrastructure/fetchers/hose.ts` | Circuit breaker NOT wired. `fetchHosePrices` still uses raw try/catch without `breakers.hose.execute()`. |
| `src/infrastructure/fetchers/ssc.ts` | Circuit breaker NOT wired. `defaultBrowserFactory` still launches Puppeteer directly. |
| `src/scheduler/intelligenceCycleJob.ts` | Bug confirmed at line 296: `const alerts: Alert[] = []` (Step E). Bug confirmed at lines 155-159: `defaultRunImpactChain` returns 0 (Step D). |
| `src/application/usecases/pollNews.ts` | `PollNewsResult` confirmed missing `insertedIds`. |

---

## Brownfield Impact

### Files modified

| File | Task | Change |
|------|------|--------|
| `src/infrastructure/db/schema.ts` | 137 | Add `notified_telegram` column migration |
| `src/infrastructure/db/alertStore.ts` | 137 | Add `markAlertNotified()` + `readUnnotifiedAlerts()` |
| `src/scheduler/intelligenceCycleJob.ts` | 137, 138, 141 | Fix Step E, fix Step D, add `getLastCycleResult()` |
| `src/application/usecases/pollNews.ts` | 138 | Add `insertedIds: string[]` to `PollNewsResult` |
| `src/infrastructure/fetchers/hose.ts` | 139, 136 | Add `fetchVnIndex()` routing + wire circuit breaker |
| `src/infrastructure/fetchers/ssc.ts` | 136 | Wrap browser factory with `breakers.ssc.execute()` |
| `src/interface/mcp/tools/systemTools.ts` | 141 | Enhance `get_system_health` with WAL size, alert stats, last cycle result |
| `mcp.config.json` | 140 | Add `walCheckpoint` cron expression to `scheduler` section |
| `src/scheduler/jobs.ts` | 140 | Register `walCheckpointJob` cron |
| `src/index.ts` | 140 | Add WAL checkpoint call inside existing `shutdown()` function |

### Files created

| File | Task | Reason |
|------|------|--------|
| `src/infrastructure/db/checkpoint.ts` | 140 | `runWalCheckpoint()` helper |
| `src/scheduler/walCheckpointJob.ts` | 140 | Daily WAL checkpoint cron job |

### Files NOT touched (already correctly implemented)

| File | Reason |
|------|--------|
| `src/infrastructure/circuitBreaker.ts` | Class already exists and correct — Task 136 only wires it |
| `src/infrastructure/circuitBreakerRegistry.ts` | Singletons already exist — Task 136 only imports them in fetchers |
| `src/interface/mcp/server.ts` | Already registers `systemTools` |
| `src/interface/mcp/tools/index.ts` | Already exports `registerSystemTools` |
| `src/infrastructure/config.ts` | No `circuitBreaker` type needed — registry uses hardcoded defaults matching `mcp.config.json` values |

### Breaking changes

None. All schema changes use `ALTER TABLE` wrapped in `try/catch`. All new exports are additive. `CycleDeps` gains optional fields only. `PollNewsResult` gains a new field (backward-compatible addition).

---

## Architecture Decision

The six tasks fall into two clusters that do not conflict with each other at a DDD layer level:

**Correctness cluster (137, 138):** Both bugs are in `intelligenceCycleJob.ts`. Step E has a hardcoded empty array; Step D has a placeholder returning 0. Both fixes are surgical (no new files, no interface changes beyond adding optional injectable fields). The `pollNews.ts` change (adding `insertedIds`) is a pure additive change to the `PollNewsResult` type.

**Hardening cluster (139, 140, 136, 141):** Task 136 wires the already-existing `CircuitBreaker` singletons from `circuitBreakerRegistry.ts` into `hose.ts` and `ssc.ts` — the class itself requires no changes. Task 141 extends the already-existing `get_system_health` tool with additional fields (WAL size, alert stats, last cycle result). Tasks 139 and 140 add new infrastructure with no existing conflicts.

The existing `circuitBreaker.ts` uses lowercase state strings (`"closed"/"open"/"half-open"`) and the error class is `CircuitOpenError`. The REQ-014 spec uses uppercase (`'CLOSED'/'OPEN'/'HALF_OPEN'`) — the implementation precedent takes priority. No state string change is required.

---

## Bug Analysis: Exact Lines

### Bug 1 — Step E (Task 137): `intelligenceCycleJob.ts` lines 293–306

```typescript
// Step E: Send HIGH/CRITICAL alerts to Telegram
try {
  // Collect alerts from DB (or injected — for testing pass empty array)
  const alerts: Alert[] = [];        // ← LINE 296: hardcoded empty array
  telegramAlertsSent = await sendAlertsFn(alerts);
```

`sendAlertsFn` always receives `[]`. The fix replaces line 296 with a DB query via an injectable `readUnnotifiedAlertsFn`. The `alerts` table also lacks a `notified_telegram` column, which must be added via `ALTER TABLE` migration.

### Bug 2 — Step D (Task 138): `intelligenceCycleJob.ts` lines 155–159

```typescript
async function defaultRunImpactChain(): Promise<number> {
  // Impact chain is already run inside pollNews per-entry.
  // This placeholder returns 0 to indicate no additional events were processed.
  return 0;    // ← hardcoded 0, real runImpactChain never called
}
```

And line 282:
```typescript
impactEventsRan = await runImpactChainFn();   // ← called with no arguments
```

The fix: (1) add `insertedIds` to `PollNewsResult`, (2) pass `insertedIds` through Step A → Step D, (3) replace `defaultRunImpactChain` with a real implementation that loads from `rag_analyses` and calls `runImpactChain`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `notified_telegram` migration | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `markAlertNotified()` helper | infrastructure | `src/infrastructure/db/alertStore.ts` | MODIFY |
| `readUnnotifiedAlerts()` helper | infrastructure | `src/infrastructure/db/alertStore.ts` | MODIFY |
| `runWalCheckpoint()` | infrastructure | `src/infrastructure/db/checkpoint.ts` | NEW |
| `VnIndexSnapshot` + `fetchVnIndex()` | infrastructure | `src/infrastructure/fetchers/hose.ts` | MODIFY |
| Wire `breakers.hose` + `breakers.cafef` in `fetchHosePrices` | infrastructure | `src/infrastructure/fetchers/hose.ts` | MODIFY |
| Wire `breakers.ssc` in `listSscDocuments` | infrastructure | `src/infrastructure/fetchers/ssc.ts` | MODIFY |
| Add `insertedIds` to `PollNewsResult` | application | `src/application/usecases/pollNews.ts` | MODIFY |
| Fix Step E — `readUnnotifiedAlertsFn` injectable | interface/scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| Fix Step D — real `defaultRunImpactChain(ids)` | interface/scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| `getLastCycleResult()` export | interface/scheduler | `src/scheduler/intelligenceCycleJob.ts` | MODIFY |
| `walCheckpointJob` cron | scheduler | `src/scheduler/walCheckpointJob.ts` | NEW |
| Register WAL cron in `startScheduler` | scheduler | `src/scheduler/jobs.ts` | MODIFY |
| WAL checkpoint in `shutdown()` | interface | `src/index.ts` | MODIFY |
| `walCheckpoint` cron expression | config | `mcp.config.json` | MODIFY |
| Enhance `get_system_health` tool | interface/mcp | `src/interface/mcp/tools/systemTools.ts` | MODIFY |

---

## Interface Contracts

### Task 137 — Schema migration (`src/infrastructure/db/schema.ts`)

Add at the end of `initDatabase()`, after the existing Task 132 `ALTER TABLE` block (after line 265):

```typescript
// Task 137: add notified_telegram column to alerts table
try {
  db.exec(`ALTER TABLE alerts ADD COLUMN notified_telegram INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists — safe to ignore */ }
db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_notified ON alerts(notified_telegram, severity)`);
```

### Task 137 — Alert DB helpers (`src/infrastructure/db/alertStore.ts`)

Add two functions after the existing `storeAlerts`:

```typescript
/**
 * Mark a single alert row as notified via Telegram.
 * Called only after notifyTelegramAlert() returns true.
 * Wrapped in try/catch by caller — a failed update must not abort the send loop.
 *
 * @param id - Alert primary key (UUID)
 * @param db - Database connection
 */
export function markAlertNotified(id: string, db: Database): void {
  db.prepare(`UPDATE alerts SET notified_telegram = 1 WHERE id = ?`).run(id);
}

/**
 * Read unnotified HIGH/CRITICAL alerts created within the lookback window.
 *
 * SQL:
 *   SELECT * FROM alerts
 *   WHERE severity IN ('high', 'critical')
 *     AND notified_telegram = 0
 *     AND triggered_at >= datetime('now', '-N minutes')
 *   ORDER BY triggered_at ASC
 *
 * @param windowMs - Lookback window in milliseconds
 * @param db       - Database connection
 * @returns        - Array of Alert domain objects (empty if none)
 */
export function readUnnotifiedAlerts(windowMs: number, db: Database): Alert[] {
  const windowMinutes = Math.round(windowMs / 60_000);

  interface AlertRow {
    id: string;
    triggered_at: string;
    severity: string;
    signals_json: string | null;
    affected_actions_json: string | null;
    message: string | null;
  }

  const rows = db
    .prepare<AlertRow, [string]>(
      `SELECT id, triggered_at, severity, signals_json, affected_actions_json, message
       FROM alerts
       WHERE severity IN ('high', 'critical')
         AND notified_telegram = 0
         AND triggered_at >= datetime('now', '-' || ? || ' minutes')
       ORDER BY triggered_at ASC`,
    )
    .all(String(windowMinutes)) as AlertRow[];

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.triggered_at,
    severity: row.severity as Alert['severity'],
    signals: JSON.parse(row.signals_json ?? '[]') as string[],
    actionCode: (JSON.parse(row.affected_actions_json ?? '[{}]') as Array<{ code?: string }>)[0]?.code ?? '',
    message: row.message ?? '',
  }));
}
```

**Note:** The window parameter is passed as a string into SQLite's `datetime()` call. SQLite's `datetime('now', '-16 minutes')` syntax requires a string literal. Since we need a dynamic window, use string concatenation inside SQL: `'-' || ? || ' minutes'`. This is safe — `windowMinutes` is a `Math.round()` result (integer), not user input.

### Task 137 — `CycleDeps` + Step E (`src/scheduler/intelligenceCycleJob.ts`)

Add one optional field to `CycleDeps` (after line 74):

```typescript
export interface CycleDeps {
  // ... existing fields ...
  /**
   * Override for reading unnotified HIGH/CRITICAL alerts from the DB.
   * Receives the lookback window in milliseconds.
   * Default reads from SQLite. Tests inject an in-memory stub.
   */
  readUnnotifiedAlertsFn?: (windowMs: number) => Promise<Alert[]>;
}
```

Add default implementation above `_runCycle`:

```typescript
async function defaultReadUnnotifiedAlerts(windowMs: number): Promise<Alert[]> {
  const { readUnnotifiedAlerts } = await import('../infrastructure/db/alertStore.js');
  const { getDb } = await import('../infrastructure/db/schema.js');
  return readUnnotifiedAlerts(windowMs, getDb());
}
```

Replace lines 293–306 (the Step E block):

```typescript
// Step E: Send HIGH/CRITICAL alerts to Telegram
try {
  const WINDOW_MS = 16 * 60 * 1000; // 16-minute window (15-min cycle + 1-min overlap)
  const readFn = deps.readUnnotifiedAlertsFn ?? defaultReadUnnotifiedAlerts;
  const pendingAlerts = await readFn(WINDOW_MS);

  let sent = 0;
  for (const alert of pendingAlerts) {
    const ok = await sendAlertsFn([alert]);
    if (ok > 0) {
      try {
        const { markAlertNotified } = await import('../infrastructure/db/alertStore.js');
        const { getDb } = await import('../infrastructure/db/schema.js');
        markAlertNotified(alert.id, getDb());
      } catch (markErr) {
        logger.warn('[intelligence-cycle] failed to mark alert notified', {
          alertId: alert.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      sent++;
    }
  }
  telegramAlertsSent = sent;
  logger.debug('[intelligence-cycle] step E complete — alerts sent', { telegramAlertsSent });
} catch (err) {
  errors++;
  logger.error('[intelligence-cycle] step E failed — sendAlerts error', {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

### Task 138 — `PollNewsResult` (`src/application/usecases/pollNews.ts`)

Add `insertedIds` field to the interface (after line 43):

```typescript
export interface PollNewsResult {
  fetched: number;
  inserted: number;
  duplicates: number;
  alerts: number;
  errors: number;
  /** IDs of rag_analyses rows newly inserted this cycle. Used by Step D. */
  insertedIds: string[];
}
```

Add tracking array before the `for` loop (after `let duplicates = 0;`):

```typescript
const insertedIds: string[] = [];
```

Inside the loop where `wasInserted` is true (after `newEntries.push(entry)`):

```typescript
insertedIds.push(entry.id);
```

Add to the return statement:

```typescript
return { fetched, inserted, duplicates, alerts: totalAlerts, errors, insertedIds };
```

### Task 138 — Step D + `CycleDeps` signature (`src/scheduler/intelligenceCycleJob.ts`)

Update `CycleDeps.runImpactChainFn` signature (line 72 area):

```typescript
runImpactChainFn?: (insertedIds: string[]) => Promise<number>;
```

Declare `insertedIds` before the market-hours `if` block (at the top of `_runCycle`, alongside the other `let` declarations):

```typescript
let insertedIds: string[] = [];
```

Update Step A (line 224 area) to capture `insertedIds`:

```typescript
const pollResult = await pollNewsFn();
newsFetched = pollResult.fetched;
insertedIds = pollResult.insertedIds ?? [];
```

Update Step D (line 282 area) to pass `insertedIds`:

```typescript
impactEventsRan = await runImpactChainFn(insertedIds);
```

Replace `defaultRunImpactChain` (lines 155–159):

```typescript
async function defaultRunImpactChain(insertedIds: string[]): Promise<number> {
  if (insertedIds.length === 0) return 0;

  const { runImpactChain } = await import('../application/usecases/runImpactChain.js');
  const { getDb } = await import('../infrastructure/db/schema.js');

  const db = getDb();
  const watchlistRows = db
    .prepare('SELECT code as actionCode, domain, exchange FROM watchlist')
    .all() as Array<{ actionCode: string; domain: string; exchange: string }>;

  if (watchlistRows.length === 0) return 0;

  let ran = 0;
  for (const id of insertedIds) {
    try {
      const row = db
        .prepare('SELECT summary FROM rag_analyses WHERE id = ?')
        .get(id) as { summary: string } | undefined;
      if (!row?.summary) continue;

      await runImpactChain({ newsText: row.summary, watchlist: watchlistRows });
      ran++;
    } catch (err) {
      logger.error('[intelligence-cycle] step D error for entry', {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to next entry — error isolation per AC-4
    }
  }
  return ran;
}
```

Also update the `_runCycle` function's resolved dependency line (currently `const runImpactChainFn = deps.runImpactChainFn ?? defaultRunImpactChain`) — no change needed there since `defaultRunImpactChain` now accepts `insertedIds`.

### Task 138 — `getLastCycleResult()` export

Add module-level state and export before `_runCycle`:

```typescript
/** Most recent completed cycle result. Null until first cycle completes. */
let _lastCycleResult: CycleResult | null = null;

/**
 * Returns the result of the most recently completed intelligence cycle.
 * Returns null if no cycle has completed since server start.
 */
export function getLastCycleResult(): CycleResult | null {
  return _lastCycleResult;
}
```

At the very end of `_runCycle`, before `return result`:

```typescript
_lastCycleResult = result;
return result;
```

### Task 139 — `VnIndexSnapshot` + `fetchVnIndex()` (`src/infrastructure/fetchers/hose.ts`)

Add a new constant and type after the `CAFEF_BANGGIA_URL` constant (line 390 area):

```typescript
/** CafeF index endpoint — returns VN-Index, HNX-Index, UPCOM-Index as JSON array. */
const CAFEF_INDEX_URL = "https://banggia.cafef.vn/stockhandler.ashx?index=0";

/** Snapshot of a market index from CafeF index endpoint. */
export interface VnIndexSnapshot {
  code: string;          // "VNINDEX"
  value: number;         // current index level — raw float, NO ×1000 multiplier
  previousValue: number; // reference/previous close
  changePct: number;     // ((value - previousValue) / previousValue) * 100
  volume: number;        // total traded volume
  fetchedAt: string;     // ISO 8601
}
```

Add private function `fetchVnIndex` after `fetchFromCafef`:

```typescript
/**
 * Fetches the VN-Index from CafeF index endpoint (index=0).
 * Index values are raw floating-point points — do NOT apply the ×1000 multiplier used for stocks.
 *
 * @param fetchedAt - ISO 8601 timestamp string for this fetch
 * @returns VnIndexSnapshot, or null if the VNINDEX record is absent or an error occurs
 */
async function fetchVnIndex(fetchedAt: string): Promise<VnIndexSnapshot | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(CAFEF_INDEX_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`CafeF index HTTP ${response.status}`);

    const data: CafefStockRecord[] = await response.json();
    const rec = data.find((r) => r.a === 'VNINDEX');

    if (!rec) {
      logger.warn('[hose] VNINDEX record absent in CafeF index response');
      return null;
    }

    // Index values are full points (e.g. 1247.35) — no ×1000 conversion
    const value = rec.l;
    const previousValue = rec.b;
    const changePct =
      previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;

    return {
      code: 'VNINDEX',
      value,
      previousValue,
      changePct: Math.round(changePct * 100) / 100,
      volume: rec.totalvolume ?? 0,
      fetchedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Add routing branch in `fetchHosePrices`, after the `codes.length === 0` guard (line 484 area) and before the `isTradingSession()` guard:

```typescript
// Special case: VNINDEX is an index composite, not a stock — route to CafeF index endpoint
if (codes.length === 1 && codes[0].toUpperCase() === 'VNINDEX') {
  try {
    const fetchedAt = new Date().toISOString();
    const snapshot = await fetchVnIndex(fetchedAt);
    if (!snapshot) return [];
    return [
      {
        code: snapshot.code,
        exchange: 'INDEX',
        price: snapshot.value,
        previousPrice: snapshot.previousValue,
        changePct: snapshot.changePct,
        volume: snapshot.volume,
        avgVolume: 0,
        fetchedAt: snapshot.fetchedAt,
      } satisfies MarketPrice,
    ];
  } catch (err) {
    logger.warn('[hose] fetchVnIndex failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
```

The existing `onlyIndex` block at the bottom (lines 559–569) becomes dead code for VNINDEX but remains as a safety net for any future index codes that bypass this branch. Leave it in place.

### Task 139 — `get_market_snapshot` impact

No changes required. The tool already calls `fetchHosePrices(["VNINDEX"])` (line 149 of `marketTools.ts`) and renders `vnIndexResult.find(p => p.code === "VNINDEX")` (line 188). With the routing branch in `fetchHosePrices`, this path now returns a real value.

### Task 140 — `runWalCheckpoint()` (`src/infrastructure/db/checkpoint.ts`)

```typescript
/**
 * Infrastructure — SQLite WAL checkpoint helper (Task 140)
 *
 * Runs a PASSIVE WAL checkpoint followed by PRAGMA optimize.
 * PASSIVE mode flushes WAL pages to the main DB file without blocking
 * active readers or writers. Safe for use in cron jobs and signal handlers.
 *
 * Layer: infrastructure/db
 */

import type { Database } from 'bun:sqlite';
import { getDb } from './schema.js';
import { logger } from '../logger.js';

/**
 * Run a PASSIVE WAL checkpoint and PRAGMA optimize on the SQLite database.
 *
 * @param db - Optional database instance. Defaults to the singleton from getDb().
 *             Pass an explicit instance in tests to avoid touching the production DB.
 */
export function runWalCheckpoint(db?: Database): void {
  const target = db ?? getDb();
  target.pragma('wal_checkpoint(PASSIVE)');
  target.pragma('optimize');
  logger.info('[db-checkpoint] WAL checkpoint + optimize complete');
}
```

### Task 140 — `walCheckpointJob.ts` (`src/scheduler/walCheckpointJob.ts`)

```typescript
/**
 * WAL Checkpoint Job — Task 140 (scheduler layer)
 *
 * Runs the SQLite WAL checkpoint daily at 03:00 GMT+7 (20:00 UTC).
 * Registered in src/scheduler/jobs.ts alongside other cron jobs.
 */

import { runWalCheckpoint } from '../infrastructure/db/checkpoint.js';
import { logger } from '../infrastructure/logger.js';

export async function runWalCheckpointJob(): Promise<void> {
  logger.info('[wal-checkpoint-job] starting daily WAL checkpoint');
  try {
    runWalCheckpoint();
  } catch (err) {
    logger.error('[wal-checkpoint-job] checkpoint failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

### Task 140 — `jobs.ts` changes

Add import at the top:

```typescript
import { runWalCheckpointJob } from './walCheckpointJob.js'
```

Add to `CRONS`:

```typescript
walCheckpoint: Bun.env.CRON_WAL_CHECKPOINT ?? '0 20 * * *',
```

Add cron registration in `startScheduler()`:

```typescript
// 03:00 GMT+7 (= 20:00 UTC) — daily WAL checkpoint (task 140)
cron.schedule(CRONS.walCheckpoint, async () => {
  await runWalCheckpointJob()
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

### Task 140 — `index.ts` change

The existing `shutdown()` function (lines 84–99) already handles both signals. Add one import + call after `cleanupBrowsers()` and before `closeVectorStore()`:

```typescript
async function shutdown(signal: string) {
  log.info(`[bootstrap] Received ${signal} — shutting down...`);
  const { cleanupBrowsers } = await import('./infrastructure/fetchers/ssc.js');
  cleanupBrowsers();
  // Task 140: WAL checkpoint before closing DB
  const { runWalCheckpoint } = await import('./infrastructure/db/checkpoint.js');
  try { runWalCheckpoint(); } catch (_) { /* best-effort: never block shutdown */ }
  const { closeVectorStore } = await import('./infrastructure/rag/vectorstore.js');
  await closeVectorStore().catch(() => {});
  const { closeDb } = await import('./infrastructure/db/schema.js');
  closeDb();
  await srv.close();
  log.info('[bootstrap] Shutdown complete');
  process.exit(0);
}
```

No change needed to the `process.on('SIGTERM')` / `process.on('SIGINT')` registrations.

### Task 140 — `mcp.config.json` change

Add `walCheckpoint` to the `scheduler` object:

```json
"scheduler": {
  "intelligenceCycle": "*/15 * * * *",
  "morningBriefing":   "0 8 * * 1-5",
  "marketOpen":        "0 9 * * 1-5",
  "marketClose":       "30 15 * * 1-5",
  "sscCheck":          "0 20 * * *",
  "eveningSummary":    "0 22 * * 1-5",
  "walCheckpoint":     "0 20 * * *"
}
```

Note: `0 20 * * *` UTC = 03:00 GMT+7. Same expression as `sscCheck` in UTC. The two jobs are independent (read-only pragma vs. Puppeteer HTTP) — safe to run at the same wall-clock UTC minute.

Also add `walCheckpoint` to `SchedulerConfig` in `src/infrastructure/config.ts` and add the field to `loadMcpConfig()` if the scheduler type is used at runtime. Currently `SchedulerConfig` is a TypeScript type but its fields are only read by individual jobs (via `Bun.env` fallback). The `jobs.ts` uses `Bun.env.CRON_WAL_CHECKPOINT ?? '0 20 * * *'` directly — no `config.ts` change is strictly required. Developer should add it for completeness but it is not blocking.

### Task 136 — Wire circuit breaker in `hose.ts`

Import from the registry at the top of the file:

```typescript
import { breakers } from '../circuitBreakerRegistry.js';
import { CircuitOpenError } from '../circuitBreaker.js';
```

**VnDirect wrapping** — the existing `try` block around the VnDirect HTTP call (lines 513–534). Replace:

```typescript
const json = await client.get(url);
```

With:

```typescript
const json = await breakers.hose.execute(() => client.get(url));
```

Update the `catch` for VnDirect (currently catches all errors and falls through to CafeF):

```typescript
} catch (err) {
  if (err instanceof CircuitOpenError) {
    logger.warn('[hose] VnDirect circuit breaker OPEN — skipping to CafeF', {
      breaker: 'hose',
    });
  } else {
    logger.debug('[hose] VnDirect unavailable, trying CafeF fallback');
  }
}
```

**CafeF fallback wrapping** — the existing `try` block around `fetchFromCafef` (lines 541–554). Replace:

```typescript
const prices = await fetchFromCafef(codes, fetchedAt);
```

With:

```typescript
const prices = await breakers.cafef.execute(() => fetchFromCafef(codes, fetchedAt));
```

Update the `catch` for CafeF:

```typescript
} catch (err) {
  if (err instanceof CircuitOpenError) {
    logger.warn('[hose] CafeF circuit breaker OPEN — both sources unavailable', {
      breaker: 'cafef',
    });
  } else {
    logger.warn('[hose] CafeF fallback also failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**VNINDEX routing branch wrapping** — the `fetchVnIndex()` call added in Task 139 does not go through either `breakers.hose` or `breakers.cafef` (it is a separate endpoint). Wrap it with `breakers.cafef` since the CafeF index endpoint is the same origin as CafeF banggia:

```typescript
const snapshot = await breakers.cafef.execute(() => fetchVnIndex(fetchedAt));
```

Update the catch inside the VNINDEX branch:

```typescript
} catch (err) {
  if (err instanceof CircuitOpenError) {
    logger.warn('[hose] CafeF circuit breaker OPEN — VN-Index unavailable');
  } else {
    logger.warn('[hose] fetchVnIndex failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return [];
}
```

### Task 136 — Wire circuit breaker in `ssc.ts`

Import at the top:

```typescript
import { breakers } from '../circuitBreakerRegistry.js';
import { CircuitOpenError } from '../circuitBreaker.js';
```

In `listSscDocuments` (line 196–198 area), the current code:

```typescript
let browser: SscBrowser | null = null;
try {
  browser = await factory();
```

Replace with:

```typescript
let browser: SscBrowser | null = null;
try {
  browser = await breakers.ssc.execute(() => factory());
} catch (err) {
  if (err instanceof CircuitOpenError) {
    logger.warn('[ssc] SSC circuit breaker OPEN — skipping document list', {
      actionCode: code,
    });
    return [];
  }
  throw err;   // non-CircuitOpenError propagates to the outer catch
}
```

The outer `try/catch` that wraps the full function body already handles all other errors and returns `[]`. The `throw err` for non-`CircuitOpenError` cases allows the outer handler to catch and log normally.

### Task 141 — Enhance `get_system_health` (`src/interface/mcp/tools/systemTools.ts`)

The existing tool returns circuit breaker status, DB size, and system log errors. REQ-014 requires adding: WAL size, LanceDB directory size, last Telegram sent timestamp, alert stats, and `lastCycleResult`.

Add imports at the top of the file:

```typescript
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getLastCycleResult } from '../../../scheduler/intelligenceCycleJob.js';
import { mcpConfig } from '../../../infrastructure/config.js';
```

Add helper functions in the helpers section:

```typescript
function getFileSizeBytes(filePath: string): number {
  try { return statSync(resolve(process.cwd(), filePath)).size; } catch { return 0; }
}

function getDirectorySize(dirPath: string): number {
  try {
    let total = 0;
    const walk = (p: string) => {
      for (const entry of readdirSync(p, { withFileTypes: true })) {
        const full = join(p, entry.name);
        if (entry.isDirectory()) { walk(full); }
        else { try { total += statSync(full).size; } catch { /* skip */ } }
      }
    };
    walk(resolve(process.cwd(), dirPath));
    return total;
  } catch { return 0; }
}
```

Inside the `get_system_health` tool handler, after the existing DB size line, add the following additional data sections before the return:

```typescript
// WAL + LanceDB sizes
const dbPath = mcpConfig.data.dbPath;
const lancedbPath = mcpConfig.data.lancedbPath;
const walSizeBytes = getFileSizeBytes(dbPath + '-wal');
const lancedbSizeBytes = getDirectorySize(lancedbPath);

// Alert stats
let totalLast24h = 0, highCriticalLast24h = 0, unnotified = 0, lastTelegramSentAt: string | null = null;
try {
  totalLast24h = (db.prepare(
    `SELECT COUNT(*) as c FROM alerts WHERE triggered_at >= datetime('now', '-24 hours')`
  ).get() as { c: number }).c;
  highCriticalLast24h = (db.prepare(
    `SELECT COUNT(*) as c FROM alerts WHERE severity IN ('high','critical') AND triggered_at >= datetime('now', '-24 hours')`
  ).get() as { c: number }).c;
  unnotified = (db.prepare(
    `SELECT COUNT(*) as c FROM alerts WHERE notified_telegram = 0 AND severity IN ('high','critical')`
  ).get() as { c: number }).c;
  lastTelegramSentAt = (db.prepare(
    `SELECT MAX(triggered_at) as t FROM alerts WHERE notified_telegram = 1`
  ).get() as { t: string | null }).t;
} catch { /* notified_telegram column may not exist yet — safe skip */ }

// Last cycle result
const lastCycleResult = getLastCycleResult();
```

Append additional sections to the `lines` array before the return:

```typescript
lines.push("--- Storage ---");
lines.push(`  DB WAL file:  ${formatBytes(walSizeBytes)}`);
lines.push(`  LanceDB dir:  ${formatBytes(lancedbSizeBytes)}`);
lines.push("");

lines.push("--- Alert Stats (last 24h) ---");
lines.push(`  Total:             ${totalLast24h}`);
lines.push(`  HIGH/CRITICAL:     ${highCriticalLast24h}`);
lines.push(`  Unnotified:        ${unnotified}`);
lines.push(`  Last Telegram:     ${lastTelegramSentAt ?? 'never'}`);
lines.push("");

if (lastCycleResult) {
  lines.push("--- Last Intelligence Cycle ---");
  lines.push(`  Mode:          ${lastCycleResult.isMarketHours ? 'market-hours' : 'off-hours'}`);
  lines.push(`  Duration:      ${(lastCycleResult.durationMs / 1000).toFixed(1)}s`);
  lines.push(`  News fetched:  ${lastCycleResult.newsFetched}`);
  lines.push(`  Prices:        ${lastCycleResult.pricesFetched}`);
  lines.push(`  Impact events: ${lastCycleResult.impactEventsRan}`);
  lines.push(`  Alerts sent:   ${lastCycleResult.telegramAlertsSent}`);
  lines.push(`  Errors:        ${lastCycleResult.errors}`);
  lines.push("");
}
```

**DDD note:** `systemTools.ts` (interface/mcp layer) importing from `intelligenceCycleJob.ts` (interface/scheduler layer) is a cross-interface-sublayer import. Both are in the `interface/` layer, which is acceptable — the DDD rule only prohibits downward imports (interface → application → infrastructure → domain). Cross-imports within the same DDD layer are allowed.

---

## Data Flow Diagrams

### Task 137 — Alert pipeline (fixed)

```
[Step A] pollNews()
  → generateAlerts() → storeAlerts() → alerts table (notified_telegram=0)

[Step E — FIXED]
  readUnnotifiedAlerts(16min, db)
    └─ SELECT WHERE severity IN ('high','critical')
              AND notified_telegram=0
              AND triggered_at >= now-16min

  for each pendingAlert:
    sendAlertsFn([alert])
      ┌─ ok > 0  → markAlertNotified(id, db)  → notified_telegram=1
      └─ ok = 0  → flag stays 0, retried next cycle
  telegramAlertsSent = sent count
```

### Task 138 — Impact chain (fixed)

```
[Step A] pollNews()
  → tryInsertEntry() returns true → insertedIds.push(entry.id)
  → PollNewsResult.insertedIds = ["uuid-1", "uuid-2", ...]

[Step D — FIXED] defaultRunImpactChain(insertedIds)
  for each id:
    SELECT summary FROM rag_analyses WHERE id = ?
    runImpactChain({ newsText: summary, watchlist })
      → buildCausalChain() with macro context (commodity + SBV)
      → CausalChain output (stored implicitly by side effects)
    impactEventsRan++   [per successful call]
  return impactEventsRan
```

### Task 139 — VN-Index flow (new path)

```
fetchHosePrices(["VNINDEX"])
  └─ codes[0] === "VNINDEX" → ROUTING BRANCH
       └─ breakers.cafef.execute(() => fetchVnIndex(fetchedAt))
            └─ GET https://banggia.cafef.vn/stockhandler.ashx?index=0
                 └─ data.find(r => r.a === "VNINDEX")
                      → value = rec.l  (1247.35 — raw float, no ×1000)
                      → changePct = ((l-b)/b)*100
            └─ return [MarketPrice{ code:"VNINDEX", exchange:"INDEX", price:1247.35 }]

get_market_snapshot (no change):
  vnIndexResult.find(p => p.code === "VNINDEX")
  → "VN-Index: 1,247.35  +0.55%"
```

---

## Task Breakdown (for PM)

Dependency order, parallelism, and effort estimate:

| # | Task | Parallel with | Effort | Blocking |
|---|------|--------------|--------|---------|
| 1 | 137 — Fix Step E (alert DB read) | 138 | S | nothing |
| 2 | 138 — Fix Step D (real impact chain) | 137 | M | nothing |
| 3 | 139 — VN-Index CafeF fetcher | 137, 138, 140 | S | 136 (for breaker wrap) |
| 4 | 140 — WAL checkpoint | 137, 138, 139 | XS | nothing |
| 5 | 136 — Wire circuit breaker | after 139 | S | 141 |
| 6 | 141 — Enhance get_system_health | after 136, 137, 138 | S | nothing |

Effort legend: XS = <1h, S = 1-2h, M = 2-4h.

Suggested sprint execution:
1. Parallel: 137, 138, 140 (all independent, fastest wins)
2. 139 (touches same file as 136 — do before 136 to avoid merge conflict in `hose.ts`)
3. 136 (wraps the newly added `fetchVnIndex` + existing `fetchFromCafef` + `listSscDocuments`)
4. 141 (needs `getLastCycleResult` from 137/138, needs breakers from 136)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `ALTER TABLE` for `notified_telegram` on existing column | High (second server start) | Low | try/catch swallows silently — same pattern as Task 132 |
| SQLite `datetime` string interpolation in `readUnnotifiedAlerts` | Low | Medium | `windowMinutes` is `Math.round()` integer — not user input; SQL injection path blocked |
| `readUnnotifiedAlerts` maps row to wrong Alert field names | Medium | High | Unit test seeds known rows and asserts exact field values (AC-1) |
| `insertedIds` empty on all-duplicate news cycle | High (normal) | Low | `if (insertedIds.length === 0) return 0` guard in `defaultRunImpactChain` |
| `runImpactChain` slow per-entry when macro fetchers time out | High | Medium | Per-entry error isolation — one timeout does not block remaining entries |
| CafeF index endpoint returns data where `l` field is ×1000 | Unknown | High | Explicit unit test asserting `value === 1247.35` (not 1247350) against fixture |
| `breakers.hose` and `breakers.cafef` — naming conflict with existing `hose` breaker | None | N/A | Registry already has `breakers.hose` — this is the correct singleton to use |
| `CircuitOpenError` name mismatch with REQ spec (`CircuitBreakerOpenError`) | Confirmed | Low | Existing code uses `CircuitOpenError` — use that name; do not create a new class |
| WAL checkpoint blocking event loop | Low | High | `PASSIVE` mode: documented as non-blocking in SQLite spec |
| `systemTools.ts` import of `intelligenceCycleJob.ts` creates circular dependency | Low | Medium | Both are in `interface/` layer — no circular path through DDD layers; verify with `bun tsc --noEmit` |
| `getLastCycleResult()` called before first cycle — returns null | Certain | Low | Tool handles `null` gracefully: skips "Last Intelligence Cycle" section if null |
| `notified_telegram` column absent when `get_system_health` queries `unnotified` count | Low | Low | Wrap alert stat queries in try/catch with fallback 0 |

---

## Security Review

- SQL parameterized? Yes — all new queries use `db.prepare(...).run(param)` / `.get(param)` with bound parameters. The `readUnnotifiedAlerts` window is computed from `Math.round()` of a numeric millisecond value, not from user input.
- File paths validated (no `../`)? Yes — all file paths come from `mcpConfig.data.*` (loaded from `mcp.config.json` at startup), not from user-supplied tool arguments.
- External HTTP rate-limited? Yes — circuit breaker `breakers.cafef.execute()` and `breakers.hose.execute()` prevent runaway retries when sources are OPEN.
- Secrets via `Bun.env` only? Yes — no new secrets introduced.

---

## Test Strategy (TDD Red-Green-Refactor)

### Task 137 — `src/__tests__/137-fix-alert-pipeline.test.ts`

**Red phase (failing tests before implementation):**

```typescript
// Test 1: schema — notified_telegram column exists after initDatabase()
const col = db.prepare("PRAGMA table_info(alerts)").all()
             .find(c => c.name === 'notified_telegram');
expect(col).toBeDefined();   // FAILS before migration

// Test 2: readUnnotifiedAlerts — returns seeded rows
// Seed 2 alerts with notified_telegram=0, triggered_at = now-5min
const alerts = readUnnotifiedAlerts(16 * 60 * 1000, db);
expect(alerts).toHaveLength(2);   // FAILS before alertStore.ts change

// Test 3: cycle integration — telegramAlertsSent = 2
const result = await runIntelligenceCycle({ isMarketHoursFn: () => true, ...mocks });
expect(result?.telegramAlertsSent).toBe(2);   // FAILS before Step E fix

// Test 4: AC-2 — failed send keeps flag at 0
const result2 = await runIntelligenceCycle({ sendAlertsFn: async () => 0, ...mocks });
const row = db.prepare('SELECT notified_telegram FROM alerts WHERE id=?').get('a1');
expect((row as any).notified_telegram).toBe(0);   // FAILS before Step E fix
```

**Green phase:** add migration → add `readUnnotifiedAlerts` → fix Step E.

**Test DB setup:** use `DB_PATH=:memory:` or `new Database(':memory:')` injection. Call `initDatabase()` before each test.

### Task 138 — `src/__tests__/138-fix-impact-chain.test.ts`

```typescript
// Test 1: PollNewsResult has insertedIds
const result = await pollNews({ fetchers: mockFetchers, db });
expect(result.insertedIds).toBeDefined();    // FAILS before pollNews.ts change
expect(result.insertedIds).toHaveLength(result.inserted);

// Test 2: defaultRunImpactChain with real entries calls runImpactChain N times
// inject runImpactChainFn that counts calls
let callCount = 0;
await runIntelligenceCycle({
  isMarketHoursFn: () => true,
  pollNewsFn: async () => ({ ..., insertedIds: ['id-1', 'id-2'] }),
  runImpactChainFn: async (ids) => { callCount = ids.length; return ids.length; },
});
expect(callCount).toBe(2);   // FAILS while placeholder returns 0

// Test 3: AC-4 — one entry throws → impactEventsRan = 1
```

### Task 139 — `src/__tests__/139-vnindex-cafef.test.ts`

```typescript
// Test 1: fetchVnIndex parses raw float correctly
const mockFetch = () => Promise.resolve([{ a: 'VNINDEX', b: 1240.5, l: 1247.35, k: 6.85, totalvolume: 350000000 }]);
// inject mock; expect value === 1247.35 (not 1247350)

// Test 2: fetchHosePrices(["VNINDEX"]) routes to fetchVnIndex
// Test 3: VNINDEX absent → returns []
// Test 4: changePct computed correctly (≈ 0.55%)
```

### Task 140 — `src/__tests__/140-wal-checkpoint.test.ts`

```typescript
// Test 1: runWalCheckpoint completes without throwing (in-memory DB)
const db = new Database(':memory:');
expect(() => runWalCheckpoint(db)).not.toThrow();

// Test 2: INFO log emitted
// Spy on logger.info — check for 'WAL checkpoint + optimize complete'

// Test 3 (integration, optional): real file DB WAL size drops
// Create real DB, write 100 rows, verify WAL exists, checkpoint, verify WAL near-zero
```

### Task 136 — `src/__tests__/136-circuit-breaker.test.ts`

The `CircuitBreaker` class already exists, so this test file may already exist. Check before creating. If it exists, add wrapping tests:

```typescript
// Test 1 (if class tests don't exist): state machine transitions
// Test 2: fetchHosePrices with mock breakers.hose in OPEN state → returns []
// Test 3: listSscDocuments with mock breakers.ssc in OPEN state → returns []
// Test 4: WARN log emitted when breaker is OPEN
```

### Task 141 — `src/__tests__/141-system-health-tool.test.ts`

```typescript
// Test 1: tool returns required keys including walSizeBytes, alertStats, lastCycleResult
// Test 2: walSizeBytes === 0 when WAL file absent
// Test 3: lastCycleResult === null before first cycle
// Test 4: lastCycleResult populated after cycle completes
// Test 5: unnotified count accurate after seeding alert with notified_telegram=0
```

---

## Implementation Notes for Developer

1. **Three separate changes to `intelligenceCycleJob.ts`** (137: Step E + `readUnnotifiedAlertsFn`, 138: Step D + `runImpactChainFn(ids)` + `_lastCycleResult`, 141: `getLastCycleResult()` export). These can be done in one commit but each change is independently testable.

2. **Two separate changes to `hose.ts`** (139: `fetchVnIndex` + routing branch, 136: circuit breaker wrapping). Do 139 first, then 136 adds `breakers.cafef.execute()` around the `fetchVnIndex` call and the existing `fetchFromCafef` call.

3. **`ssc.ts` wrapping is surgical** — only wrap `factory()` on line 198 of `listSscDocuments`. Do not wrap the second `listSscDocuments`-style function `downloadSscDocument` (line ~325) unless it also uses `defaultBrowserFactory` directly. Check line 327 — if it does, apply the same pattern.

4. **`circuitBreaker.ts` and `circuitBreakerRegistry.ts` require NO changes.** The existing `CircuitState = "closed" | "open" | "half-open"` is the correct state string — do not introduce uppercase variants.

5. **`McpConfig` type in `config.ts`** does not include `circuitBreaker`. The registry uses hardcoded defaults (`failureThreshold: 5, resetTimeoutMs: 60000`). This matches `mcp.config.json`. No config type change is needed for Sprint 014.

6. **`SchedulerConfig` in `config.ts`** does not include `walCheckpoint`. The `jobs.ts` uses `Bun.env.CRON_WAL_CHECKPOINT ?? '0 20 * * *'` directly (same pattern as all other crons). This is acceptable — add `walCheckpoint` to `SchedulerConfig` and `loadMcpConfig()` for completeness but it is not blocking.

7. **Tool count in `server.ts`**: The file already registers `registerSystemTools` which adds 4 tools (`get_system_health`, `get_global_log`, `get_tool_log`, `get_error_summary`). After Task 141 modifies the existing `get_system_health` tool, no tool count change occurs. Do not touch `server.ts`.
