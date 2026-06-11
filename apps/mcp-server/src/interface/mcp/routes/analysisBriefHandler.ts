/**
 * analysisBriefHandler.ts — GET /api/analysis-brief/:ticker
 *
 * MAW-P0-3: Serve a per-ticker analysis brief from
 * `docs/analysis-briefs/{TICKER}.md`, parsed into structured JSON sections.
 *
 * Response shape (200 OK):
 *   {
 *     ticker:       string,   // uppercase, e.g. "VCB"
 *     fundamentals: string,   // [Report Analyzer] section text
 *     news:         string,   // [News Scout] section text
 *     price:        string,   // [Market Watcher] section text
 *     synthesis:    string,   // [Unified Agent] section text
 *     raw:          string,   // full markdown content
 *     updatedAt:    string    // ISO 8601 file mtime — use for staleness badge
 *   }
 *
 * Response (404 JSON) when the brief file does not exist for the ticker:
 *   { error: "not_found", ticker: "XYZ" }
 *
 * Response (400 JSON) when ticker path segment is missing or invalid:
 *   { error: "invalid_ticker" }
 *
 * Response (500 JSON) on unexpected I/O error:
 *   { error: "io_error", detail: "<message>" }
 *
 * Risk R1 mitigation: `updatedAt` carries the file mtime; the frontend
 * MUST render a staleness badge (amber if > 24h).  No fabrication — if the
 * file is absent the handler returns 404.
 *
 * DDD Layer: interface — imports only from infrastructure/fileStore, never from domain/.
 * DI contract: projectRoot injected by server.ts (no hardcoded path here).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readAnalysisBrief } from "../../../infrastructure/fileStore/analysisBriefReader.js";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/analysis-brief/:ticker.
 *
 * @param _req        - Incoming HTTP request (unused — ticker comes from caller)
 * @param res         - HTTP response
 * @param ticker      - Ticker extracted from the URL path segment by server.ts
 * @param projectRoot - Absolute path to the repo root (injected for testability)
 */
export function handleGetAnalysisBrief(
  _req: IncomingMessage,
  res: ServerResponse,
  ticker: string,
  projectRoot: string,
): void {
  if (!ticker || ticker.trim().length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_ticker" }));
    return;
  }

  let dto;
  try {
    dto = readAnalysisBrief(ticker, projectRoot);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "io_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    return;
  }

  if (dto === null) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", ticker: ticker.toUpperCase() }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(dto));
}
