/**
 * FE-HEADER-SSOT — TopNav SSOT drift-guard tests (P0-5-FIX).
 *
 * Asserts that:
 *  1. TopNav renders the branding link "VN Market Intelligence"
 *  2. ANALYST_NAV has 18 primary analyst tabs, in order, with correct labels + comingSoon flags.
 *     - "Tổng Quan" (/dashboard) is ENABLED (no comingSoon) — dashboard._index.tsx exists (P0-1).
 *     - "Kỹ Thuật" (/dashboard/technical) is ENABLED (no comingSoon) — dashboard.technical.tsx exists (TASK-17 P2-1b).
 *     - "Tin Tức" (/dashboard/news) is ENABLED (no comingSoon) — dashboard.news.tsx exists (TASK-17 P1-1b).
 *     - "Vĩ Mô" (/dashboard/macro) is ENABLED (no comingSoon) — dashboard.macro.tsx exists (TASK-17 P1-2b).
 *     - "Tài Chính" (/dashboard/bctc) is ENABLED (no comingSoon) — dashboard.bctc.tsx exists (TASK-17 P1-3b).
 *     - "Bản Tin AI" (/dashboard/intel) is ENABLED (no comingSoon) — dashboard.intel.tsx exists (TASK-17 intel).
 *     - "Cảnh Báo" (/dashboard/alerts) is ENABLED (no comingSoon) — dashboard.alerts.tsx exists (TASK-17 alerts).
 *     - "Lưu trữ Thị trường" (/dashboard/market-summaries) is ENABLED — dashboard.market-summaries.tsx exists (TASK-17 PAGE 8).
 *     - "Dòng tiền ngành" (/dashboard/sector-rotation) is ENABLED — dashboard.sector-rotation.tsx exists (TASK-17 PAGE 9).
 *     - "Dây chuyền ngành" (/dashboard/sector-cascade) is ENABLED — dashboard.sector-cascade.tsx exists (TASK-17 PAGE 10).
 *     - "Tín hiệu Kinh Dịch" (/dashboard/kinh-dich-signals) is ENABLED — dashboard.kinh-dich-signals.tsx exists (TASK-17 PAGE 11).
 *     - "Bối cảnh toàn cầu" (/dashboard/global-markets) is ENABLED — dashboard.global-markets.tsx exists (TASK-17 PAGE 12).
 *  3. SYSTEM_NAV has 7 ops/infra tabs (incl. bctc-eval + bctc-inspect; excl. db).
 *  4. NAV_ITEMS is the union (analyst + system) — 25 total.
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
  it("exports exactly 18 analyst nav items", () => {
    expect(ANALYST_NAV).toHaveLength(18);
  });

  it("contains first 9 analyst items in order with correct labels and comingSoon flags", () => {
    const expected: Array<{ to: string; label: string; comingSoon?: boolean }> =
      [
        { to: "/dashboard", label: "Tổng Quan" },
        { to: "/dashboard/watchlist", label: "Danh Mục", comingSoon: true },
        { to: "/dashboard/analysis", label: "Cổ Phiếu" },
        { to: "/dashboard/technical", label: "Kỹ Thuật" },
        { to: "/dashboard/news", label: "Tin Tức" },
        { to: "/dashboard/macro", label: "Vĩ Mô" },
        { to: "/dashboard/intel", label: "Bản Tin AI" },
        { to: "/dashboard/bctc", label: "Tài Chính" },
        { to: "/dashboard/alerts", label: "Cảnh Báo" },
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

  it("'Kỹ Thuật' tab points to /dashboard/technical and is ENABLED (no comingSoon)", () => {
    const tech = ANALYST_NAV.find((n) => n.label === "Kỹ Thuật");
    expect(tech).toBeDefined();
    expect(tech!.to).toBe("/dashboard/technical");
    expect(tech!.comingSoon).toBeUndefined();
  });

  it("'Bản Tin AI' tab points to /dashboard/intel and is ENABLED (no comingSoon)", () => {
    const intel = ANALYST_NAV.find((n) => n.label === "Bản Tin AI");
    expect(intel).toBeDefined();
    expect(intel!.to).toBe("/dashboard/intel");
    expect(intel!.comingSoon).toBeUndefined();
  });

  it("'Cảnh Báo' tab points to /dashboard/alerts and is ENABLED (no comingSoon)", () => {
    const alerts = ANALYST_NAV.find((n) => n.label === "Cảnh Báo");
    expect(alerts).toBeDefined();
    expect(alerts!.to).toBe("/dashboard/alerts");
    expect(alerts!.comingSoon).toBeUndefined();
  });

  it("'Lưu trữ Thị trường' tab points to /dashboard/market-summaries and is ENABLED (TASK-17 PAGE 8)", () => {
    const archive = ANALYST_NAV.find((n) => n.label === "Lưu trữ Thị trường");
    expect(archive).toBeDefined();
    expect(archive!.to).toBe("/dashboard/market-summaries");
    expect(archive!.comingSoon).toBeUndefined();
  });

  it("'Dòng tiền ngành' tab points to /dashboard/sector-rotation and is ENABLED (TASK-17 PAGE 9)", () => {
    const sectorRotation = ANALYST_NAV.find((n) => n.label === "Dòng tiền ngành");
    expect(sectorRotation).toBeDefined();
    expect(sectorRotation!.to).toBe("/dashboard/sector-rotation");
    expect(sectorRotation!.comingSoon).toBeUndefined();
  });

  it("'Dây chuyền ngành' tab points to /dashboard/sector-cascade and is ENABLED (TASK-17 PAGE 10)", () => {
    const sectorCascade = ANALYST_NAV.find((n) => n.label === "Dây chuyền ngành");
    expect(sectorCascade).toBeDefined();
    expect(sectorCascade!.to).toBe("/dashboard/sector-cascade");
    expect(sectorCascade!.comingSoon).toBeUndefined();
  });

  it("'Tín hiệu Kinh Dịch' tab points to /dashboard/kinh-dich-signals and is ENABLED (TASK-17 PAGE 11)", () => {
    const kinhDich = ANALYST_NAV.find((n) => n.label === "Tín hiệu Kinh Dịch");
    expect(kinhDich).toBeDefined();
    expect(kinhDich!.to).toBe("/dashboard/kinh-dich-signals");
    expect(kinhDich!.comingSoon).toBeUndefined();
  });

  it("'Bối cảnh toàn cầu' tab points to /dashboard/global-markets and is ENABLED (TASK-17 PAGE 12)", () => {
    const globalMarkets = ANALYST_NAV.find((n) => n.label === "Bối cảnh toàn cầu");
    expect(globalMarkets).toBeDefined();
    expect(globalMarkets!.to).toBe("/dashboard/global-markets");
    expect(globalMarkets!.comingSoon).toBeUndefined();
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
  it("NAV_ITEMS is the union of ANALYST_NAV + SYSTEM_NAV (25 items total)", () => {
    expect(NAV_ITEMS).toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length);
    expect(NAV_ITEMS).toHaveLength(25);
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

  it("renders all 18 analyst nav labels", () => {
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
