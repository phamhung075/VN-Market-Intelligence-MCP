/**
 * NF-LD-4-dev-A — Static file server for the news-fetch pilot dashboard.
 *
 * Serves the dashboard files from apps/mcp-server/src/interface/news-fetch-dashboard/
 * over GET /dashboards/news-fetch/ (and sub-assets).
 *
 * Routes handled (wired in server.ts):
 *   GET /dashboards/news-fetch/              → index.html
 *   GET /dashboards/news-fetch/index.html    → index.html
 *   GET /dashboards/news-fetch/<asset>       → named asset (data.js, rerun-handler.js, results.json, etc.)
 *
 * Security / DDD:
 *   - No db parameter — static files only, zero DB access, zero credentials.
 *   - No getDb(), no new Database(), no Bun.env / process.env reads.
 *   - Path-traversal guard: asset name must NOT contain ".." or "/" — 400 on violation.
 *   - Files are resolved relative to this source file's directory (import.meta.path).
 *   - dashDir points to ../../news-fetch-dashboard from this file's location.
 *
 * DRY / anti-drift:
 *   The dashboard files in this directory are COPIES of apps/news-fetch/dashboard/.
 *   Canonical source: apps/news-fetch/dashboard/
 *   Sync script:      apps/mcp-server/sync-news-fetch-dashboard.sh
 *   Run after any source change to keep both locations in sync.
 *
 * Pattern: mirrors handleBctcInspectPage in bctcInspectHandler.ts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

// ─── Dashboard directory ──────────────────────────────────────────────────────

// Resolved at module load time — safe for container use.
// In container: /app/src/interface/mcp/routes/newsFetchDashboardHandler.ts
// dashDir:      /app/src/interface/news-fetch-dashboard/
const dashDir = resolve(dirname(import.meta.path), "../../news-fetch-dashboard");

// ─── MIME type map ────────────────────────────────────────────────────────────

function getMimeType(filename: string): string {
  if (filename.endsWith(".html")) return "text/html; charset=utf-8";
  if (filename.endsWith(".js") || filename.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Handle GET /dashboards/news-fetch/ and GET /dashboards/news-fetch/<asset>.
 *
 * @param _req  - Incoming HTTP request (unused for static serving)
 * @param res   - Server response
 * @param asset - null (→ serve index.html) OR the bare asset name extracted from the URL path.
 *                Must be a plain filename (no "/" or ".." components) — caller is server.ts.
 */
export function handleNewsFetchDashboard(
  _req: IncomingMessage,
  res: ServerResponse,
  asset: string | null,
): void {
  // ── Serve index.html for root path ──────────────────────────────────────────
  if (asset === null || asset === "" || asset === "index.html") {
    try {
      const htmlPath = resolve(dashDir, "index.html");
      const html = readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(
        `news-fetch dashboard index.html not found: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  // ── Path-traversal guard — reject any asset name containing ".." or "/" ────
  // basename() strips any directory prefix from the asset name.
  // If the result does not equal the original, it contained path separators.
  const safe = basename(asset);
  if (safe !== asset || asset.includes("..") || asset.includes("/")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Invalid asset path" }));
    return;
  }

  // ── Serve named asset ────────────────────────────────────────────────────────
  try {
    const assetPath = resolve(dashDir, safe);
    const content = readFileSync(assetPath);
    const mimeType = getMimeType(safe);
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(content);
  } catch (err) {
    const isNotFound =
      err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Asset not found: ${safe}` }));
    } else {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
