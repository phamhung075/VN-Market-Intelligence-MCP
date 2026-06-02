/**
 * Interface — GET /mcp/api/prices/history
 *
 * Returns OHLCV price history for a single ticker from daily_ohlcv.
 *
 * Query params:
 *   code  — required, uppercase ticker or index code (e.g. FPT, VNINDEX)
 *   days  — optional integer, default 30, max 365 (clamped server-side)
 *
 * Response shape matches fetchPriceHistory client parser ({ history: [...] }):
 *   { code, days, count, history: [{ date, code, open, high, low, close, volume }] }
 *
 * Error cases:
 *   400 — missing or empty code
 *   404 — no rows found for this code + days range
 *   500 — DB error
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

interface OhlcvRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function handlePriceHistory(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawCode = (url.searchParams.get("code") ?? "").trim().toUpperCase();
    const rawDays = url.searchParams.get("days");

    if (!rawCode) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required param: code" }));
      return;
    }

    const parsedDays = rawDays !== null ? parseInt(rawDays, 10) : DEFAULT_DAYS;
    const days = Number.isNaN(parsedDays)
      ? DEFAULT_DAYS
      : Math.max(MIN_DAYS, Math.min(MAX_DAYS, parsedDays));

    const rows = db
      .prepare<OhlcvRow, [string, number]>(
        `SELECT code, date, open, high, low, close, volume
         FROM daily_ohlcv
         WHERE code = ?
           AND date >= date('now', '-' || ? || ' days')
         ORDER BY date ASC`,
      )
      .all(rawCode, days) as OhlcvRow[];

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "no_data",
          detail: `No OHLCV data found for ${rawCode} in the last ${days} days.`,
          code: rawCode,
          days,
        }),
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        code: rawCode,
        days,
        count: rows.length,
        history: rows,
      }),
    );
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
