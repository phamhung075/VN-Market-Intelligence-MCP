/**
 * ind-p1-indicator-gauges-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for IND-P1-FRONTEND-GAUGE-CARDS
 * (Chỉ Báo / /dashboard/indicator-gauges).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 26 items (was 25 before this addition).
 *   2. NAV_ITEMS total is 33 (ANALYST_NAV 26 + SYSTEM_NAV 7).
 *   3. 'Chỉ Báo' item exists at /dashboard/indicator-gauges and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: PAGE 19 {to: "/dashboard/news-buzz"} item still present.
 *
 * Sprint: MARKET-INDICATOR-DEPTH-P0
 * Task:   IND-P1-FRONTEND-GAUGE-CARDS
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  TopNav,
  NAV_ITEMS,
  ANALYST_NAV,
  SYSTEM_NAV,
} from "~/components/TopNav";

function renderTopNav(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TopNav />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Suite 1: ANALYST_NAV count
// ---------------------------------------------------------------------------

describe("TopNav — ANALYST_NAV count after IND-P1 addition", () => {
  it("exports exactly 26 analyst nav items (IND-P1 added 'Chỉ Báo')", () => {
    expect(ANALYST_NAV).toHaveLength(26);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after IND-P1 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (26) + SYSTEM_NAV (7) = 33 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(33);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Chỉ Báo' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Chỉ Báo' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Chỉ Báo");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/indicator-gauges", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Chỉ Báo");
    expect(item!.to).toBe("/dashboard/indicator-gauges");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Chỉ Báo");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position — last in ANALYST_NAV
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Chỉ Báo'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Chỉ Báo");
    expect(last!.to).toBe("/dashboard/indicator-gauges");
  });

  it("second-to-last ANALYST_NAV entry is 'Tin nhắc đến' (PAGE 19, still present)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Tin nhắc đến");
    expect(secondLast!.to).toBe("/dashboard/news-buzz");
  });

  it("ANALYST_NAV[25] is 'Chỉ Báo' (zero-based, appended after PAGE 19)", () => {
    expect(ANALYST_NAV[25]!.label).toBe("Chỉ Báo");
    expect(ANALYST_NAV[25]!.to).toBe("/dashboard/indicator-gauges");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Chỉ Báo' label", () => {
    renderTopNav();
    expect(screen.getByText("Chỉ Báo")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: new tab renders as NavLink (not disabled span)
// ---------------------------------------------------------------------------

describe("TopNav — new tab renders as NavLink", () => {
  it("'/dashboard/indicator-gauges' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/indicator-gauges");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 19 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 19 tab still present", () => {
  it("'Tin nhắc đến' tab still exists at /dashboard/news-buzz", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Tin nhắc đến");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/news-buzz");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[24] is 'Tin nhắc đến' (PAGE 19 index unchanged)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Tin nhắc đến");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/news-buzz");
  });
});
