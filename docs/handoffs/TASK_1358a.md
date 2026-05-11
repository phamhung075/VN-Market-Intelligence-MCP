# TASK_1358a — bctcOverdueCheckJob gap tests

**Sprint:** 1358
**Layer:** interface/scheduler (test only — no production changes)
**Source:** `apps/mcp-server/src/scheduler/financial-reports/bctcOverdueCheckJob.ts`
**Output:** `apps/mcp-server/src/__tests__/1358a-bctc-overdue-check-gaps.test.ts`

---

## Brownfield — what test 316 already covers

| # | What |
|---|------|
| 316-1 | Single ticker overdue 5 days — 1 alert inserted |
| 316-2 | Slice-2 wire-up — inserted alert visible via `readUnnotifiedAlerts` |
| 316-3 | Below threshold (1 day) — 0 alerts |
| 316-4 | Filing exists (DA_NOP) — 0 alerts |
| 316-5 | Idempotency same UTC day — second run inserts 0 |
| 316-6 | Batch anti-spam — 5 tickers, 1 filing → 4 overdue, 1 alert |
| 316-7 | Custom `overdueDaysThreshold` param |
| 316-8 | Weekly epoch dedup — same week no re-fire, week+1 fires |

Do NOT duplicate any of these. New file covers gaps only.

---

## DI strategy

The job already exposes a clean `RunOptions` bag:

```typescript
export async function runBctcOverdueCheck(opts: RunOptions = {}): Promise<RunResult>
// opts.db        — injectable Database (use in-memory SQLite)
// opts.now       — injectable reference instant
// opts.overdueDaysThreshold — injectable threshold
```

`runImpactChain` is imported directly (no DI surface). Use `mock.module()` to stub it for the cascade fire-and-forget test only. All other 7 tests use real in-memory SQLite and real domain functions — no `mock.module` needed.

**DDL required** (same as test 316 `buildDb()`):

```sql
CREATE TABLE watchlist (code TEXT PRIMARY KEY, exchange TEXT NOT NULL DEFAULT 'HOSE', domain TEXT NOT NULL DEFAULT 'general');
CREATE TABLE financial_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, action_code TEXT NOT NULL, period_year INTEGER NOT NULL, period_quarter INTEGER, published_at TEXT);
CREATE TABLE alerts (id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL, severity TEXT NOT NULL, signals_json TEXT, affected_actions_json TEXT, analysis_ids_json TEXT, message TEXT, read INTEGER NOT NULL DEFAULT 0, user_note TEXT, notified_telegram INTEGER NOT NULL DEFAULT 0);
```

---

## 8 test cases

### OVD-1: patchBrokenSignalsJson — broken rows are patched on run

**What to test:** rows in `alerts` with `id LIKE 'bctc-overdue:%'` and `signals_json` without a `"type"` key (old string-array format) are rewritten to a proper Signal object array.

**Setup:**
- Insert an alert row with `id = 'bctc-overdue:FPT:2025:4:19456'`, `signals_json = '["bctc_overdue"]'`, `affected_actions_json = '[{"code":"FPT"}]'`, `message = 'test msg'`, `triggered_at = '2026-01-01T00:00:00.000Z'`, other columns nulled/zeroed
- Call `runBctcOverdueCheck({ db, now: new Date("2026-04-05T00:00:00Z") })` with empty watchlist

**Assert:**
- The row's `signals_json` is now a JSON string containing `"type"` key
- Parsed first signal has `type: "bctc_overdue"`, `severity: "high"`, `actionCode: "FPT"`

---

### OVD-2: patchBrokenSignalsJson — already-valid rows are untouched (no-op WHERE)

**What to test:** a row with valid `signals_json` (already has `"type"`) is NOT modified by the migration.

**Setup:**
- Insert an alert row with `id = 'bctc-overdue:VCB:2025:4:19456'`, `signals_json = '[{"type":"bctc_overdue","severity":"high"}]'`
- Record the `signals_json` value before the run
- Call `runBctcOverdueCheck({ db, now })` with empty watchlist

**Assert:**
- `signals_json` after run is identical to the value before run (no mutation)

---

### OVD-3: threshold boundary — daysOverdue === threshold fires; daysOverdue === threshold − 1 does not

**What to test:** the `<` guard (`if (daysOverdue < threshold) continue`) is exact. At `threshold = 5`:
- 5 days overdue → alert fires
- 4 days overdue → no alert

**Setup:** Two separate `runBctcOverdueCheck` calls, each with a fresh db:
- Run A: `now` such that Q4-2025 deadline (2026-03-31) is exactly 5 days ago → `now = 2026-04-05T00:00:00Z`, `overdueDaysThreshold = 5`
- Run B: `now = 2026-04-04T00:00:00Z`, `overdueDaysThreshold = 5` (4 days overdue)

**Assert:**
- Run A: `result.alertsInserted === 1`
- Run B: `result.alertsInserted === 0`

