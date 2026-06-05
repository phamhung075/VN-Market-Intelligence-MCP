/**
 * FE-HEADER-SSOT — TopNav SSOT drift-guard tests.
 *
 * Asserts that:
 *  1. TopNav renders the branding link "VN Market Intelligence"
 *  2. The canonical 8-item NAV_ITEMS list is fully exported and contains
 *     every expected route, in order, with the correct labels.
 *  3. bctc-inspect carries reload:true (reloadDocument guard).
 *  4. The Home NavLink is present.
 *
 * If the canonical list is trimmed or reordered, these tests fail loudly —
 * preventing silent drift between routes that both use <TopNav />.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TopNav, NAV_ITEMS } from "~/components/TopNav";

// Wrap in MemoryRouter so NavLink/Link work outside a real Remix context.
function renderTopNav() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <TopNav />
    </MemoryRouter>
  );
}

describe("TopNav — canonical NAV_ITEMS list", () => {
  it("exports exactly 8 nav items", () => {
    expect(NAV_ITEMS).toHaveLength(8);
  });

  it("contains all 8 canonical routes in order", () => {
    const expected = [
      { to: "/dashboard/analysis", label: "Analysis" },
      { to: "/dashboard/services", label: "Services" },
      { to: "/dashboard/fetch", label: "Fetch Ops" },
      { to: "/dashboard/vps", label: "VPS Proxy" },
      { to: "/dashboard/db", label: "Database" },
      { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
      { to: "/dashboard/bctc-inspect", label: "BCTC Inspect" },
      { to: "/dashboard/orchestration", label: "Orchestration" },
    ];
    expected.forEach(({ to, label }, i) => {
      expect(NAV_ITEMS[i].to).toBe(to);
      expect(NAV_ITEMS[i].label).toBe(label);
    });
  });

  it("bctc-inspect item carries reload:true", () => {
    const bctcInspect = NAV_ITEMS.find((n) => n.to === "/dashboard/bctc-inspect");
    expect(bctcInspect).toBeDefined();
    expect(bctcInspect?.reload).toBe(true);
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

  it("renders all 8 canonical nav labels", () => {
    renderTopNav();
    const expectedLabels = [
      "Analysis",
      "Services",
      "Fetch Ops",
      "VPS Proxy",
      "Database",
      "BCTC Eval",
      "BCTC Inspect",
      "Orchestration",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("nav items link to correct routes", () => {
    renderTopNav();
    const links = screen.getAllByRole("link");
    // Branding + Home + 8 nav items = 10 total links
    expect(links.length).toBeGreaterThanOrEqual(9);

    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard/analysis");
    expect(hrefs).toContain("/dashboard/bctc-eval");
    expect(hrefs).toContain("/dashboard/bctc-inspect");
    expect(hrefs).toContain("/dashboard/orchestration");
  });
});
