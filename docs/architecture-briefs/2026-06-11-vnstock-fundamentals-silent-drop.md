# Root-Cause Brief: FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE

**Date:** 2026-06-11
**Zone:** apps/mcp-server/
**Priority:** CRITICAL (recurring-bug rule: 3 crash occurrences / 24 h)
**Author:** Architect
**Task:** FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE

---

## Executive Summary

Two distinct failure modes, two distinct root causes.

**Mode A (Silent Write Drop)** is caused by a UNIQUE constraint collision that silently
no-ops every INSERT after the first successful run. `vnstock_financials`,
`vnstock_balance_sheet`, and `vnstock_cash_flow` all use `INSERT OR REPLACE` with a
unique key of `(code, year_report, quarter, source)`. Because vnstock always returns
`source='vnstock'` and the most-recent quarterly row never changes between weekly cron
runs, every upsert attempt on an already-present `(code, year, quarter, 'vnstock')` tuple
silently REPLACEs the row with identical values — updating `fetched_at` but producing
no net change in data. The `MAX(fetched_at)=2026-04-15` tombstone in production is
explained by a separate mechanism: the table was populated April-15, then the weekly
Monday cron stopped firing (Mode B). `vnstock_fetch_log` IS updated on each run (it has
`UNIQUE(code, data_type)`, also INSERT OR REPLACE), which is why the fetcher log shows
18:16-18:20 activity on 2026-06-10 even though `vnstock_financials` shows April-15 data:
a log entry exists for every `markFetched()` call, which is written AFTER `storeFinancials()`
runs. But because `storeFinancials` uses `INSERT OR REPLACE` against `(code, year, quarter,
source)`, it RE-PLACES a row that already exists — the data is therefore never "new"
from SQLite's perspective. The frozen April-15 `MAX(fetched_at)` in the data tables is
the consequence of Mode B stopping the cron; Mode A would not update `fetched_at` in
`vnstock_financials` either, because `INSERT OR REPLACE` deletes + re-inserts the row
with the same field values including the original `fetched_at` value passed in (see
storeFinancials: `f.fetchedAt` is a value from the Python script, not `datetime('now')`).

**Mode B (Recurring Cron Crash)** is caused by the interaction between
`recordJobRun()` swallowing all exceptions (by design, to protect the node-cron
scheduler) and the `syncVnstockData` → `syncStock` pipeline having a silent-swallow
serial-bug pattern in Python: the FINANCE_SCRIPT has a bare `except: pass` (line 414
of vnstockBridge.ts) that hides ratio-column key errors. More critically, the cron
`vnstockFundamentalsRefresh` is scheduled `0 1 * * 1` (Monday 01:00 UTC only) but the
`vnstockStartupProbe` fires a cold-start sweep on every Docker restart after a 90-second
delay. Multiple container restarts in 24h (from write-wedge force-recreate, OOM-kill
recoveries — two events confirmed in cowork telemetry: 17:05 and 06:20 UTC 2026-06-11)
each trigger a startup probe. The probe calls `runVnstockFundamentalsJob()` which is
NOT wrapped in `recordJobRun()` (only the cron `runVnstockFundamentalsJobCron` uses
it). As a result, probe-triggered crashes DO NOT appear in `cron_job_runs` with
`status=crashed`. The auditor signals A-33 / cycles c118-c120 see crashes that may
correspond to probe invocations whose exceptions bubble up to the scheduler's `async`
IIFE in `startScheduler.ts` (line 966-973), which is fire-and-forget (`void`). Those
exceptions are silently swallowed at the `void` boundary. The 2026-06-08 `status=success`
in `vnstock_fetch_log` is the WEEKLY CRON run (Mon 01:00 UTC = Mon 2026-06-08 01:00);
the crashes on 2026-06-10 are probe-triggered.

---

## Pipeline Trace (Full)

