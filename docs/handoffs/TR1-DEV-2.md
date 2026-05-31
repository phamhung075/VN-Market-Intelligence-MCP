# Handoff — TR1-DEV-2: DT-2 + DT-3 Magnitude/Cross-Statement Validators + DT-4 WARN + Finalize Wiring

**Sprint:** BCTC-TRUST-RED
**Task ID:** TR1-DEV-2
**Owner:** dev-mcp-server
**Estimated Scope:** 2.5h
**Priority:** HIGH (aggregate report-level gate)
**Date Created:** 2026-05-30

---

## Summary

Create `bctcMagnitudeValidator.ts` (domain layer, DT-2 + DT-3 detectors). DT-2 flags reports where gross_profit ≥ net_revenue (impossible margin) or balance sheet is forced-zero (all decomposition = 0 with passing arithmetic). DT-3 flags cross-statement revenue contradictions (≥3 prior-period values diverging >20%, or ≥2 current-period values diverging >20%). Wire both into `finalizeBctcRefineTool.ts` (before atomic transaction) to set `refine_status='REJECTED_SANITY'` on BLOCK. Add DT-4 WARN (identical timestamp detection) as logging-only. Domain layer pure, zero infrastructure imports.

---

## Files to Create

### `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts`

**Implement:**

1. **DT-2: Magnitude Implausibility Detector**

```typescript
export interface MagnitudeViolation extends SanityViolation {
  code: "MAGNITUDE_GROSS_EQ_NET" | "MAGNITUDE_LABEL_AMBIGUOUS" | "BALANCE_FORCED_ZERO";
}

export function detectMagnitudeViolations(rows: BctcTableRow[]): SanityViolation[] {
  const violations: SanityViolation[] = [];

  // DT-2a: Income statement check (gross_profit >= net_revenue)
  const incomeRows = rows.filter(r => r.statement_section === 'income_statement');
  const netRevenueRow = incomeRows.find(r =>
    r.is_summary_row === 1 && /doanh thu thuần|net revenue/i.test(r.label)
  );
  const grossProfitRow = incomeRows.find(r =>
    r.is_summary_row === 1 && /lợi nhuận gộp|gross profit/i.test(r.label)
  );

  if (netRevenueRow && grossProfitRow) {
    const labelConfidence = 0.8; // Conservative: both labels match regex
    if (labelConfidence >= 0.8) {
      if (grossProfitRow.value_current && netRevenueRow.value_current) {
        if (grossProfitRow.value_current >= netRevenueRow.value_current * 0.999) {
          violations.push({
            code: "MAGNITUDE_GROSS_EQ_NET",
            description: "Gross profit >= net revenue (impossible for real company)",
            severity: "BLOCK",
          });
        }
      }
    } else {
      violations.push({
        code: "MAGNITUDE_LABEL_AMBIGUOUS",
        description: "Income statement label match ambiguous; magnitude check skipped",
        severity: "WARN",
      });
    }
  }

  // DT-2b: Balance sheet forced-zero check
  const balanceRows = rows.filter(r => r.statement_section === 'balance_sheet' && r.is_summary_row === 1);
  const totalAssetsRow = balanceRows.find(r => /tổng tài sản|total assets/i.test(r.label));
  const totalLiabilitiesRow = balanceRows.find(r => /tổng nợ phải trả|total liabilities/i.test(r.label));
  const equityRow = balanceRows.find(r => /vốn chủ sở hữu|equity total/i.test(r.label));

  if (totalAssetsRow && totalLiabilitiesRow && equityRow) {
    const ta = totalAssetsRow.value_current || 0;
    const tl = totalLiabilitiesRow.value_current || 0;
    const eq = equityRow.value_current || 0;

    // Forced-zero: both decomposition subtotals are zero, but arithmetic balances
    if (tl === 0 && eq === 0 && ta > 0) {
      const arithmeticError = Math.abs(ta - (tl + eq));
      if (arithmeticError < 0.01 * ta) {
        violations.push({
          code: "BALANCE_FORCED_ZERO",
          description: "Balance sheet decomposition forced-zero (liabilities + equity = 0); balancing artifact",
          severity: "BLOCK",
        });
      }
    }
  }

  return violations;
}
```

