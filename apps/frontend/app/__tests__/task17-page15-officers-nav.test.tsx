/**
 * task17-page15-officers-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 15 (Ban lãnh đạo & quản trị).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 21 items (was 20 before PAGE 15).
 *   2. NAV_ITEMS total is 28 (ANALYST_NAV 21 + SYSTEM_NAV 7).
 *   3. 'Ban lãnh đạo' item exists at /dashboard/officers and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end, adjacent to shareholders).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. All previously-existing analyst tabs still present (regression guard — PAGE 14 last).
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

describe("TopNav — ANALYST_NAV count after PAGE 15 addition", () => {
  it("exports exactly 21 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(21);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 15 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (21) + SYSTEM_NAV (7) = 28 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(28);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Ban lãnh đạo' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Ban lãnh đạo' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Ban lãnh đạo");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/officers", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Ban lãnh đạo");
    expect(item!.to).toBe("/dashboard/officers");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Ban lãnh đạo");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Ban lãnh đạo'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Ban lãnh đạo");
    expect(last!.to).toBe("/dashboard/officers");
  });

  it("second-to-last ANALYST_NAV entry is 'Cơ cấu cổ đông' (adjacent placement)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Cơ cấu cổ đông");
    expect(secondLast!.to).toBe("/dashboard/shareholders");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Ban lãnh đạo' label", () => {
    renderTopNav();
    expect(screen.getByText("Ban lãnh đạo")).toBeTruthy();
  });

  it("renders all 21 analyst nav labels", () => {
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
      "Ban lãnh đạo",
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
  it("'/dashboard/officers' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/officers");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 14 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 14 tab still present", () => {
  it("'Cơ cấu cổ đông' tab still exists at /dashboard/shareholders", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Cơ cấu cổ đông");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/shareholders");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[20] is 'Cơ cấu cổ đông' (index after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[20]!.label).toBe("Cơ cấu cổ đông");
    expect(ANALYST_NAV[20]!.to).toBe("/dashboard/shareholders");
  });

  it("ANALYST_NAV[21] is 'Ban lãnh đạo' (the new entry)", () => {
    expect(ANALYST_NAV[21]!.label).toBe("Ban lãnh đạo");
    expect(ANALYST_NAV[21]!.to).toBe("/dashboard/officers");
  });
});
