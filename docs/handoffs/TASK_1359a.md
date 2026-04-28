# TASK 1359a — vpsServiceHealthJob + walCheckpointAlert Gap Tests (16 tests)

## Context

Sprint 1359. Scheduler layer. Two jobs with zero test coverage at the job/integration
level. The domain-layer poller (`vpsHealthPoller.ts`) and the `walCheckpointAlert` helper
are already tested at the unit level. These 16 tests close the scheduler-job gap:
specifically `runVpsServiceHealthJob` (the DB-write coordinator) and the two-tier
threshold behaviour of `walCheckpointAlert` at boundaries not yet exercised.

**Source files (read-only — no production changes):**
- `apps/mcp-server/src/scheduler/system/vpsServiceHealthJob.ts`
- `apps/mcp-server/src/scheduler/walCheckpointAlert.ts`

**Output file to create:**
- `apps/mcp-server/src/__tests__/1359a-vps-health-job-wal-checkpoint-gaps.test.ts`

---

## Coverage Gap Analysis

### Already covered (do NOT duplicate)

`FIX-VPS-HEALTH-FRESHN.test.ts` covers `checkServiceFreshness` at the domain level:
healthy/unhealthy/unreachable per service, passive service, DB-error fail-open, market
hours guard. `234-vps-health-sla.test.ts` covers `pollVpsServiceHealth`, schema shape,
SLA breach detection, and the no-polymarket-breaker meta-test.

`1476-wal-stuck-alert.test.ts` covers: CRITICAL path (remaining > 10 000), boundary
at exactly 5 000 (= WAL_WARN_THRESHOLD, silent), clean WAL (remaining = 0), send
error swallowed. That test was written against the old 50 000 threshold; the production
code uses 5 000 / 10 000. The existing tests pass against current thresholds but leave
the following gaps open.

### Gaps for 1359a

**VPS Health Job (VHJ — 8 tests):** `runVpsServiceHealthJob` is never tested. It wraps
`checkAllVpsServiceFreshness` and writes each result to `vps_service_health` via a
prepared INSERT. The DI signature is `(db, configs?)`.

**WAL Checkpoint Alert (WCA — 8 tests):** The two-tier boundary semantics (5 000 /
10 000) need explicit boundary-value and message-content coverage. The existing test
file covers three of the logical cases but misses: warn-path message content, critical
path message content, remaining = 5 001 (first warn), remaining = 10 001 (first
critical), remaining = 10 000 (exact threshold — warn, not critical), and multi-call
isolation.

---

## Section A — runVpsServiceHealthJob (VHJ-1 through VHJ-8)

### Schema helper

