/**
 * Dashboard layout route — shared nav for all /dashboard/* child routes.
 * Uses Remix nested routing: each child renders inside <Outlet />.
 */
import { Outlet } from "@remix-run/react";
import { TopNav } from "~/components/TopNav";

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <TopNav />

      {/* Child page — full viewport width, horizontally centered content */}
      <main className="min-h-[calc(100vh-3.5rem)] w-full p-6">
        <div className="mx-auto w-full max-w-screen-xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
