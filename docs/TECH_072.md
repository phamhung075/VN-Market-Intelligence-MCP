# TECH-072: BCTC Pipeline Fix — financial_reports persistence, storeReport hardening, registry test

status: APPROVED_BY_ARCHITECT
req_ref: REQ-072

---

## Brownfield Impact

- Files modified:
  - `src/application/usecases/parseBctcReport.ts` (storeReport try/catch, WAL checkpoint)
  - `src/__tests__/308-tool-registry.test.ts` (count 57 → 59, comment chain)
  - `docs/data/project-stats.json` (verify sprint 72, no change expected)
- Files created:
  - `src/__tests__/1181-financial-reports-persist.test.ts`
- Files deleted: none
- Breaking changes: no — all changes are internal to the application layer and test layer.
  The `parseBctcReport` function signature is unchanged; the error propagation change only
  surfaces errors that were previously silently swallowed.

---

## Architecture Decision

The WAL visibility gap is the primary failure mode. `storeReport` writes rows via the WAL;
a reader that opens a second DB handle (e.g. `sqlite3` CLI, diagnostic query in another
process) may not see uncommitted WAL frames until a checkpoint runs. The fix inserts a
targeted `PRAGMA wal_checkpoint(PASSIVE)` call immediately after each successful
`storeReport`, consistent with the `PASSIVE` checkpoint already used in
`checkpoint.ts:runWalCheckpoint`. The error-propagation fix (try/catch around `storeReport`)
is an independent hardening measure: it converts a class of silent-swallow bugs into explicit
logged failures, matching the existing error-handling contract in `fetchParseAndStoreBctc`.

Both fixes are confined to `parseBctcReport.ts` (application layer), consistent with the
existing layer rules. No domain or infrastructure files need modification.

---

## DDD Layer Plan

| Component                          | Layer          | File Path                                                     | New/Modify |
|------------------------------------|----------------|---------------------------------------------------------------|------------|
| storeReport try/catch wrapper      | application    | `src/application/usecases/parseBctcReport.ts`                 | MODIFY     |
| WAL checkpoint after storeReport   | application    | `src/application/usecases/parseBctcReport.ts`                 | MODIFY     |
| Integration persist test           | test           | `src/__tests__/1181-financial-reports-persist.test.ts`        | NEW        |
| Tool registry count assertion      | test           | `src/__tests__/308-tool-registry.test.ts`                     | MODIFY     |
| Sprint stats verification          | docs/data      | `docs/data/project-stats.json`                                | VERIFY     |

---

## Interface Contracts

### No new public interfaces

All changes are internal to `parseBctcReport.ts`. The exported function signature is
unchanged:

```typescript
export async function parseBctcReport(
  params: ParseBctcReportParams,
): Promise<FinancialReport>
```

The only observable contract change: the function now propagates `storeReport` errors
(previously swallowed). Callers — specifically `fetchParseAndStoreBctc` — already wrap the
call in a try/catch that logs and returns `null`, so the new behaviour is transparent at the
orchestrator level while being correctly logged.

### Modified behaviour in parseBctcReport — Step 7

Replace the current bare call at lines 441-443:

```typescript
// BEFORE (lines 441-443 of parseBctcReport.ts)
await initDatabase();
storeReport(report, validationStatus, validationNotes);
return report;
```

With the hardened version:

```typescript
// AFTER
await initDatabase();
const db = getDb();

try {
  storeReport(report, validationStatus, validationNotes);
} catch (err) {
  throw new Error(
    `storeReport failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

// WAL checkpoint — makes the new row visible to external readers immediately.
// Skipped for :memory: DBs (WAL mode is a no-op there).
const dbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? "";
if (dbPath !== ":memory:") {
  try {
    db.exec("PRAGMA wal_checkpoint(PASSIVE)");
  } catch (checkpointErr) {
    // Non-fatal: log and continue — data is already persisted in WAL
    logger.debug("[parseBctcReport] WAL checkpoint busy or failed (non-fatal)", {
      error: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
    });
  }
}

