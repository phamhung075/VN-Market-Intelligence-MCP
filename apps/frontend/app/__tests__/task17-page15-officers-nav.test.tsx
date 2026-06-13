/**
 * task17-page15-officers-nav.test.tsx
 *
 * TopNav SSOT presence + relative-order guard for TASK-17 PAGE 15 (Ban lãnh đạo & quản trị).
 *
 * Asserts:
 *   1. 'Ban lãnh đạo' item exists at /dashboard/officers and is ENABLED.
 *   2. The item appears immediately AFTER 'Cơ cấu cổ đông' in ANALYST_NAV (relative order).
 *      Does NOT assert absolute array position or total count — decoupled from nav growth.
 *   3. NAV_ITEMS structural invariant: length == ANALYST_NAV.length + SYSTEM_NAV.length.
 *   4. TopNav renders the new label in the DOM.
 *   5. The new tab renders as a NavLink (not a disabled span).
 *   6. All previously-existing analyst tabs still present (regression guard — PAGE 14 last).
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

describe("TopNav — ANALYST_NAV count after PAGE 15 addition", () => {
  it("ANALYST_NAV has at least 21 items (PAGE 15 was appended, nav may have grown since)", () => {
    expect(ANALYST_NAV.length).toBeGreaterThanOrEqual(21);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS structural invariant (no frozen total)
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 15 addition", () => {
  it("NAV_ITEMS length equals ANALYST_NAV.length + SYSTEM_NAV.length (structural invariant)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
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
// Suite 4: relative order — PAGE 15 item comes immediately after PAGE 14 predecessor
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("'Ban lãnh đạo' appears immediately after 'Cơ cấu cổ đông' in ANALYST_NAV (relative order)", () => {
    const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Cơ cấu cổ đông");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Ban lãnh đạo");
    expect(predecessorIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predecessorIdx);
    // Immediately adjacent — no items between predecessor and PAGE 15 item
    expect(itemIdx).toBe(predecessorIdx + 1);
  });

  it("'Cơ cấu cổ đông' predecessor appears before 'Ban lãnh đạo' in ANALYST_NAV (adjacent placement)", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/shareholders");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/officers");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBe(predIdx + 1);
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

  it("renders all analyst nav labels present as of PAGE 15", () => {
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

  it("'Cơ cấu cổ đông' appears before 'Ban lãnh đạo' in ANALYST_NAV", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/shareholders");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/officers");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predIdx);
  });

  it("'Ban lãnh đạo' entry exists with correct route and is enabled", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/officers");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Ban lãnh đạo");
    expect(item!.comingSoon).toBeUndefined();
  });
});