```typescript
function buildVpsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE vps_service_health (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name       TEXT NOT NULL,
      polled_at          TEXT NOT NULL,
      health_status      TEXT NOT NULL,
      response_time_ms   INTEGER,
      last_successful_run TEXT,
      uptime_seconds     INTEGER,
      error_message      TEXT
    );
    CREATE TABLE market_prices (
      code TEXT, price REAL, change_amt REAL, change_pct REAL,
      volume INTEGER, updated_at TEXT, exchange TEXT
    );
    CREATE TABLE market_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT, message_type TEXT, ticker TEXT, content TEXT, sent_at TEXT
    );
    CREATE TABLE daily_ohlcv (
      code TEXT, date TEXT, close REAL, updated_at TEXT, foreign_buy_vol INTEGER
    );
    CREATE TABLE sbv_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT, fetched_at TEXT
    );
  `);
  return db;
}
```

### Import

```typescript
import { runVpsServiceHealthJob } from "../scheduler/system/vpsServiceHealthJob.js";
import {
  DEFAULT_FRESHNESS_CONFIGS,
  type FreshnessConfig,
} from "../domain/services/vpsHealthPoller.js";
```

### VHJ-1: polled count equals config length

Arrange: `buildVpsDb()`, pass 3-element custom configs array (all passive).
Act: `const r = await runVpsServiceHealthJob(db, threeConfigs)`.
Assert: `r.polled === 3`.

Rationale: `polled` is the length of the freshness-check results array, not the
stored count.

### VHJ-2: stored count equals polled count when all INSERTs succeed

Arrange: `buildVpsDb()`, pass 3 passive configs.
Act: `const r = await runVpsServiceHealthJob(db, threeConfigs)`.
Assert: `r.stored === 3`.
Also assert: `SELECT COUNT(*) FROM vps_service_health` returns 3.

### VHJ-3: empty config array returns polled=0, stored=0, writes nothing

Arrange: `buildVpsDb()`, pass `[]` as configs.
Act: `const r = await runVpsServiceHealthJob(db, [])`.
Assert: `r.polled === 0`, `r.stored === 0`.
Assert: `SELECT COUNT(*) FROM vps_service_health` returns 0.

### VHJ-4: DB INSERT failure for one row does not prevent others from storing

Arrange: `buildVpsDb()`. Prepare a 2-element configs array (both passive).
Wrap `db.prepare` so the first call to `stmt.run()` throws, subsequent calls succeed.
Act: `const r = await runVpsServiceHealthJob(db, twoConfigs)`.
Assert: `r.polled === 2`, `r.stored === 1` (one failed, one succeeded, no re-throw).
Assert: the second service IS present in `vps_service_health`.

Implementation hint — stub pattern (no mock.module needed):
```typescript
const realPrepare = db.prepare.bind(db);
let callCount = 0;
db.prepare = (sql: string) => {
  const stmt = realPrepare(sql);
  if (sql.includes("INSERT INTO vps_service_health")) {
    const realRun = stmt.run.bind(stmt);
    stmt.run = (...args: unknown[]) => {
      callCount++;
      if (callCount === 1) throw new Error("simulated INSERT failure");
      return realRun(...args);
    };
  }
  return stmt;
};
```

### VHJ-5: stored rows contain correct service_name and health_status

Arrange: `buildVpsDb()`. Use a single passive config with `serviceName: "vn-bctc-fetch"`.
Act: `await runVpsServiceHealthJob(db, [passiveConfig])`.
Query: `SELECT service_name, health_status FROM vps_service_health LIMIT 1`.
Assert: `service_name === "vn-bctc-fetch"`, `health_status === "healthy"`.

### VHJ-6: stored rows have a valid ISO polled_at timestamp

Arrange/Act: same as VHJ-5.
Query: `SELECT polled_at FROM vps_service_health LIMIT 1`.
Assert: `new Date(row.polled_at).toISOString()` does not throw (i.e., parses as valid ISO).

### VHJ-7: unhealthy result is stored, not silently dropped

Arrange: `buildVpsDb()`. Build a non-passive config with a SQL that returns a row
older than maxAgeMs:
```typescript
const staleConfig: FreshnessConfig = {
  serviceName: "vn-news-fetch",
  description: "test stale",
  latestTimestampSql: `SELECT '2000-01-01T00:00:00.000Z' AS latest_at`,
  maxAgeMs: 1,
};
```
Act: `const r = await runVpsServiceHealthJob(db, [staleConfig])`.
Assert: `r.stored === 1`.
Query: `SELECT health_status FROM vps_service_health LIMIT 1`.
Assert: `health_status === "unhealthy"`.

### VHJ-8: runVpsHealthPolling smoke — resolves without throwing (dynamic import guard)

This test verifies the public cron entry-point `runVpsHealthPolling()` does not crash
when the dynamic import path resolves in test env. Because `getDb()` in test env points
to the in-memory DB (set via `Bun.env.DB_PATH = ":memory:"`), this is a smoke test:

```typescript
Bun.env["DB_PATH"] = ":memory:";
// runVpsHealthPolling dynamically imports schema.js then calls runVpsServiceHealthJob.
// It catches all errors internally — must resolve (not reject).
await expect(runVpsHealthPolling()).resolves.toBeUndefined();
```

Assert: promise resolves (does not reject), return value is `undefined`.

---

## Section B — walCheckpointAlert (WCA-1 through WCA-8)

### Import + fixture pattern

```typescript
import { walCheckpointAlert } from "../scheduler/walCheckpointAlert.js";

// Each test constructs its own sendWorkCalls array + mock fn
let calls: string[];
let mockSend: (msg: string) => Promise<void>;

