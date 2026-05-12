/**
 * Interface — GET /api/health/vps-news route handler
 *
 * No auth required — readable by any monitor / uptime tool.
 *
 * Queries vps_push_log for MAX(pushed_at) WHERE service='news' AND status='ok'.
 * Returns:
 *   { lastPushAt: ISO|null, ageMs: number|null, healthy: boolean }
 * where healthy = ageMs !== null && ageMs < 7_200_000 (2-hour threshold,
 * mirrors Sprint 1855a suppression gate).
 *
 * DI contract: db injected by caller. No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

const NEWS_STALE_THRESHOLD_MS = 7_200_000; // 2 hours

export function handleVpsNewsHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const row = db
      .prepare(
        `SELECT MAX(pushed_at) AS last_push_at
         FROM vps_push_log
         WHERE service = 'news' AND status = 'ok'`,
      )
      .get() as { last_push_at: string | null } | null;

    const lastPushAt = row?.last_push_at ?? null;
    const ageMs = lastPushAt !== null ? Date.now() - new Date(lastPushAt).getTime() : null;
    const healthy = ageMs !== null && ageMs < NEWS_STALE_THRESHOLD_MS;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ lastPushAt, ageMs, healthy }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "DB error", detail: err instanceof Error ? err.message : String(err) }));
  }
}
