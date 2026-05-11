# TASK-1849d — Tests + Regression Verification

**Sprint:** 1849
**Type:** SPRINT-S
**Priority:** MEDIUM
**Owner:** dev-mcp-server
**Status:** Todo
**Handoff Created:** 2026-05-07

---

## Objective

Create comprehensive tests for resolution tracking feature, verify backward-compatibility, and ensure test baseline maintained.

---

## Acceptance Criteria

### AC-1: Test File and Organization

- [ ] File: `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts`
- [ ] Add new describe block: `describe("Resolution tracking (Sprint 1849)")`
- [ ] Do NOT create a separate test file (reuse 226 as per architect guidance)
- [ ] Keep existing tests intact (no modifications to pre-1849 tests)

### AC-2: Store Function Tests — markResolved()

- [ ] Test: `markResolved() sets resolution + resolved_at atomically`
  - Create report with status="new", resolution="none"
  - Call `markResolved(db, id, "fixed", "2026-05-07T12:00:00Z")`
  - Verify: SELECT shows resolution="fixed" AND resolved_at="2026-05-07T12:00:00Z"

- [ ] Test: `markResolved() with unknown id is idempotent`
  - Call `markResolved(db, 99999, "fixed")` on non-existent id
  - Should NOT throw error
  - Should return silently (UPDATE affects 0 rows)

- [ ] Test: `markResolved() timestamp handling`
  - Call `markResolved(db, id, "monitoring")` without resolvedAt param
  - Verify: resolved_at is set to ~current timestamp (within 1 second)

### AC-3: Store Function Tests — listUnresolvedReports()

- [ ] Test: `listUnresolvedReports() includes none + monitoring, excludes fixed/wontfix/duplicate`
  - Create 5 reports:
    - Report A: resolution="none" (unresolved)
    - Report B: resolution="monitoring" (unresolved)
    - Report C: resolution="claimed" (invalid, should NOT exist per C-1)
    - Report D: resolution="fixed" (resolved)
    - Report E: resolution="wontfix" (resolved)
  - Call `listUnresolvedReports()`
  - Verify: returns A + B only (excludes D + E)

- [ ] Test: `listUnresolvedReports() excludes status=processed rows`
  - Create report: status="processed", resolution="none"
  - Call `listUnresolvedReports()`
  - Verify: processed report is NOT returned

- [ ] Test: `listUnresolvedReports() ordered by created_at ASC`
  - Create 3 unresolved reports with different created_at timestamps
  - Call `listUnresolvedReports()`
  - Verify: returned in ascending created_at order

### AC-4: Store Function Tests — listResolvedReports()

- [ ] Test: `listResolvedReports() returns only fixed/wontfix/duplicate`
  - Create reports with various resolutions
  - Call `listResolvedReports()`
  - Verify: returns only fixed + wontfix + duplicate rows

- [ ] Test: `listResolvedReports(limit=2)` respects limit parameter
  - Create 5 resolved reports
  - Call `listResolvedReports(db, 2)`
  - Verify: returns exactly 2 rows

### AC-5: MCP Tool Tests — process_telegram_report() with resolution

- [ ] Test: `process_telegram_report(id, resolution="fixed") calls markResolved()`
  - Create report with resolution="none"
  - Call `process_telegram_report(id, "fixed", false)`
  - Verify: DB shows resolution="fixed" AND resolved_at is set

- [ ] Test: `process_telegram_report(id, resolution="monitoring") without message delete`
  - Call `process_telegram_report(id, "monitoring", false)`
  - Verify: resolution="monitoring" persisted, no Telegram message deleted

- [ ] Test: `process_telegram_report(id, resolution="duplicate") with message delete`
  - Mock `deleteTelegramMessage()`
  - Call `process_telegram_report(id, "duplicate", true)`
  - Verify: resolution="duplicate" persisted AND deleteTelegramMessage called

### AC-6: Backward-Compatibility Tests

- [ ] Test: `process_telegram_report(id) without resolution param — old behavior`
  - Call `process_telegram_report(id)` (no resolution arg)
  - Verify: resolution unchanged (still "none" or whatever it was)
  - No call to `markResolved()`

- [ ] Test: `process_telegram_report(id, delete_telegram_message=true) without resolution`
  - Call `process_telegram_report(id, undefined, true)` or `process_telegram_report(id, delete_telegram_message=true)`
  - Verify: message deleted, resolution unchanged

- [ ] Test: `Zod schema default resolution="none"`
  - Parse input: `{ id: 42 }` (no resolution field)
  - Verify: Zod coerces to `{ id: 42, resolution: "none" }`

### AC-7: serializeReport() Tests

- [ ] Test: `serializeReport() includes all 11 fields`
  - Create report with all fields populated (including claimed_by, claimed_at, resolution, resolved_at)
  - Call `serializeReport(report)`
  - Verify JSON output includes:
    - id, message_id, text, from_agent, priority, status
    - created_at, claimed_by, claimed_at
    - resolution, resolved_at
  - All 11 fields present, no omissions

