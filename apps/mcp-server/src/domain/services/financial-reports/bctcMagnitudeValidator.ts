/**
 * bctcMagnitudeValidator — DT-2 + DT-3 Aggregate Report-Level Sanity Validators
 *
 * Sprint BCTC-TRUST-RED (TR1-DEV-2)
 * DDD layer: domain — pure functions, zero I/O, zero infrastructure/interface imports.
 *
 * DT-2: Magnitude Implausibility Detector
 *   - Income statement: gross_profit >= net_revenue (impossible margin) → BLOCK
 *   - Balance sheet: forced-zero (liabilities=0, equity=0 with passing arithmetic) → BLOCK
 *
 * DT-3: Cross-Statement Revenue Consistency Detector
 *   - Prior-period: ≥3 distinct revenue values with any pair diverging >20% → BLOCK
 *   - Current-period: ≥2 distinct revenue values with any pair diverging >20% → BLOCK
 *
 * @module domain/services/financial-reports/bctcMagnitudeValidator
 */

import type { SanityViolation } from "./bctcSanityValidator.js";

// ── Domain-local row type (DDD-isolated subset of BctcTableRow) ───────────────
// Mirrors the fields needed from bctc_table_rows without importing application layer.
// finalizeBctcRefineTool passes its parsed rows (which satisfy this interface) directly.

export interface MagnitudeRow {
  statement_section: string;    // "balance_sheet" | "income_statement" | ...
  is_summary_row: number;       // 0 or 1
  label: string;
  value_current: number | null;
  value_prior: number | null;
}

// ── DT-2: Magnitude Implausibility Detector ───────────────────────────────────

/**
 * detectMagnitudeViolations — DT-2 income + balance sheet magnitude checks.
 *
 * AC-TR1-2-1: gross_profit >= net_revenue → BLOCK (MAGNITUDE_GROSS_EQ_NET)
 * AC-TR1-2-3: total_liabilities=0, equity=0, total_assets>0, arithmetic passes → BLOCK (BALANCE_FORCED_ZERO)
 * AC-TR1-2-2: realistic 30% margin → no BLOCK
 * AC-TR1-2-4: realistic balance → no BLOCK
 * AC-TR1-2-7: ambiguous label match → WARN not BLOCK (safe-degrade)
 *
 * @param rows Parsed rows from finalize (passed by value — pure function, no I/O)
 * @returns Array of SanityViolation; empty = no violations detected
 */
export function detectMagnitudeViolations(rows: MagnitudeRow[]): SanityViolation[] {
  const violations: SanityViolation[] = [];

  // ── DT-2a: Income statement — gross_profit >= net_revenue ─────────────────

  const incomeRows = rows.filter((r) => r.statement_section === "income_statement");
  const summaryIncomeRows = incomeRows.filter((r) => r.is_summary_row === 1);

  const netRevenueRow = summaryIncomeRows.find((r) =>
    /doanh thu thu[aầâ]n|doanh thu thu[^\s|]n|net revenue/i.test(r.label),
  );
  const grossProfitRow = summaryIncomeRows.find((r) =>
    /l[oợ]i nhu[aậ]n g[oộ]p|gross profit/i.test(r.label),
  );

  if (netRevenueRow && grossProfitRow) {
    // Both labels matched high-confidence (regex-based: if match was found, confidence ≥ 0.8)
    const nrVal = netRevenueRow.value_current;
    const gpVal = grossProfitRow.value_current;

    if (nrVal != null && gpVal != null) {
      if (gpVal >= nrVal * 0.999) {
        violations.push({
          code: "MAGNITUDE_GROSS_EQ_NET",
          description: `Gross profit (${gpVal}) >= net revenue (${nrVal}) — impossible margin for a real company`,
          severity: "BLOCK",
        });
      }
    }
    // If values are null — label matched but no data; skip DT-2a (cannot check)
  } else if (incomeRows.length > 0 && (!netRevenueRow || !grossProfitRow)) {
    // Income section present but labels ambiguous — safe-degrade to WARN
    violations.push({
      code: "MAGNITUDE_LABEL_AMBIGUOUS",
      description:
        "Income statement present but net_revenue or gross_profit label match ambiguous; DT-2 income check skipped",
      severity: "WARN",
    });
  }

  // ── DT-2b: Balance sheet — forced-zero check ──────────────────────────────

  const balanceRows = rows.filter(
    (r) => r.statement_section === "balance_sheet" && r.is_summary_row === 1,
  );

  const totalAssetsRow = balanceRows.find((r) =>
    /tổng tài sản|total assets/i.test(r.label),
  );
  const totalLiabilitiesRow = balanceRows.find((r) =>
    /tổng nợ phải trả|total liabilities/i.test(r.label),
  );
  const equityRow = balanceRows.find((r) =>
    /vốn chủ sở hữu|equity total|tổng vốn chủ sở hữu/i.test(r.label),
  );

  if (totalAssetsRow && totalLiabilitiesRow && equityRow) {
    const ta = totalAssetsRow.value_current ?? 0;
    const tl = totalLiabilitiesRow.value_current ?? 0;
    const eq = equityRow.value_current ?? 0;

    // Forced-zero: both decomposition subtotals are zero while total_assets > 0.
    // Symptom: equity=0 and liabilities=0 but total_assets has a non-zero value.
    // This is the forced-zero fabrication pattern: the balance check table "passes"
    // because both sides of the arithmetic are zeroed (sum of zeroes = zero, but ≠ ta).
    // Genuine "no data" case is excluded by requiring ta > 0.
    if (tl === 0 && eq === 0 && ta > 0) {
      violations.push({
        code: "BALANCE_FORCED_ZERO",
        description: `Balance sheet forced-zero: liabilities=${tl}, equity=${eq}, total_assets=${ta}; decomposition all-zero while assets non-zero`,
        severity: "BLOCK",
      });
    }
  }

  return violations;
}

