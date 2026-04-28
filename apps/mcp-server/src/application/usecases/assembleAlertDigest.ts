/**
 * Assemble Alert Digest — Task 188 (Application Layer)
 *
 * Queries the last 24 hours of alerts from SQLite, groups them by affected
 * stock code, and formats a Vietnamese-language digest text.
 *
 * Rules:
 *   - Only alerts within the last 24 hours are included.
 *   - Alerts are grouped by the first stock code in affected_actions_json.
 *   - Alerts with no parseable stock code are grouped under "(khac)".
 *   - Each stock block shows up to 3 messages. If count > 3, the rest are
 *     summarised as "(va N canh bao khac)".
 *   - Stock blocks are sorted by count DESC.
 *   - The digest header contains total, critical, and high severity counts.
 *   - When no alerts exist: text = "Khong co canh bao".
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 *
 * @module application/usecases/assembleAlertDigest
 */

import type { Database } from "bun:sqlite";
import { getDb, initDatabase } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** One alert row from the DB (minimal fields needed for the digest). */
interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  message: string | null;
  affected_actions_json: string | null;
}

/** A grouped block of alerts for a single stock code. */
export interface StockAlertBlock {
  /** The stock code, or "(khac)" for alerts with no parseable code. */
  code: string;
  /** Total alert count for this stock in the 24h window. */
  count: number;
  /** Up to 3 message strings from the most recent alerts. */
  topMessages: string[];
  /** Number of additional alerts beyond the top 3. Zero when count <= 3. */
  overflow: number;
}

/**
 * Structured daily alert digest.
 *
 * Produced by `assembleAlertDigest()` — consumed by the scheduler job
 * (`alertDigestJob.ts`) and the MCP tool (`alertDigestTools.ts`).
 */
export interface AlertDigest {
  /** Date in YYYY-MM-DD (Vietnam timezone). */
  date: string;
  /** ISO timestamp of when the digest was generated. */
  generatedAt: string;
  /** Total alerts in the 24h window. */
  totalCount: number;
  /** Alerts with severity = "critical". */
  criticalCount: number;
  /** Alerts with severity = "high". */
  highCount: number;
  /** Per-stock grouped blocks, sorted by count DESC. */
  stockBlocks: StockAlertBlock[];
  /** Fully formatted Vietnamese-language digest text. */
  text: string;
}

/** Options for assembleAlertDigest (DB injection for testing). */
export interface AssembleAlertDigestOptions {
  /** Injected DB connection (optional — defaults to global getDb()). */
  db?: Database;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vietnam timezone date string (YYYY-MM-DD) from a UTC Date.
 */
function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + 7 * 3_600_000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse the first stock code from an affected_actions_json cell.
 * Returns "(khac)" when the field is null, empty, or unparseable.
 */
function parseFirstCode(json: string | null): string {
  if (!json) return "(khac)";
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return "(khac)";
    const item = parsed[0];
    if (typeof item === "string" && item.trim().length > 0) return item.trim();
    if (
      item &&
      typeof item === "object" &&
      "code" in item &&
      typeof (item as { code: unknown }).code === "string"
    ) {
      const code = ((item as { code: string }).code).trim();
      return code.length > 0 ? code : "(khac)";
    }
    return "(khac)";
  } catch {
    return "(khac)";
  }
}

/**
 * Severity sort weight (higher = more severe).
 */
function severityWeight(severity: string): number {
  switch (severity) {
    case "critical": return 4;
    case "high":     return 3;
    case "medium":   return 2;
    case "low":      return 1;
    default:         return 0;
  }
}

/**
 * Build the formatted Vietnamese digest text from the computed data.
 */