- [ ] Test: `serializeReport() handles null resolved_at`
  - Create report with resolved_at=NULL
  - Call `serializeReport(report)`
  - Verify: JSON shows `"resolved_at": null` (not undefined)

### AC-8: SELECT Column Projection Tests

- [ ] Test: `listNewReports() returns all 10 columns`
  - Verify: returned object has id, message_id, text, from_agent, priority, status, created_at, claimed_by, claimed_at, resolution, resolved_at

- [ ] Test: `listAllReports() returns all 10 columns`

- [ ] Test: `getReport(id) returns all 10 columns`

- [ ] Test: `listNewReportsUnclaimed() returns all 10 columns`

### AC-9: Type Safety

- [ ] Verify: `ResolutionStatus` type = 5 values only
  ```typescript
  type ResolutionStatus = "none" | "fixed" | "wontfix" | "duplicate" | "monitoring";
  ```
- [ ] Verify: "claimed" is NOT in ResolutionStatus (C-1)
- [ ] Verify: TypeScript enforces enum values at compile time (no string literals bypass)

### AC-10: Regression — Full Test Suite

- [ ] Run: `bun test` from `apps/mcp-server/`
- [ ] Baseline check: ≥8804 tests pass
- [ ] Failure check: 0 failing tests (testBaselineFail must remain 0)
- [ ] No new regressions introduced
- [ ] All pre-existing tests still passing

### AC-11: TypeScript Compilation

- [ ] Run: `tsc --noEmit` from project root
- [ ] No errors or warnings
- [ ] All types inferred correctly
- [ ] No `any` types introduced

### AC-12: Code Coverage

- [ ] New functions: markResolved(), listUnresolvedReports(), listResolvedReports()
  - Target: ≥95% line coverage
  - Branch coverage: ≥90% (all if/else paths tested)

---

## Test Case Summary

| Test Name | Type | Priority |
|-----------|------|----------|
| markResolved atomicity | Store | P0 |
| markResolved idempotency | Store | P0 |
| listUnresolvedReports filters | Store | P0 |
| listUnresolvedReports excludes processed | Store | P0 |
| listResolvedReports only terminal states | Store | P0 |
| process_telegram_report with resolution | MCP | P0 |
| process_telegram_report backward-compat | MCP | P0 |
| Zod schema resolution enum | MCP | P1 |
| serializeReport all 11 fields | MCP | P1 |
| SELECT column projection (4 functions) | Regression | P1 |
| ResolutionStatus = 5 values only | Type | P1 |
| Full suite regression (≥8804 pass) | Regression | P0 |

**Total new test cases: ≥12**

---

## Implementation Notes

### Test File Structure

```typescript
describe("Resolution tracking (Sprint 1849)", () => {
  beforeEach(() => {
    // Init test DB
  });

  describe("markResolved()", () => {
    test("sets resolution + resolved_at atomically", () => { ... });
    test("is idempotent on unknown id", () => { ... });
    test("handles timestamp auto-generation", () => { ... });
  });

  describe("listUnresolvedReports()", () => {
    test("includes none + monitoring, excludes fixed/wontfix/duplicate", () => { ... });
    test("excludes status=processed rows", () => { ... });
    test("ordered by created_at ASC", () => { ... });
  });

  describe("listResolvedReports()", () => {
    test("returns only fixed/wontfix/duplicate", () => { ... });
    test("respects limit parameter", () => { ... });
  });

  describe("process_telegram_report() with resolution", () => {
    test("calls markResolved() when resolution provided", () => { ... });
    test("backward-compatible without resolution param", () => { ... });
    test("Zod schema defaults resolution to 'none'", () => { ... });
  });

  describe("serializeReport() (C-2 fix)", () => {
    test("includes all 11 fields", () => { ... });
    test("handles null resolved_at", () => { ... });
  });

  describe("SELECT column coverage (C-2)", () => {
    test("listNewReports returns all columns", () => { ... });
    test("listAllReports returns all columns", () => { ... });
    test("getReport returns all columns", () => { ... });
  });
});
```

### Running Tests

```bash
# Run just the new tests
bun test -- "226.*Sprint 1849"

# Run full suite
bun test

# Check coverage
bun test --coverage
```

---

## Definition of Done

- [ ] AC-1..12 all checked
- [ ] All 12+ new test cases pass
- [ ] No regressions: `bun test` ≥8804 pass, 0 fail
- [ ] TypeScript: `tsc --noEmit` clean
- [ ] Code coverage: ≥95% for new functions
- [ ] ResolutionStatus type = 5 values only (C-1)
- [ ] SELECT statements project all columns (C-2)
- [ ] Task report created in `reports/TASK_REPORT_1849d.md`
- [ ] PR ready for merge

---

## Dependencies

- **Requires:** 1849a + 1849b merged first
  - 1849a: schema + store functions
  - 1849b: MCP tool + serializeReport

---

## Known Test Patterns

Existing tests in 226-telegram-report-store.test.ts use:
- `describe()` / `test()` structure
- `initDatabase()` setup
- `getDb()` for test DB access
- `closeDb()` cleanup
- Simple assertions: `.toEqual()`, `.toBeDefined()`, etc.

Follow existing patterns for consistency.