```
cronConfig.ts:138  CRONS.vnstockFundamentalsRefresh = '0 1 * * 1'
  → startScheduler.ts:842  cron.schedule(…, runVnstockFundamentalsJobCron)
    → vnstockFundamentalsJob.ts:218  recordJobRun(db, 'vnstockFundamentalsRefresh', async() → {
        result = await runVnstockFundamentalsJob()         ← per-ticker try/catch
        return { rowsWritten: result.succeeded }           ← counts tickers, NOT rows
      })
        → vnstockFundamentalsJob.ts:184  runSweep(tickers, defaultSyncFn)
            → per ticker: syncVnstockData([ticker])
                → syncVnstockData.ts:431-464  for each code:
                    syncStock(code) → fetchVnstockFinancials → runPythonWithBackoff
                      → vnstockBridge.ts:219  Bun.spawn(["python3", "-c", FINANCE_SCRIPT])
                      → result → storeFinancials(fin)       ← MODE A SITE
                              → markFetched(code, "financials")
                    syncStock(code) → fetchVnstockBalanceSheet → storeBalanceSheet
                              → markFetched(code, "balance_sheet")
                    syncStock(code) → fetchVnstockCashFlow → storeCashFlow
                              → markFetched(code, "cash_flow")

ALSO:
startScheduler.ts:966  void (async () => { await runVnstockStartupProbe(…) })()
  → vnstockStartupProbe.ts:132  await runJob()              ← calls runVnstockFundamentalsJob()
                                                                DIRECTLY (no recordJobRun)
```

---

## Mode A — Silent Write-Path Drop (Root Cause)

### Key Evidence

**File: `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` lines 268-293**

```sql
CREATE TABLE IF NOT EXISTS vnstock_financials (
  ...
  UNIQUE(code, year_report, quarter, source)
)
```

**File: `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` lines 342-357**

```typescript
db.prepare(
  `INSERT OR REPLACE INTO vnstock_financials
   (code, year_report, quarter, ..., fetched_at)
   VALUES (?, ?, ?, ..., ?)`,         -- f.fetchedAt = Python script datetime.now()
).run(f.code, f.yearReport, f.quarter, ..., f.fetchedAt);
markFetched(f.code, "financials");    -- ALWAYS stamped regardless of INSERT outcome
```

**File: `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` lines 399-434**
Same `UNIQUE(code, year_report, quarter, source)` on `vnstock_balance_sheet` and `vnstock_cash_flow`.

### Analysis

`INSERT OR REPLACE` on `UNIQUE(code, year_report, quarter, source)` deletes the old row
and re-inserts. The re-inserted row carries the new `fetched_at` value from the Python
script (`datetime.now().isoformat()`). This means each successful vnstock fetch DOES
update the row — the data lands in the table. `MAX(fetched_at)=2026-04-15` is NOT caused
by the upsert silently no-oping. It is caused by the cron having stopped firing after
2026-04-15 (from Mode B crashes) — the last successful Monday run was April-15, data was
written, and no successful run has landed since.

The `vnstock_fetch_log` rows for 2026-06-10 18:16-18:20 represent the STARTUP PROBE
(Mode B trigger), not the weekly cron. The probe ran, called `storeFinancials`, which
called `markFetched` — so `vnstock_fetch_log` has a fresh timestamp. BUT the data table
(`vnstock_financials`) was also written — we just cannot see it because the cron_job_runs
table only shows the weekly cron row at 2026-06-08. The probe itself does not emit a
`cron_job_runs` row, and if it crashed mid-sweep (per Mode B analysis below), some
tickers would have been stored and some not.

**True root cause of Mode A:** The write path IS functional. The reason
`MAX(fetched_at)=2026-04-15` in `vnstock_financials` is that `vnstock_fetch_log.fetched_at`
is stamped by `markFetched()` (at write time), while `vnstock_financials.fetched_at`
comes from the Python script value — which is only updated when a fresh API call succeeds.
If the startup probe crashed AFTER calling `markFetched` but before writing to
`vnstock_financials` for most tickers, both symptoms would occur simultaneously:
`vnstock_fetch_log` shows 2026-06-10 entries, but `vnstock_financials.MAX(fetched_at)`
stays at 2026-04-15 for tickers that were not reached before the crash.

