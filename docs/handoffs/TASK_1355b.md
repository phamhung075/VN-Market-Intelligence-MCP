# TASK_1355b — Gap-fill tests: davPharmacyJob

**Sprint:** 1355
**Layer:** Test only (scheduler)
**Size:** S (1h)
**Owner:** Developer

---

## Context

`davPharmacyJob.ts` (64 lines) exports a single function with no DI params on its public signature:

```typescript
export async function runDavPharmacyCheck(): Promise<void>
```

All dependencies are imported at the top of the module as static imports:
- `logger` from `../infrastructure/logger.js`
- `fetchDavPharmacy` from `../infrastructure/fetchers/davPharmacy.js`
- `getDb, initDatabase` from `../infrastructure/db/schema.js`
- `insertPharmaEvent` from `../infrastructure/db/pharmaStore.js`

Since the function has no DI params, the test strategy is **`mock.module()` before dynamic import** — identical to the `1352a` pattern for `macroIndicatorRefreshJob` and `marketScanJob`.

---

## Production File

`apps/mcp-server/src/scheduler/davPharmacyJob.ts`

### Key logic paths to cover

| Path | Lines | Notes |
|------|-------|-------|
| `initDatabase()` called before `fetchDavPharmacy()` | 28–31 | Sequencing assertion (DAV-8) |
| `getDb()` called after `initDatabase()` | 29 | Returns the db used for inserts |
| Happy path: N approvals stored, stored=N | 32–51 | DAV-1 |
| Per-item error absorption: inner try/catch on `insertPharmaEvent` | 46–50 | DAV-2, DAV-3 |
| `fetchDavPharmacy` rejects → outer catch logs, no re-throw | 59–63 | DAV-4 |
| Empty approvals array | 31 | DAV-5 |
| `relatedStocks` empty → `stock_code: null` | 41 | DAV-6 |
| `logger.info` final log with `durationMs` field | 54–58 | DAV-7 |
| `initDatabase()` called before `fetchDavPharmacy()` — order | 28–31 | DAV-8 |

---

## DI Surface — Production Change Required

`runDavPharmacyCheck()` has **no DI params**. To enable test injection without production behaviour change, add optional dependency overrides using the same pattern as `macroIndicatorRefreshJob`:

```typescript
// Internal type — not exported
interface DavPharmacyDeps {
  initDb?: () => Promise<void>;
  getDbFn?: () => Database;
  fetchFn?: () => Promise<DrugApproval[]>;
  insertFn?: (db: Database, row: PharmaEventRow) => void;
}

export async function runDavPharmacyCheck(
  _deps: DavPharmacyDeps = {},
): Promise<void>
```

**IMPORTANT:** This is a minimal, additive change. Default values resolve to the real production imports. No callers pass `_deps` — all existing call sites continue to work unchanged.

Alternatively, if the developer prefers to avoid touching production code entirely, they can use `mock.module()` on all four dependency modules. This is the `1352a` approach and is equally valid. The `mock.module` approach is fully sufficient and **requires zero production changes**. Developer may choose either approach.

---

## mock.module Pattern

Follow `1352a` exactly:

1. At the top of the test file (before any imports of the job), capture real implementations:
```typescript
import { fetchDavPharmacy as _realFetchDavPharmacy } from "../infrastructure/fetchers/davPharmacy.js";
import { getDb as _realGetDb, initDatabase as _realInitDatabase } from "../infrastructure/db/schema.js";
import { insertPharmaEvent as _realInsertPharmaEvent } from "../infrastructure/db/pharmaStore.js";
import { logger as _realLogger } from "../infrastructure/logger.js";
```

2. Snapshot to frozen consts immediately:
```typescript
const _frozenFetch = _realFetchDavPharmacy;
const _frozenGetDb = _realGetDb;
const _frozenInitDatabase = _realInitDatabase;
const _frozenInsertPharmaEvent = _realInsertPharmaEvent;
```

