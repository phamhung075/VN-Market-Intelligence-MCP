/**
 * Interface — GET /mcp/api/kinh-dich/reading/:code
 *
 * Returns the latest Kinh Dich reading for a single stock from the
 * kinhdich_readings DB cache.  Serves ONLY cached rows — no live domain
 * computation per request (R-6 anti-pattern).
 *
 * Response shape matches KinhDichReading frontend interface (dashboard.analysis.tsx):
 *   { stock, hexagram, name, trend, signal, confidence, timestamp,
 *     actionNote, overallReading }
 *
 * Error cases:
 *   400  — missing / empty code in path
 *   404  — no row found for this stock (intelligence cycle not run yet)
 *   500  — DB error
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { QUE_META } from "../tools/kinhdich/hexagramNames.js";

interface KinhDichDbRow {
  hexagram_number: number;
  trading_signal: string | null;
  confidence: number | null;
  timestamp: string;
}

/**
 * Derive trend label from trading signal string.
 * BÁN-containing → "BẤT LỢI"; MUA-containing → "THUẬN LỢI"; else "TRUNG TÍNH".
 */
function deriveTrend(signal: string | null): string {
  if (!signal) return "TRUNG TÍNH";
  const upper = signal.toUpperCase();
  if (upper.includes("BÁN") || upper.includes("BAN")) return "BẤT LỢI";
  if (upper.includes("MUA")) return "THUẬN LỢI";
  return "TRUNG TÍNH";
}

export function handleKinhDichReading(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  code: string,
): void {
  const trimmedCode = (code ?? "").trim().toUpperCase();

  if (!trimmedCode) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing stock code" }));
    return;
  }

  try {
    const row = db
      .prepare<KinhDichDbRow, [string]>(
        `SELECT hexagram_number, trading_signal, confidence, timestamp
         FROM kinhdich_readings
         WHERE stock_code = ?
         ORDER BY timestamp DESC
         LIMIT 1`,
      )
      .get(trimmedCode) as KinhDichDbRow | null;

    if (!row) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "no_reading",
          detail: `No Kinh Dich reading for ${trimmedCode}. Intelligence cycle may not have run yet.`,
          stock: trimmedCode,
        }),
      );
      return;
    }

    // QUE_META is 1-indexed: hexagram 1 is at index 0
    const meta = QUE_META[row.hexagram_number - 1];
    const name = meta?.name ?? String(row.hexagram_number);
    const signal = row.trading_signal ?? "KHÔNG XÁC ĐỊNH";
    const confidence = row.confidence ?? 0;
    const trend = deriveTrend(row.trading_signal);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        stock: trimmedCode,
        hexagram: row.hexagram_number,
        name,
        trend,
        signal,
        confidence,
        timestamp: row.timestamp,
        actionNote: null,
        overallReading: null,
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