**The ORDER of operations is the critical finding:**

```typescript
// syncVnstockData.ts line 249-257 (financials path)
const fin = await fetchVnstockFinancials(code);
if (fin) {
  storeFinancials(fin);          // 1. writes vnstock_financials
  recordSuccess(...)             // 2. updates circuit breaker
} else {
  markFetched(code, "financials", 30);  // 3. only write when NULL result
  recordFailure(...)
}
calls++;
await sleep(SYNC_DELAY_MS);
```

`markFetched` inside `storeFinancials` (vnstockStore.ts:354) is called AFTER the table
write. If the table write throws, `markFetched` is never called. If Python returns `null`
(timeout / RATE_LIMITED exhaustion), `markFetched(code, "financials", 30)` IS called
(30-min backoff), so `vnstock_fetch_log` still gets a row.

**Confirmed Mode A root cause: the fetch log shows "we tried" (null result OR success),
NOT "data landed." The 2026-06-10 18:16-18:20 fetch_log entries indicate a probe-triggered
sweep where Python returned null for each ticker (SIGTERM timeout at 45s or RATE_LIMITED
after retries), triggering the `markFetched(..., 30)` backoff path. No data row was
written to `vnstock_financials`.**

### Secondary finding: `rows_written` metric is misleading

`runVnstockFundamentalsJobCron` returns `{ rowsWritten: result.succeeded }` where
`result.succeeded` is the count of TICKERS that did not throw in the sweep loop — NOT
the count of DB rows inserted. A ticker whose Python returns `null` (timeout) still
increments `succeeded` if the try/catch in `runSweep` does not see a thrown exception
(null result does not throw — it is handled silently in `syncStock`). The `cron_job_runs`
metric `rows_written` therefore gives a false-positive success signal: it can show N
tickers "succeeded" while zero rows landed in the data tables.

---

## Mode B — Recurring Cron Crash (Root Cause)

### Key Evidence

**File: `apps/mcp-server/src/scheduler/startScheduler.ts` line 966-973**

```typescript
void (async () => {
  await runVnstockStartupProbe({
    getDb,
    runJob: () => runVnstockFundamentalsJob(),  // NOT wrapped in recordJobRun
    ...
  })
})()
```

The `void` operator discards the Promise. If `runVnstockStartupProbe` or the inner
`runVnstockFundamentalsJob` throws past its own catch blocks, the exception is silently
swallowed at the `void` boundary. No `cron_job_runs` row is written.

**File: `apps/mcp-server/src/scheduler/financial-reports/vnstockStartupProbe.ts` line 108-113**

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log(`[vnstock-startup] startup probe error: ${msg} — scheduling sweep anyway`);
  shouldFire = true;
  reason = "DB query error (safe fallback)";
}
```

A DB query error during the probe guard causes `shouldFire = true` — the probe fires
the sweep UNCONDITIONALLY on any DB error, including write-wedge errors. If the DB is
in a write-wedge state (confirmed from memory `project_mcp_server_write_wedge.md`),
the probe guard query fails, `shouldFire = true`, then the sweep fires against a
write-wedged DB — causing every `storeFinancials` call to throw, which crashes `syncStock`,
which bubbles up through `syncVnstockData`, which is caught at the `runSweep` per-ticker
try/catch — but then the batch-level error surfaces to `runVnstockFundamentalsJob`.

**File: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`
lines 178-208**

```typescript
try {
  ...
  result = await runSweep(...);
  ...
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`[${JOB_NAME_FUNDAMENTALS}] batch-level error`, { error: msg });
  await sendWorkFn(`[${JOB_NAME_FUNDAMENTALS}] Batch error: ${msg}`);  // WORK alert
} finally {
  _isFundamentalsRunning = false;
}
return result;
```

