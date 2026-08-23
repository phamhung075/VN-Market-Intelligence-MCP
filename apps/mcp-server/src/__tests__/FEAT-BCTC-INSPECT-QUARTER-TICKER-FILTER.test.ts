// apps/mcp-server/src/__tests__/FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts
// Task: TASK-BCTC-INSPECT-UI-FILTERS — quarter + ticker facet filters on the
// BCTC inspector doc dropdown.
//
// Scope: pure functions mirroring bctc-inspector.html logic:
//   - normalizeQuarter(val)               — coerce DocListItem.period_quarter
//                                            (number | "Q1"-shaped string | null) → number|null
//   - applyFilterPredicate(item, qVal, tVal) — AND-composed quarter+ticker match
//   - resolveSelectionAfterFilter(currentDocId, filteredIds) — keep vs reset
//
// DOM-level wiring (select rendering, change-event dispatch, statusBar text)
// is NOT unit-testable in bun (no jsdom) — verified live by QA per sprint
// convention (mirrors 1976-bctc-inspector-page-nav.test.ts).
import { describe, it, expect } from "bun:test";

// ── Pure helpers mirroring bctc-inspector.html logic ─────────────────────────

/**
 * Coerce a DocListItem.period_quarter value (number | "Q1"-shaped string | null)
 * into a plain number, or null when it cannot be resolved.
 * Live-data quirk (2/257 rows, both ticker HUT): period_quarter holds the
 * string "Q1" instead of the typed `number|null`.
 */
function normalizeQuarter(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const m = /^Q([1-4])$/i.exec(val.trim());
    return m ? Number(m[1]) : null;
  }
  return null;
}

/**
 * AND-composed predicate: quarter filter (qVal = "" | "YYYY-Q") AND ticker
 * filter (tVal = "" | action_code). Mirrors applyFilters()'s inline filter.
 */
function applyFilterPredicate(
  item: { period_quarter: unknown; period_year: number; action_code: string },
  qVal: string,
  tVal: string
): boolean {
  if (qVal) {
    const q = normalizeQuarter(item.period_quarter);
    if (q === null || `${item.period_year}-${q}` !== qVal) return false;
  }
  return !tVal || item.action_code === tVal;
}

/**
 * Selection-survival resolver: does the currently-selected doc_id survive
 * the new filtered set? Mirrors the branch in applyFilters() (FR-6/FR-7).
 */
function resolveSelectionAfterFilter(
  currentDocId: string | null,
  filteredIds: string[]
): { action: "keep" | "reset" } {
  if (currentDocId && filteredIds.includes(currentDocId)) {
    return { action: "keep" };
  }
  return { action: "reset" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TASK-BCTC-INSPECT-UI-FILTERS — quarter + ticker filter pure helpers", () => {

  describe("normalizeQuarter", () => {
    it("passes numbers through unchanged", () => {
      expect(normalizeQuarter(1)).toBe(1);
      expect(normalizeQuarter(4)).toBe(4);
      expect(normalizeQuarter(0)).toBe(0);
    });

    it("coerces \"Q1\"-shaped strings to numbers", () => {
      expect(normalizeQuarter("Q1")).toBe(1);
      expect(normalizeQuarter("Q2")).toBe(2);
      expect(normalizeQuarter("Q3")).toBe(3);
      expect(normalizeQuarter("Q4")).toBe(4);
    });

    it("is case-insensitive and trims whitespace", () => {
      expect(normalizeQuarter("q1")).toBe(1);
      expect(normalizeQuarter(" Q2 ")).toBe(2);
    });

    it("returns null for null / undefined", () => {
      expect(normalizeQuarter(null)).toBeNull();
      expect(normalizeQuarter(undefined)).toBeNull();
    });

    it("returns null for malformed strings", () => {
      expect(normalizeQuarter("abc")).toBeNull();
      expect(normalizeQuarter("Q5")).toBeNull();
      expect(normalizeQuarter("Q0")).toBeNull();
      expect(normalizeQuarter("1")).toBeNull();
      expect(normalizeQuarter("")).toBeNull();
    });
  });

  describe("applyFilterPredicate (AND-composed)", () => {
    const item = { period_quarter: 1, period_year: 2025, action_code: "VCB" };

    it("matches when quarter-only filter matches", () => {
      expect(applyFilterPredicate(item, "2025-1", "")).toBe(true);
    });

    it("matches when ticker-only filter matches", () => {
      expect(applyFilterPredicate(item, "", "VCB")).toBe(true);
    });

    it("matches when both filters match (AND)", () => {
      expect(applyFilterPredicate(item, "2025-1", "VCB")).toBe(true);
    });

    it("does not match when neither filter matches", () => {
      expect(applyFilterPredicate(item, "2024-4", "FPT")).toBe(false);
    });

    it("does not match when quarter matches but ticker does not (AND semantics)", () => {
      expect(applyFilterPredicate(item, "2025-1", "FPT")).toBe(false);
    });

    it("does not match when ticker matches but quarter does not (AND semantics)", () => {
      expect(applyFilterPredicate(item, "2024-4", "VCB")).toBe(false);
    });

    it("matches everything when both filters are empty (all-option)", () => {
      expect(applyFilterPredicate(item, "", "")).toBe(true);
    });

    it("excludes items whose period_quarter cannot be normalized when a quarter filter is active", () => {
      const malformed = { period_quarter: null, period_year: 2025, action_code: "VCB" };
      expect(applyFilterPredicate(malformed, "2025-1", "")).toBe(false);
    });

    it("handles the live-data string-quarter quirk (HUT rows: period_quarter=\"Q1\")", () => {
      const hutRow = { period_quarter: "Q1", period_year: 2024, action_code: "HUT" };
      expect(applyFilterPredicate(hutRow, "2024-1", "")).toBe(true);
      expect(applyFilterPredicate(hutRow, "2024-2", "")).toBe(false);
    });
  });

  describe("resolveSelectionAfterFilter", () => {
    it("returns keep when currentDocId survives the filtered set", () => {
      expect(resolveSelectionAfterFilter("doc-1", ["doc-1", "doc-2"])).toEqual({ action: "keep" });
    });

    it("returns reset when currentDocId is filtered out", () => {
      expect(resolveSelectionAfterFilter("doc-1", ["doc-2", "doc-3"])).toEqual({ action: "reset" });
    });

    it("returns reset when the filtered set is empty", () => {
      expect(resolveSelectionAfterFilter("doc-1", [])).toEqual({ action: "reset" });
    });

    it("returns reset when there is no current selection", () => {
      expect(resolveSelectionAfterFilter(null, ["doc-1"])).toEqual({ action: "reset" });
    });
  });
});