// ── DT-3: Cross-Statement Revenue Consistency Detector ───────────────────────

/**
 * detectCrossStatementRevenue — DT-3 cross-unit revenue contradiction check.
 *
 * Collects all rows matching /doanh thu thu[aâ]n/i label across all units.
 * Prior-period: ≥3 distinct values with any pair diverging >20% → BLOCK
 * Current-period: ≥2 distinct values with any pair diverging >20% → BLOCK
 *
 * AC-TR1-2-6: three distinct prior values [16058000, 11481000, 20225000] → BLOCK
 * AC-TR1-2-7: two prior values differing <5% → no BLOCK
 *
 * @param rows All rows across all units for the report
 * @returns Array of SanityViolation; empty = no contradictions detected
 */
export function detectCrossStatementRevenue(rows: MagnitudeRow[]): SanityViolation[] {
  const violations: SanityViolation[] = [];

  // Collect revenue rows across all units
  const revenueRows = rows.filter((r) => /doanh thu thu[aầâ]n|doanh thu thu[^\s|]n/i.test(r.label));

  if (revenueRows.length === 0) {
    return violations;
  }

  // ── Prior-period check: ≥3 distinct values with any pair >20% divergence ──

  const distinctPriorValues = new Set<number>();
  for (const row of revenueRows) {
    if (row.value_prior != null) {
      distinctPriorValues.add(row.value_prior);
    }
  }

  if (distinctPriorValues.size >= 3) {
    const values = Array.from(distinctPriorValues).sort((a, b) => a - b);
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i] as number;
        const b = values[j] as number;
        const maxVal = Math.max(a, b);
        if (maxVal === 0) continue;
        const divergence = Math.abs(a - b) / maxVal;
        if (divergence > 0.2) {
          violations.push({
            code: "CROSS_STMT_REVENUE_CONTRADICTION",
            description: `Prior-period revenue contradiction: ${a} vs ${b} (${(divergence * 100).toFixed(1)}% divergence > 20% threshold)`,
            severity: "BLOCK",
          });
          return violations; // One violation is enough — stop early
        }
      }
    }
  }

  // ── Current-period check: ≥2 distinct values with any pair >20% divergence ─

  const distinctCurrentValues = new Set<number>();
  for (const row of revenueRows) {
    if (row.value_current != null) {
      distinctCurrentValues.add(row.value_current);
    }
  }

  if (distinctCurrentValues.size >= 2) {
    const values = Array.from(distinctCurrentValues).sort((a, b) => a - b);
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const a = values[i] as number;
        const b = values[j] as number;
        const maxVal = Math.max(a, b);
        if (maxVal === 0) continue;
        const divergence = Math.abs(a - b) / maxVal;
        if (divergence > 0.2) {
          violations.push({
            code: "CROSS_STMT_REVENUE_CONTRADICTION",
            description: `Current-period revenue contradiction: ${a} vs ${b} (${(divergence * 100).toFixed(1)}% divergence > 20% threshold)`,
            severity: "BLOCK",
          });
          return violations;
        }
      }
    }
  }

  return violations;
}
