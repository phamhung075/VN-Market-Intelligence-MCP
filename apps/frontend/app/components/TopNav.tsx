/**
 * TopNav — SSOT shared top navigation bar.
 *
 * Single source of truth for:
 *   - Application branding link ("VN Market Intelligence" → "/")
 *   - ANALYST_NAV: primary analyst-facing tabs (always visible)
 *   - SYSTEM_NAV: ops/infra tabs collapsed under a "Hệ Thống" group
 *   - NAV_ITEMS: union of all nav entries (re-export for backward compat)
 *   - Home NavLink
 *   - NavLink active/hover styling (slate dark theme)
 *
 * Used by BOTH the root index route (app/routes/_index.tsx) and the
 * dashboard layout route (app/routes/dashboard.tsx). Do NOT duplicate
 * or hand-copy nav markup elsewhere — import <TopNav /> instead.
 *
 * P0-5 NAV restructure: analyst tabs are primary (top level); ops/infra
 * tabs are secondary and collapsed under the "Hệ Thống" Collapsible group.
 * Uses the existing Radix Collapsible primitive (no new deps).
 *
 * P0-5-FIX: comingSoon tabs render as disabled spans (not NavLinks) to
 * prevent dead-link 404s for routes not yet implemented. Enabled analyst
 * tabs point only to existing route files (verified against app/routes/).
 */
import { useState } from "react";
import { Link, NavLink, useLocation } from "@remix-run/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";

export type NavItem = {
  to: string;
  label: string;
  reload?: boolean;
  comingSoon?: boolean;
};

/**
 * PRIMARY analyst-facing tabs — always visible in the top nav.
 *
 * Route existence verified against apps/frontend/app/routes/ (2026-06-11):
 *   - /dashboard          → dashboard._index.tsx    EXISTS  → enabled (label: "Tổng Quan")
 *   - /dashboard/analysis  → dashboard.analysis.tsx  EXISTS  → enabled (label: "Cổ Phiếu")
 *   - /dashboard/news     → dashboard.news.tsx       EXISTS  → enabled (label: "Tin Tức") — TASK-17 P1-1b
 *   - /dashboard/macro    → dashboard.macro.tsx       EXISTS  → enabled (label: "Vĩ Mô") — TASK-17 P1-2b
 *   - All other analyst targets → NO route file yet   → comingSoon: true
 *
 * comingSoon items render as disabled spans (not NavLinks) — no dead links.
 */
export const ANALYST_NAV: NavItem[] = [
  { to: "/dashboard", label: "Tổng Quan" },
  { to: "/dashboard/watchlist", label: "Danh Mục", comingSoon: true },
  { to: "/dashboard/analysis", label: "Cổ Phiếu" },
  { to: "/dashboard/news", label: "Tin Tức" },
  { to: "/dashboard/macro", label: "Vĩ Mô" },
  { to: "/dashboard/ai-intel", label: "AI Intel", comingSoon: true },
  { to: "/dashboard/bctc", label: "Tài Chính", comingSoon: true },
  { to: "/dashboard/alerts", label: "Cảnh Báo", comingSoon: true },
];

/**
 * SYSTEM group — ops/infra tabs collapsed by default under "Hệ Thống".
 * dashboard.db is retired from nav (route file kept for a later phase).
 * bctc-eval and bctc-inspect are restored per P0-5-FIX architect brief.
 * bctc-inspect: reload:true forces full browser navigation so the raw HTML
 * response loads as a real document and its scripts execute.
 */
export const SYSTEM_NAV: NavItem[] = [
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/orchestration", label: "Orchestration" },
  { to: "/dashboard/quality-audit", label: "Quality Audit" },
  { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
  { to: "/dashboard/bctc-inspect", label: "BCTC Inspect", reload: true },
];

/**
 * NAV_ITEMS — backward-compat union of all nav entries.
 * SSOT: ANALYST_NAV + SYSTEM_NAV. Any consumer that iterates all routes
 * should use this. Active NAV = ANALYST_NAV (top level) + SYSTEM_NAV (System group).
 *
 * Note: /dashboard/db (Database) is retired from nav per P0-5 brief.
 * Note: comingSoon items are present in the array but render as disabled spans.
 */
export const NAV_ITEMS: NavItem[] = [...ANALYST_NAV, ...SYSTEM_NAV];

/** Shared NavLink class helper — keeps active/hover styling DRY. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-700 text-slate-100"
      : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
  ].join(" ");
}

/** Chevron icon rendered inline — no icon lib dep. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        "inline-block transition-transform duration-200",
        open ? "rotate-180" : "rotate-0",
      ].join(" ")}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Top navigation bar. Render once at the top of each full-page layout. */
export function TopNav() {
  const [systemOpen, setSystemOpen] = useState(false);
  const { pathname } = useLocation();

  // Highlight the "Hệ Thống" trigger when any system route is active.
  const isSystemActive = SYSTEM_NAV.some((item) =>
    pathname.startsWith(item.to)
  );

  return (
    <nav className="border-b border-slate-700 bg-slate-800 px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="font-bold tracking-tight text-slate-100 hover:text-slate-300 shrink-0"
        >
          VN Market Intelligence
        </Link>

        <div className="flex flex-wrap items-center gap-1">
          {/* Home link */}
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>

          {/* PRIMARY analyst tabs — always visible */}
          {ANALYST_NAV.map(({ to, label, comingSoon }) =>
            comingSoon ? (
              <span
                key={to}
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-slate-600"
              >
                {label}
                <span className="rounded bg-slate-700 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Sắp có
                </span>
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === "/dashboard"}
                className={navLinkClass}
              >
                {label}
              </NavLink>
            )
          )}

          {/* SYSTEM group — collapsed by default */}
          <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
            <CollapsibleTrigger
              className={[
                "inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                isSystemActive || systemOpen
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
              ].join(" ")}
              aria-expanded={systemOpen}
              aria-label="Hệ Thống — system operations menu"
            >
              Hệ Thống
              <ChevronIcon open={systemOpen} />
            </CollapsibleTrigger>

            <CollapsibleContent className="absolute z-50 mt-1 rounded border border-slate-600 bg-slate-800 py-1 shadow-lg">
              {SYSTEM_NAV.map(({ to, label, reload }) => (
                <NavLink
                  key={to}
                  to={to}
                  reloadDocument={reload ?? false}
                  className={({ isActive }) =>
                    [
                      "block px-4 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-slate-700 text-slate-100"
                        : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                    ].join(" ")
                  }
                >
                  {label}
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </nav>
  );
}