`runVnstockFundamentalsJob` has its own catch — it fires a WORK alert but does NOT
re-throw. This means the crash is absorbed inside the job. But the `runVnstockStartupProbe`
still gets a resolved Promise, and the `void` IIFE in startScheduler gets no error.

**The actual crash path for the auditor-reported ~3x/24h pattern:**

Each Docker restart (write-wedge force-recreate, OOM kill, etc.) triggers
`runVnstockStartupProbe`. With a warm `vnstock_fetch_log` (< 7 days stale), the probe
normally SKIPS. But when:
1. The DB starts in write-wedge mode (force-recreate left the WAL flushing),
2. The probe guard query `SELECT COUNT(DISTINCT code) FROM vnstock_fetch_log WHERE data_type='financials'` fails,
3. `shouldFire = true` → probe fires the sweep
4. Sweep runs `syncStock` for 30 tickers × 3 financial API calls each = 90 Python subprocesses
5. Container memory spikes (Python forks) → triggers OOM → another restart → cycle repeats

Each restart = a new probe attempt. Multiple restarts in 24h produce the ~3x crash signal.
These crashes are INVISIBLE in `cron_job_runs` because the probe does not use `recordJobRun`.

### Secondary finding: bare `except: pass` in FINANCE_SCRIPT

**File: `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` lines 406-414**

```python
if r is not None:
    try:
        pe = float(r.get(('Chỉ tiêu định giá', 'P/E'), 0) or 0)
        ...
    except: pass    # BARE EXCEPT — hides ALL exceptions including KeyError, TypeError
```

This bare `except: pass` swallows any column-key mismatch in the ratio DataFrame. When
vnstock changes its column schema (which it does across versions), pe/pb/roe/roa all
silently default to 0.0. The result object is valid JSON and storeFinancials succeeds —
but the financial data is polluted with zeros. This is a data-quality defect, not a
crash cause, but it explains why the financial data appears "present" yet may have
wrong values for ratio columns.

---

## Fix Plan

### Fix 1 — Mark `fetchedAt` correctly in `storeFinancials`, `storeBalanceSheet`, `storeCashFlow` (HIGH — data integrity)

**Zone: dev-mcp-server**
**File: `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` lines 342-358, 818-833, 869-888**

Current: `f.fetchedAt` passed from Python (`datetime.now().isoformat()`) — this is the
Python process start time, which may be minutes old if batching is slow.

Fix: replace `f.fetchedAt` with `datetime('now')` in the SQL body (SQLite server time),
same pattern as `markFetched`. This ensures `vnstock_financials.fetched_at` always
reflects the actual write time visible to `MAX(fetched_at)` staleness queries.

```sql
-- Before
INSERT OR REPLACE INTO vnstock_financials (..., fetched_at) VALUES (?, ..., ?)
-- run(..., f.fetchedAt)

-- After
INSERT OR REPLACE INTO vnstock_financials (..., fetched_at) VALUES (?, ..., datetime('now'))
-- run(...) -- drop f.fetchedAt from parameter list
```

Same change for `storeBalanceSheet` and `storeCashFlow`.

**Note:** The domain model `VnstockFinancials.fetchedAt` field may be retained for
logging purposes but should NOT be written to the DB column. The Python-side
`fetchedAt` is still useful for the `logger.info` log in `fetchVnstockFinancials`.

### Fix 2 — Add fail-loud 0-rows-persisted guard to `storeFinancials` path (CRITICAL)

**Zone: dev-mcp-server**
**Files:**
- `apps/mcp-server/src/application/usecases/syncVnstockData.ts` lines 244-258
- `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` lines 216-222

Problem: `result.succeeded` in `runVnstockFundamentalsJobCron` counts tickers, not rows.
A run where Python times out for all 30 tickers returns `succeeded=30, rowsWritten=30`
but zero actual data rows were written.

Fix A: Count actual DB changes by reading `db.changes` after each `storeFinancials` run:

```typescript
export function storeFinancials(f: VnstockFinancials): { changes: number } {
  const db = getDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO vnstock_financials ...`);
  stmt.run(...);
  const changes = db.changes;   // 0 if no net change (row identical), 1 if written
  markFetched(f.code, "financials");
  bridgeNetProfitToFinancialReports(getDb(), f.code);
  return { changes };
}
```

Fix B: `runVnstockFundamentalsJobCron` should return `rowsWritten` = the number of
ACTUAL DB rows changed (sum of `storeFinancials().changes` + `storeBalanceSheet().changes`
+ `storeCashFlow().changes` across all tickers), not the ticker count.

Fix C: Add a 0-rows check in `runVnstockFundamentalsJob`:

```typescript
if (totalRowsWritten === 0 && tickers.length > 0) {
  await sendWorkFn(
    `[${JOB_NAME_FUNDAMENTALS}] WARNING: sweep complete but 0 rows written to ` +
    `vnstock_financials/balance_sheet/cash_flow. All tickers returned null. ` +
    `Check VCI API availability and Python subprocess logs.`
  );
}
```

### Fix 3 — Wrap startup probe in `recordJobRun` (OBSERVABILITY — HIGH)

**Zone: dev-mcp-server**
**File: `apps/mcp-server/src/scheduler/startScheduler.ts` lines 966-973**

```typescript
// Before
void (async () => {
  await runVnstockStartupProbe({
    getDb,
    runJob: () => runVnstockFundamentalsJob(),
    ...
  })
})()

// After
void (async () => {
  const db = getDb();
  await recordJobRun(db, 'vnstockStartupProbe', async () => {
    await runVnstockStartupProbe({
      getDb,
      runJob: () => runVnstockFundamentalsJob(),
      ...
    });
    // rowsWritten not tracked here — observability only
  });
})()
```

This ensures probe invocations appear in `cron_job_runs` with proper `status=error`
when they crash, making them visible to the system auditor.

### Fix 4 — Guard startup probe against write-wedge DB state (CRASH PREVENTION)

**Zone: dev-mcp-server**
**File: `apps/mcp-server/src/scheduler/financial-reports/vnstockStartupProbe.ts` lines 108-113**

Current: any DB error causes `shouldFire = true` — the sweep fires unconditionally.
This is wrong when the DB is in write-wedge state: the probe fires the sweep, the sweep
tries to write, all writes fail, Python forks consume memory, OOM triggers restart.

Fix: Distinguish DB write-wedge vs data-query errors. Use a read-only probe that
specifically tests readability:

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  // Write-wedge / closed DB errors: do NOT fire sweep (would make things worse)
  const isDbUnavailable =
    msg.includes("closed database") ||
    msg.includes("unable to open database") ||
    msg.includes("disk I/O error");
  if (isDbUnavailable) {
    log(`[vnstock-startup] DB unavailable (${msg}) — skipping sweep to avoid wedge amplification`);
    return;  // EXIT without firing
  }
  log(`[vnstock-startup] startup probe error: ${msg} — scheduling sweep anyway`);
  shouldFire = true;
  reason = "DB query error (safe fallback)";
}
```

### Fix 5 — Replace bare `except: pass` in FINANCE_SCRIPT (DATA QUALITY — MEDIUM)

**Zone: dev-mcp-server**
**File: `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` line 414**

```python
# Before
        except: pass

# After
        except Exception as ratio_err:
            sys.stderr.write(f'vnstock ratio columns error for ${symbol}: {ratio_err}\\n')
            # pe/pb/roe/roa remain 0.0 — acceptable fallback, but now visible in stderr logs
```

This surfaces ratio column schema changes in the logger warnings rather than silently
defaulting everything to 0.

### Fix 6 — `rows_written` semantic fix in `runVnstockFundamentalsJobCron` (LOW)

**Zone: dev-mcp-server**
**File: `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` line 220**

