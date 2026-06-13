/**
 * task17-page14-shareholders-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 14 (Cơ cấu cổ đông).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 20 items (was 19 before PAGE 14).
 *   2. NAV_ITEMS total is 27 (ANALYST_NAV 20 + SYSTEM_NAV 7).
 *   3. 'Cơ cấu cổ đông' item exists at /dashboard/shareholders and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. All previously-existing analyst tabs still present (regression guard).
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

describe("TopNav — ANALYST_NAV count after PAGE 14 addition", () => {
  it("exports exactly 20 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 14 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (20) + SYSTEM_NAV (7) = 27 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(27);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Cơ cấu cổ đông' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Cơ cấu cổ đông' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Cơ cấu cổ đông");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/shareholders", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Cơ cấu cổ đông");
    expect(item!.to).toBe("/dashboard/shareholders");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Cơ cấu cổ đông");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Cơ cấu cổ đông'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Cơ cấu cổ đông");
    expect(last!.to).toBe("/dashboard/shareholders");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Cơ cấu cổ đông' label", () => {
    renderTopNav();
    expect(screen.getByText("Cơ cấu cổ đông")).toBeTruthy();
  });

  it("renders all 20 analyst nav labels", () => {
    renderTopNav();
    const expectedLabels = [
      "Tổng Quan",
      "Danh Mục",
      "Cổ Phiếu",
      "Kỹ Thuật",
      "Tin Tức",
      "Vĩ Mô",
      "Bản Tin AI",
      "Tài Chính",
      "Cảnh Báo",
      "Khối ngoại",
      "Kế hoạch vs TH",
      "Dự báo AI",
      "Niềm tin AI",
      "Lưu trữ Thị trường",
      "Dòng tiền ngành",
      "Dây chuyền ngành",
      "Tín hiệu Kinh Dịch",
      "Bối cảnh toàn cầu",
      "Sự kiện doanh nghiệp",
      "Cơ cấu cổ đông",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: new tab renders as NavLink (not disabled span)
// ---------------------------------------------------------------------------

describe("TopNav — new tab renders as NavLink", () => {
  it("'/dashboard/shareholders' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/shareholders");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — previously existing page-13 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 13 tab still present", () => {
  it("'Sự kiện doanh nghiệp' tab still exists at /dashboard/corporate-events", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Sự kiện doanh nghiệp");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/corporate-events");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[19] is 'Sự kiện doanh nghiệp' (index after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[19]!.label).toBe("Sự kiện doanh nghiệp");
    expect(ANALYST_NAV[19]!.to).toBe("/dashboard/corporate-events");
  });

  it("ANALYST_NAV[20] is 'Cơ cấu cổ đông' (the new entry)", () => {
    expect(ANALYST_NAV[20]!.label).toBe("Cơ cấu cổ đông");
    expect(ANALYST_NAV[20]!.to).toBe("/dashboard/shareholders");
  });
});
