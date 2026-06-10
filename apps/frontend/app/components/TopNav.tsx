/**
 * TopNav — SSOT shared top navigation bar.
 *
 * Single source of truth for:
 *   - Application branding link ("VN Market Intelligence" → "/")
 *   - Canonical NAV_ITEMS list (all 8 dashboard routes, incl. reload flag)
 *   - Home NavLink
 *   - NavLink active/hover styling (slate dark theme)
 *
 * Used by BOTH the root index route (app/routes/_index.tsx) and the
 * dashboard layout route (app/routes/dashboard.tsx). Do NOT duplicate
 * or hand-copy nav markup elsewhere — import <TopNav /> instead.
 */
import { Link, NavLink } from "@remix-run/react";

export type NavItem = { to: string; label: string; reload?: boolean };

/** Canonical 8-item nav list. Adding/removing items here propagates everywhere. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard/analysis", label: "Analysis" },
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/db", label: "Database" },
  { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
  // bctc-inspect is a resource route (loader-only, no default-export component).
  // reloadDocument forces a full browser navigation so the raw HTML response
  // loads as a real document and its scripts execute.
  { to: "/dashboard/bctc-inspect", label: "BCTC Inspect", reload: true },
  { to: "/dashboard/orchestration", label: "Orchestration" },
  { to: "/dashboard/quality-audit", label: "Quality Audit" },
];

/** Shared NavLink class helper — keeps active/hover styling DRY. */
function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-700 text-slate-100"
      : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
  ].join(" ");
}

/** Top navigation bar. Render once at the top of each full-page layout. */
export function TopNav() {
  return (
    <nav className="border-b border-slate-700 bg-slate-800 px-6 py-3">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="font-bold tracking-tight text-slate-100 hover:text-slate-300"
        >
          VN Market Intelligence
        </Link>
        <div className="flex gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          {NAV_ITEMS.map(({ to, label, reload }) => (
            <NavLink
              key={to}
              to={to}
              reloadDocument={reload ?? false}
              className={navLinkClass}
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