3. For each test: call `mock.module(path, factory)` with the desired stubs, then dynamically import the job:
```typescript
mock.module("../infrastructure/fetchers/davPharmacy.js", () => ({
  fetchDavPharmacy: async () => mockApprovals,
}));
mock.module("../infrastructure/db/schema.js", () => ({
  initDatabase: async () => {},
  getDb: () => mockDb,
}));
mock.module("../infrastructure/db/pharmaStore.js", () => ({
  insertPharmaEvent: mockInsert,
}));
const { runDavPharmacyCheck } = await import("../scheduler/davPharmacyJob.js");
await runDavPharmacyCheck();
```

4. In `afterAll`: restore all mocked modules to frozen real implementations.

---

## Schema for in-memory DB (DAV-1 through DAV-3)

For tests that use a real `Database` instance as the `db` passed to `insertPharmaEvent`, the `pharma_events` table DDL is:

```sql
CREATE TABLE IF NOT EXISTS pharma_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  drug_name TEXT,
  manufacturer TEXT,
  stock_code TEXT,
  approval_date TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Since `insertPharmaEvent` is mocked in most tests, a real in-memory DB is only needed if the developer validates inserted rows (optional for DAV-1).

---

## DrugApproval Fixture Helper

```typescript
import type { DrugApproval } from "../infrastructure/fetchers/davPharmacy.js";

