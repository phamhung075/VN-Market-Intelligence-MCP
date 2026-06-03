/**
 * Remix client entry-point (explicit, replaces the Remix default).
 *
 * Additions vs the Remix default:
 *   • vite:preloadError guard — when a dynamic import / module preload fails
 *     (e.g. stale bundle hashes after a redeploy), reload the page once to
 *     fetch the fresh bundle.  A one-shot sessionStorage flag keyed by pathname
 *     prevents an infinite reload loop: if the flag is already set for this
 *     path the reload is skipped and the root ErrorBoundary renders instead.
 */
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { RemixBrowser } from "@remix-run/react";

// ---------------------------------------------------------------------------
// Vite preload-error auto-reload (one-shot per pathname)
// ---------------------------------------------------------------------------
const CHUNK_RELOAD_FLAG_PREFIX = "chunk_reload_attempted:";

function getChunkReloadFlag(): string {
  return CHUNK_RELOAD_FLAG_PREFIX + window.location.pathname;
}

window.addEventListener("vite:preloadError", () => {
  const flag = getChunkReloadFlag();
  if (sessionStorage.getItem(flag)) {
    // Already attempted a reload for this path — do not loop.
    // Root ErrorBoundary will surface the error.
    return;
  }
  sessionStorage.setItem(flag, "1");
  window.location.reload();
});

// ---------------------------------------------------------------------------
// Standard Remix hydration
// ---------------------------------------------------------------------------
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>
  );
});
