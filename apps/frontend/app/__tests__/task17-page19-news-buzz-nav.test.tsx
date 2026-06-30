/**
 * task17-page19-news-buzz-nav.test.tsx
 *
 * TopNav SSOT count + item guard for TASK-17 PAGE 19 (Tin tức nhắc đến / news-buzz).
 *
 * Asserts:
 *   1. ANALYST_NAV now has 26 items (25 after PAGE-19 + 1 added by IND-P1-FRONTEND-GAUGE-CARDS).
 *   2. NAV_ITEMS total is 33 (ANALYST_NAV 26 + SYSTEM_NAV 7).
 *   3. 'Tin nhắc đến' item exists at /dashboard/news-buzz and is ENABLED.
 *   4. The PAGE19 item is at index [24] (second-to-last; IND-P1 appended after).
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
  it("exports exactly 26 analyst nav items (25 after PAGE-19 + 1 IND-P1-FRONTEND-GAUGE-CARDS)", () => {
    expect(ANALYST_NAV).toHaveLength(26);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: NAV_ITEMS total count
// ---------------------------------------------------------------------------

describe("TopNav — NAV_ITEMS total after PAGE 19 addition", () => {
  it("NAV_ITEMS is ANALYST_NAV (26) + SYSTEM_NAV (7) = 33 total (IND-P1-FRONTEND-GAUGE-CARDS added 'Chỉ Báo')", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(33);
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

describe("TopNav — PAGE 19 item position (IND-P1 appended after)", () => {
  it("last ANALYST_NAV entry is now 'Chỉ Báo' (IND-P1 appended after PAGE-19)", () => {
    const last = ANALYST_NAV.at(-1);
    expect(last).toBeDefined();
    expect(last!.label).toBe("Chỉ Báo");
    expect(last!.to).toBe("/dashboard/indicator-gauges");
  });

  it("second-to-last ANALYST_NAV entry is 'Tin nhắc đến' (PAGE-19, shifted by IND-P1 append)", () => {
    const secondLast = ANALYST_NAV.at(-2);
    expect(secondLast).toBeDefined();
    expect(secondLast!.label).toBe("Tin nhắc đến");
    expect(secondLast!.to).toBe("/dashboard/news-buzz");
  });

  it("ANALYST_NAV[24] is 'Tin nhắc đến' (index unchanged after IND-P1 append at [25])", () => {
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

  it("renders key analyst nav labels including new 'Chỉ Báo' (IND-P1-FRONTEND-GAUGE-CARDS)", () => {
    renderTopNav();
    const expectedLabels = [
      "Tổng Quan",
      "Danh Mục",
      "Cổ Phiếu",
      // "Kỹ Thuật" removed — route deleted FE-AHUB-INT-INTEGRATE
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
      "Chỉ Báo",
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

describe("TopNav — regression guard: PAGE 18 + PAGE 19 tabs still present", () => {
  it("'Uy tín DN' tab still exists at /dashboard/reputation", () => {
    const item = ANALYST_NAV.find((n) => n.label === "Uy tín DN");
    expect(item).toBeDefined();
    expect(item!.to).toBe("/dashboard/reputation");
    expect(item!.comingSoon).toBeUndefined();
  });

  it("ANALYST_NAV[23] is 'Uy tín DN' (index unchanged after IND-P1 append at end)", () => {
    expect(ANALYST_NAV[23]!.label).toBe("Uy tín DN");
    expect(ANALYST_NAV[23]!.to).toBe("/dashboard/reputation");
  });

  it("ANALYST_NAV[24] is 'Tin nhắc đến' (PAGE 19 index unchanged)", () => {
    expect(ANALYST_NAV[24]!.label).toBe("Tin nhắc đến");
    expect(ANALYST_NAV[24]!.to).toBe("/dashboard/news-buzz");
  });
});