2. **DT-3: Cross-Statement Revenue Consistency Detector**

```typescript
export function detectCrossStatementRevenue(rows: BctcTableRow[]): SanityViolation[] {
  const violations: SanityViolation[] = [];

  // Collect all rows matching revenue label across all units
  const revenueRows = rows.filter(r =>
    /doanh thu thuần/i.test(r.label)
  );

  // Extract prior-period values
  const priorValues = new Map<number, number>(); // value -> count of occurrences
  for (const row of revenueRows) {
    if (row.value_prior !== null && row.value_prior !== undefined) {
      const count = priorValues.get(row.value_prior) || 0;
      priorValues.set(row.value_prior, count + 1);
    }
  }

  // Check prior-period divergence (>=3 distinct, >20% pairwise)
  if (priorValues.size >= 3) {
    const values = Array.from(priorValues.keys()).sort((a, b) => a - b);
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const maxVal = Math.max(values[i], values[j]);
        const divergence = Math.abs(values[i] - values[j]) / maxVal;
        if (divergence > 0.2) {
          violations.push({
            code: "CROSS_STMT_REVENUE_CONTRADICTION",
            description: `Prior-period revenue divergence > 20%: ${values[i]} vs ${values[j]} (${(divergence * 100).toFixed(1)}%)`,
            severity: "BLOCK",
          });
          return violations; // One violation is enough
        }
      }
    }
  }

  // Extract current-period values
  const currentValues = new Map<number, number>();
  for (const row of revenueRows) {
    if (row.value_current !== null && row.value_current !== undefined) {
      const count = currentValues.get(row.value_current) || 0;
      currentValues.set(row.value_current, count + 1);
    }
  }

  // Check current-period divergence (>=2 distinct, >20% pairwise)
  if (currentValues.size >= 2) {
    const values = Array.from(currentValues.keys()).sort((a, b) => a - b);
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const maxVal = Math.max(values[i], values[j]);
        const divergence = Math.abs(values[i] - values[j]) / maxVal;
        if (divergence > 0.2) {
          violations.push({
            code: "CROSS_STMT_REVENUE_CONTRADICTION",
            description: `Current-period revenue divergence > 20%: ${values[i]} vs ${values[j]} (${(divergence * 100).toFixed(1)}%)`,
            severity: "BLOCK",
          });
          return violations;
        }
      }
    }
  }

  return violations;
}
```

---

## Files to Modify

### `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Changes:**

1. Import `detectMagnitudeViolations` and `detectCrossStatementRevenue` from domain service:
   ```typescript
   import { detectMagnitudeViolations, detectCrossStatementRevenue } from "domain/services/financial-reports/bctcMagnitudeValidator";
   ```

2. After the parse loop builds `allTableRows` (and after `applyCorrections`), add:
   ```typescript
   // DT-2 + DT-3: Aggregate report-level sanity checks
   const magnitudeViolations = detectMagnitudeViolations(allTableRows);
   const crossStmtViolations = detectCrossStatementRevenue(allTableRows);
   const allViolations = [...magnitudeViolations, ...crossStmtViolations];

   if (allViolations.some(v => v.severity === "BLOCK")) {
     // Block: do NOT insert rows; reject report
     await db.exec("BEGIN TRANSACTION");
     await db.query(
       "UPDATE financial_reports SET refine_status = ?, flags = ? WHERE id = ?"
     ).run("REJECTED_SANITY", JSON.stringify(allViolations), report_id);

     // Mark all units for this report with violation flags
     const unitsForReport = await db.query(
       "SELECT id FROM bctc_refined_units WHERE report_id = ?"
     ).all(report_id);
     for (const unit of unitsForReport) {
       const existingFlags = await db.query(
         "SELECT flags FROM bctc_refined_units WHERE id = ?"
       ).get(unit.id);
       const merged = [
         ...JSON.parse(existingFlags?.flags || "[]"),
         ...allViolations.map(v => ({ code: v.code, severity: v.severity })),
       ];
       await db.query(
         "UPDATE bctc_refined_units SET flags = ? WHERE id = ?"
       ).run(JSON.stringify(merged), unit.id);
     }
     await db.exec("COMMIT");

     return { ok: false, report_id, rejected_reason: allViolations };
   }

   // DT-4: Identical-timestamp warning
   const doneUnits = await db.query(
     "SELECT DISTINCT refined_at FROM bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'"
   ).all(report_id);
   if (doneUnits.length > 0) {
     const timestamps = new Set(doneUnits.map(u => u.refined_at as string));
     if (timestamps.size === 1) {
       logger.warn(`DT4_IDENTICAL_TIMESTAMP: report_id=${report_id}; all units share one refined_at`, {
         report_id,
         refined_at: doneUnits[0].refined_at,
       });
     }
   }
   ```

