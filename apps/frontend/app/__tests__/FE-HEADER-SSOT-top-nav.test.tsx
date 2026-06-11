/**
 * FE-HEADER-SSOT — TopNav SSOT drift-guard tests (P0-5-FIX).
 *
 * Asserts that:
 *  1. TopNav renders the branding link "VN Market Intelligence"
 *  2. ANALYST_NAV has 8 primary analyst tabs, in order, with correct labels + comingSoon flags.
 *     - "Tổng Quan" (/dashboard) is ENABLED (no comingSoon) — dashboard._index.tsx exists (P0-1).
 *     - "Tin Tức" (/dashboard/news) is ENABLED (no comingSoon) — dashboard.news.tsx exists (TASK-17 P1-1b).
 *  3. SYSTEM_NAV has 7 ops/infra tabs (incl. bctc-eval + bctc-inspect; excl. db).
 *  4. NAV_ITEMS is the union (analyst + system) — 15 total.
 *  5. The "Cổ Phiếu" tab links to /dashboard/analysis (the existing route) — NOT /dashboard/stock.
 *  6. comingSoon tabs render as disabled spans (aria-disabled="true"), NOT as links.
 *  7. Enabled analyst tabs render as NavLinks.
 *  8. The Home NavLink is rendered.
 *  9. The "Hệ Thống" collapsible trigger is rendered.
 * 10. Database tab (/dashboard/db) is absent from NAV_ITEMS (retired from nav).
 * 11. bctc-eval and bctc-inspect are present in SYSTEM_NAV.
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

  it("contains all 8 analyst items in order with correct labels and comingSoon flags", () => {
    const expected: Array<{ to: string; label: string; comingSoon?: boolean }> =
      [
        { to: "/dashboard", label: "Tổng Quan" },
        { to: "/dashboard/watchlist", label: "Danh Mục", comingSoon: true },
        { to: "/dashboard/analysis", label: "Cổ Phiếu" },
        { to: "/dashboard/news", label: "Tin Tức" },
        { to: "/dashboard/macro", label: "Vĩ Mô", comingSoon: true },
        { to: "/dashboard/ai-intel", label: "AI Intel", comingSoon: true },
        { to: "/dashboard/bctc", label: "Tài Chính", comingSoon: true },
        { to: "/dashboard/alerts", label: "Cảnh Báo", comingSoon: true },
      ];
    expected.forEach(({ to, label, comingSoon }, i) => {
      expect(ANALYST_NAV[i].to).toBe(to);
      expect(ANALYST_NAV[i].label).toBe(label);
      expect(ANALYST_NAV[i].comingSoon).toBe(comingSoon);
    });
  });

  it("'Cổ Phiếu' tab points to /dashboard/analysis (the existing route)", () => {
    const stock = ANALYST_NAV.find((n) => n.label === "Cổ Phiếu");
    expect(stock).toBeDefined();
    expect(stock!.to).toBe("/dashboard/analysis");
    expect(stock!.comingSoon).toBeUndefined();
  });
});

describe("TopNav — SYSTEM_NAV canonical list", () => {
  it("exports exactly 7 system nav items", () => {
    expect(SYSTEM_NAV).toHaveLength(7);
  });

  it("contains all 7 system routes in order", () => {
    const expected = [
      { to: "/dashboard/services", label: "Services" },
      { to: "/dashboard/fetch", label: "Fetch Ops" },
      { to: "/dashboard/vps", label: "VPS Proxy" },
      { to: "/dashboard/orchestration", label: "Orchestration" },
      { to: "/dashboard/quality-audit", label: "Quality Audit" },
      { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
      { to: "/dashboard/bctc-inspect", label: "BCTC Inspect" },
    ];
    expected.forEach(({ to, label }, i) => {
      expect(SYSTEM_NAV[i].to).toBe(to);
      expect(SYSTEM_NAV[i].label).toBe(label);
    });
  });

  it("bctc-inspect has reload:true", () => {
    const inspect = SYSTEM_NAV.find((n) => n.to === "/dashboard/bctc-inspect");
    expect(inspect).toBeDefined();
    expect(inspect!.reload).toBe(true);
  });

  it("Database tab (/dashboard/db) is absent from SYSTEM_NAV (retired from nav per P0-5)", () => {
    const dbEntry = SYSTEM_NAV.find((n) => n.to === "/dashboard/db");
    expect(dbEntry).toBeUndefined();
  });
});

describe("TopNav — NAV_ITEMS union (backward compat)", () => {
  it("NAV_ITEMS is the union of ANALYST_NAV + SYSTEM_NAV (15 items total)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(15);
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

  it("'Cổ Phiếu' tab renders as a link to /dashboard/analysis", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/analysis");
    expect(hrefs).not.toContain("/dashboard/stock");
  });

  it("comingSoon tabs render as disabled spans with aria-disabled='true' (NOT links)", () => {
    renderTopNav();
    const comingSoonItems = ANALYST_NAV.filter((n) => n.comingSoon);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));

    for (const item of comingSoonItems) {
      // Must NOT appear as a link
      expect(hrefs).not.toContain(item.to);
    }

    // Each comingSoon label element must carry aria-disabled="true"
    for (const item of comingSoonItems) {
      const el = screen.getByText(item.label, { selector: "span" });
      expect(el.closest("[aria-disabled='true']")).toBeTruthy();
    }
  });

  it("enabled analyst tabs render as NavLinks", () => {
    renderTopNav();
    const enabledItems = ANALYST_NAV.filter((n) => !n.comingSoon);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    for (const item of enabledItems) {
      expect(hrefs).toContain(item.to);
    }
  });

  it("does not render a top-level Database link", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).not.toContain("/dashboard/db");
  });
});