return report;
```

Key design notes:

1. `getDb()` is called AFTER `initDatabase()` so the singleton is guaranteed open and points
   to the same connection that `storeReport` used internally. There is no second handle.
2. The `db.exec("PRAGMA wal_checkpoint(PASSIVE)")` call uses the same singleton — not a new
   connection — so it is guaranteed to flush WAL frames written by the same session.
3. The `:memory:` guard prevents a harmless-but-confusing no-op PRAGMA on in-memory DBs
   used by tests. In Bun SQLite, `PRAGMA journal_mode = WAL` is accepted but silently
   ignored for `:memory:` DBs; the checkpoint PRAGMA is likewise a no-op, so the guard is
   defensive hygiene only.
4. The `logger` import already exists in `parseBctcReport.ts`'s dependency chain via
   `fetchParseAndStoreBctc`. However, `parseBctcReport.ts` itself does not currently import
   `logger`. The developer must add:
   ```typescript
   import { logger } from "../../infrastructure/logger.js";
   ```
   This is an application → infrastructure import, which is permitted by the DDD layer rules.

### Modified behaviour — storeReport internal (no signature change)

`storeReport` itself remains unchanged. The try/catch wraps the call site in
`parseBctcReport`, not the function body. This is the correct location: the caller decides
error semantics, not the helper.

---

## Task Breakdown

Dependency order for PM sprint planning:

| ID   | Title                                                   | Depends On | Branch                       |
|------|---------------------------------------------------------|------------|------------------------------|
| 1181 | TDD red: failing 1181-financial-reports-persist.test.ts | —          | task/1181-bctc-persist-test  |
| 1182 | Fix storeReport error propagation + WAL checkpoint      | 1181       | task/1182-bctc-persist-fix   |
| 1183 | Fix 308-tool-registry.test.ts count 57 → 59            | —          | task/1183-registry-count-fix |
| 1184 | project-stats.json verify sprint 72 + QA smoke          | 1182, 1183 | —                            |

Tasks 1181 and 1183 have no mutual dependency and can be started in parallel.

---

## Integration Test Design (Task 1181 + 1182)

File: `src/__tests__/1181-financial-reports-persist.test.ts`

### Test setup requirements

- Set `process.env["DB_PATH"] = ":memory:"` before importing any module that calls `getDb()`.
  This must be the first statement in the test file (before all imports) or placed inside a
  `beforeAll` that runs before any module-level side effects touch the singleton. In Bun's
  test runner, `beforeAll` runs before test bodies but after module-level imports — so the
  safest approach is to call `closeDb()` in `beforeAll` and then set `DB_PATH` to `:memory:`
  before calling `initDatabase()` explicitly inside the test.
- Call `closeDb()` in `afterEach` to reset the singleton between tests.
- Restore or delete `process.env["DB_PATH"]` in `afterAll`.

### Minimal BCTC text fixture

The `pdfTextOverride` must contain enough Vietnamese keywords that the three domain
extractors (`extractBalanceSheet`, `extractIncomeStatement`, `extractCashFlow`) return at
least some non-zero values. A zero-confidence report is still stored — the test only asserts
the row exists, not that financial values are meaningful. The minimal fixture must contain:

- At least one balance sheet keyword (e.g. `Tổng tài sản`, `TỔNG CỘNG TÀI SẢN`)
- At least one income statement keyword (e.g. `Doanh thu`, `Lợi nhuận sau thuế`)
- At least one cash flow keyword (e.g. `Lưu chuyển tiền thuần`)
- A Vietnamese number (e.g. `1.234.567`)

### Test assertion sequence

```
1. closeDb()                                          // reset any singleton from prior test
2. process.env["DB_PATH"] = ":memory:"
3. await initDatabase()                               // creates schema on :memory: connection
4. result = await fetchParseAndStoreBctc({
     actionCode: "VNM",
     year: 2025,
     quarter: "Q4",
     pdfTextOverride: MINIMAL_BCTC_FIXTURE,
     insertAnalysisFn: async () => {},                // mock LanceDB — non-fatal if omitted
   })
5. expect(result).not.toBeNull()
6. const db = getDb()                                 // same singleton storeReport used
7. const row = db.query(
     "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = 'VNM'"
   ).get()
