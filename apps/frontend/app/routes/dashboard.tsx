/**
 * Dashboard layout route — shared nav for all /dashboard/* child routes.
 * Uses Remix nested routing: each child renders inside <Outlet />.
 */
import { Outlet, NavLink, Link } from "@remix-run/react";

const NAV_ITEMS = [
  { to: "/dashboard/analysis", label: "Analysis" },
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/db", label: "Database" },
  { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
  { to: "/dashboard/bctc-inspect", label: "BCTC Inspect" },
  { to: "/dashboard/orchestration", label: "Orchestration" },
] as const;

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Top nav */}
      <nav className="border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="font-bold tracking-tight text-slate-100 hover:text-slate-300"
          >
            VN Market Intelligence
          </Link>
          <div className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                [
                  "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                ].join(" ")
              }
            >
              Home
            </NavLink>
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-700 text-slate-100"
                      : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Child page */}
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