function makeApproval(overrides: Partial<DrugApproval> = {}): DrugApproval {
  return {
    drugName: "TestDrug",
    manufacturer: "Dược Hậu Giang",
    registrationNumber: "SD-0001/26",
    approvalDate: "2026-01-15",
    category: "generic",
    relatedStocks: ["DHG"],
    ...overrides,
  };
}
```

---

## Test File

**Path:** `apps/mcp-server/src/__tests__/1355b-dav-pharmacy-job-gaps.test.ts`

**Header:**
```typescript
Bun.env["DB_PATH"] = ":memory:";
```

**Imports:**
```typescript
import { describe, it, expect, mock, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import type { DrugApproval } from "../infrastructure/fetchers/davPharmacy.js";
```

Note: `runDavPharmacyCheck` is imported dynamically inside each test (after `mock.module` calls).

---

## 8 Test Cases

### DAV-1: Normal path — fetchDavPharmacy returns N approvals, stored count = N

**Setup:**
- Mock `fetchDavPharmacy` → returns `[makeApproval(), makeApproval({ drugName: "Drug2", registrationNumber: "SD-0002/26" })]` (2 items)
- Mock `initDatabase` → `async () => {}`
- Mock `getDb` → returns a real in-memory DB (with pharma_events DDL) or a mock db object
- Track `insertPharmaEvent` call count

**Assert:**
- `insertPharmaEvent` called exactly 2 times
- No error thrown

---

### DAV-2: Partial failure — one insertPharmaEvent throws, stored = N-1, job completes

**Setup:**
- Mock `fetchDavPharmacy` → returns 2 approvals
- Mock `insertPharmaEvent`:
  - First call: throws `new Error("DB write failed")`
  - Second call: succeeds (no-op)
- Track calls

**Assert:**
- Job does NOT throw (outer function resolves)
- `insertPharmaEvent` called twice (once failing, once succeeding)
- (Optionally) logger.warn called once for the failed item

---

### DAV-3: All inserts fail — stored = 0, job completes (no re-throw)

**Setup:**
- Mock `fetchDavPharmacy` → returns 2 approvals
- Mock `insertPharmaEvent` → always throws `new Error("DB unavailable")`

**Assert:**
- Job does NOT throw
- `insertPharmaEvent` called 2 times (both failing, both absorbed)

---

### DAV-4: fetchDavPharmacy rejects — outer catch logs error, no re-throw

**Setup:**
- Mock `fetchDavPharmacy` → `async () => { throw new Error("Network timeout"); }`
- Capture logger.error calls (mock logger or spy on it)

**Assert:**
- Job does NOT throw (outer try/catch absorbs it)
- logger.error called with message containing `"job failed"` or `"Network timeout"`

---

### DAV-5: Empty approvals array — stored = 0, logger.info called with fetched:0

**Setup:**
- Mock `fetchDavPharmacy` → `async () => []`
- Capture logger.info calls

**Assert:**
- `insertPharmaEvent` never called
- `logger.info` final call contains `fetched: 0` and `stored: 0`

---

### DAV-6: stock_code null fallback — relatedStocks empty array → stock_code null passed to insertPharmaEvent

**Setup:**
- Mock `fetchDavPharmacy` → returns `[makeApproval({ relatedStocks: [] })]`
- Capture the argument passed to `insertPharmaEvent`

**Assert:**
- `insertPharmaEvent` called once
- Captured row has `stock_code: null`
  - Because: `approval.relatedStocks[0] ?? null` → `undefined ?? null` → `null`

---

### DAV-7: Logger.info called with correct durationMs field (>= 0)

**Setup:**
- Mock `fetchDavPharmacy` → returns `[]`
- Mock the logger, capture the second `logger.info` call (the completion log)

**Assert:**
- The info log object contains a `durationMs` key
- `durationMs >= 0`

---

### DAV-8: initDatabase called before fetchDavPharmacy (sequencing assertion)

**Setup:**
- Track call order using a shared `callOrder: string[]` array
- Mock `initDatabase` → `async () => { callOrder.push("initDatabase"); }`
- Mock `fetchDavPharmacy` → `async () => { callOrder.push("fetchDavPharmacy"); return []; }`

**Assert:**
- `callOrder[0] === "initDatabase"`
- `callOrder[1] === "fetchDavPharmacy"`

---

## mock.module Teardown

```typescript
afterAll(() => {
  mock.module("../infrastructure/fetchers/davPharmacy.js", () => ({
    fetchDavPharmacy: _frozenFetch,
  }));
  mock.module("../infrastructure/db/schema.js", () => ({
    initDatabase: _frozenInitDatabase,
    getDb: _frozenGetDb,
  }));
  mock.module("../infrastructure/db/pharmaStore.js", () => ({
    insertPharmaEvent: _frozenInsertPharmaEvent,
  }));
  mock.module("../infrastructure/logger.js", () => ({
    logger: _realLogger,
  }));
});
```

---

## Production Change Required

None if using the `mock.module` strategy (recommended). The job signature remains `runDavPharmacyCheck(): Promise<void>`.

If the developer chooses the optional DI param approach (described above), the production change is additive only — a default-valued `_deps = {}` parameter — and introduces no behaviour change.

---

## Risk Notes

- `davPharmacy.ts` fetcher has its own internal try/catch that returns `[]` on network error. **The outer catch in `runDavPharmacyCheck` (DAV-4) is triggered only when `fetchDavPharmacy` rejects.** In tests, mock `fetchDavPharmacy` directly to reject — do not rely on the fetcher's internal error handling.
- The job uses `Date.now()` for `durationMs` — this is always `>= 0` without any Date mocking.
- `insertPharmaEvent` is synchronous in the production code (no `await`). The mock should be synchronous too (or throw synchronously) to match.
- `mock.module` is worker-scoped and permanent within the test worker. Using dynamic `await import(...)` inside each test body ensures the freshly mocked module is loaded. Call `mock.module()` before the `await import()` in each test.
- Per the established pattern (1352a), `schema.js` must NOT be mocked as the real module — use `initDatabase: async () => {}` and `getDb: () => fakeDb` to avoid touching the real DB layer.

---

## Success Criteria

- 8 new tests, all passing
- No `mock.module` leak to sibling test files (teardown `afterAll` restores real modules)
- Test file isolated: `Bun.env["DB_PATH"] = ":memory:"` at top
- Zero production file changes
- DAV-8 uses `callOrder` array to assert ordering, not timing
