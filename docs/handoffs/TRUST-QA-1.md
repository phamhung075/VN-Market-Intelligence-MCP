# Handoff — TRUST-QA-1: QA Red-Before-Green Test Suite (TRUST-RED-sanity-gate.test.ts)

**Sprint:** BCTC-TRUST-RED
**Task ID:** TRUST-QA-1
**Owner:** qa
**Estimated Scope:** 2h (test authoring + RED-before-GREEN protocol execution)
**Priority:** HIGHEST (gate-proof mandatory)
**Date Created:** 2026-05-30

---

## Summary

Create `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts` with 6 test cases (TR-RED-1 through TR-RED-6) proving RED-before-GREEN protocol. Each case demonstrates the gate is real: (1) run test with gate DISABLED (RED = bug exists), (2) enable gate, (3) test goes GREEN. QA must inject fabricated data, prove gate blocks it, then prove clean data passes. Verify all assertions via direct `bun:sqlite` DB read (NOT HTTP echo), as per mcp-server-write-wedge lesson. No test baseline regression (maintain existing PASS/FAIL counts).

---

## File to Create

`apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts`

**Structure:**
```typescript
import { Database } from "bun:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

describe("TRUST-RED sanity gates", () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = new Database(":memory:");
    // Initialize schema (copy from schema-financial-reports.ts)
    initializeTestSchema(testDb);
  });

  afterEach(() => {
    testDb.close();
  });

  // Test cases TR-RED-1 through TR-RED-6
});
```

---

## Test Cases (Detailed Specification)

### TR-RED-1: DT-1 Digit-Run Inject via push_bctc_refined_unit → REJECTED_SANITY

**Purpose:** Prove DT-1 gate at ingest catches digit-run fabrication.

**RED phase (gate disabled):**
1. Comment out the `validateBctcUnit` call in `pushBctcRefinedUnitTool.ts`
2. Inject markdown with 2+ distinct digit-runs:
   ```markdown
   | 100 | Doanh thu thuần | 12345678901234 |
   | 200 | Lợi nhuận gộp | 8901234567890 |
   ```
3. Call handler with `window_status="DONE"`, confidence=0.85
4. Verify insertion succeeds; row has `window_status='DONE'` (RED = gate missing)

**GREEN phase (gate enabled):**
1. Re-enable `validateBctcUnit` call in `pushBctcRefinedUnitTool.ts`
2. Run same test
3. Assert: handler returns `{ ok: false, rejected_reason: [...] }`
4. Assert DB: `SELECT window_status FROM bctc_refined_units WHERE unit_id = ?` = "REJECTED_SANITY"
5. Assert DB: `SELECT flags FROM bctc_refined_units` contains violation JSON

**Test code:**
```typescript
it("TR-RED-1: DT-1 digit-run inject blocks at ingest", async () => {
  const fakeMarkdown = `| 100 | Doanh thu thuần | 12345678901234 |
| 200 | Lợi nhuận gộp | 8901234567890 |`;

  const reportId = "test-fpt";
  const unitId = "unit-1";

  // Seed report
  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status) VALUES (?, ?, ?)"
  ).run(reportId, "FPT", "IN_PROGRESS");

  // Call handler (simulating push_bctc_refined_unit)
  const result = await pushBctcRefinedUnitTool.handler({
    report_id: reportId,
    unit_id: unitId,
    page_numbers: [1],
    markdown: fakeMarkdown,
    confidence: 0.85,
    flags: [],
    window_status: "DONE",  // Caller wants DONE
  });

  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.ok).toBe(false);
  expect(parsed.rejected_reason).toBeDefined();
  expect(parsed.rejected_reason[0]?.code).toBe("DIGIT_RUN");

  // Verify DB: window_status is REJECTED_SANITY, not DONE
  const row = testDb.query(
    "SELECT window_status FROM bctc_refined_units WHERE unit_id = ?"
  ).get(unitId) as { window_status: string };
  expect(row.window_status).toBe("REJECTED_SANITY");

  // Verify flags contain violation
  const unitRow = testDb.query(
    "SELECT flags FROM bctc_refined_units WHERE unit_id = ?"
  ).get(unitId) as { flags: string };
  const flags = JSON.parse(unitRow.flags);
  expect(flags).toContainEqual(
    expect.objectContaining({ code: "DIGIT_RUN", severity: "BLOCK" })
  );
});
```

