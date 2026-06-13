/**
 * task17-page18-reputation-nav.test.tsx
 *
 * TopNav SSOT presence + relative-order guard for TASK-17 PAGE 18 (Điểm Uy tín Doanh nghiệp).
 *
 * Asserts:
 *   1. 'Uy tín DN' item exists at /dashboard/reputation and is ENABLED.
 *   2. The item appears immediately AFTER 'Lãi suất Fed' in ANALYST_NAV (relative order).
 *      Does NOT assert absolute array position or total count — decoupled from nav growth.
 *   3. NAV_ITEMS structural invariant: length == ANALYST_NAV.length + SYSTEM_NAV.length.
 *   4. TopNav renders the new label in the DOM.
 *   5. The new tab renders as a NavLink (not a disabled span).
 *   6. Regression guard: PAGE 17 {to: "/dashboard/fed-rates"} item still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 18 addition", () => {
  it("ANALYST_NAV has at least 24 items (PAGE 18 was appended, nav may have grown since)", () => {
    expect(ANALYST_NAV.length).toBeGreaterThanOrEqual(24);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS structural invariant (no frozen total)
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 18 addition", () => {
  it("NAV_ITEMS length equals ANALYST_NAV.length + SYSTEM_NAV.length (structural invariant)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Uy tín DN' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Uy tín DN' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Uy tín DN");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/reputation", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Uy tín DN");
    expect(item!.to).toBe("/dashboard/reputation");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Uy tín DN");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: relative order — PAGE 18 item comes immediately after PAGE 17 predecessor
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("'Uy tín DN' appears immediately after 'Lãi suất Fed' in ANALYST_NAV (relative order)", () => {
    const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Lãi suất Fed");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Uy tín DN");
    expect(predecessorIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predecessorIdx);
    // Immediately adjacent — no items between predecessor and PAGE 18 item
    expect(itemIdx).toBe(predecessorIdx + 1);
  });

  it("'Lãi suất Fed' predecessor appears before 'Uy tín DN' in ANALYST_NAV (adjacent placement)", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/fed-rates");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/reputation");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBe(predIdx + 1);
  });

  it("'Uy tín DN' entry exists with correct route in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/reputation");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Uy tín DN");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Uy tín DN' label", () => {
    renderTopNav();
    expect(screen.getByText("Uy tín DN")).toBeTruthy();
  });

  it("renders all analyst nav labels present as of PAGE 18", () => {
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
      "Uy tín DN",
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
  it("'/dashboard/reputation' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/reputation");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 17 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 17 tab still present", () => {
  it("'Lãi suất Fed' tab still exists at /dashboard/fed-rates", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Lãi suất Fed");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/fed-rates");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("'Lãi suất Fed' appears before 'Uy tín DN' in ANALYST_NAV", () => {
    const predIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/fed-rates");
    const itemIdx = ANALYST_NAV.findIndex((n) => n.to === "/dashboard/reputation");
    expect(predIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(predIdx);
  });

  it("'Uy tín DN' entry exists with correct route and is enabled", () => {
    const item = ANALYST_NAV.find((n) => n.to === "/dashboard/reputation");
    expect(item).toBeDefined();
    expect(item!.label).toBe("Uy tín DN");
    expect(item!.comingSoon).toBeUndefined();
  });
});
