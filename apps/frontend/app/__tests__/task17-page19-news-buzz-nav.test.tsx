/**
 * task17-page19-news-buzz-nav.test.tsx
 *
 * TopNav SSOT count + new item guard for TASK-17 PAGE 19 (Tin tức nhắc đến / news-buzz).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 25 items (was 24 before PAGE 19).
 *   2. NAV_ITEMS total is 32 (ANALYST_NAV 25 + SYSTEM_NAV 7).
 *   3. 'Tin nhắc đến' item exists at /dashboard/news-buzz and is ENABLED.
 *   4. The new item is the last in ANALYST_NAV (appended at end).
 *   5. TopNav renders the new label in the DOM.
 *   6. The new tab renders as a NavLink (not a disabled span).
 *   7. Regression guard: PAGE 18 {to: "/dashboard/reputation"} item still present.
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

describe("TopNav — ANALYST_NAV count after PAGE 19 addition", () => {
  it("exports exactly 25 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(25);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 19 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (25) + SYSTEM_NAV (7) = 32 total", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(32);
  });

  it("SYSTEM_NAV still has 7 items (unchanged)", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: new 'Tin nhắc đến' item
// ---------------------------------------------------------------------------

describe("TopNav — 'Tin nhắc đến' new item", () => {
  it("exists in ANALYST_NAV", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Tin nhắc đến");
    expect(item).toBeDefined();
  });

  it("points to /dashboard/news-buzz", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Tin nhắc đến");
    expect(item!.to).toBe("/dashboard/news-buzz");
  });

  it("is ENABLED (no comingSoon flag)", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Tin nhắc đến");
    expect(item!.comingSoon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: new item position — last in ANALYST_NAV
// ---------------------------------------------------------------------------

describe("TopNav — new item is last in ANALYST_NAV", () => {
  it("last ANALYST_NAV entry is 'Tin nhắc đến'", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Tin nhắc đến");
    expect(last!.to).toBe("/dashboard/news-buzz");
  });

  it("second-to-last ANALYST_NAV entry is 'Uy tín DN' (adjacent placement)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Uy tín DN");
    expect(secondLast!.to).toBe("/dashboard/reputation");
  });

  it("ANALYST_NAV[24] is 'Tin nhắc đến' (zero-based index)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Tin nhắc đến");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/news-buzz");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: rendered DOM
// ---------------------------------------------------------------------------

describe("TopNav — rendered DOM includes new label", () => {
  it("renders 'Tin nhắc đến' label", () => {
    renderTopNav();
    expect(screen.getByText("Tin nhắc đến")).toBeTruthy();
  });

  it("renders all 25 analyst nav labels", () => {
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
      "Tin nhắc đến",
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
  it("'/dashboard/news-buzz' appears as an href in rendered links", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/news-buzz");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: regression guard — PAGE 18 tab still present
// ---------------------------------------------------------------------------

describe("TopNav — regression guard: PAGE 18 tab still present", () => {
  it("'Uy tín DN' tab still exists at /dashboard/reputation", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Uy tín DN");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/reputation");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[23] is 'Uy tín DN' (index unchanged from PAGE 18)", () => {
    expect(ANALYST_NAV[23]!.label).toBe("Uy tín DN");
    expect(ANALYST_NAV[23]!.to).toBe("/dashboard/reputation");
  });

  it("ANALYST_NAV[24] is 'Tin nhắc đến' (the new PAGE 19 entry)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Tin nhắc đến");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/news-buzz");
  });
});
