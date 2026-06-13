/**
 * task17-page14-shareholders-nav.test.tsx
 *
 * TopNav SSOT presence + relative-order guard for TASK-17 PAGE 14 (Cơ cấu cổ đông).
 *
 * Asserts:
 *   1. 'Cơ cấu cổ đông' item exists at /dashboard/shareholders and is ENABLED.
 *   2. The item appears immediately AFTER 'Sự kiện doanh nghiệp' in ANALYST_NAV (relative order).
 *      Does NOT assert absolute array position or total count — decoupled from nav growth.
 *   3. NAV_ITEMS structural invariant: length == ANALYST_NAV.length + SYSTEM_NAV.length.
 *   4. TopNav renders the new label in the DOM.
 *   5. The new tab renders as a NavLink (not a disabled span).
 *   6. All previously-existing analyst tabs still present (regression guard).
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

describe("TopNav — ANALYST_NAV count after PAGE 14 addition", () => {
  it("ANALYST_NAV has at least 20 items (PAGE 14 was appended, nav may have grown since)", () => {
    expect(ANALYST_NAV.length).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS structural invariant (no frozen total)
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 14 addition", () => {
  it("NAV_ITEMS length equals ANALYST_NAV.length + SYSTEM_NAV.length (structural invariant)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
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
// Suite 4: relative order — PAGE 14 item comes immediately after PAGE 13 predecessor
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("'Cơ cấu cổ đông' appears immediately after 'Sự kiện doanh nghiệp' in ANALYST_NAV (relative order)", () => {
    const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Sự kiện doanh nghiệp");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Cơ cấu cổ đông");
    expect(predecessorIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predecessorIdx);
    // Immediately adjacent — no items between predecessor and PAGE 14 item
    expect(itemIdx).toBe(predecessorIdx + 1);
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

  it("renders all analyst nav labels present as of PAGE 14", () => {
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

  it("'Sự kiện doanh nghiệp' appears before 'Cơ cấu cổ đông' in ANALYST_NAV", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/corporate-events");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/shareholders");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predIdx);
  });

  it("'Cơ cấu cổ đông' entry exists with correct route and is enabled", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/shareholders");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Cơ cấu cổ đông");
    expect(item!.comingSoon).toBeUndefined();
  });
});
