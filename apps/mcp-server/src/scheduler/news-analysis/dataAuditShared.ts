/**
 * Data Audit Job — Shared Types & Helpers
 *
 * FACTORY-SCHEDULER-split-dataAuditJob: extracted from dataAuditJob.ts so the
 * per-check modules under `audit-checks/` and the orchestrators in
 * `dataAuditJob.ts` share ONE copy of the AuditFinding contract, the
 * category/priority mapping, the feedback-dedup insert, the previous-row-
 * count lookup, the plausible-range/snapshot-table constants, and the
 * Telegram message formatter.
 *
 * Layer: infrastructure/scheduler
 * DDD rules:
 *   - May import from infrastructure/ and domain/
 *   - Must NOT import from application/ or interface/
 *   - The agent_feedback DDL is inlined in dataAuditJob.ts (not imported
 *     from feedbackTools.ts) to avoid violating DDD by importing from
 *     interface/mcp/tools/ — DDL itself lives in infrastructure/db/schema.ts.
 */

import { Database } from "bun:sqlite";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single audit check result.
 *
 * @property table        - SQLite table name, "lancedb", or "db_overall"
 * @property check        - Short slug: e.g. "zero_price_rows", "stale_alerts_unread"
 * @property severity     - "info" | "warning" | "critical"
 * @property rowsAffected - Rows deleted, updated, or counted as problematic
 * @property action       - "auto_cleaned" | "flagged" | "escalated" | "none"
 * @property detail       - Human-readable explanation <= 200 chars
 */
export interface AuditFinding {
  table: string;
  check: string;
  severity: "info" | "warning" | "critical";
  rowsAffected: number;
  action: "auto_cleaned" | "flagged" | "escalated" | "none";
  detail: string;
}

/** Injectable Telegram send function signature — avoids importing telegram.ts at module level. */
export type TelegramFn = (text: string) => Promise<void | boolean>;

/** Injectable LanceDB count function signature. */
export type GetCountFn = () => Promise<number>;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commodity plausible-range constants — physical validity bounds, not policy thresholds.
 *  Oil: WTI/Brent never below $10 or above $300 in modern markets (pre-war record ~$147).
 *  Gold: Has never traded below $500/oz since 2005; above $5000 would be unprecedented.
 *  CPI: Annual CPI change outside -5% to +30% indicates extraction error for VN context.
 *  USD/VND: Rate should be between 20,000 and 30,000 for any plausible VN scenario.
 */
export const INDICATOR_RANGES: Record<string, { min: number; max: number; severity: "critical" | "warning" }> = {
  brent_crude_usd:  { min: 10,     max: 300,    severity: "critical" },
  wti_crude_usd:    { min: 10,     max: 300,    severity: "critical" },
  gold_usd_per_oz:  { min: 500,    max: 5000,   severity: "critical" },
  cpi_vietnam:      { min: -5,     max: 30,     severity: "warning"  },
  usd_vnd_rate:     { min: 20000,  max: 30000,  severity: "warning"  },
  // FIX-DOWJONES-STALE-WRONG-VALUE: audit-layer defense-in-depth — same band
  // as the write-time gate in indicatorPlausibility.ts. A ~44%-wrong magnitude
  // (23750 vs real DJIA ~42k) corrupts regime analysis exactly like a bad
  // brent/gold value, so it is severity=critical like those.
  dow_jones:        { min: 25000,  max: 60000,  severity: "critical" },
};

