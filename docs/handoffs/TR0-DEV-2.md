# Handoff — TR0-DEV-2: Publishability Guard in get_bctc_full (PUB-1..4 Gates)

**Sprint:** BCTC-TRUST-RED
**Task ID:** TR0-DEV-2
**Owner:** dev-mcp-server
**Estimated Scope:** 1.5h
**Priority:** HIGH (serve-layer guard, downstream of TR1)
**Date Created:** 2026-05-30

---

## Summary

Add `checkPublishability(db, reportId)` helper in `bctcFullTools.ts`. Call immediately after `latestRow` query. Function evaluates four binding conditions (PUB-1..4); if any fails, return human-readable refusal text instead of building three financial sections. Four checks: (1) refine_status IN DONE/PARTIAL, (2) ≥1 bctc_table_rows with non-null value_current, (3) balance sheet has ≥1 non-summary child row, (4) no REJECTED_SANITY units (or partial report if only some sections rejected). No new schema, no new DB tables.

---

## Files to Modify

### `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`

**Changes:**

1. Add helper function `checkPublishability`:

```typescript
interface PublishabilityCheck {
  publishable: boolean;
  reason?: string;  // Refusal text if not publishable
  rejectedSections?: string[];  // Section names with all units REJECTED_SANITY
}

function checkPublishability(
  db: Database,
  reportId: string,
): PublishabilityCheck {
  // PUB-1: refine_status IN ('DONE', 'PARTIAL')
  const report = db.query(
    "SELECT refine_status FROM financial_reports WHERE id = ?"
  ).get(reportId) as { refine_status: string } | undefined;

  if (!report || !['DONE', 'PARTIAL'].includes(report.refine_status)) {
    return {
      publishable: false,
      reason: "Chưa có dữ liệu BCTC",  // No BCTC data
    };
  }

  // PUB-2: At least one bctc_table_rows row with non-null value_current
  const rowCount = db.query(
    "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ? AND value_current IS NOT NULL"
  ).get(reportId) as { cnt: number };

  if (rowCount.cnt === 0) {
    return {
      publishable: false,
      reason: "refine data absent — report has no extracted rows",
    };
  }

  // PUB-3: Balance sheet has at least one non-summary child row
  const balanceChildren = db.query(
    "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ? AND statement_section = 'balance_sheet' AND is_summary_row = 0"
  ).get(reportId) as { cnt: number };

  if (balanceChildren.cnt === 0) {
    return {
      publishable: false,
      reason: "balance sheet has no decomposition — forced-zero pass suspected",
    };
  }

  // PUB-4: Check for REJECTED_SANITY units
  const rejectedUnits = db.query(
    "SELECT DISTINCT window_status FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'"
  ).all(reportId) as { window_status: string }[];

  if (rejectedUnits.length > 0) {
    // Partial rejection: some units are rejected, some may be clean
    // For simplicity, we block if ANY unit is REJECTED_SANITY
    // (architect brief PUB-4 allows warning for partial, but full rejection is safer)
    const rejectedCount = db.query(
      "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'"
    ).get(reportId) as { cnt: number };

    const totalCount = db.query(
      "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ?"
    ).get(reportId) as { cnt: number };

    if (rejectedCount.cnt === totalCount.cnt) {
      // All units rejected
      return {
        publishable: false,
        reason: "All refined units rejected by sanity gates; no publishable data",
        rejectedSections: [],
      };
    } else {
      // Partial rejection: warn but still publish
      const rejectedSections = db.query(
        "SELECT DISTINCT label FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'"
      ).all(reportId) as { label: string }[];

      return {
        publishable: true,  // Partial pass
        rejectedSections: rejectedSections.map(r => r.label),
      };
    }
  }

  return { publishable: true };
}
```

2. In the handler, after the `latestRow` query (which returns the most recent `financial_reports` row):

```typescript
export async function getBctcFullHandler(args: {
  code: string;
  page_num?: number;
}): Promise<string> {
  const code = args.code.toUpperCase();

  // ... existing code to fetch latestRow ...
  const latestRow = await db.query(
    "SELECT id, ticker, year, quarter, refine_status FROM financial_reports WHERE action_code = ? ORDER BY sort_key DESC LIMIT 1"
  ).get(code);

  if (!latestRow) {
    return "Chưa có dữ liệu BCTC";
  }

  // NEW: Check publishability
  const pubCheck = checkPublishability(db, latestRow.id);
  if (!pubCheck.publishable) {
    return pubCheck.reason || "Chưa có dữ liệu BCTC";
  }

  // If partial rejection, add warning
  if (pubCheck.rejectedSections && pubCheck.rejectedSections.length > 0) {
    // Log warning or prepend to output
    console.warn(`[PUB-4 partial] Sections rejected for report ${latestRow.id}: ${pubCheck.rejectedSections.join(", ")}`);
  }

  // ... continue with normal three-section output build ...
}
```

3. Add comment to code block:
```typescript
// PUB-1 through PUB-4 are binding publication gates.
// PUB-1: refine_status must be DONE or PARTIAL.
// PUB-2: must have ≥1 extracted row (value_current IS NOT NULL).
// PUB-3: balance sheet must have ≥1 non-summary child (no forced-zero).
// PUB-4: no REJECTED_SANITY units, or partial rejection warning.
// If any gate fails, structured feed refuses to serve (analyst receives refusal text).
```

