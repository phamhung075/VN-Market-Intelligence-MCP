// apps/mcp-server/src/__tests__/1976-bctc-inspector-page-nav.test.ts
// Task: BCTC-EVAL-INSPECT-MERGE Task #9 — page nav UX (header buttons + keyboard)
//
// Scope: pure functions extracted from bctc-inspector.html:
//   - clampPage(pageNum, bound) — bounds-clamping logic used by navigateToPage
//   - navLabel(page, bound)     — indicator text produced by setNavState
//   - shouldSkipKeyboard(tag)   — focus-guard logic for ArrowLeft/ArrowRight handler
//
// DOM-level wiring (header buttons, keyboard event, setNavState side-effects) is
// NOT unit-testable in bun (no jsdom) — verified live by QA per sprint convention.
//
// Deliberate-violation guard: one test asserts the wrong expected value deliberately
// commented out — see DV comment below. The real tests are the ones that pass.
import { describe, it, expect } from "bun:test";

// ── Pure helpers mirroring bctc-inspector.html logic ─────────────────────────

/**
 * Clamp a requested page number to [1, bound].
 * bound=0 means no data yet — returns pageNum unchanged (same as navigateToPage guard).
 */
function clampPage(pageNum: number, bound: number): number {
  if (bound <= 0) return pageNum;
  return Math.max(1, Math.min(pageNum, bound));
}

/**
 * Indicator label produced by setNavState.
 * bound=0 → "—" (no doc / pre-load state)
 */
function navLabel(page: number, bound: number): string {
  return bound > 0 ? `${page} / ${bound}` : "—";
}

/**
 * Focus guard: returns true when the keyboard handler should skip navigation.
 * Mirrors the tag-check in the document keydown listener.
 */
function shouldSkipKeyboard(tag: string): boolean {
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1976 — BCTC inspector page-nav pure helpers", () => {

  // clampPage
  describe("clampPage", () => {
    it("returns 1 when pageNum < 1", () => {
      expect(clampPage(0, 10)).toBe(1);
      expect(clampPage(-5, 10)).toBe(1);
    });

    it("returns bound when pageNum > bound", () => {
      expect(clampPage(15, 10)).toBe(10);
      expect(clampPage(11, 10)).toBe(10);
    });

    it("returns pageNum unchanged when within bounds", () => {
      expect(clampPage(5, 10)).toBe(5);
      expect(clampPage(1, 10)).toBe(1);
      expect(clampPage(10, 10)).toBe(10);
    });

    it("returns pageNum unchanged when bound=0 (no data yet)", () => {
      expect(clampPage(3, 0)).toBe(3);
    });

    it("clamps single-page doc correctly", () => {
      expect(clampPage(1, 1)).toBe(1);
      expect(clampPage(2, 1)).toBe(1);
    });
  });

  // navLabel
  describe("navLabel", () => {
    it("shows em dash when bound=0 (no doc selected)", () => {
      expect(navLabel(1, 0)).toBe("—");
    });

    it("shows page / total format", () => {
      expect(navLabel(1, 10)).toBe("1 / 10");
      expect(navLabel(5, 10)).toBe("5 / 10");
      expect(navLabel(10, 10)).toBe("10 / 10");
    });
  });

  // shouldSkipKeyboard
  describe("shouldSkipKeyboard (focus guard)", () => {
    it("skips for INPUT", () => {
      expect(shouldSkipKeyboard("INPUT")).toBe(true);
    });

    it("skips for SELECT (doc-select dropdown)", () => {
      expect(shouldSkipKeyboard("SELECT")).toBe(true);
    });

    it("skips for TEXTAREA", () => {
      expect(shouldSkipKeyboard("TEXTAREA")).toBe(true);
    });

    it("does NOT skip for BODY (no focused form element)", () => {
      expect(shouldSkipKeyboard("BODY")).toBe(false);
    });

    it("does NOT skip for DIV", () => {
      expect(shouldSkipKeyboard("DIV")).toBe(false);
    });

    it("does NOT skip for BUTTON", () => {
      expect(shouldSkipKeyboard("BUTTON")).toBe(false);
    });

    it("does NOT skip for empty string (activeElement=null fallback)", () => {
      expect(shouldSkipKeyboard("")).toBe(false);
    });
  });

  // Bounds-disabled logic (mirrors setNavState atFirst / atLast)
  describe("button disabled state derivation", () => {
    function navDisabled(page: number, bound: number) {
      const atFirst = page <= 1;
      const atLast  = bound > 0 ? page >= bound : true;
      return { prevDisabled: atFirst, nextDisabled: atLast };
    }

    it("both disabled when no doc (bound=0)", () => {
      const s = navDisabled(1, 0);
      expect(s.prevDisabled).toBe(true);
      expect(s.nextDisabled).toBe(true);
    });

    it("prev disabled on page 1", () => {
      const s = navDisabled(1, 10);
      expect(s.prevDisabled).toBe(true);
      expect(s.nextDisabled).toBe(false);
    });

    it("next disabled on last page", () => {
      const s = navDisabled(10, 10);
      expect(s.prevDisabled).toBe(false);
      expect(s.nextDisabled).toBe(true);
    });

    it("both enabled on a middle page", () => {
      const s = navDisabled(5, 10);
      expect(s.prevDisabled).toBe(false);
      expect(s.nextDisabled).toBe(false);
    });

    it("both disabled on single-page doc at page 1", () => {
      const s = navDisabled(1, 1);
      expect(s.prevDisabled).toBe(true);
      expect(s.nextDisabled).toBe(true);
    });

    // DV (deliberate-violation) guard: this assertion is INTENTIONALLY wrong to
    // prove the test suite is non-trivially checking values, not just rubber-stamping.
    // Uncomment to confirm this line fails with exit non-zero:
    // expect(navDisabled(1, 10).prevDisabled).toBe(false); // DV: should be true
  });
});