---

### OVD-4: empty watchlist — returns zeros immediately, no DB writes

**What to test:** when the `watchlist` table has zero rows, the job returns `{ alertsInserted: 0, stocksChecked: 0, overdueFound: 0 }` and writes nothing to `alerts`.

**Setup:** db with empty watchlist.

**Assert:**
- All three counters are `0`
- `SELECT COUNT(*) FROM alerts` = 0

---

### OVD-5: watchlist query throws — returns zeros gracefully

**What to test:** when `db.query(...)` on the watchlist throws (e.g. table missing), the job catches the error and returns zeros without re-throwing.

**Setup:** A duck-typed db where `query()` always throws `new Error("table not found")` on first call.

```typescript
const badDb = {
  query: () => { throw new Error("table not found"); },
  prepare: () => ({ run: () => ({ changes: 0 }) }),
  exec: () => {},
} as any;
```

**Assert:**
- `await runBctcOverdueCheck({ db: badDb })` resolves (no throw)
- Returns `{ alertsInserted: 0, stocksChecked: 0, overdueFound: 0 }`

---

### OVD-6: cascade fire-and-forget — runImpactChain rejection does NOT surface to job result

**What to test:** `void runImpactChain(...).catch(...)` swallows rejections. A job call must return a clean `RunResult` even when `runImpactChain` throws.

**Mock strategy:** `mock.module("../application/usecases/runImpactChain.js", ...)` at top of file to make `runImpactChain` reject immediately.

**Setup:**
- Mock `runImpactChain` to `async () => { throw new Error("cascade failed"); }`
- Insert 1 overdue ticker (FPT, 5 days overdue, no filing)
- Call `runBctcOverdueCheck({ db, now: new Date("2026-04-05T00:00:00Z") })`

**Assert:**
- Job resolves (no throw)
- `result.alertsInserted === 1` (alert was inserted before cascade)
- `result.overdueFound === 1`

**Teardown:** restore `runImpactChain` via `mock.module` afterAll.

---

### OVD-7: batch alert affectedActions contains all overdue ticker codes

**What to test:** `affected_actions_json` in the inserted batch alert is a JSON array where every overdue ticker appears as `{ code, expectedImpact, confidence }`.

**Setup:**
- Insert 3 overdue tickers (FPT, HPG, SSI) — all general domain, no filings
- `now = 2026-04-05T00:00:00Z` (5 days past Q4-2025 deadline)

**Assert:**
- `SELECT affected_actions_json FROM alerts` → parse → length === 3
- All 3 codes present: FPT, HPG, SSI
- Each element has `expectedImpact: "down"`, `confidence: 0.6`

---

### OVD-8: signals_json shape on inserted batch alert

**What to test:** `signals_json` stored in the batch alert is a valid Signal object array with required fields, not the legacy string-array format.

**Setup:**
- Insert 2 overdue tickers (FPT, VNM — no filings), `now = 2026-04-05T00:00:00Z`

**Assert:**
- `SELECT signals_json FROM alerts` → parse → array of length 1
- Signal[0] has: `type === "bctc_overdue"`, `severity === "high"`, `confidence === 0.6`
- `actionCode` contains both "FPT" and "VNM" (comma-separated)
- `detectedAt` is an ISO string

---

## File structure

```
apps/mcp-server/src/__tests__/1358a-bctc-overdue-check-gaps.test.ts
```

Top-level block:
```typescript
Bun.env["DB_PATH"] = ":memory:";
// real-module captures BEFORE mock.module (for OVD-6 teardown)
// mock.module for runImpactChain (mutable factory variable pattern)
// buildDb() helper — same DDL as test 316
// describe("Task 1358a — bctcOverdueCheckJob gap tests", () => { ... })
// afterAll() — restore mocked modules
```

Tests OVD-1 through OVD-5 and OVD-7 through OVD-8: use real domain functions + in-memory SQLite. No `mock.module` needed beyond what is declared top-level for OVD-6.

OVD-6 is the only test that exercises the mock; all others ignore it (the mock factory variable returns a real no-op by default).

---

## Risk flags

- **OVD-6 isolation:** `mock.module` is worker-scoped and permanent. Declare the factory variable at top-level and set it to a pass-through implementation (`async () => ({ chains: [] })`) by default. Only OVD-6 overrides to reject. afterAll restores to frozen real implementation.
- **patchBrokenSignalsJson WHERE clause:** The patch targets `id LIKE 'bctc-overdue:%' AND signals_json NOT LIKE '%"type"%'`. OVD-1 inserts a legacy-format row before calling the job. The job's internal call to `patchBrokenSignalsJson` will fire because the empty watchlist means no new alerts are inserted — confirming migration runs independently of the main scan loop.
- **No production changes required.** The `RunOptions` DI surface is already present. `runImpactChain` is the only module needing `mock.module`.