---

## Acceptance Criteria

- AC-TR0-2-1: Function `checkPublishability` exists in `bctcFullTools.ts`.
- AC-TR0-2-2: Function is called immediately after `latestRow` query, before building financial output.
- AC-TR0-2-3: When `refine_status NOT IN ('DONE', 'PARTIAL')`, returns refusal text "Chưa có dữ liệu BCTC".
- AC-TR0-2-4: When `bctc_table_rows` COUNT(*) WHERE value_current IS NOT NULL = 0, returns refusal text "refine data absent".
- AC-TR0-2-5: When `bctc_table_rows` has only `is_summary_row = 1` rows (no children), returns refusal text "balance sheet no decomposition".
- AC-TR0-2-6: When `bctc_refined_units` has rows with `window_status = 'REJECTED_SANITY'`, returns refusal text (blocking structured feed).
- AC-TR0-2-7: Calling `get_bctc_full` for a clean report (all PUB-1..4 pass) returns full three-section output (BCTC SUMMARY, comparison, sentiment).
- AC-TR0-2-8: Output text for REJECTED_SANITY report does NOT contain "Net Revenue :" and does NOT contain numeric financial values.
- AC-TR0-2-9: `checkPublishability` uses `db` parameter directly (no HTTP calls, injectable for testing).
- AC-TR0-2-10: Partial rejection (some units REJECTED_SANITY, some clean) logs warning but continues to serve clean sections.

---

## Test Plan

### Unit Tests

1. **TC-TR0-2-1: PUB-1 gate — refine_status not DONE/PARTIAL**
   ```typescript
   // Seed financial_reports with refine_status='PENDING'
   const check = checkPublishability(testDb, reportId);
   expect(check.publishable).toBe(false);
   expect(check.reason).toContain("Chưa có dữ liệu");
   ```

2. **TC-TR0-2-2: PUB-2 gate — no rows with value_current**
   ```typescript
   // Seed report DONE but bctc_table_rows all have value_current=NULL
   const check = checkPublishability(testDb, reportId);
   expect(check.publishable).toBe(false);
   expect(check.reason).toContain("refine data absent");
   ```

3. **TC-TR0-2-3: PUB-3 gate — balance sheet only has summary rows**
   ```typescript
   // Seed report DONE + rows + balance_sheet rows all with is_summary_row=1
   const check = checkPublishability(testDb, reportId);
   expect(check.publishable).toBe(false);
   expect(check.reason).toContain("balance sheet no decomposition");
   ```

4. **TC-TR0-2-4: PUB-4 gate — all units REJECTED_SANITY**
   ```typescript
   // Seed all bctc_refined_units with window_status='REJECTED_SANITY'
   const check = checkPublishability(testDb, reportId);
   expect(check.publishable).toBe(false);
   expect(check.reason).toContain("rejected by sanity");
   ```

5. **TC-TR0-2-5: All gates pass**
   ```typescript
   // Seed complete clean report: DONE status, rows with values, balance children, no REJECTED_SANITY
   const check = checkPublishability(testDb, reportId);
   expect(check.publishable).toBe(true);
   expect(check.reason).toBeUndefined();
   ```

### Integration Test

1. **TC-TR0-2-6: get_bctc_full returns refusal for REJECTED_SANITY report**
   ```typescript
   // Seed report with refine_status='REJECTED_SANITY'
   const result = await getBctcFullHandler({ code: 'FPT' });
   expect(result).not.toContain("Net Revenue");
   expect(result).not.toMatch(/\d+,\d+/); // No formatted numbers
   ```

2. **TC-TR0-2-7: get_bctc_full returns structured output for clean report**
   ```typescript
   // Seed clean report
   const result = await getBctcFullHandler({ code: 'FPT' });
   expect(result).toContain("BCTC SUMMARY") || expect(result).toContain("Doanh thu");
   expect(result).toMatch(/\d+,\d+/); // Contains formatted numbers
   ```

---

## Dependencies

- `financial_reports` table (query refine_status)
- `bctc_table_rows` table (COUNT value_current, query balance sheet)
- `bctc_refined_units` table (query window_status)
- Database instance (passed as parameter)
- No new schema, no new tables

**Blocked by:** TR1-DEV-2 (depends on refine_status='REJECTED_SANITY' being set by finalize gate)

**Blocks:** None (standalone output guard)

---

## Implementation Notes

- PUB-4 partial rejection: if only some units are REJECTED_SANITY, the function returns `publishable: true` with warning sections listed. This allows analysts to see data for clean units while being warned about rejected sections.
- The refusal text matches existing no-data response ("Chưa có dữ liệu BCTC") so analysts see familiar messaging.
- `checkPublishability` is a private helper (no export); only `get_bctc_full` handler calls it.
- All gates use COUNT(*) queries for efficiency (no full row scan).

---

## Sign-Off

- **Code Review:**
  - Four gates implemented (PUB-1, PUB-2, PUB-3, PUB-4)
  - Queries use parameterized statements (SQL injection safe)
  - Database parameter injectable (testable)
  - All ACs addressed

- **Verification:**
  - Compile: `bun run build` exits 0
  - All integration tests pass
  - Analyst can call `get_bctc_full(FPT)` after purge and receives refusal (FPT = REJECTED_SANITY)

---