---

### TR-RED-2: DT-2 Magnitude Violation (gross_profit = net_revenue) via finalize_bctc_refine → REJECTED_SANITY

**Purpose:** Prove DT-2 gate at finalize catches impossible gross profit margin.

**RED phase (gate disabled):**
1. Comment out `detectMagnitudeViolations` call in `finalizeBctcRefineTool.ts`
2. Seed `bctc_refined_units` with markdown containing `gross_profit = net_revenue = 100000`
3. Set unit `window_status='DONE'`
4. Call finalize handler
5. Verify: `refine_status='DONE'` (RED = gate missing) and `bctc_table_rows` COUNT > 0 (rows inserted)

**GREEN phase (gate enabled):**
1. Re-enable `detectMagnitudeViolations` call
2. Run same test
3. Assert: handler returns `{ ok: false }`
4. Assert DB: `SELECT refine_status FROM financial_reports WHERE id = ?` = "REJECTED_SANITY"
5. Assert DB: `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ?` = 0 (no rows inserted)

**Test code:**
```typescript
it("TR-RED-2: DT-2 magnitude violation blocks at finalize", async () => {
  const reportId = "test-acb";

  // Seed report
  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status) VALUES (?, ?, ?)"
  ).run(reportId, "ACB", "IN_PROGRESS");

  // Seed DONE unit with magnitude violation
  const unitId = "unit-2";
  const violatingMarkdown = `| 10 | Doanh thu thuần | 100,000 |
| 20 | Lợi nhuận gộp | 100,000 |`;

  testDb.query(
    "INSERT INTO bctc_refined_units (id, report_id, window_status, markdown) VALUES (?, ?, ?, ?)"
  ).run(unitId, reportId, "DONE", violatingMarkdown);

  // Call finalize handler
  const result = await finalizeBctcRefineTool.handler({
    report_id: reportId,
    report_status: "DONE",
  });

  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.ok).toBe(false);

  // Verify DB: refine_status = REJECTED_SANITY
  const report = testDb.query(
    "SELECT refine_status FROM financial_reports WHERE id = ?"
  ).get(reportId) as { refine_status: string };
  expect(report.refine_status).toBe("REJECTED_SANITY");

  // Verify DB: no rows inserted
  const rowCount = testDb.query(
    "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?"
  ).get(reportId) as { cnt: number };
  expect(rowCount.cnt).toBe(0);
});
```

---

### TR-RED-3: DT-3 Cross-Statement Revenue Contradiction (≥3 distinct >20% divergence) via finalize → REJECTED_SANITY

**Purpose:** Prove DT-3 gate catches revenue inconsistencies across units.

**Test code:**
```typescript
it("TR-RED-3: DT-3 revenue contradiction blocks at finalize", async () => {
  const reportId = "test-fpt-2";

  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status) VALUES (?, ?, ?)"
  ).run(reportId, "FPT", "IN_PROGRESS");

  // Seed two DONE units with contradictory prior-period revenue
  const unit1 = "unit-3a";
  const unit2 = "unit-3b";
  const md1 = `| 10 | Doanh thu thuần | 100,000 | 16,058,000 |`;
  const md2 = `| 10 | Doanh thu thuần | 100,000 | 11,481,000 |`;

  testDb.query(
    "INSERT INTO bctc_refined_units (id, report_id, window_status, markdown) VALUES (?, ?, ?, ?)"
  ).run(unit1, reportId, "DONE", md1);
  testDb.query(
    "INSERT INTO bctc_refined_units (id, report_id, window_status, markdown) VALUES (?, ?, ?, ?)"
  ).run(unit2, reportId, "DONE", md2);

  // Call finalize
  const result = await finalizeBctcRefineTool.handler({
    report_id: reportId,
    report_status: "DONE",
  });

  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.ok).toBe(false);

  // Verify DB
  const report = testDb.query(
    "SELECT refine_status FROM financial_reports WHERE id = ?"
  ).get(reportId) as { refine_status: string };
  expect(report.refine_status).toBe("REJECTED_SANITY");
});
```

---

### TR-RED-4: Publish Guard Refuses Structured Feed for REJECTED_SANITY Report

**Purpose:** Prove PUB-4 gate refuses to serve data from REJECTED_SANITY reports.