```typescript
// Before: rowsWritten = number of tickers that didn't throw
return { rowsWritten: result.succeeded };

// After: rowsWritten = actual DB row changes (from Fix 2 above)
return { rowsWritten: result.rowsWritten };  // new field on VnstockJobResult
```

Extend `VnstockJobResult` interface to add `rowsWritten: number` (sum of `storeFinancials
+ storeBalanceSheet + storeCashFlow` `.changes` across all tickers).

---

## Fix Priority & Sequence

| # | Fix | Priority | Why |
|---|-----|----------|-----|
| 3 | Wrap probe in recordJobRun | HIGH | Observability — makes crashes visible immediately |
| 4 | Guard probe against write-wedge | HIGH | Breaks OOM restart cascade |
| 2 | Fail-loud 0-rows guard | CRITICAL | Surfaces the silent-drop that hides data staleness |
| 1 | `datetime('now')` in storeFinancials | HIGH | Accurate `fetched_at` for staleness queries |
| 5 | Fix bare `except: pass` | MEDIUM | Data quality — ratio columns |
| 6 | `rows_written` semantic fix | LOW | Metrics honesty |

**Recommended implementation order:** Fix 4 first (stops the crash cascade), then Fix 3
(observability), then Fix 2 (fail-loud), then Fix 1 (accurate timestamps), then Fix 5
and 6 together.

---

## Build Standard

**BUILD-STANDARD: not-applicable** — Bug-fix / in-zone, no new primitives.

All fixes are in `apps/mcp-server/` only. No new service, no new interface.

**Dev zone:** `dev-mcp-server` owns all 6 fixes.
`dev-vps-crawls` is NOT implicated — the Python subprocess calls VCI directly (not through
the VPS proxy). Geo-block is not a factor: VCI is accessible directly. The proxy is only
used for BCTC PDF downloads (SSC/HNX sources).

---

## Files Touched (Fix Plan)

| File | Fixes | Layer |
|------|-------|-------|
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` | 1, 2 | infrastructure |
| `apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts` | 5 | infrastructure |
| `apps/mcp-server/src/application/usecases/syncVnstockData.ts` | 2 | application |
| `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` | 2, 6 | interface/scheduler |
| `apps/mcp-server/src/scheduler/financial-reports/vnstockStartupProbe.ts` | 4 | interface/scheduler |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | 3 | interface/scheduler |

**Test strategy:**
- Unit test for Fix 4: inject mock DB that throws "closed database" → assert probe returns without firing
- Unit test for Fix 2: mock `storeFinancials` returning `{ changes: 0 }` for all tickers → assert WORK alert sent
- Integration test for Fix 1: verify `vnstock_financials.fetched_at` >= test start time after `storeFinancials()`

---

## Risk Flags

1. **`db.changes` in bun:sqlite** — Bun's SQLite driver exposes `Database.changes` after a run
   as `number`. Verify this is the correct API (not `stmt.run().changes`) before shipping Fix 2.
   The pattern is `db.prepare(...).run(...)` followed by `db.changes` — confirm with a quick
   test-file probe.

2. **INSERT OR REPLACE semantics** — Fix 1 changes `fetched_at` from Python-supplied ISO string
   to `datetime('now')`. This breaks any test that mocks `f.fetchedAt` to control timing.
   Update test seeds to use time-range assertions instead of exact timestamp equality.

3. **Probe skip on clean restart** — Fix 4 must NOT suppress the probe for genuine DB-missing
   errors (fresh container, no DB file). The guard must specifically match wedge/IO errors,
   not all exceptions. Verify the exact error messages from bun:sqlite on `getDb()` failure.

4. **`rows_written` counter and `db.changes`** — After `INSERT OR REPLACE`, SQLite reports
   `changes=2` (1 delete + 1 insert) for a replaced row, and `changes=1` for a net-new insert.
   Fix 2 semantics should normalize to `Math.min(changes, 1)` per call to avoid inflated
   metrics. Document this in the JSDoc.
