# TASK_1355a — Gap-fill tests: monthlySignalQualityJob

**Sprint:** 1355
**Layer:** Test only (scheduler)
**Size:** S (1h)
**Owner:** Developer

---

## Context

`monthlySignalQualityJob.ts` (119 lines) has two optional DI params already wired in production:

```typescript
export async function runMonthlySignalQualityJob(
  db?: Database,
  sendFn?: (text: string) => Promise<boolean | void>,
): Promise<void>
```

The `signalQualityAudit` service already has test coverage (1295c). The job wrapper itself has zero tests. All live code paths in the wrapper are exercised purely through DI — no `mock.module()` is needed.

---

## Production File

`apps/mcp-server/src/scheduler/audits/monthlySignalQualityJob.ts`

### Key logic paths to cover

| Path | Lines | Notes |
|------|-------|-------|
| January rollover: `auditMonth === 0` → month=11, year-=1 | 64–68 | Requires injecting a Date fixture |
| Non-January: `auditMonth -= 1` | 68 | Standard offset |
| `queryRejectionStats(db, monthName, year)` call | 88 | Receives correct monthName + year |
| `generateAuditReport(db)` call | 91 | Return value embedded in message |
| Regex extraction: `/Rejection Rate \| (\d+\.\d+)%/` | 94–95 | Fallback to 0 when no match |
| Threshold check: `rejectionRateDecimal > 0.02` | 100 | `>` not `>=` |
| `shouldAlert=true` branch: alert prefix + full report | 110–112 | Message contains `⚠️ **ALERT**` + report |
| `shouldAlert=false` branch: no alert prefix | 114 | Message contains `✓ Rejection rate` |
| `resolvedSend(message)` called once | 118 | Always called regardless of threshold |

### DI surface

Both DI params already exist on the production signature. No production changes required.

The `db` param routes around the dynamic `import("../../infrastructure/db/schema.js")`. The `sendFn` param routes around the dynamic `import("../../infrastructure/notifiers/telegram.js")`.

`queryRejectionStats` and `generateAuditReport` accept a `db: Database` parameter — control their output by shaping the in-memory DB content (or by stubbing via a wrapper object, see test strategy below).

---

## Schema Required

The job calls:
1. `queryRejectionStats(db, month, year)` — queries `signal_rejections` table
2. `generateAuditReport(db)` — queries `signal_rejections` + `agent_signals` tables

For tests MSQ-1 through MSQ-7, the simplest strategy is to **stub `queryRejectionStats` and `generateAuditReport`** via a tiny in-memory wrapper rather than populating the full schema DDL. However, since these are imported at the top of the production file (not dynamically), the developer has two options:

**Option A (preferred — matches 1354b pattern):** Use a minimal in-memory DB with the two required tables and insert rows to drive the output.

