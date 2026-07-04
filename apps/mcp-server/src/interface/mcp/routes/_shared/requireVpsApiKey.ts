/**
 * Shared VPS push-auth guard.
 *
 * Extracted from server.ts (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md
 * §4 Stage 1 — also closes FACTORY-INTERFACE-vps-auth-guard-dedup for its first callers).
 *
 * Byte-identical lift of the x-api-key / authorization: Bearer 401 guard that was
 * previously copy-pasted verbatim across 15+ VPS push/pull + ops debug-trigger routes.
 *
 * Precedence (preserved exactly): the `x-api-key` header is checked BEFORE the
 * `authorization: Bearer <key>` fallback.
 *
 * Writes the 401 response itself and returns false when unauthorized so callers
 * can `if (!requireVpsApiKey(req, res)) return;`. Returns true when authorized —
 * caller proceeds without writing anything.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export function requireVpsApiKey(req: IncomingMessage, res: ServerResponse): boolean {
  const apiKey = Bun.env.VPS_PUSH_API_KEY;
  const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return false;
  }
  return true;
}
