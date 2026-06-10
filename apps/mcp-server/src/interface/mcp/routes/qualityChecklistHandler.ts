/**
 * qualityChecklistHandler.ts — GET /api/quality-checklist read-only endpoint
 *
 * Serves docs/data/quality-checklist.json as JSON.
 * Read-only: no projection, no transformation — the whole artifact is safe to
 * expose as-is (no sensitive fields, no agent-instruction blobs).
 *
 * Returns 200 + JSON body on success.
 * Returns 500 + JSON error body if the file is missing or cannot be parsed.
 *
 * DDD Layer: interface — no domain or infrastructure imports.
 * Pattern: mirrors orchestrationHandler.ts read-path (OSC-4a precedent).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

/**
 * Handle GET /api/quality-checklist.
 *
 * @param req                   - Incoming HTTP request (unused — read-only, no query params)
 * @param res                   - HTTP response
 * @param qualityChecklistPath  - Absolute path to quality-checklist.json (injected for testability)
 */
export function handleGetQualityChecklist(
  req: IncomingMessage,
  res: ServerResponse,
  qualityChecklistPath: string,
): void {
  let raw: string;
  try {
    raw = readFileSync(qualityChecklistPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `quality-checklist.json unreadable: ${msg}` }));
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `quality-checklist.json parse error: ${msg}` }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(parsed));
}