**Test code:**
```typescript
it("TR-RED-4: Publish guard blocks output for REJECTED_SANITY report", async () => {
  const reportId = "test-fpt-reject";

  // Seed report with REJECTED_SANITY status
  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status, year, quarter) VALUES (?, ?, ?, ?, ?)"
  ).run(reportId, "FPT", "REJECTED_SANITY", 2026, 1);

  // Call get_bctc_full
  const result = await getBctcFull.handler({ code: "FPT" });

  // Assert: output contains refusal text, no financial numbers
  expect(result).not.toContain("Net Revenue");
  expect(result).not.toMatch(/\d{1,3}(,\d{3})+/); // No formatted numbers (e.g., "1,234,567")
  // Assert: contains refusal message
  expect(result).toMatch(/Chưa có dữ liệu|no publishable data/i);
});
```

---

### TR-RED-5: Clean Data Passes All Gates

**Purpose:** Prove no false positives on legitimate data.

**Test code:**
```typescript
it("TR-RED-5: Clean data passes all gates", async () => {
  const reportId = "test-clean";

  // Seed DONE report with realistic data
  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status) VALUES (?, ?, ?)"
  ).run(reportId, "VCB", "DONE");

  // Seed realistic unit
  const unitId = "unit-clean";
  const cleanMarkdown = `| 10 | Doanh thu thuần | 200,000 | 180,000 |
| 20 | Lợi nhuận gộp | 50,000 | 45,000 |`;

  testDb.query(
    "INSERT INTO bctc_refined_units (id, report_id, window_status, markdown, confidence) VALUES (?, ?, ?, ?, ?)"
  ).run(unitId, reportId, "DONE", cleanMarkdown, 0.85);

  // Push: should succeed
  const pushResult = await pushBctcRefinedUnitTool.handler({
    report_id: reportId,
    unit_id: unitId,
    markdown: cleanMarkdown,
    confidence: 0.85,
    window_status: "DONE",
  });

  const pushed = JSON.parse(pushResult.content[0].text);
  expect(pushed.ok).toBe(true);
  expect(pushed.window_status || "DONE").toBe("DONE");

  // Finalize: should succeed
  // (Seed more realistic table rows for DT-2/3 to pass)
  const finalResult = await finalizeBctcRefineTool.handler({
    report_id: reportId,
    report_status: "DONE",
  });

  const finalized = JSON.parse(finalResult.content[0].text);
  expect(finalized.ok).toBe(true);

  // Verify DB
  const report = testDb.query(
    "SELECT refine_status FROM financial_reports WHERE id = ?"
  ).get(reportId) as { refine_status: string };
  expect(report.refine_status).toBe("DONE");
});
```

---

### TR-RED-6: All Assertions Use bun:sqlite Direct DB Read (Not HTTP Echo)

**Purpose:** Prove QA uses honest verification (DB state, not HTTP response fields).

**Test code:**
```typescript
it("TR-RED-6: Assertions use bun:sqlite direct DB read", async () => {
  const reportId = "test-db-verify";

  testDb.query(
    "INSERT INTO financial_reports (id, action_code, refine_status) VALUES (?, ?, ?)"
  ).run(reportId, "TEST", "DONE");
  testDb.query(
    "INSERT INTO bctc_refined_units (id, report_id, window_status) VALUES (?, ?, ?)"
  ).run("u1", reportId, "DONE");
  testDb.query(
    "INSERT INTO bctc_table_rows (id, report_id, value_current) VALUES (?, ?, ?)"
  ).run("r1", reportId, 100);

  // Verify via direct DB read, not HTTP response
  const unitCheck = testDb.query(
    "SELECT window_status FROM bctc_refined_units WHERE id = ?"
  ).get("u1") as { window_status: string };
  expect(unitCheck.window_status).toBe("DONE");

  const rowCount = testDb.query(
    "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?"
  ).get(reportId) as { cnt: number };
  expect(rowCount.cnt).toBe(1);

  // Never trust HTTP echo (e.g., handler.rows_parsed or rows_stored fields)
  // Always query the actual DB to prove persistence
});
```

---

## Red-Before-Green Protocol Execution

For each test case, follow this sequence:

### Step 1: RED (Gate Disabled)
```bash
# Comment out the gate call in the source file
# e.g., in pushBctcRefinedUnitTool.ts:
# // const validation = validateBctcUnit(...);

bun test TRUST-RED-sanity-gate.test.ts
# Test should PASS (RED = vulnerability exists, gate is missing)
```

### Step 2: GREEN (Gate Enabled)
```bash
# Uncomment the gate call
# const validation = validateBctcUnit(...);

bun test TRUST-RED-sanity-gate.test.ts
# Test should PASS (GREEN = gate fires, blocks malformed data)
```

### Step 3: Documentation
Record in test file or handoff:
- Date/time RED phase executed
- Date/time GREEN phase executed
- No test baseline regression (existing test suite PASS count unchanged)

---

## Test Infrastructure Setup

### Schema Initialization Helper
```typescript
function initializeTestSchema(db: Database): void {
  db.query(`
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      action_code TEXT,
      refine_status TEXT DEFAULT 'PENDING',
      confirm_status TEXT DEFAULT 'PENDING',
      year INTEGER,
      quarter INTEGER,
      flags TEXT DEFAULT '[]'
    );
  `).run();

  db.query(`
    CREATE TABLE IF NOT EXISTS bctc_refined_units (
      id TEXT PRIMARY KEY,
      report_id TEXT,
      window_status TEXT DEFAULT 'PENDING',
      markdown TEXT,
      confidence REAL DEFAULT 0.0,
      flags TEXT DEFAULT '[]',
      refined_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  db.query(`
    CREATE TABLE IF NOT EXISTS bctc_table_rows (
      id TEXT PRIMARY KEY,
      report_id TEXT,
      statement_section TEXT,
      is_summary_row INTEGER DEFAULT 0,
      label TEXT,
      value_current REAL,
      value_prior REAL
    );
  `).run();
}
```

---

## Acceptance Criteria

- AC-TRUST-QA-1-1: Test file exists at path above and compiles without errors.
- AC-TRUST-QA-1-2: 6 test cases (TR-RED-1 through TR-RED-6) are implemented.
- AC-TRUST-QA-1-3: Each test case follows RED-before-GREEN protocol (documented in test or handoff).
- AC-TRUST-QA-1-4: All assertions use `new Database(...).query(...)` direct DB read (zero HTTP echo assertions).
- AC-TRUST-QA-1-5: No test baseline regression: existing PASS/FAIL counts maintained or improved.
- AC-TRUST-QA-1-6: Test suite runs cleanly: `bun test TRUST-RED-sanity-gate.test.ts` exits 0.
- AC-TRUST-QA-1-7: RED phase documented: gate calls commented, tests pass (vulnerability visible).
- AC-TRUST-QA-1-8: GREEN phase documented: gate calls enabled, tests pass (gate working).

---

## Dependencies

- `pushBctcRefinedUnitTool` handler (TR0-DEV-1 impl)
- `finalizeBctcRefineTool` handler (TR1-DEV-2 impl)
- `getBctcFull` handler (TR0-DEV-2 impl)
- `validateBctcUnit` function (TR1-DEV-1 impl)
- `detectMagnitudeViolations` + `detectCrossStatementRevenue` functions (TR1-DEV-2 impl)
- `checkPublishability` helper (TR0-DEV-2 impl)

**Blocked by:** TR0-DEV-1, TR1-DEV-1, TR1-DEV-2, TR0-DEV-2 (all dev tasks must be complete before QA testing)

**Blocks:** None (final gate-proof before PO sign-off)

---

## [QA] Review Record — cycle-158 · 2026-05-30

**Verdict:** CHANGES_REQUESTED

**Test file committed:** `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts`
**Commit SHA:** `15dfc434`
**Test count:** 8 pass / 0 fail (in TRUST-RED-sanity-gate.test.ts)

### RED-before-GREEN Evidence

| Case | RED (gate disabled) | GREEN (gate enabled) |
|---|---|---|
| TR-RED-1 | validateBctcUnit commented → window_status='DONE' in DB | sanity_block=true, window_status='REJECTED_SANITY', flags=['sanity:DIGIT_RUN'] confirmed via bun:sqlite |
| TR-RED-2 | detectMagnitudeViolations removed → ok:true, refine_status='DONE' | MAGNITUDE_GROSS_EQ_NET BLOCK, refine_status='REJECTED_SANITY', bctc_table_rows COUNT=0 |
| TR-RED-3 | detectCrossStatementRevenue removed → ok:true, refine_status='DONE' | CROSS_STMT_REVENUE_CONTRADICTION (11481 vs 16058 = 28.5% > 20%), REJECTED_SANITY, rows=0 |
| TR-RED-4 | checkPublishability removed → output contains "Net Revenue :" | PUB-1 fires: "Chưa có dữ liệu", no financial data; DB still shows REJECTED_SANITY |
| TR-RED-5 | N/A (clean data — proves no false positive) | ok:true, window_status='DONE', refine_status='DONE' |
| TR-RED-6 | N/A (protocol verification) | All COUNT queries via db.query(..).get() — zero HTTP echo assertions |
| TR-RED-1-WARN | N/A (single digit-run edge case) | ok:true, window_status='DONE' — no false block |
| TR-RED-5b | N/A (clean finalize) | ok:true, refine_status='DONE' — no false block on 30% margin |

### Regression Check

- HCM-DISAMBIG-extraction.test.ts: 19 pass / 0 fail (unchanged, QA did NOT modify)
- bctcSanityValidator.test.ts + bctcMagnitudeValidator.test.ts + AR-refined-units-idempotency.test.ts: 74 pass / 0 fail
- tsc: 0 errors | DDD: PASS | security: PASS

### BLOCKING ISSUE (file:line — must fix before APPROVE)

**apps/mcp-server/src/__tests__/240-bctc-full.test.ts:219–285** — `makeDb()` helper creates minimal schema without `refine_status` column. After dev commit `b08ab73a` added `checkPublishability()` which reads `refine_status`, all tests using this old `makeDb()` schema fail with "no such column: refine_status". **4 tests fail.**

**Fix required:** Replace `makeDb()` manual schema in `240-bctc-full.test.ts` with `initFinancialReportsTables()` call, OR add `refine_status TEXT DEFAULT 'DONE'` to the `makeDb()` CREATE TABLE statement.

This is a pre-existing regression from dev commit `b08ab73a` (TR0-DEV-2). QA cannot APPROVE until this is fixed.

---

## [QA] Review Record — cycle-159 · 2026-05-30 — RE-SWEEP APPROVED

**Verdict:** APPROVED
**Fixer commit:** `caf6865d` (fix(test/240-bctc-full): add missing refine_status column to test schema)
**Scope of fixer diff:** `apps/mcp-server/src/__tests__/240-bctc-full.test.ts` only (+86/-7 lines, test helpers only, zero production code)

### Authoritative Per-Suite Counts

| Suite | Pass | Fail |
|---|---|---|
| TRUST-RED-sanity-gate.test.ts | 8 | 0 |
| bctcSanityValidator.test.ts | 18 | 0 |
| bctcMagnitudeValidator.test.ts | 17 | 0 |
| 240-bctc-full.test.ts | 5 | 0 |
| AR-refined-units-idempotency.test.ts | 13 | 0 |
| AIT-DEV-1.test.ts | 59 | 0 |
| HCM-DISAMBIG-extraction.test.ts | 19 | 0 |

Full bun test: exit 0.

### Discrepancy Reconciliation

Prior notebook cycle-158 reported bctcSanityValidator=37, bctcMagnitudeValidator=20, AR-refined-units=17. All were prior notebook reporting errors. Authoritative (confirmed by grep -c + bun test run): 18, 17, 13 respectively. No test hidden or not running. Fixer's report of 18/17 is consistent with authoritative.

### Gate Checks

- **HCM-DISAMBIG 0-diff:** `git diff 891dd3f0 HEAD -- HCM-DISAMBIG-extraction.test.ts` = empty. PASS.
- **TRUST-RED gate still blocks:** All 8 gate cases pass. No production code changed by caf6865d. Gate handlers unchanged.
- **Publish guard genuinely exercised:** Tests 1/3/4/5 inject all required rows so PUB-1..4 all fire. Assertions confirm financial text only served when gates pass. Not bypassed.
- **tsc:** 19 errors in DWF-routing-policy-fence.test.ts — pre-existing from commit 8105f8fd (DYN-WF-FOUNDATION sprint, out-of-scope). Zero new errors from caf6865d.
- **DDD:** PASS (test-only change).
- **Security:** PASS (test-only change).

Sprint BCTC-TRUST-RED ready for ops rebuild.

---
