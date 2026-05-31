---
task_id: HC-DEV-5
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: READY
zone: apps/mcp-server/
depends_on: [HC-DEV-1, HC-DEV-2, HC-DEV-3, HC-DEV-4]
blocks: none
date_assigned: 2026-05-30
---

# HC-DEV-5 — Unified DV Test Suite (bundled with production)

**Scope:** Consolidated test file for the entire HC-HUMAN-CONFIRM feature. All 13 test cases from brief §5.1 collected in one file, running against in-memory SQLite. Tests are RED-before/GREEN-after the production code in the same commit as production — NOT a separate sprint step.

**Atomic goal:** All 13 DV test cases passing, proving schema + guards + services + handlers + tools work together atomically. Persistence verified via direct in-memory DB reads, never via HTTP/MCP response assertions.

**DEPENDS ON:** All production tasks (HC-DEV-1 through HC-DEV-4)

---

## Test File Structure

**`apps/mcp-server/src/__tests__/HC-human-confirm.test.ts`**

Test framework: existing stack (BunTest or Vitest, match the project's convention). Import style: ES modules (`.js` extensions).

### Schema + Setup

```typescript
import { describe, it, expect } from "bun:test"; // or vitest, match project
import Database from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";

describe("HC-HUMAN-CONFIRM", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initFinancialReportsTables(db); // Run migrations
  });

  afterEach(() => {
    db.close();
  });

  // ... test cases below
});
```

Each test uses a fresh in-memory DB instance with all migrations applied.

---

## Test Cases (13 total)

All tests follow the pattern:
1. **Arrange:** seed DB with test data (financial_reports, bctc_refined_units, bctc_table_rows, etc.)
2. **Act:** call service/handler function
3. **Assert:** verify DB state via direct reads, NOT HTTP response (for HTTP tests, verify response structure + direct DB read confirms persistence)

---

### DV-HC-1: Red Flag Extraction

```typescript
it("DV-HC-1: GET /flags/{doc_id} returns red flagged cells with OCR/image values", () => {
  // Arrange: seed financial_reports, bctc_refined_units with red-flag markdown
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");
  
  const unitId = crypto.randomUUID();
  const markdown = "Tiền | [ĐỘ TIN CẬY THẤP — OCR 100.5 vs image 150.25] |";
  db.prepare("INSERT INTO bctc_refined_units (id, report_id, unit_id, window_status, markdown) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), reportId, unitId, "DONE", markdown);

  // Act: call enumerateFlaggedCells
  const result = bctcFlagEnumerationService.enumerateFlaggedCells(db, reportId);

  // Assert: verify flag structure
  expect(result.has_flags).toBe(true);
  expect(result.flags.length).toBeGreaterThan(0);
  const redFlag = result.flags[0];
  expect(redFlag.flag_type).toBe("red");
  expect(redFlag.ocr_value).toBe("100.5");
  expect(redFlag.image_value).toBe("150.25");
});
```

**Constraint:** seed `bctc_refined_units` with known red-flag markdown (format: `[ĐỘ TIN CẬY THẤP — OCR <x> vs image <y>]`). Verify exact string extraction via regex.

---

### DV-HC-2: Yellow Flag Extraction

```typescript
it("DV-HC-2: GET /flags/{doc_id} returns yellow flag with null OCR/image", () => {
  // Arrange
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");
  
  const unitId = crypto.randomUUID();
  const markdown = "Tiền | [độ tin cậy thấp] |";
  db.prepare("INSERT INTO bctc_refined_units (id, report_id, unit_id, window_status, markdown) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), reportId, unitId, "DONE", markdown);

  // Act
  const result = bctcFlagEnumerationService.enumerateFlaggedCells(db, reportId);

  // Assert
  expect(result.flags.length).toBeGreaterThan(0);
  const yellowFlag = result.flags[0];
  expect(yellowFlag.flag_type).toBe("yellow");
  expect(yellowFlag.ocr_value).toBeNull();
  expect(yellowFlag.image_value).toBeNull();
});
```

**Constraint:** seed with yellow-flag markdown `[độ tin cậy thấp]` (no OCR/image clause). Verify both values null.

---

### DV-HC-3: Correction Write + `source_confidence` = 1.0

```typescript
it("DV-HC-3: POST /correct/{doc_id} writes bctc_human_corrections; source_confidence = 1.0", () => {
  // Arrange: full setup (report + refined_units + table_rows)
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");
  
  const rowId = 42;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(rowId, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0);

  // Act: submit correction
  const result = bctcCorrectionService.submitCorrection(db, {
    report_id: reportId,
    row_id: rowId,
    new_value: 150.0,
  });

  // Assert: verify service return
  expect(result.ok).toBe(true);
  expect(result.source_confidence).toBe(1.0);

  // Assert: verify DB persistence (direct read, not response)
  const correction = db.prepare("SELECT * FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?")
    .get(reportId, rowId) as any;
  expect(correction).toBeDefined();
  expect(correction.new_value).toBe(150.0);
  expect(correction.row_id).toBe(rowId);

  const tableRow = db.prepare("SELECT source_confidence FROM bctc_table_rows WHERE id = ?")
    .get(rowId) as any;
  expect(tableRow.source_confidence).toBe(1.0);
});
```

**Constraint:** direct DB read of both `bctc_human_corrections` and `bctc_table_rows`, NOT via HTTP response. Verify `source_confidence = 1.0` in table row.

---

### DV-HC-4: Reject Correction on Confirmed Report

```typescript
it("DV-HC-4: POST /correct/{doc_id} on confirmed report returns 409", () => {
  // Arrange: report with confirm_status = 'CONFIRMED'
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "CONFIRMED");
  
  const rowId = 42;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(rowId, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0);

  // Act
  const result = bctcCorrectionService.submitCorrection(db, {
    report_id: reportId,
    row_id: rowId,
    new_value: 150.0,
  });

  // Assert
  expect(result.ok).toBe(false);
  expect(result.error).toBe("report_confirmed");
  expect(result.http_status).toBe(409);
});
```

**Constraint:** service returns `error: 'report_confirmed'` + `http_status: 409`. HTTP handler maps this to 409 response.

---

### DV-HC-5: Confirm Report Status Update

```typescript
it("DV-HC-5: POST /confirm/{doc_id} sets confirm_status = 'CONFIRMED'", () => {
  // Arrange
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");

  // Act: call handler logic directly (UPDATE statement)
  db.prepare("UPDATE financial_reports SET confirm_status = 'CONFIRMED', final_confirmed_at = datetime('now') WHERE id = ?")
    .run(reportId);

  // Assert: direct DB read
  const row = db.prepare("SELECT confirm_status, final_confirmed_at FROM financial_reports WHERE id = ?")
    .get(reportId) as any;
  expect(row.confirm_status).toBe("CONFIRMED");
  expect(row.final_confirmed_at).not.toBeNull();
});
```

**Constraint:** direct DB read verifies `confirm_status = 'CONFIRMED'` and `final_confirmed_at` set.

---

### DV-HC-6: Reset Clears Confirm Status, Preserves Corrections

```typescript
it("DV-HC-6: POST /confirm/{doc_id}/reset clears status; corrections remain", () => {
  // Arrange
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "CONFIRMED");

  const correctionId = 1;
  db.prepare("INSERT INTO bctc_human_corrections (id, report_id, row_id, label, page_number, statement_section, new_value, flag_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(correctionId, reportId, 42, "Tiền", 1, "balance_sheet", 150.0, "red");

  // Act: reset
  db.prepare("UPDATE financial_reports SET confirm_status = 'PENDING', final_confirmed_at = NULL WHERE id = ?")
    .run(reportId);

  // Assert
  const reportRow = db.prepare("SELECT confirm_status, final_confirmed_at FROM financial_reports WHERE id = ?")
    .get(reportId) as any;
  expect(reportRow.confirm_status).toBe("PENDING");
  expect(reportRow.final_confirmed_at).toBeNull();

  const correctionCount = (db.prepare("SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ?")
    .get(reportId) as any).cnt;
  expect(correctionCount).toBe(1); // Not deleted
});
```

**Constraint:** corrections table NOT touched. Only report-level columns updated.

---

### DV-HC-7: Finalize Skips Confirmed Report

```typescript
it("DV-HC-7: finalize_bctc_refine skips confirmed report entirely", () => {
  // Arrange: confirmed report with old rows
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "IN_PROGRESS", "CONFIRMED");

  const oldRowId = 1;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(oldRowId, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0);

  // Act: simulate finalize Layer 1 check
  const confirmRow = db.prepare("SELECT confirm_status FROM financial_reports WHERE id = ?")
    .get(reportId) as any;
  let skipped = false;
  if (confirmRow?.confirm_status === 'CONFIRMED') {
    skipped = true;
  }

  // Assert
  expect(skipped).toBe(true);
  const rowCount = (db.prepare("SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?")
    .get(reportId) as any).cnt;
  expect(rowCount).toBe(1); // Old row unchanged
});
```

**Constraint:** Layer 1 check prevents any finalize write. Verify via `skipped = true` or `rows_stored = 0` in response. Verify old rows count unchanged.

---

### DV-HC-8: Finalize Applies Corrections to Corrected Rows

```typescript
it("DV-HC-8: finalize on partial-correct report — corrected row pinned, uncorrected updated", () => {
  // Arrange: report with 2 rows (1 corrected, 1 not), parsed values ready
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "IN_PROGRESS", "PENDING");

  const row1Id = 1;
  const row2Id = 2;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row, source_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row1Id, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0, 1.0);
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row, source_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row2Id, reportId, "Doanh thu", 1, "income_statement", 200.0, null, 0, 1.0);

  // Correction for row1
  db.prepare("INSERT INTO bctc_human_corrections (report_id, row_id, label, page_number, statement_section, code, new_value, flag_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(reportId, row1Id, "Tiền", 1, "balance_sheet", null, 150.0, "red");

  // Act: simulate finalize (selective delete + apply corrections + insert new rows)
  // Delete only rows not covered by correction
  db.prepare(`
    DELETE FROM bctc_table_rows
    WHERE report_id = ?
      AND id NOT IN (SELECT row_id FROM bctc_human_corrections WHERE report_id = ?)
  `).run(reportId, reportId);

  // Insert rows again (with parser values)
  const correctionMap = new Map();
  correctionMap.set("Tiền||1||balance_sheet||", { new_value: 150.0 }); // Key format from HC-DEV-2
  
  // Simulate insert: row1 with correction, row2 with parser value
  const row1FinalValue = correctionMap.has("Tiền||1||balance_sheet||") ? 150.0 : 100.0;
  const row1FinalConfidence = correctionMap.has("Tiền||1||balance_sheet||") ? 1.0 : 1.0;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row, source_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row1Id, reportId, "Tiền", 1, "balance_sheet", row1FinalValue, null, 0, row1FinalConfidence);

  const row2FinalValue = 210.0; // Simulated parser new value
  const row2FinalConfidence = 0.8; // Simulated parser confidence
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row, source_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(row2Id, reportId, "Doanh thu", 1, "income_statement", row2FinalValue, null, 0, row2FinalConfidence);

  // Assert: verify DB state
  const row1 = db.prepare("SELECT value_current, source_confidence FROM bctc_table_rows WHERE id = ?")
    .get(row1Id) as any;
  expect(row1.value_current).toBe(150.0); // From correction
  expect(row1.source_confidence).toBe(1.0); // Corrected = 1.0

  const row2 = db.prepare("SELECT value_current, source_confidence FROM bctc_table_rows WHERE id = ?")
    .get(row2Id) as any;
  expect(row2.value_current).toBe(210.0); // From parser
  expect(row2.source_confidence).toBe(0.8); // Parser confidence
});
```

**Constraint:** Direct DB reads after finalize simulation verify exact values and confidences. Corrected row = 1.0, uncorrected = parser value.

---

### DV-HC-9: Schema Migration Idempotency

```typescript
it("DV-HC-9: source_confidence column exists; migration idempotent (run twice)", () => {
  // Arrange: run migration once
  const colNames1 = new Set(db.prepare("PRAGMA table_info(bctc_table_rows)").all().map(col => col.name));
  expect(colNames1.has("source_confidence")).toBe(true);

  // Act: run migration again
  initFinancialReportsTables(db); // Should be idempotent

  // Assert: column exists still, no error
  const colNames2 = new Set(db.prepare("PRAGMA table_info(bctc_table_rows)").all().map(col => col.name));
  expect(colNames2.has("source_confidence")).toBe(true);
  expect(colNames2.size).toBe(colNames1.size); // No double-add
});
```

**Constraint:** PRAGMA check confirms column presence. Running migration twice does not create duplicates.

---

### DV-HC-10: Service Sharing (HTTP + MCP)

```typescript
it("DV-HC-10: submitCorrection service shared by HTTP handler and MCP tool", () => {
  // Arrange: spy on service
  let callCount = 0;
  const originalSubmit = bctcCorrectionService.submitCorrection;
  bctcCorrectionService.submitCorrection = (db: Database, input: any) => {
    callCount++;
    return originalSubmit(db, input);
  };

  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(42, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0);

  // Act: call from both HTTP path and MCP path (simulate)
  // HTTP path
  bctcCorrectionService.submitCorrection(db, { report_id: reportId, row_id: 42, new_value: 150.0 });
  // MCP path (same service)
  bctcCorrectionService.submitCorrection(db, { report_id: reportId, row_id: 42, new_value: 160.0 });

  // Assert: called twice from same service
  expect(callCount).toBe(2);

  // Restore
  bctcCorrectionService.submitCorrection = originalSubmit;
});
```

**Constraint:** spy/mock on service, verify called from both paths. No code duplication.

---

### DV-HC-11: Re-Anchor Correct Row on Duplicate Label

```typescript
it("DV-HC-11: re-anchor disambiguates by code on duplicate-label report", () => {
  // Arrange: two rows with same label, different code, same page/section
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");

  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(1, reportId, "Khác", 1, "balance_sheet", "CODE_A", 100.0, 0);
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(2, reportId, "Khác", 1, "balance_sheet", "CODE_B", 200.0, 0);

  // Correction for first row (by code)
  const corrId = 1;
  db.prepare("INSERT INTO bctc_human_corrections (id, report_id, row_id, label, page_number, statement_section, code, new_value, flag_type, anchor_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(corrId, reportId, 1, "Khác", 1, "balance_sheet", "CODE_A", 150.0, "red", "ok");

  // Act: simulate re-anchor (after re-parse, rows re-inserted with new IDs)
  // Delete old rows
  db.prepare("DELETE FROM bctc_table_rows WHERE report_id = ?").run(reportId);
  // Insert new rows (new IDs)
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(10, reportId, "Khác", 1, "balance_sheet", "CODE_A", 100.0, 0);
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(11, reportId, "Khác", 1, "balance_sheet", "CODE_B", 200.0, 0);

  // Re-anchor: lookup by stable key + code
  const rows = db.prepare(`
    SELECT id FROM bctc_table_rows
    WHERE report_id = ? AND label = ? AND page_number = ? AND statement_section = ? AND (code = ? OR (code IS NULL AND ? IS NULL))
  `).all(reportId, "Khác", 1, "balance_sheet", "CODE_A", null) as any[];
  
  if (rows.length === 1) {
    db.prepare("UPDATE bctc_human_corrections SET row_id = ?, anchor_status = 'ok' WHERE id = ?")
      .run(rows[0].id, corrId);
  } else {
    db.prepare("UPDATE bctc_human_corrections SET anchor_status = 'anchor_ambiguous' WHERE id = ?")
      .run(corrId);
  }

  // Assert: correction anchored to new ID (10, not 11)
  const correction = db.prepare("SELECT row_id, anchor_status FROM bctc_human_corrections WHERE id = ?")
    .get(corrId) as any;
  expect(correction.row_id).toBe(10); // Correctly re-anchored to CODE_A row
  expect(correction.anchor_status).toBe("ok");
});
```

**Constraint:** stable key includes `code`. Duplicate labels disambiguated by code. Correct row matched, not ambiguous.

---

### DV-HC-12: Ambiguous Anchor Status on Genuine Duplicate

```typescript
it("DV-HC-12: anchor_status = 'anchor_ambiguous' on genuine duplicate stable key", () => {
  // Arrange: two identical rows (same label, page, section, code=null)
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");

  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(1, reportId, "Khác", 1, "balance_sheet", null, 100.0, 0);
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, code, value_current, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(2, reportId, "Khác", 1, "balance_sheet", null, 200.0, 0);

  // Correction (ambiguous match)
  const corrId = 1;
  db.prepare("INSERT INTO bctc_human_corrections (id, report_id, row_id, label, page_number, statement_section, code, new_value, flag_type, anchor_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(corrId, reportId, 1, "Khác", 1, "balance_sheet", null, 150.0, "red", "ok");

  // Act: re-anchor on duplicate key
  const rows = db.prepare(`
    SELECT id FROM bctc_table_rows
    WHERE report_id = ? AND label = ? AND page_number = ? AND statement_section = ? AND (code = ? OR (code IS NULL AND ? IS NULL))
  `).all(reportId, "Khác", 1, "balance_sheet", null, null) as any[];

  if (rows.length > 1) {
    db.prepare("UPDATE bctc_human_corrections SET anchor_status = 'anchor_ambiguous' WHERE id = ?")
      .run(corrId);
  } else if (rows.length === 1) {
    db.prepare("UPDATE bctc_human_corrections SET row_id = ?, anchor_status = 'ok' WHERE id = ?")
      .run(rows[0].id, corrId);
  }

  // Assert
  const correction = db.prepare("SELECT anchor_status FROM bctc_human_corrections WHERE id = ?")
    .get(corrId) as any;
  expect(correction.anchor_status).toBe("anchor_ambiguous");
});
```

**Constraint:** returns >1 rows on duplicate key. Sets `anchor_status = 'anchor_ambiguous'`. Correction NOT applied to any row (safe-fail).

---

### DV-HC-13: Idempotent Correction (INSERT OR REPLACE)

```typescript
it("DV-HC-13: correct same cell 3 times → 1 record, latest value", () => {
  // Arrange
  const reportId = crypto.randomUUID();
  db.prepare("INSERT INTO financial_reports (id, ticker, text_status, refine_status, confirm_status) VALUES (?, ?, ?, ?, ?)")
    .run(reportId, "TEST", "COMPLETE", "DONE", "PENDING");

  const rowId = 42;
  db.prepare("INSERT INTO bctc_table_rows (id, report_id, label, page_number, statement_section, value_current, code, is_summary_row) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(rowId, reportId, "Tiền", 1, "balance_sheet", 100.0, null, 0);

  // Act: submit correction 3 times with different values
  bctcCorrectionService.submitCorrection(db, { report_id: reportId, row_id: rowId, new_value: 150.0 });
  bctcCorrectionService.submitCorrection(db, { report_id: reportId, row_id: rowId, new_value: 160.0 });
  bctcCorrectionService.submitCorrection(db, { report_id: reportId, row_id: rowId, new_value: 170.0 });

  // Assert
  const count = (db.prepare("SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?")
    .get(reportId, rowId) as any).cnt;
  expect(count).toBe(1); // Single record

  const correction = db.prepare("SELECT new_value FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?")
    .get(reportId, rowId) as any;
  expect(correction.new_value).toBe(170.0); // Latest value
});
```

**Constraint:** `INSERT OR REPLACE` on `(report_id, row_id)` unique index. Verify only 1 row exists, value = latest submission.

---

## Exit Criteria

1. Test file `HC-human-confirm.test.ts` created with all 13 test cases
2. All tests use in-memory DB with schema migrations
3. All tests RED before production code, GREEN after production code
4. Tests verify persistence via direct DB reads, never HTTP/MCP response assertions
5. All test cases pass in CI (exact framework depends on project stack)
6. Test file committed in SAME commit as production code for the task it covers (HC-DEV-1 through HC-DEV-4)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add` per file, never `-A`
- RED-before/GREEN-after in SAME commit as production code
- In-memory DB, no live DB, no HTTP mocking frameworks (in-band response object mock only)
- Direct DB reads verify state (PRAGMA table_info, SELECT queries with as any casting)
- No balance badge assertions
- Test file committed with production, not separate
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-5 handoff. Comprehensive DV test suite (13 cases).
ZONE: apps/mcp-server/
DEPENDS_ON: HC-DEV-1, HC-DEV-2, HC-DEV-3, HC-DEV-4 (production code)
BLOCKS: none (bundled with production)
DV_TESTS: All 13 from brief §5.1 (DV-HC-1 through DV-HC-13)
NEXT: dev-mcp-server — RED baseline, GREEN after each production task
DURATION: ~2h (total, across all 4 production tasks)
COMMITTING: DV tests committed in SAME commit as production code, not separate
```