beforeEach(() => {
  calls = [];
  mockSend = async (msg: string) => { calls.push(msg); };
});
```

### WCA-1: remaining below warn threshold (4 999) — silent

`remaining = 9_999 - 5_000 = 4_999` (< WAL_WARN_THRESHOLD 5 000).
Assert: `calls.length === 0`.

Rationale: closes off-by-one below the lower boundary.

### WCA-2: remaining exactly at warn threshold (5 000) — silent

`remaining = 10_000 - 5_000 = 5_000` (= WAL_WARN_THRESHOLD — the guard is `<=`).
Assert: `calls.length === 0`.

Rationale: the production guard is `if (remaining <= WAL_WARN_THRESHOLD) return`.
Exactly at threshold must be silent.

### WCA-3: remaining = 5 001 — first warn fires

`remaining = 15_001 - 10_000 = 5_001` (first frame above WAL_WARN_THRESHOLD).
Assert: `calls.length === 1`.
Assert: `calls[0]` contains `"WAL WARNING"`.
Assert: `calls[0]` does NOT contain `"WAL CRITICAL"`.

### WCA-4: warn message content shape

`remaining = 6_000 - 0 = 6_000` (> 5 000, <= 10 000).
Assert: `calls[0]` contains `"WAL WARNING"`.
Assert: `calls[0]` contains `"6000 frames un-flushed"`.
Assert: `calls[0]` contains `"WAL=6000"`.
Assert: `calls[0]` contains `"checkpointed=0"`.
Assert: `calls[0]` contains `"monitoring"`.
Assert: `calls[0]` does NOT contain `"manual restart"`.

### WCA-5: remaining exactly at critical threshold (10 000) — warn, not critical

`remaining = 20_000 - 10_000 = 10_000` (= WAL_STUCK_THRESHOLD exactly).
The production guard is `isCritical = remaining > WAL_STUCK_THRESHOLD` (strict `>`).
Assert: `calls.length === 1`.
Assert: `calls[0]` contains `"WAL WARNING"`.
Assert: `calls[0]` does NOT contain `"WAL CRITICAL"`.

Rationale: this is the exact boundary between warn and critical. Must be warn.

### WCA-6: remaining = 10 001 — first critical fires

`remaining = 30_001 - 20_000 = 10_001` (first frame above WAL_STUCK_THRESHOLD).
Assert: `calls.length === 1`.
Assert: `calls[0]` contains `"WAL CRITICAL"`.

### WCA-7: critical message content shape

`remaining = 15_000 - 0 = 15_000`.
Assert: `calls[0]` contains `"WAL CRITICAL"`.
Assert: `calls[0]` contains `"15000 frames un-flushed"`.
Assert: `calls[0]` contains `"manual restart may be needed"`.
Assert: `calls[0]` does NOT contain `"monitoring"`.

### WCA-8: send error is swallowed — promise resolves, no re-throw

`remaining = 20_000` (critical). Inject a throwing `sendWorkFn`:
```typescript
const throwingFn = async (_msg: string) => { throw new Error("Telegram down"); };
await expect(
  walCheckpointAlert({ walSize: 30_000, checkpointed: 10_000 }, throwingFn),
).resolves.toBeUndefined();
```

This extends `1476`'s existing throw test by verifying the resolve value is
`undefined`, not just that it does not throw.

---

## DI Strategy Summary

| Job | DI mechanism | Mock needed |
|-----|-------------|-------------|
| `runVpsServiceHealthJob` | `(db, configs?)` — plain args | in-memory `Database`, custom `FreshnessConfig[]` |
| `runVpsHealthPolling` | dynamic import, catches internally | `Bun.env.DB_PATH = ":memory:"` |
| `walCheckpointAlert` | `sendWorkFn?` optional arg | inline async function |

No `mock.module` needed for any test in this file.

---

## Constraints

- No production file changes.
- File starts with `Bun.env["DB_PATH"] = ":memory:";` before any imports.
- All 16 tests must pass in the baseline suite (`bun test`).
- Test file path: `apps/mcp-server/src/__tests__/1359a-vps-health-job-wal-checkpoint-gaps.test.ts`

---

## Acceptance Criteria (from SPRINT_GOAL.md)

- 16 new tests, all green.
- Covers DI path, DB-insert-failure isolation, threshold boundaries.
- Full suite: prior baseline + 16 = at minimum 7 772 pass (plus whatever 1359b adds).
- 0 TS errors.