/** Major tables for D-10 row count snapshot. */
export const SNAPSHOT_TABLES = [
  "watchlist",
  "market_prices",
  "alerts",
  "rag_analyses",
  "financial_reports",
  "agent_feedback",
  "system_logs",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping helper
// ─────────────────────────────────────────────────────────────────────────────

export function checkToCategory(check: string): string {
  switch (check) {
    case "zero_price_rows":
    case "stale_price_rows":
    case "missing_sentiment_or_impact":
    case "failed_validation_unfixed":
    case "outlier_indicator_values":
      return "data_extraction_error";
    case "orphan_alerts":
      return "alert_quality";
    case "lancedb_rag_count_drift":
      return "performance_issue";
    case "stale_new_feedback":
      return "other";
    default:
      return "other";
  }
}

export function severityToPriority(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Row count trend detection (task 1086)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read previous D-10 row_count_snapshot findings from audit_state.last_daily_findings.
 * Returns a Map<tableName, rowCount> for each SNAPSHOT_TABLE that had a previous reading.
 * Returns an empty map on any error (first run, missing table, corrupt JSON, etc.).
 */
export function getPreviousRowCounts(db: Database): Map<string, number> {
  const result = new Map<string, number>();
  try {
    const row = db.query<{ last_daily_findings: string | null }, []>(
      "SELECT last_daily_findings FROM audit_state WHERE id = 1",
    ).get();
    if (!row?.last_daily_findings) return result;

    const findings: AuditFinding[] = JSON.parse(row.last_daily_findings);
    for (const f of findings) {
      if (f.check === "row_count_snapshot" && typeof f.rowsAffected === "number") {
        result.set(f.table, f.rowsAffected);
      }
    }
  } catch {
    // First audit, missing table, corrupt JSON — all fine, return empty map
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// agent_feedback insert with dedup guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the dedup title for an audit finding.
 *
 * Report 1055: stranded_bctc_pdf emits ONE finding per file. If all per-file
 * findings share the same dedup title they collapse to a single row and only
 * the first PDF gets reparsed. We append a short filename tag parsed out of
 * the detail prefix (format: "TICKER:filename..." — see checkBctcStranded in
 * audit-checks/checkBctcStranded.ts) so each stranded file is tracked
 * independently.
 *
 * Exported for unit testing (see 1055-bctc-stranded-dedup.test.ts).
 */
export function buildFindingTitle(finding: AuditFinding): string {
  let titleSuffix = "";
  if (finding.check === "stranded_bctc_pdf" && finding.rowsAffected === 1) {
    const m = finding.detail.match(/^[A-Z]{2,5}:(.*?\.pdf)/i);
    if (m) {
      titleSuffix = ` [${m[1]!.slice(0, 60)}]`;
    }
  }
  return `[AUDIT] ${finding.check} — ${finding.table} (${finding.rowsAffected} rows)${titleSuffix}`;
}

/**
 * Insert a finding into agent_feedback.
 * Skips insertion if the same (agent='data-auditor', title) was already inserted today.
 */
export function insertFeedbackIfNew(db: Database, finding: AuditFinding): void {
  const title = buildFindingTitle(finding);

  // Dedup guard: skip if the same finding is either (a) already inserted
  // today, or (b) still open from any prior day (status='new'). Without the
  // status check the audit spams a fresh row every day for the same
  // long-standing issue until a human acknowledges it.
  const existing = db.prepare(`
    SELECT COUNT(*) as cnt FROM agent_feedback
    WHERE agent = 'data-auditor'
      AND title = ?
      AND (created_at >= date('now') OR status = 'new')
  `).get(title) as { cnt: number };

  if (existing.cnt > 0) return; // already inserted today, or still open

  const category = checkToCategory(finding.check);
  const priority = severityToPriority(finding.severity);
  const detail = finding.detail.slice(0, 500);

  db.prepare(`
    INSERT INTO agent_feedback (agent, category, title, detail, priority, status, created_at)
    VALUES ('data-auditor', ?, ?, ?, ?, 'new', datetime('now'))
  `).run(category, title, detail, priority);
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram message formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatTimestampGMT7(): string {
  const now = new Date();
  const gmt7 = new Date(now.getTime() + VN_OFFSET_MS);
  const yyyy = gmt7.getUTCFullYear();
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  const hh = String(gmt7.getUTCHours()).padStart(2, "0");
  const min = String(gmt7.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} GMT+7`;
}

export function buildTelegramMessage(mode: "daily" | "weekly", findings: AuditFinding[], db: Database): string {
  const ts = formatTimestampGMT7();
  const lines: string[] = [`DB audit (${mode}) — ${ts}`];

  // Cleaned line
  const cleaned = findings.filter((f) => f.action === "auto_cleaned" && f.rowsAffected > 0);
  if (cleaned.length === 0) {
    lines.push("Cleaned: 0 rows");
  } else {
    const totalCleaned = cleaned.reduce((s, f) => s + f.rowsAffected, 0);
    const parts = cleaned.map((f) => `${f.check}: ${f.rowsAffected.toLocaleString("vi-VN")}`);
    lines.push(`Cleaned: ${totalCleaned.toLocaleString("vi-VN")} rows (${parts.join(", ")})`);
  }

  // Flagged line
  const flagged = findings.filter((f) => f.action === "flagged" || f.action === "escalated");
  const warnings = flagged.filter((f) => f.severity === "warning").length;
  const criticals = flagged.filter((f) => f.severity === "critical").length;
  lines.push(`Flagged: ${warnings} warnings, ${criticals} criticals`);

  // Feedback queue line — always live from DB
  let pendingCount = 0;
  let highPriorityCount = 0;
  try {
    const pending = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new'"
    ).get();
    pendingCount = pending?.cnt ?? 0;

    const high = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new' AND priority IN ('high','critical')"
    ).get();
    highPriorityCount = high?.cnt ?? 0;
  } catch { /* best-effort */ }

  lines.push(`Feedback queue: ${pendingCount} new items (${highPriorityCount} high priority)`);

  return lines.join("\n");
}