export function formatAlertDigest(
  date: string,
  totalCount: number,
  criticalCount: number,
  highCount: number,
  stockBlocks: StockAlertBlock[],
): string {
  if (totalCount === 0) {
    return `[${date}] Tóm tắt cảnh báo\nKhông có cảnh báo trong 24 giờ qua.`;
  }

  const lines: string[] = [];

  // Header
  lines.push(`[${date}] Tóm tắt cảnh báo (24 giờ qua)`);
  lines.push(
    `Tổng: ${totalCount} cảnh báo | Nghiêm trọng: ${criticalCount} | Quan trọng: ${highCount}`,
  );
  lines.push("");

  // Per-stock blocks
  for (const block of stockBlocks) {
    const label = block.code === "(khac)" ? "(khac)" : block.code;
    lines.push(`${label} — ${block.count} cảnh báo:`);
    for (const msg of block.topMessages) {
      lines.push(`  - ${msg}`);
    }
    if (block.overflow > 0) {
      lines.push(`  (và ${block.overflow} cảnh báo khác)`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the last 24h of alerts from SQLite, group by stock, and return a
 * structured digest with formatted text.
 *
 * @param options - Injection options (db for testing)
 * @returns Fully assembled AlertDigest
 */
export async function assembleAlertDigest(
  options: AssembleAlertDigestOptions = {},
): Promise<AlertDigest> {
  const db = options.db ?? (await initDatabase(), getDb());

  // Use unixepoch() arithmetic instead of a JS ISO string so the comparison is
  // format-agnostic: alerts stored as "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now'))
  // and alerts stored as "YYYY-MM-DDTHH:MM:SS.mmmZ" (JS toISOString()) are both
  // matched correctly. A plain string comparison fails because ' ' < 'T' in ASCII,
  // causing same-day SQLite-format rows to be silently excluded (Task 1394).
  const rows = db
    .prepare(
      `SELECT id, triggered_at, severity, message, affected_actions_json
       FROM alerts
       WHERE unixepoch(triggered_at) >= unixepoch('now') - 86400
       ORDER BY triggered_at DESC`,
    )
    .all() as AlertRow[];

  const totalCount = rows.length;
  const criticalCount = rows.filter((r) => r.severity === "critical").length;
  const highCount = rows.filter((r) => r.severity === "high").length;

  // Group by stock code
  const groups = new Map<
    string,
    { alerts: AlertRow[]; maxSeverity: number }
  >();

  for (const row of rows) {
    const code = parseFirstCode(row.affected_actions_json);
    const existing = groups.get(code);
    if (existing) {
      existing.alerts.push(row);
      existing.maxSeverity = Math.max(
        existing.maxSeverity,
        severityWeight(row.severity),
      );
    } else {
      groups.set(code, {
        alerts: [row],
        maxSeverity: severityWeight(row.severity),
      });
    }
  }

  // Build stock blocks sorted by count DESC
  const stockBlocks: StockAlertBlock[] = Array.from(groups.entries())
    .map(([code, { alerts }]) => {
      // Sort alerts within block by severity DESC, then by triggered_at DESC
      const sorted = [...alerts].sort((a, b) => {
        const sw = severityWeight(b.severity) - severityWeight(a.severity);
        if (sw !== 0) return sw;
        return b.triggered_at.localeCompare(a.triggered_at);
      });

      const top3 = sorted.slice(0, 3);
      const overflow = sorted.length - top3.length;
      const topMessages = top3.map((a) => a.message ?? "(không có nội dung)");

      return {
        code,
        count: alerts.length,
        topMessages,
        overflow,
      };
    })
    .sort((a, b) => b.count - a.count);

  const date = todayVietnam();
  const generatedAt = new Date().toISOString();

  const text = formatAlertDigest(
    date,
    totalCount,
    criticalCount,
    highCount,
    stockBlocks,
  );

  logger.info("[assembleAlertDigest] digest assembled", {
    date,
    totalCount,
    criticalCount,
    highCount,
    stockCount: stockBlocks.length,
  });

  return {
    date,
    generatedAt,
    totalCount,
    criticalCount,
    highCount,
    stockBlocks,
    text,
  };
}
