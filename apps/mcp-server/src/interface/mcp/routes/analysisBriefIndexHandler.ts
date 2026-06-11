/**
 * analysisBriefIndexHandler.ts — GET /api/analysis-briefs
 *
 * TASK-17 P1-3a: Serve the catalogue index of all available AI analysis-briefs.
 * Backs the "Financial Reports" hub page (dev-frontend) listing every ticker
 * that has a brief, each linking to the existing AI Deep Dive.
 *
 * Source: `docs/analysis-briefs/*.md` — the real verdict files.
 * NOT the financial_reports DB table (those rows are seed/placeholder).
 *
 * Response shape (200 OK):
 *   {
 *     generated_at: string,   // ISO 8601 server clock
 *     count:        number,   // total number of brief files found
 *     items: [
 *       {
 *         ticker:          string,        // from filename (strip .md), uppercase
 *         exchange:        string | null, // from **Exchange**: line
 *         latest_period:   string | null, // from latest ### {TICKER} {period} — Released
 *         released:        string | null, // Released date in that heading
 *         verdict_label:   string | null, // leading word(s) before the em-dash
 *         verdict_summary: string | null, // text after the em-dash, ~200 chars
 *         confidence:      number | null, // from "Confidence: X"
 *         updated_at:      string | null  // file mtime as ISO 8601
 *       },
 *       ...
 *     ]
 *   }
 *
 * Sort: updated_at desc (most recently modified first); ties alphabetical.
 * Empty dir → 200 + { count: 0, items: [] }.
 * Single malformed file → ticker still listed with null fields.
 * Fatal read error → 500 JSON { error, detail }.
 *
 * DDD Layer: interface — imports only from infrastructure/fileStore.
 * DI contract: projectRoot injected by server.ts (no hardcoded path here).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readAnalysisBriefIndex } from "../../../infrastructure/fileStore/analysisBriefReader.js";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/analysis-briefs.
 *
 * @param _req        - Incoming HTTP request (unused)
 * @param res         - HTTP response
 * @param projectRoot - Absolute path to the repo root (injected by server.ts)
 */
export function handleGetAnalysisBriefIndex(
  _req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): void {
  try {
    const body = readAnalysisBriefIndex(projectRoot);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "io_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
