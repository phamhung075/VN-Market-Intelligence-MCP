/**
 * marketDigestHandler.ts — GET /api/market-digest
 *
 * MAW-P0-2: Serve the last 3 MARKET channel synthesis dishes for the
 * Market Analyst Workbench frontend.
 *
 * Source: `market_messages` SQLite table — last 3 rows by sent_at DESC
 * from the CHEF unified-agent synthesis agents (morning-briefing,
 * evening-summary, france-summary).  These correspond to the 3 guaranteed
 * daily dishes (05:23 / 08:37 / 19:37 UTC).
 *
 * Response shape (200 OK):
 *   {
 *     items: [
 *       {
 *         id:         number,        // market_messages.id
 *         text:       string,        // full message content
 *         ts:         string,        // ISO 8601 sent_at
 *         type:       string,        // message_type (e.g. "morning_briefing")
 *         from_agent: string         // e.g. "morning-briefing"
 *       },
 *       ...
 *     ],
 *     count:      number,            // number of items returned (0–3)
 *     fetchedAt:  string             // ISO 8601 timestamp of this response
 *   }
 *
 * 200 + empty items[] when no rows exist (no error).
 * 500 on DB error.
 *
 * Risk R2 mitigation: no DB-level cache (query is fast); caller can add
 * HTTP cache headers if needed — not the handler's concern.
 *
 * DDD Layer: interface — imports only from infrastructure/db, never from domain/.
 * DI contract: db injected by server.ts (no getDb() call here).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Agents whose messages constitute CHEF MARKET synthesis dishes. */
export const CHEF_SYNTHESIS_AGENTS: ReadonlyArray<string> = [
  "morning-briefing",
  "evening-summary",
  "france-summary",
];

/** One digest item in the response. */
export interface MarketDigestItem {
  id: number;
  text: string;
  ts: string;
  type: string;
  from_agent: string;
}

/** Full response body for GET /api/market-digest. */
export interface MarketDigestResponse {
  items: MarketDigestItem[];
  count: number;
  fetchedAt: string;
}

/** Raw SQLite row from market_messages. */
interface MarketMessageRow {
  id: number;
  from_agent: string;
  message_type: string;
  content: string;
  sent_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the last `limit` MARKET synthesis messages from the DB.
 *
 * Filters to CHEF_SYNTHESIS_AGENTS only so alert / calibration / prediction
 * messages are excluded from the analyst digest.
 *
 * @param db    - SQLite database instance (injected)
 * @param limit - Max rows to return (default 3, clamped 1–10)
 * @returns Array of digest items, newest first
 */
export function queryMarketDigest(
  db: Database,
  limit = 3,
): MarketDigestItem[] {
  const clampedLimit = Math.min(10, Math.max(1, limit));

  // Build IN clause for agent filter
  const placeholders = CHEF_SYNTHESIS_AGENTS.map(() => "?").join(", ");

  const rows = db
    .prepare<MarketMessageRow, (string | number)[]>(
      `SELECT id, from_agent, message_type, content, sent_at
       FROM market_messages
       WHERE from_agent IN (${placeholders})
       ORDER BY sent_at DESC
       LIMIT ?`,
    )
    .all(...(CHEF_SYNTHESIS_AGENTS as string[]), clampedLimit);

  return rows.map((row) => ({
    id: row.id,
    text: row.content,
    ts: row.sent_at,
    type: row.message_type,
    from_agent: row.from_agent,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/market-digest.
 *
 * @param _req   - Incoming HTTP request (unused — no query params consumed here)
 * @param res    - HTTP response
 * @param db     - SQLite database instance (injected by server.ts)
 * @param now    - Optional clock override for testability (defaults to new Date())
 */
export function handleGetMarketDigest(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const items = queryMarketDigest(db, 3);

    const body: MarketDigestResponse = {
      items,
      count: items.length,
      fetchedAt: now.toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
