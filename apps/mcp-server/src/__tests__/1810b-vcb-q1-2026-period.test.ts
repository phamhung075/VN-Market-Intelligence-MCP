/**
 * Task 1810b — FIX: VCB Q1-2026 returns "no data" despite PDF stored
 *
 * Root cause: parseYearQuarterFromFilename() Tier 3 (YYYYMMDD prefix path)
 * maps month=4 (April publication date) to quarter="Q2" via the calendar-quarter
 * formula `month <= 6 → Q2`. But April is the *publication* month for Q1 reports
 * (Vietnamese SSC deadline: Q1 filing due ~April 30). The YYYYMMDD prefix in
 * VPS-style filenames is the publication date, not the period-end date.
 *
 * Impact: filenames like "20260430-VCB-bao-cao.pdf" (no Q-token, April 2026
 * publication) are parsed as {year:2026, quarter:"Q2"} instead of Q1-2026.
 * The report is then stored under sort_key "2026-Q2", so queries for Q1-2026
 * return no data.
 *
 * Fix: in Tier 3, when YYYYMMDD prefix month is 4 (April), use publication-date
 * boundary logic (same as detectTargetQuarter) instead of calendar-quarter:
 *   month 1-4  → Q4 of previous calendar year? No — we need Q1 for April.
 *
 * Actually the correct fix: Tier 3 should map publication month → fiscal quarter
 * using the same VN SSC deadlines as detectTargetQuarter:
 *   month 1-4  → Q1 (files due April 30 — these are Q1 report filings)
 *   month 5-7  → Q2
 *   month 8-10 → Q3
 *   month 11-12 → Q4
 *
 * But this conflicts with Tier 1 behaviour: "BCTC VNM 31.03.2026" → month 3 = Q1.
 * Tier 1 uses period-end date (month 3 = Q1). Tier 3's YYYYMMDD is publication date.
 *
 * Simplest safe fix: in Tier 3, treat month 4 (April) as Q1, not Q2.
 * Month 4 is a *publication* month for Q1 reports. Mapping: <= 4 → Q1.
 *
 * TDD: RED first, then GREEN.
 */

import { describe, it, expect } from "bun:test";
import { parseYearQuarterFromFilename } from "../scheduler/financial-reports/bctcReparseJob.js";

describe("Task 1810b — parseYearQuarterFromFilename Q1-2026 (April publication)", () => {
  // ── Tier 2 paths (should already work — regression guard) ────────────────

  it("20260430-VCB-...-Quy-1-nam-2026_signed.pdf → {year:2026, quarter:'Q1'}", () => {
    expect(
      parseYearQuarterFromFilename(
        "20260430-VCB-Bao-cao-tai-chinh-hop-nhat-Quy-1-nam-2026_signed.pdf",
      ),
    ).toEqual({ year: 2026, quarter: "Q1" });
  });

  it("20260430-VCB-CBTT-BCTC-Q1.2026_signed.pdf → {year:2026, quarter:'Q1'}", () => {
    expect(
      parseYearQuarterFromFilename("20260430-VCB-CBTT-BCTC-Q1.2026_signed.pdf"),
    ).toEqual({ year: 2026, quarter: "Q1" });
  });

  // ── Tier 3 path — YYYYMMDD prefix, no Q-token, April 2026 publication ───
  // This is the regression: month=4 was mapped to Q2 by the calendar formula.

  it("20260430-VCB-bao-cao-tai-chinh.pdf (no Q-token) → {year:2026, quarter:'Q1'}", () => {
    // Tier 1: no dd.mm.yyyy date → skip
    // Tier 2: no Q-token → skip
    // Tier 3: YYYYMMDD=20260430, month=4 → must produce Q1 (publication month for Q1)
    expect(
      parseYearQuarterFromFilename("20260430-VCB-bao-cao-tai-chinh.pdf"),
    ).toEqual({ year: 2026, quarter: "Q1" });
  });

  // ── Boundary: April of any year should map to Q1, not Q2 ────────────────

  it("20250429-VCB-bao-cao-tai-chinh.pdf (no Q-token, April 2025) → {year:2025, quarter:'Q1'}", () => {
    expect(
      parseYearQuarterFromFilename("20250429-VCB-bao-cao-tai-chinh.pdf"),
    ).toEqual({ year: 2025, quarter: "Q1" });
  });

  // ── Existing Tier 3 behaviour for other months must not regress ──────────

  it("20260531-VCB-bao-cao.pdf (month=5, no Q-token) → Q2", () => {
    expect(
      parseYearQuarterFromFilename("20260531-VCB-bao-cao.pdf"),
    ).toEqual({ year: 2026, quarter: "Q2" });
  });

  it("20260930-VCB-bao-cao.pdf (month=9, no Q-token) → Q3", () => {
    expect(
      parseYearQuarterFromFilename("20260930-VCB-bao-cao.pdf"),
    ).toEqual({ year: 2026, quarter: "Q3" });
  });

  it("20261231-VCB-bao-cao.pdf (month=12, no Q-token) → Q4", () => {
    expect(
      parseYearQuarterFromFilename("20261231-VCB-bao-cao.pdf"),
    ).toEqual({ year: 2026, quarter: "Q4" });
  });
});
