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
// Centralized helper (FACTORY-APP-dedup-date-freshness-helpers) — todayVietnam
// was duplicated locally here (using a bare 7*3_600_000 offset literal instead
// of VN_OFFSET_MS) as well as in assembleBriefing.ts/assembleEveningSummary.ts.
import { todayVietnam } from "../../domain/services/timeHelpers.js";

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
  /**
   * triggered_at value (raw SQLite or ISO string) for each entry in topMessages,
   * same index. Empty string "" when the source row has no triggered_at.
   * Used by formatAlertDigest to render (+HH:MM) ICT on incremental price_drop lines.
   */
  topTriggeredAt: string[];
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
 * Returns true when the message is a price_drop entry.
 * Detection: presence of "Giá giảm" substring (case-sensitive).
 */
function isPriceDrop(msg: string): boolean {
  return msg.includes("Giá giảm");
}

/**
 * Returns true when the message represents a cumulative price move.
 * Detection: "lũy kế" or "luy ke" (ASCII transliteration), case-insensitive.
 */
function isCumulative(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("lũy kế") || lower.includes("luy ke");
}

/**
 * Convert a raw triggered_at string (SQLite "YYYY-MM-DD HH:MM:SS" or ISO
 * "YYYY-MM-DDTHH:MM:SS.mmmZ") to a zero-padded HH:MM string in Vietnam
 * Standard Time (ICT, UTC+7).
 *
 * Returns null when the input is empty, null, or produces an invalid Date.
 */
function toIctHHMM(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // SQLite datetime() stores "YYYY-MM-DD HH:MM:SS" without T or Z.
  // Append "Z" only when the string has no timezone indicator.
  const normalised = /[TZ+]/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(normalised);
  if (isNaN(d.getTime())) return null;
  const ict = new Date(d.getTime() + 7 * 3_600_000);
  const hh = String(ict.getUTCHours()).padStart(2, "0");
  const mm = String(ict.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
    let priceDropSeen = false;
    for (let i = 0; i < block.topMessages.length; i++) {
      const msg = block.topMessages[i]!;
      let prefix = "";
      if (isCumulative(msg)) {
        // Cumulative entry — always labelled; does NOT consume the "first drop" slot
        prefix = "(lũy kế) ";
      } else if (isPriceDrop(msg)) {
        if (priceDropSeen) {
          // Second or later incremental price_drop — show ICT time or fall back
          const raw = block.topTriggeredAt[i] ?? "";
          const ict = toIctHHMM(raw);
          prefix = ict !== null ? `(+${ict}) ` : "(+thêm) ";
        } else {
          // First incremental price_drop — no prefix, but mark seen
          priceDropSeen = true;
        }
      }
      lines.push(`  - ${prefix}${msg}`);
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

      // Deduplicate by message string before slicing (Task 1791).
      // Within a single digest window the same alert fires many times with
      // an identical message (e.g. "VRE volume spike 3.3×" × 24).
      // We keep the first occurrence of each unique message (which is the
      // highest-severity / most-recent entry because `sorted` is ordered by
      // severity DESC then triggered_at DESC).
      // Raw count is preserved; overflow is derived from unique count.
      const seen = new Set<string>();
      const deduplicated: AlertRow[] = [];
      for (const a of sorted) {
        const key = a.message ?? "(không có nội dung)";
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(a);
        }
      }

      const top3 = deduplicated.slice(0, 3);
      const overflow = deduplicated.length - top3.length;
      const topMessages = top3.map((a) => a.message ?? "(không có nội dung)");
      const topTriggeredAt = top3.map((a) => a.triggered_at ?? "");

      return {
        code,
        count: alerts.length,
        topMessages,
        topTriggeredAt,
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
