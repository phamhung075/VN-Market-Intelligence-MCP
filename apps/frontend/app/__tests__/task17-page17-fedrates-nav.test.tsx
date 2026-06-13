/**
 * task17-page17-fedrates-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 17 (Lãi suất Fed Mỹ).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 23 items (was 22 before PAGE 17).
 *   2. NAV_ITEMS total is 30 (ANALYST_NAV 23 + SYSTEM_NAV 7).
 *   3. 'Lãi suất Fed' item exists at /dashboard/fed-rates and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: PAGE 16 {to: "/dashboard/financials"} item still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 17 addition", () => {
  it("exports exactly 23 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(23);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 17 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (23) + SYSTEM_NAV (7) = 30 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(30);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Lãi suất Fed' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Lãi suất Fed' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Lãi suất Fed");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/fed-rates", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Lãi suất Fed");
    expect(item!.to).toBe("/dashboard/fed-rates");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Lãi suất Fed");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Lãi suất Fed'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Lãi suất Fed");
    expect(last!.to).toBe("/dashboard/fed-rates");
  });

  it("second-to-last ANALYST_NAV entry is 'Định giá' (adjacent placement)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Định giá");
    expect(secondLast!.to).toBe("/dashboard/financials");
  });

  it("ANALYST_NAV[23] is 'Lãi suất Fed' (zero-based index, after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[23]!.label).toBe("Lãi suất Fed");
    expect(ANALYST_NAV[23]!.to).toBe("/dashboard/fed-rates");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Lãi suất Fed' label", () => {
    renderTopNav();
    expect(screen.getByText("Lãi suất Fed")).toBeTruthy();
  });

  it("renders all 23 analyst nav labels", () => {
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
      "Lãi suất Fed",
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
  it("'/dashboard/fed-rates' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/fed-rates");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 16 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 16 tab still present", () => {
  it("'Định giá' tab still exists at /dashboard/financials", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Định giá");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/financials");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[22] is 'Định giá' (index after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[22]!.label).toBe("Định giá");
    expect(ANALYST_NAV[22]!.to).toBe("/dashboard/financials");
  });

  it("ANALYST_NAV[23] is 'Lãi suất Fed' (the new PAGE 17 entry)", () => {
    expect(ANALYST_NAV[23]!.label).toBe("Lãi suất Fed");
    expect(ANALYST_NAV[23]!.to).toBe("/dashboard/fed-rates");
  });
});
