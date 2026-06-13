/**
 * task17-page16-financials-nav.test.tsx
 *
 * TopNav SSOT presence + relative-order guard for TASK-17 PAGE 16 (Định giá & Cơ bản).
 *
 * Asserts:
 *   1. 'Định giá' item exists at /dashboard/financials and is ENABLED.
 *   2. The item appears immediately AFTER 'Ban lãnh đạo' in ANALYST_NAV (relative order).
 *      Does NOT assert absolute array position or total count — decoupled from nav growth.
 *   3. NAV_ITEMS structural invariant: length == ANALYST_NAV.length + SYSTEM_NAV.length.
 *   4. TopNav renders the new label in the DOM.
 *   5. The new tab renders as a NavLink (not a disabled span).
 *   6. Regression guard: PAGE 15 {to: "/dashboard/officers"} item is still present.
 *
 * Design principle: a per-page test must NOT break when page-(N+k) is later added.
 * Absolute count is asserted only in FE-HEADER-SSOT-top-nav.test.tsx.
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
// Suite 1: ANALYST_NAV minimum size (decoupled — no frozen absolute count)
// ---------------------------------------------------------------------------

describe("TopNav — ANALYST_NAV count after PAGE 16 addition", () => {
  it("ANALYST_NAV has at least 22 items (PAGE 16 was appended, nav may have grown since)", () => {
    expect(ANALYST_NAV.length).toBeGreaterThanOrEqual(22);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS structural invariant (no frozen total)
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 16 addition", () => {
  it("NAV_ITEMS length equals ANALYST_NAV.length + SYSTEM_NAV.length (structural invariant)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
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
// Suite 4: relative order — PAGE 16 item comes immediately after PAGE 15 predecessor
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("'Định giá' appears immediately after 'Ban lãnh đạo' in ANALYST_NAV (relative order)", () => {
    const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Ban lãnh đạo");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Định giá");
    expect(predecessorIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predecessorIdx);
    // Immediately adjacent — no items between predecessor and PAGE 16 item
    expect(itemIdx).toBe(predecessorIdx + 1);
  });

  it("'Ban lãnh đạo' predecessor appears before 'Định giá' in ANALYST_NAV (adjacent placement)", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/officers");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/financials");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBe(predIdx + 1);
  });

  it("'Định giá' entry exists with correct route in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/financials");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Định giá");
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

  it("renders all analyst nav labels present as of PAGE 16", () => {
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

  it("'Ban lãnh đạo' appears before 'Định giá' in ANALYST_NAV", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/officers");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/financials");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predIdx);
  });

  it("'Định giá' entry exists with correct route and is enabled", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/financials");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Định giá");
    expect(item!.comingSoon).toBeUndefined();
  });
});
