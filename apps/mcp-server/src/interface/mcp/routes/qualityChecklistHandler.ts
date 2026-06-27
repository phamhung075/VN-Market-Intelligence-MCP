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
 * `data_asof` field: this handler computes its result on-read from a static
 * JSON file — there is no DB writer; freshness equals request time by design
 * (RISK-2 from Architect review: computed-on-read; badge will always show green).
 * This is intentional — do NOT add a DB store for this endpoint.
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
 * @param now                   - Optional clock override for testability (defaults to new Date())
 */
export function handleGetQualityChecklist(
  req: IncomingMessage,
  res: ServerResponse,
  qualityChecklistPath: string,
  now: Date = new Date(),
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

  // data_asof: computed-on-read; freshness = request time by design (no DB store for this handler).
  const body =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>), data_asof: now.toISOString() }
      : { data: parsed, data_asof: now.toISOString() };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
