/**
 * BEQ-BANK-DISCRIM DV tests — bank discriminator fix in aggregateScalars
 *
 * Sprint: BCTC-EXTRACT-QUALITY Phase-2
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md §4
 *
 * Task: BEQ-8 — Replace isBankPath = findByCode(rows,"10")===null
 *               with isBankFormFromRows(rows) in bctcScalarAggregator.ts line 578
 *
 * Anti-false-green:
 *   RED (before patch): balance-sheet-only FPT rows (no code "10") → isBankPath=true
 *   (the broken discriminator interprets absence of income-stmt code as bank form)
 *   → notApplicable includes ["gross_profit","current_assets","gross_margin_pct"]
 *   → those columns would be null-cleared on a corporate ticker.
 *
 *   GREEN (after patch): isBankFormFromRows used → FPT codes 100/280/300/400 contain
 *   3-digit codes → hasCorpBalance=true → isBankFormFromRows returns false
 *   → notApplicable=[] (no null-clear on corporate)
 *
 * DV-BANK-1: balance-sheet-only corporate rows (FPT codes: 100, 280, 300, 400)
 *            → aggregateScalars returns notApplicable=[] (NOT the bank null-clear list)
 * DV-BANK-2: bank rows (ACB with Roman codes I, II, XIII)
 *            → aggregateScalars returns notApplicable includes "gross_profit"
 * DV-BANK-3: empty rows → aggregateScalars returns notApplicable=[] (fail-safe)
 */

import { describe, it, expect } from "bun:test";
import { aggregateScalars } from "../domain/services/financial-reports/bctcScalarAggregator.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRow(
  code: string | null,
  section: string,
  value: number | null = null,
): AggregatorRow {
  return {
    code,
    label: `Label for ${code}`,
    value_current: value,
    statement_section: section,
    is_summary_row: 1,
    unit: "vnd",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BEQ-8 — isBankPath discriminator fix in aggregateScalars", () => {
  it("DV-BANK-1: balance-sheet-only corporate rows (FPT codes 100/280/300/400) → notApplicable=[] (no bank null-clear)", () => {
    /**
     * RED (before patch): no code "10" in income_statement section
     * → findByCode(rows,"10")===null → isBankPath=true → notApplicable includes bank fields
     *
     * GREEN (after patch): isBankFormFromRows sees codes 100/280/300/400 (3-digit)
     * → hasCorpBalance=true → isBankFormFromRows returns false → notApplicable=[]
     */
    const rows: AggregatorRow[] = [
      makeRow("100", "balance_sheet", 41_000_000_000_000),
      makeRow("280", "balance_sheet", 88_000_000_000_000),
      makeRow("300", "balance_sheet", 47_000_000_000_000),
      makeRow("400", "balance_sheet", 41_000_000_000_000),
    ];

    const result = aggregateScalars(rows);

    // CORPORATE: notApplicable must be empty — no bank null-clear should fire
    expect(result.notApplicable).toEqual([]);
    // Specifically, gross_profit must NOT be in notApplicable
    expect(result.notApplicable).not.toContain("gross_profit");
    expect(result.notApplicable).not.toContain("current_assets");
    expect(result.notApplicable).not.toContain("gross_margin_pct");
  });

  it("DV-BANK-2: bank rows (ACB with Roman codes I, II, XIII) → notApplicable includes gross_profit (correct bank null-clear)", () => {
    /**
     * Bank form confirmed: Roman codes I, II, XIII + section codes A, B
     * → isBankFormFromRows returns true → notApplicable includes bank fields
     * This verifies the patch does NOT break bank detection for real bank rows.
     */
    const rows: AggregatorRow[] = [
      makeRow("A",    "balance_sheet", 100_000_000_000_000),
      makeRow("B",    "balance_sheet",  80_000_000_000_000),
      makeRow("I",    "income_statement", 15_000_000_000_000),
      makeRow("II",   "income_statement",  3_000_000_000_000),
      makeRow("XIII", "income_statement",  2_800_000_000_000),
    ];

    const result = aggregateScalars(rows);

    // BANK: gross_profit must be in notApplicable (bank null-clear is correct)
    expect(result.notApplicable).toContain("gross_profit");
    expect(result.notApplicable).toContain("current_assets");
    expect(result.notApplicable).toContain("gross_margin_pct");
  });

  it("DV-BANK-3: empty rows → notApplicable=[] (fail-safe — no bank promotion without evidence)", () => {
    const result = aggregateScalars([]);

    // isBankFormFromRows returns false for empty rows (fail-safe)
    expect(result.notApplicable).toEqual([]);
    expect(result.notApplicable).not.toContain("gross_profit");
  });
});
