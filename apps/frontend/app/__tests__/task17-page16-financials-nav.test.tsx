/**
 * task17-page16-financials-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 16 (Định giá & Cơ bản).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 22 items (was 21 before PAGE 16).
 *   2. NAV_ITEMS total is 29 (ANALYST_NAV 22 + SYSTEM_NAV 7).
 *   3. 'Định giá' item exists at /dashboard/financials and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end, adjacent to officers).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: PAGE 15 {to: "/dashboard/officers"} item is still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 16 addition", () => {
  it("exports exactly 22 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(22);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 16 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (22) + SYSTEM_NAV (7) = 29 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(29);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Định giá' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Định giá' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Định giá");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/financials", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Định giá");
    expect(item!.to).toBe("/dashboard/financials");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Định giá");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Định giá'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Định giá");
    expect(last!.to).toBe("/dashboard/financials");
  });

  it("second-to-last ANALYST_NAV entry is 'Ban lãnh đạo' (adjacent placement)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Ban lãnh đạo");
    expect(secondLast!.to).toBe("/dashboard/officers");
  });

  it("ANALYST_NAV[21] is 'Định giá' (zero-based index)", () => {
    expect(ANALYST_NAV[21]!.label).toBe("Định giá");
    expect(ANALYST_NAV[21]!.to).toBe("/dashboard/financials");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Định giá' label", () => {
    renderTopNav();
    expect(screen.getByText("Định giá")).toBeTruthy();
  });

  it("renders all 22 analyst nav labels", () => {
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
      "Định giá",
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
  it("'/dashboard/financials' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/financials");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 15 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 15 tab still present", () => {
  it("'Ban lãnh đạo' tab still exists at /dashboard/officers", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Ban lãnh đạo");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/officers");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[20] is 'Ban lãnh đạo' (index unchanged)", () => {
    expect(ANALYST_NAV[20]!.label).toBe("Ban lãnh đạo");
    expect(ANALYST_NAV[20]!.to).toBe("/dashboard/officers");
  });

  it("ANALYST_NAV[21] is 'Định giá' (the new entry)", () => {
    expect(ANALYST_NAV[21]!.label).toBe("Định giá");
    expect(ANALYST_NAV[21]!.to).toBe("/dashboard/financials");
  });
});
