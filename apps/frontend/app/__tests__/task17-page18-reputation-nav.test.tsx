/**
 * task17-page18-reputation-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 18 (Điểm Uy tín Doanh nghiệp).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 24 items (was 23 before PAGE 18).
 *   2. NAV_ITEMS total is 31 (ANALYST_NAV 24 + SYSTEM_NAV 7).
 *   3. 'Uy tín DN' item exists at /dashboard/reputation and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: PAGE 17 {to: "/dashboard/fed-rates"} item still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 18 addition", () => {
  it("exports exactly 24 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(24);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 18 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (24) + SYSTEM_NAV (7) = 31 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(31);
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
// Suite 4: new item position
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Uy tín DN'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Uy tín DN");
    expect(last!.to).toBe("/dashboard/reputation");
  });

  it("second-to-last ANALYST_NAV entry is 'Lãi suất Fed' (adjacent placement)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Lãi suất Fed");
    expect(secondLast!.to).toBe("/dashboard/fed-rates");
  });

  it("ANALYST_NAV[24] is 'Uy tín DN' (zero-based index, after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Uy tín DN");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/reputation");
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

  it("renders all 24 analyst nav labels", () => {
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

  it("ANALYST_NAV[23] is 'Lãi suất Fed' (index after QUE-REFERENCE-PAGE-2 insertion)", () => {
    expect(ANALYST_NAV[23]!.label).toBe("Lãi suất Fed");
    expect(ANALYST_NAV[23]!.to).toBe("/dashboard/fed-rates");
  });

  it("ANALYST_NAV[24] is 'Uy tín DN' (the new PAGE 18 entry)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Uy tín DN");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/reputation");
  });
});
