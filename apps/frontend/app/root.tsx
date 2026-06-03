// Tier 2: Router skeleton — must type-check before any page is built.
import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useRouteError,
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

export default function App() {
  return <Outlet />;
}

// ---------------------------------------------------------------------------
// Chunk-load error detection helpers (mirrors entry.client.tsx guard)
// ---------------------------------------------------------------------------
const CHUNK_RELOAD_FLAG_PREFIX = "chunk_reload_attempted:";

/** Patterns that identify a stale-bundle / missing-chunk load error. */
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

function isChunkError(err: unknown): boolean {
  if (err instanceof Error) {
    return CHUNK_ERROR_RE.test(err.message) || CHUNK_ERROR_RE.test(err.name);
  }
  return false;
}

function getChunkReloadFlag(pathname: string): string {
  return CHUNK_RELOAD_FLAG_PREFIX + pathname;
}

// ---------------------------------------------------------------------------
// Root ErrorBoundary — chunk-aware auto-reload, non-chunk errors unchanged
// ---------------------------------------------------------------------------
export function ErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isChunkError(error)) return;

    const flag = getChunkReloadFlag(window.location.pathname);
    if (sessionStorage.getItem(flag)) {
      // One reload already attempted — do not loop; fall through to UI.
      return;
    }
    sessionStorage.setItem(flag, "1");
    window.location.reload();
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-destructive">
          Something went wrong
        </h1>
        <p className="mt-2 text-muted-foreground">
          Please refresh the page or contact support.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block text-sm text-slate-400 hover:text-slate-200 underline"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
