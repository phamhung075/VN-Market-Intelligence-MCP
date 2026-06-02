/**
 * Interface — GET /mcp/api/kinh-dich/market
 *
 * Returns a derived aggregate Kinh Dich market signal computed from the most
 * recent kinhdich_readings for all watchlist stocks.
 *
 * Derivation algorithm (pure, no I/O beyond DB read):
 *   1. Fetch the latest reading per stock_code from watchlist.
 *   2. Among all rows, pick the row with maximum confidence as representative.
 *   3. hexagram = representative.hexagram_number, name from QUE_META.
 *   4. signal = representative.trading_signal.
 *   5. confidence = confidence-weighted average across all rows.
 *   6. timestamp = MAX(timestamp) across all selected rows.
 *   7. 0 rows → 503 with { error: "no_readings" }.
 *
 * Response shape matches KinhDichMarket frontend interface:
 *   { hexagram, name, trend, signal, confidence, timestamp, derived, note }
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { QUE_META } from "../tools/kinhdich/hexagramNames.js";

interface WatchlistReadingRow {
  stock_code: string;
  hexagram_number: number;
  trading_signal: string | null;
  confidence: number | null;
  timestamp: string;
}

/**
 * Derive trend label from trading signal string.
 */
function deriveTrend(signal: string | null): string {
  if (!signal) return "TRUNG TÍNH";
  const upper = signal.toUpperCase();
  if (upper.includes("BÁN") || upper.includes("BAN")) return "BẤT LỢI";
  if (upper.includes("MUA")) return "THUẬN LỢI";
  return "TRUNG TÍNH";
}

export function handleKinhDichMarket(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    // Fetch the latest reading per watchlist stock using a correlated subquery
    // to get the most recent timestamp per stock_code.
    const rows = db
      .prepare<WatchlistReadingRow, []>(
        `SELECT kr.stock_code, kr.hexagram_number, kr.trading_signal,
                kr.confidence, kr.timestamp
         FROM kinhdich_readings kr
         INNER JOIN watchlist w ON w.code = kr.stock_code
         INNER JOIN (
           SELECT stock_code, MAX(timestamp) AS max_ts
           FROM kinhdich_readings
           GROUP BY stock_code
         ) latest ON latest.stock_code = kr.stock_code
                  AND latest.max_ts = kr.timestamp`,
      )
      .all() as WatchlistReadingRow[];

    if (rows.length === 0) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "no_readings",
          detail: "Intelligence cycle has not run yet — no kinhdich_readings for watchlist stocks.",
        }),
      );
      return;
    }

    // Pick the row with maximum confidence as the representative.
    let representative = rows[0]!;
    for (const r of rows) {
      const rConf = r.confidence ?? 0;
      const repConf = representative.confidence ?? 0;
      if (rConf > repConf) {
        representative = r;
      }
    }

    // Confidence-weighted average across all rows.
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of rows) {
      const w = r.confidence ?? 0;
      weightedSum += w * w; // weighted by confidence itself
      totalWeight += w;
    }
    const avgConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // MAX timestamp across all rows.
    let maxTimestamp = rows[0]!.timestamp;
    for (const r of rows) {
      if (r.timestamp > maxTimestamp) maxTimestamp = r.timestamp;
    }

    const hexNum = representative.hexagram_number;
    const meta = QUE_META[hexNum - 1];
    const name = meta?.name ?? String(hexNum);
    const signal = representative.trading_signal ?? "KHÔNG XÁC ĐỊNH";
    const trend = deriveTrend(representative.trading_signal);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        hexagram: hexNum,
        name,
        trend,
        signal,
        confidence: Math.round(avgConfidence * 1000) / 1000,
        timestamp: maxTimestamp,
        derived: true,
        note: "Aggregated from watchlist readings",
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