DDL needed:
```sql
-- signal_rejections (used by queryRejectionStats + generateAuditReport)
CREATE TABLE IF NOT EXISTS signal_rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  stock_code TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- agent_signals (used by generateAuditReport for rate denominator)
CREATE TABLE IF NOT EXISTS agent_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Option B (alternative):** Since `queryRejectionStats` and `generateAuditReport` are static imports (not dynamic), use `mock.module()` on `../../application/services/signalQualityAudit.js` before dynamically importing the job. Follow the `mock.module` teardown pattern from `1352a`. This is more complex but removes the DDL dependency.

Recommendation: **Option A** for MSQ-1–MSQ-7. Use controlled DB content to produce specific `report` strings that contain or omit the `Rejection Rate | X.XX%` pattern as needed per test case.

For **MSQ-8** (regex fallback), pass a DB that results in `generateAuditReport` returning a string with no `Rejection Rate |` line — an empty DB produces `Rejection Rate | 0.00%` so the developer must craft a report string without that pattern. Use Option B (mock `generateAuditReport`) specifically for MSQ-8 to return a custom string.

---

## Test File

**Path:** `apps/mcp-server/src/__tests__/1355a-monthly-signal-quality-job-gaps.test.ts`

**Header:**
```typescript
Bun.env["DB_PATH"] = ":memory:";
```

**Imports:**
```typescript
import { describe, it, expect, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { runMonthlySignalQualityJob } from "../scheduler/audits/monthlySignalQualityJob.js";
```

---

## 8 Test Cases

### MSQ-1: January rollover — month 0 audits December of prior year

**Setup:**
- Stub `Date` to return month 0 (January), year 2026 by monkey-patching the global `Date` constructor before the call, then restoring after. Alternatively, since the job uses `new Date()` internally, inject a custom nowFn — but the production function does NOT accept a nowFn. Therefore the test must either:
  - Use `mock.module` on a date helper, or
  - Accept that `new Date()` is used and verify behaviour by inspecting the message sent via `sendFn`

**Correct approach:** Temporarily replace `globalThis.Date` with a class that returns a fixed UTC date of `2026-01-01T00:00:00Z`, then restore after the call.

**Mock setup:**
```typescript
const OrigDate = globalThis.Date;
class FakeDate extends OrigDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(2026, 0, 1); // Jan 1 2026
    else super(...(args as ConstructorParameters<typeof Date>));
  }
  getUTCMonth() { return 0; }
  getUTCFullYear() { return 2026; }
}
globalThis.Date = FakeDate as unknown as typeof Date;
```
After call, `globalThis.Date = OrigDate`.

- Pass empty in-memory DB (with required DDL tables)
- Capture `sendFn` argument

**Assert:**
- `sendFn` called once
- Message contains `December 2025`

---

### MSQ-2: Non-January month — month offset -1, correct year

**Setup:** Same global Date trick, return month 3 (April), year 2026 → expects "March 2026".

**Assert:**
- Message contains `March 2026`

---

### MSQ-3: Rejection rate below 2% — no alert prefix in message

**Setup:**
- DB has 0 rejections, 0 agent_signals → `rejectionRatePercent = 0`
- `generateAuditReport` returns a report with `Rejection Rate | 0.00%`

**Assert:**
- `sendFn` called once
- Message does NOT contain `⚠️ **ALERT**`
- Message contains `✓ Rejection rate within acceptable threshold.`

---

### MSQ-4: Rejection rate above 2% threshold — alert prefix + full report in message

**Setup:**
- Populate DB: insert 3 rows into `signal_rejections` for current month, insert 100 rows into `agent_signals` for current month → rejection rate = 3% > 2%
- Alternatively, use mock.module on `signalQualityAudit.js` to return a `generateAuditReport` that returns `"Rejection Rate | 3.00%"`

**Assert:**
- Message contains `⚠️ **ALERT**`
- Message contains `3.00%`
- Message contains the full report string returned by `generateAuditReport`

---

### MSQ-5: sendFn injection — called exactly once per job run

**Setup:**
- Use default (passing) DB
- Track call count on `sendFn`

**Assert:**
- `sendFn` call count === 1

---

### MSQ-6: queryRejectionStats wiring — receives correct monthName + year

**Setup:**
- Fix current date to May 2026 (month 4) → prior month = April 2026
- Use `mock.module` on `../../application/services/signalQualityAudit.js` to intercept `queryRejectionStats`, capture its `month` and `year` args

**Assert:**
- Captured `month === "April"`
- Captured `year === 2026`

---

### MSQ-7: generateAuditReport wiring — return value embedded in message when threshold exceeded

**Setup:**
- Use `mock.module` on `signalQualityAudit.js`:
  - `queryRejectionStats` returns `{ total: 5, by_agent: { qa: 5 }, by_type: {}, by_stock: {} }`
  - `generateAuditReport` returns a sentinel string `"SENTINEL_REPORT_STRING\nRejection Rate | 5.00%"`
- Fix date to non-January month so `shouldAlert = true` (5% > 2%)

**Assert:**
- Message contains `SENTINEL_REPORT_STRING`

---

### MSQ-8: Regex extraction fallback — report with no rate match defaults to 0% (no alert sent)

**Setup:**
- Use `mock.module` on `signalQualityAudit.js`:
  - `generateAuditReport` returns `"# Report\nNo rate data available"` (no `Rejection Rate | X.XX%` line)
  - `queryRejectionStats` returns empty stats

**Assert:**
- `rejectionRatePercent` resolves to 0 (inferred from message: `Rejection Rate: 0.00%`)
- Message does NOT contain `⚠️ **ALERT**`
- `sendFn` still called once (message always sent)

---

## mock.module Teardown Pattern

For tests MSQ-6, MSQ-7, MSQ-8 that use `mock.module`, follow the isolation pattern from `1352a`:

1. Capture real implementations before any `mock.module()` call using `import { fn as _realFn }` at file top
2. Snapshot into `const _frozen = _realFn` immediately after import
3. After all `mock.module` tests, restore via `mock.module("../path", () => ({ fn: _frozen }))` in `afterAll`

---

## Production Change Required

None. Both DI params (`db?`, `sendFn?`) already exist on `runMonthlySignalQualityJob`. The `Date` global patching is purely in-test.

---

## Risk Notes

- `generateAuditReport` uses `new Date()` internally (not injected), so it always queries the real current month. For MSQ-3, an empty DB is sufficient because 0/0 = 0%. For MSQ-4, either populate DB rows dated to the current calendar month or use `mock.module`.
- The threshold check is `>` (strictly greater than) not `>=`. A 2.00% rate does NOT trigger the alert. Tests must use values like 3% (above) and 0% (below).
- `sendFn` is called unconditionally regardless of threshold — both branches send the message.

---

## Success Criteria

- 8 new tests, all passing
- No `mock.module` leak to sibling files (teardown `afterAll` restores real modules)
- Test file isolated: `Bun.env["DB_PATH"] = ":memory:"` at top
- Zero production file changes
