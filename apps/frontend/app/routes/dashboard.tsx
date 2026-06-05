/**
 * Dashboard layout route — shared nav for all /dashboard/* child routes.
 * Uses Remix nested routing: each child renders inside <Outlet />.
 */
import { Outlet, NavLink, Link } from "@remix-run/react";

type NavItem = { to: string; label: string; reload?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard/analysis", label: "Analysis" },
  { to: "/dashboard/services", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/db", label: "Database" },
  { to: "/dashboard/bctc-eval", label: "BCTC Eval" },
  // bctc-inspect is a resource route (loader-only, no default-export component).
  // Client-side SPA navigation would try to mount a component inside <Outlet />
  // and render a blank pane. reloadDocument forces a full browser navigation so
  // the raw HTML response loads as a real document and its scripts execute.
  { to: "/dashboard/bctc-inspect", label: "BCTC Inspect", reload: true },
  { to: "/dashboard/orchestration", label: "Orchestration" },
];

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
            {NAV_ITEMS.map(({ to, label, reload }) => (
              <NavLink
                key={to}
                to={to}
                reloadDocument={reload ?? false}
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

      {/* Child page — full viewport width, horizontally centered content */}
      <main className="min-h-[calc(100vh-3.5rem)] w-full p-6">
        <div className="mx-auto w-full max-w-screen-xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