8. expect(row.cnt).toBe(1)
```

### RED → GREEN contract

- Task 1181 writes this test. It must fail RED before 1182 is applied (because the current
  code has no WAL checkpoint and the test environment uses `:memory:` which, combined with
  existing WAL mode pragma, may behave differently — but the real proof is that the test
  catches any future regression at the persistence boundary regardless of WAL mode).
- Task 1182 applies the `storeReport` try/catch and post-insert checkpoint. The test must
  turn GREEN.

Note: the `:memory:` guard in the WAL checkpoint code ensures the `PRAGMA
wal_checkpoint(PASSIVE)` is skipped in this test. The test proves the INSERT reaches the
table, not that WAL is flushed (WAL is irrelevant for `:memory:`). The WAL flush benefit is
for production (`data/market.db`), verified manually via AC-3.

---

## 308 Tool Registry Fix Design (Task 1183)

File: `src/__tests__/308-tool-registry.test.ts`

### Exact changes required

1. Line 48: change test description string from
   `"toolRegistry contains exactly 57 entries (all register*Tools from server.ts)"`
   to
   `"toolRegistry contains exactly 59 entries (all register*Tools from server.ts)"`

2. Line 61: change assertion from
   `expect(toolRegistry.length).toBe(57);`
   to
   `expect(toolRegistry.length).toBe(59);`

3. Comment chain (lines 50-60): extend with two additional lines documenting the sprint 071
   additions:
   ```
   //          56 + registerInsiderTools (task 1146) = 57
   //          57 + registerMarketMessageTools (task 1166) = 58
   //          58 + registerTickerIntelligenceTools (task 1180) = 59
   ```
   The existing final line ends at `57` — remove the erroneous last line and replace with the
   correct three-step chain above.

### Confirmation of actual count

The `registry.ts` file (read during brownfield analysis) exports entries in this order
(lines 82-end): 57 named entries were present through task 1146. Lines 70-71 show:
```
import { registerMarketMessageTools } from "./marketMessageTools.js";
import { registerTickerIntelligenceTools } from "./tickerIntelligenceTools.js";
```
Both are imported and must appear in the array. Current count: 59. No further counting
verification is required — `bun test 308-tool-registry.test.ts` will confirm.

---

## Risk Assessment

| Risk                                                              | Probability | Impact | Mitigation                                                                                          |
|-------------------------------------------------------------------|-------------|--------|-----------------------------------------------------------------------------------------------------|
| WAL checkpoint adds latency to every `parseBctcReport` call       | Low         | Low    | PASSIVE mode is non-blocking; BCTC reparse is a background job, not a hot path                     |
| `:memory:` guard incorrectly evaluates for production path        | Low         | High   | Guard checks `process.env["DB_PATH"]` with the exact same fallback chain as `schema.ts:getDb()`    |
| `logger` import in parseBctcReport.ts creates a circular import   | Low         | High   | `infrastructure/logger.ts` has no imports from `application/` — no cycle possible                  |
| Test 1181 cannot reset DB_PATH before module imports execute      | Medium      | Medium | Use `closeDb()` + explicit `initDatabase()` inside test body; never rely on module-load-time DB_PATH |
| storeReport try/catch masks non-SQLite errors thrown in future    | Low         | Low    | Re-throws with descriptive prefix — error is surfaced to `fetchParseAndStoreBctc` logger unchanged |
| Existing tests 042-047, 121, 240, 291 break from the change       | Low         | High   | All those tests mock or bypass `storeReport`; none test the post-store WAL checkpoint call         |

---

## Security Review

- SQL parameterized? Yes — `storeReport` uses `db.prepare` + `stmt.run({...})` with named
  bindings. No changes affect this pattern.
- File paths validated (no `../`)? Not applicable to this sprint — no new file path handling.
- External HTTP rate-limited? Not applicable — no new HTTP calls.
- Secrets via Bun.env only? Yes — `DB_PATH` is read from `process.env` / `Bun.env` only,
  consistent with existing `schema.ts` pattern.
