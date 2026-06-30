/**
 * ind-p1-momentum-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-502-MOMENTUM-FRONTEND
 * (Động Lực P1 / /dashboard/momentum).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 27 items (was 26 before this addition).
 *   2. NAV_ITEMS total is 34 (ANALYST_NAV 27 + SYSTEM_NAV 7).
 *   3. 'Động Lực P1' item exists at /dashboard/momentum and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended after 'Chỉ Báo').
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: 'Chỉ Báo' {to: "/dashboard/indicator-gauges"} still present.
 *
 * Sprint: BA-IND-P1-MOMENTUM-FRONTEND
 * Task:   TASK-502-MOMENTUM-FRONTEND AC-6
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

describe("TopNav — ANALYST_NAV count after TASK-502 addition", () => {
  it("exports exactly 27 analyst nav items (TASK-502 added 'Động Lực P1')", () => {
    expect(ANALYST_NAV).toHaveLength(27);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after TASK-502 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (27) + SYSTEM_NAV (7) = 34 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(34);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Động Lực P1' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Động Lực P1' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Động Lực P1");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/momentum", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Động Lực P1");
    expect(item!.to).toBe("/dashboard/momentum");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Động Lực P1");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position — last in ANALYST_NAV
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Động Lực P1'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Động Lực P1");
    expect(last!.to).toBe("/dashboard/momentum");
  });

  it("second-to-last ANALYST_NAV entry is 'Chỉ Báo' (IND-P1, still present)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Chỉ Báo");
    expect(secondLast!.to).toBe("/dashboard/indicator-gauges");
  });

  it("ANALYST_NAV[26] is 'Động Lực P1' (zero-based, appended after 'Chỉ Báo')", () => {
    expect(ANALYST_NAV[26]!.label).toBe("Động Lực P1");
    expect(ANALYST_NAV[26]!.to).toBe("/dashboard/momentum");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Động Lực P1' label", () => {
    renderTopNav();
    expect(screen.getByText("Động Lực P1")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite 6: new tab renders as NavLink (not disabled span)
// ---------------------------------------------------------------------------

describe("TopNav — new tab renders as NavLink", () => {
  it("'/dashboard/momentum' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/momentum");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — 'Chỉ Báo' tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: 'Chỉ Báo' tab still present", () => {
  it("'Chỉ Báo' tab still exists at /dashboard/indicator-gauges", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Chỉ Báo");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/indicator-gauges");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[25] is 'Chỉ Báo' (IND-P1 index unchanged)", () => {
    expect(ANALYST_NAV[25]!.label).toBe("Chỉ Báo");
    expect(ANALYST_NAV[25]!.to).toBe("/dashboard/indicator-gauges");
  });
});
