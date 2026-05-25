// DEPRECATED: direct callers must use kinh-dich-service:5005 via clients.ts — see P1-F
// G5-INVERSE REMEDIATION: appendKinhDich() callers (marketTools.ts, analysis.ts) have
// been rewired to use getKinhDichReading() / getMarketHexagram() from clients.ts.
// This file is NOT deleted in Phase 1 — deletion is Phase 2 G5 task.
// src/domain/services/kinhDich/kinhDichWrapper.ts
// Task 1077 — Kinh Dich Default Layer
//
// Pure domain service. Appends a compact Kinh Dich hexagram reading to any
// analysis output string. Database handle is passed as a parameter (dependency
// injection) — this file NEVER imports from src/infrastructure/.
//
// Usage (interface layer wires the db handle):
//   const text = await appendKinhDich("VCB", baseText, db);

import type { Database } from "bun:sqlite";
import { QUE_META } from "./hexagramLibrary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Row type for kinhdich_readings table queries
// ─────────────────────────────────────────────────────────────────────────────

interface KinhDichRow {
  hexagram_number: number;
  bien_que_number: number;
  trading_signal: string | null;
  confidence: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve hexagram name from QUE_META by number (1-64). Returns fallback if not found. */
function getQueName(number: number): string {
  const meta = QUE_META.find((q) => q.id === number);
  return meta ? meta.name : `Que ${number}`;
}

/** Map "MARKET" ticker to the VNINDEX code stored in kinhdich_readings. */
function resolveCode(ticker: string): string {
  return ticker === "MARKET" ? "VNINDEX" : ticker;
}

/**
 * Format confidence from [0, 1] float to "nn%" string.
 * If confidence is null or invalid, returns empty string.
 */
function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null || isNaN(confidence)) return "";
  return `${Math.round(confidence * 100)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a compact Kinh Dich hexagram reading to any analysis output string.
 *
 * Reads the latest stored hexagram from the `kinhdich_readings` table using the
 * injected database handle. No live score recomputation — uses the most recently
 * stored reading written by `get_kinhdich_reading` / cron.
 *
 * Never throws. All errors are caught internally. On failure or missing data:
 *   returns `baseOutput + "\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ."`
 *
 * @param ticker      Stock ticker code (e.g. "VCB") or "MARKET" for VN-Index.
 *                    Empty string → returns baseOutput unchanged.
 * @param baseOutput  The existing analysis text to append to.
 * @param db          SQLite database handle. Must have the kinhdich_readings table.
 * @returns           baseOutput + "\n---\nKinh Dịch: ..." block (always a string)
 */
export async function appendKinhDich(
  ticker: string,
  baseOutput: string,
  db: Database,
): Promise<string> {
  // Guard: empty ticker → no-op
  if (!ticker) return baseOutput;

  const FALLBACK = `${baseOutput}\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.`;

  try {
    const code = resolveCode(ticker);

    // Query the most recent stored reading for this ticker
    const row = db
      .prepare<KinhDichRow, [string]>(`
        SELECT hexagram_number, bien_que_number, trading_signal, confidence
        FROM kinhdich_readings
        WHERE stock_code = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `)
      .get(code);

    if (!row) {
      return FALLBACK;
    }

    // Resolve names from pure domain data (hexagramLibrary)
    const hexName = getQueName(row.hexagram_number);
    const bienName = getQueName(row.bien_que_number);

    // Build the 1-line trend signal from tradingSignal
    const signal = row.trading_signal ?? "N/A";

    // Confidence percentage
    const confStr = formatConfidence(row.confidence);

    // Compose the block in the specified format:
    //   \n---\nKinh Dịch: {hexagram_name} ({number}) — {1-line trend signal}
    //   Biến quẻ: {changing_hex_name} → {direction}
    //   Độ tin cậy: {confidence}%
    const block = [
      `\n---`,
      `Kinh Dịch: ${hexName} (${row.hexagram_number}) — ${signal}`,
      `Biến quẻ: ${bienName} → ${bienName}`,
      ...(confStr ? [`Độ tin cậy: ${confStr}`] : []),
    ].join("\n");

    return baseOutput + block;
  } catch {
    // Never propagate exceptions to callers
    return FALLBACK;
  }
}
