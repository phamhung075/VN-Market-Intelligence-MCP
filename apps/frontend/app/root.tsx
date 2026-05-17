// Tier 2: Router skeleton — must type-check before any page is built.
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";

import stylesheet from "~/styles/theme.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Dashboard quick-links rendered at root level for the home page.
// Dashboard pages have their own nav inside dashboard.tsx layout route.
const DASHBOARD_LINKS = [
  { to: "/dashboard/server", label: "Services" },
  { to: "/dashboard/fetch", label: "Fetch Ops" },
  { to: "/dashboard/vps", label: "VPS Proxy" },
  { to: "/dashboard/db", label: "Database" },
] as const;

export default function App() {
  return (
    <>
      {/* Global top bar — visible only on non-dashboard routes */}
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-2 hidden">
        <nav className="flex gap-4 text-sm">
          <Link to="/" className="text-slate-300 hover:text-slate-100">
            Home
          </Link>
          {DASHBOARD_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-slate-400 hover:text-slate-200"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <Outlet />
    </>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="vi">
      <head>
        <title>Error — VN Market Intelligence</title>
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Something went wrong
          </h1>
          <p className="mt-2 text-muted-foreground">
            Please refresh the page or contact support.
          </p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
