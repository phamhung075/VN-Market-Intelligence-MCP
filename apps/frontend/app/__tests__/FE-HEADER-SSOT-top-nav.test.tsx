/**
 * FE-HEADER-SSOT — TopNav SSOT drift-guard tests (P0-5 NAV restructure).
 *
 * Asserts that:
 *  1. TopNav renders the branding link "VN Market Intelligence"
 *  2. ANALYST_NAV has 8 primary analyst tabs, in order, with correct labels.
 *  3. SYSTEM_NAV has 5 ops/infra tabs, in order, with correct labels.
 *  4. NAV_ITEMS is a union (analyst + system) — 13 total.
 *  5. bctc-inspect is NOT in SYSTEM_NAV (it was retired from the top-level nav;
 *     its route file lives on but is no longer directly linked).
 *  6. The Home NavLink is rendered.
 *  7. The "Hệ Thống" collapsible trigger is rendered.
 *  8. All analyst labels are rendered in the document.
 *  9. Database tab (/dashboard/db) is absent from NAV_ITEMS (retired from nav).
 *
 * If ANALYST_NAV or SYSTEM_NAV are trimmed, reordered, or merged incorrectly,
 * these tests fail loudly — preventing silent drift.
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

// Wrap in MemoryRouter so NavLink/Link work outside a real Remix context.
function renderTopNav(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TopNav />
    </MemoryRouter>
  );
}

describe("TopNav — ANALYST_NAV canonical list", () => {
  it("exports exactly 8 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(8);
  });

  it("contains all 8 analyst routes in order", () => {
    const expected = [
      { to: "/dashboard", label: "Tổng Quan" },
      { to: "/dashboard/watchlist", label: "Danh Mục" },
      { to: "/dashboard/stock", label: "Cổ Phiếu" },
      { to: "/dashboard/news", label: "Tin Tức" },
      { to: "/dashboard/macro", label: "Vĩ Mô" },
      { to: "/dashboard/ai-intel", label: "AI Intel" },
      { to: "/dashboard/bctc", label: "Tài Chính" },
      { to: "/dashboard/alerts", label: "Cảnh Báo" },
    ];
    expected.forEach(({ to, label }, i) => {
      expect(ANALYST_NAV[i].to).toBe(to);
      expect(ANALYST_NAV[i].label).toBe(label);
    });
  });
});

describe("TopNav — SYSTEM_NAV canonical list", () => {
  it("exports exactly 5 system nav items", () => {
    expect(SYSTEM_NAV).toHaveLength(5);
  });

  it("contains all 5 system routes in order", () => {
    const expected = [
      { to: "/dashboard/services", label: "Services" },
      { to: "/dashboard/fetch", label: "Fetch Ops" },
      { to: "/dashboard/vps", label: "VPS Proxy" },
      { to: "/dashboard/orchestration", label: "Orchestration" },
      { to: "/dashboard/quality-audit", label: "Quality Audit" },
    ];
    expected.forEach(({ to, label }, i) => {
      expect(SYSTEM_NAV[i].to).toBe(to);
      expect(SYSTEM_NAV[i].label).toBe(label);
    });
  });
});

describe("TopNav — NAV_ITEMS union (backward compat)", () => {
  it("NAV_ITEMS is the union of ANALYST_NAV + SYSTEM_NAV (13 items total)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(13);
  });

  it("Database tab (/dashboard/db) is absent from NAV_ITEMS (retired from nav per P0-5)", () => {
    const dbEntry = NAV_ITEMS.find((n) => n.to === "/dashboard/db");
    expect(dbEntry).toBeUndefined();
  });
});

describe("TopNav — rendered output", () => {
  it("renders branding link 'VN Market Intelligence'", () => {
    renderTopNav();
    expect(screen.getByText("VN Market Intelligence")).toBeTruthy();
  });

  it("renders Home NavLink", () => {
    renderTopNav();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("renders the 'Hệ Thống' system group trigger", () => {
    renderTopNav();
    expect(screen.getByText("Hệ Thống")).toBeTruthy();
  });

  it("renders all 8 analyst nav labels", () => {
    renderTopNav();
    const expectedLabels = [
      "Tổng Quan",
      "Danh Mục",
      "Cổ Phiếu",
      "Tin Tức",
      "Vĩ Mô",
      "AI Intel",
      "Tài Chính",
      "Cảnh Báo",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("analyst nav items link to correct routes", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));

    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/dashboard/watchlist");
    expect(hrefs).toContain("/dashboard/bctc");
    expect(hrefs).toContain("/dashboard/alerts");
  });

  it("does not render a top-level Database link", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard/db");
  });
});
