/**
 * task17-page17-fedrates-nav.test.tsx
 *
 * TopNav SSOT presence + relative-order guard for TASK-17 PAGE 17 (Lãi suất Fed Mỹ).
 *
 * Asserts:
 *   1. 'Lãi suất Fed' item exists at /dashboard/fed-rates and is ENABLED.
 *   2. The item appears immediately AFTER 'Định giá' in ANALYST_NAV (relative order).
 *      Does NOT assert absolute array position or total count — decoupled from nav growth.
 *   3. NAV_ITEMS structural invariant: length == ANALYST_NAV.length + SYSTEM_NAV.length.
 *   4. TopNav renders the new label in the DOM.
 *   5. The new tab renders as a NavLink (not a disabled span).
 *   6. Regression guard: PAGE 16 {to: "/dashboard/financials"} item still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 17 addition", () => {
  it("ANALYST_NAV has at least 23 items (PAGE 17 was appended, nav may have grown since)", () => {
    expect(ANALYST_NAV.length).toBeGreaterThanOrEqual(23);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS structural invariant (no frozen total)
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 17 addition", () => {
  it("NAV_ITEMS length equals ANALYST_NAV.length + SYSTEM_NAV.length (structural invariant)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
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
// Suite 4: relative order — PAGE 17 item comes immediately after PAGE 16 predecessor
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("'Lãi suất Fed' appears immediately after 'Định giá' in ANALYST_NAV (relative order)", () => {
    const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Định giá");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Lãi suất Fed");
    expect(predecessorIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predecessorIdx);
    // Immediately adjacent — no items between predecessor and PAGE 17 item
    expect(itemIdx).toBe(predecessorIdx + 1);
  });

  it("'Định giá' predecessor appears before 'Lãi suất Fed' in ANALYST_NAV (adjacent placement)", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/financials");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/fed-rates");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBe(predIdx + 1);
  });

  it("'Lãi suất Fed' entry exists with correct route in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/fed-rates");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Lãi suất Fed");
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

  it("renders all analyst nav labels present as of PAGE 17", () => {
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

  it("'Định giá' appears before 'Lãi suất Fed' in ANALYST_NAV", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/financials");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/fed-rates");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predIdx);
  });

  it("'Lãi suất Fed' entry exists with correct route and is enabled", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/fed-rates");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Lãi suất Fed");
    expect(item!.comingSoon).toBeUndefined();
  });
});