3. Proceed with normal transaction (INSERT `bctc_table_rows`, UPDATE `financial_reports` to caller-supplied `report_status`) only if no BLOCK violations.

4. If WARN-only violations: log them via `logger.warn` but proceed with normal transaction.

---

## Acceptance Criteria

- AC-TR1-2-1: File `bctcMagnitudeValidator.ts` compiles without errors.
- AC-TR1-2-2: `detectMagnitudeViolations` with `gross_profit = net_revenue = 100000` returns violations containing `{ severity: "BLOCK", code: "MAGNITUDE_GROSS_EQ_NET" }`.
- AC-TR1-2-3: `detectMagnitudeViolations` with `gross_profit = 30000, net_revenue = 100000` (realistic 30% margin) returns zero BLOCK violations.
- AC-TR1-2-4: `detectMagnitudeViolations` with `total_liabilities = 0, equity_total = 0, total_assets = 500000` returns violations containing `{ severity: "BLOCK", code: "BALANCE_FORCED_ZERO" }`.
- AC-TR1-2-5: `detectMagnitudeViolations` with `total_liabilities = 200000, equity_total = 300000, total_assets = 500000` (realistic balance) returns zero BLOCK violations.
- AC-TR1-2-6: `detectCrossStatementRevenue` with three `value_prior` rows `[16058000, 11481000, 20225000]` (29% divergence > 20%) returns BLOCK violation.
- AC-TR1-2-7: `detectCrossStatementRevenue` with two `value_prior` values differing by <5% returns zero BLOCK violations.
- AC-TR1-2-8: Zero imports from `infrastructure/` or `interface/` layers in bctcMagnitudeValidator.ts (domain isolation).
- AC-TR1-2-9: `finalizeBctcRefineTool.ts` calls `detectMagnitudeViolations` + `detectCrossStatementRevenue` after parse loop, before INSERT transaction.
- AC-TR1-2-10: When violations contain BLOCK, `financial_reports.refine_status = 'REJECTED_SANITY'` is set (verified by direct `bun:sqlite` query in test).
- AC-TR1-2-11: When violations contain BLOCK, `bctc_table_rows` INSERT does NOT execute; COUNT(*) WHERE report_id = ? remains 0 (verified by direct query).
- AC-TR1-2-12: DT-4 identical-timestamp check fires when all `refined_at` values are identical, logging WARN (not blocking).
- AC-TR1-2-13: CONFIRMED guard (Layer 1) still takes precedence; if `financial_reports.confirm_status = 'CONFIRMED'`, report is never overwritten to REJECTED_SANITY.

---

## Test Plan

### Unit Tests (Domain Layer)

1. **TC-TR1-2-1: DT-2 gross_profit >= net_revenue (BLOCK)**
   ```typescript
   const rows = [
     { statement_section: 'income_statement', is_summary_row: 1, label: 'Doanh thu thuần', value_current: 100000 },
     { statement_section: 'income_statement', is_summary_row: 1, label: 'Lợi nhuận gộp', value_current: 100000 },
   ];
   const violations = detectMagnitudeViolations(rows);
   expect(violations).toContainEqual({
     severity: "BLOCK",
     code: "MAGNITUDE_GROSS_EQ_NET",
   });
   ```

2. **TC-TR1-2-2: DT-2 realistic margin (no violation)**
   ```typescript
   const rows = [
     { statement_section: 'income_statement', is_summary_row: 1, label: 'Doanh thu thuần', value_current: 100000 },
     { statement_section: 'income_statement', is_summary_row: 1, label: 'Lợi nhuận gộp', value_current: 30000 },
   ];
   const violations = detectMagnitudeViolations(rows);
   expect(violations.filter(v => v.severity === 'BLOCK')).toEqual([]);
   ```

3. **TC-TR1-2-3: DT-2 forced-zero balance (BLOCK)**
   ```typescript
   const rows = [
     { statement_section: 'balance_sheet', is_summary_row: 1, label: 'Tổng tài sản', value_current: 500000 },
     { statement_section: 'balance_sheet', is_summary_row: 1, label: 'Tổng nợ phải trả', value_current: 0 },
     { statement_section: 'balance_sheet', is_summary_row: 1, label: 'Vốn chủ sở hữu', value_current: 0 },
   ];
   const violations = detectMagnitudeViolations(rows);
   expect(violations).toContainEqual({
     severity: "BLOCK",
     code: "BALANCE_FORCED_ZERO",
   });
   ```

4. **TC-TR1-2-4: DT-3 revenue contradiction ≥20% (BLOCK)**
   ```typescript
   const rows = [
     { label: 'Doanh thu thuần', value_prior: 16058000 },
     { label: 'Doanh thu thuần', value_prior: 11481000 }, // 29% divergence
     { label: 'Doanh thu thuần', value_prior: 20225000 },
   ];
   const violations = detectCrossStatementRevenue(rows);
   expect(violations).toContainEqual({
     severity: "BLOCK",
     code: "CROSS_STMT_REVENUE_CONTRADICTION",
   });
   ```

5. **TC-TR1-2-5: DT-3 revenue stable <5% (no violation)**
   ```typescript
   const rows = [
     { label: 'Doanh thu thuần', value_prior: 16058000 },
     { label: 'Doanh thu thuần', value_prior: 16058000 },
   ];
   const violations = detectCrossStatementRevenue(rows);
   expect(violations).toEqual([]);
   ```

### Integration Test (Finalize Wiring)

1. **TC-TR1-2-6: finalizeBctcRefineTool with DT-2 BLOCK**
   - Seed `bctc_refined_units` with DONE unit containing gross_profit = net_revenue
   - Call finalize handler
   - Assert: `financial_reports.refine_status = 'REJECTED_SANITY'` (direct DB query)
   - Assert: `bctc_table_rows COUNT(*) = 0` (rows not inserted)

2. **TC-TR1-2-7: finalizeBctcRefineTool with DT-3 BLOCK**
   - Seed units with contradictory prior-period revenues
   - Call finalize handler
   - Assert: `refine_status = 'REJECTED_SANITY'` + no rows inserted

3. **TC-TR1-2-8: DT-4 identical timestamp WARN (logging only)**
   - Seed units with all identical `refined_at`
   - Call finalize handler
   - Assert: `logger.warn` called with `DT4_IDENTICAL_TIMESTAMP` message
   - Assert: transaction still proceeds normally (no rejection)

---

## Dependencies

- `BctcTableRow` interface (existing in infrastructure)
- `logger` instance (existing in finalizeBctcRefineTool.ts)
- Database transaction support (existing)

**Blocked by:** TR0-DEV-1 (ingest gate placement and schema enum)

**Blocks:** TR0-DEV-2 (publish guard depends on refine_status='REJECTED_SANITY' being set), TRUST-QA-1

---

## Implementation Notes

- DT-2 uses simple regex matching for income/balance labels. If labels are ambiguous in production data, the function emits WARN not BLOCK (safe-degrade).
- DT-3 is conservative: single revenue value = no violation; ≥2 distinct with >20% divergence = BLOCK.
- The `allViolations` are stored in `flags` JSON on both `financial_reports` and all related `bctc_refined_units` rows for audit trail visibility.
- DT-4 is logging-only (no rejection); it's a forensic signal for ops to detect suspicious timing patterns.
- The CONFIRMED guard check (if `confirm_status='CONFIRMED'`) must be placed BEFORE any DT-2/DT-3 gate (Layer 1, as per architect brief).

---

## Sign-Off

- **Code Review:**
  - Domain layer pure (no I/O, no DB)
  - DT-2 label matching handles both English and Vietnamese
  - DT-3 threshold 20% matches architect spec
  - DT-4 logging non-blocking
  - Finalize wiring respects CONFIRMED guard

- **Verification:**
  - Compile: `bun run build` exits 0
  - All 8 unit tests pass
  - All 3 integration tests pass
  - ACs above verified

---
