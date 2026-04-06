/**
 * Data Audit Job — Task 157
 *
 * Scheduled database audit and cleanup engine.
 * Runs nightly (daily) at 23:00 and weekly (deep) at Sunday 01:00 GMT+7.
 *
 * Layer: infrastructure/scheduler
 * DDD rules:
 *   - May import from infrastructure/ and domain/
 *   - Must NOT import from application/ or interface/
 *   - The agent_feedback DDL is inlined here (not imported from feedbackTools.ts)
 *     to avoid violating DDD by importing from interface/mcp/tools/
 *
 * Exports:
 *   AuditFinding       — result interface for each check
 *   runDailyAudit()    — D-1 through D-10 checks, < 5s
 *   runWeeklyAudit()   — daily + W-1 through W-7, < 30s
 */

import { Database } from "bun:sqlite";

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
const INDICATOR_RANGES: Record<string, { min: number; max: number; severity: "critical" | "warning" }> = {
  brent_crude_usd:  { min: 10,     max: 300,    severity: "critical" },
  wti_crude_usd:    { min: 10,     max: 300,    severity: "critical" },
  gold_usd_per_oz:  { min: 500,    max: 5000,   severity: "critical" },
  cpi_vietnam:      { min: -5,     max: 30,     severity: "warning"  },
  usd_vnd_rate:     { min: 20000,  max: 30000,  severity: "warning"  },
};

/** Major tables for D-10 row count snapshot. */
const SNAPSHOT_TABLES = [
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

function checkToCategory(check: string): string {
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

function severityToPriority(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers (inline DDL — no interface-layer import)
// ─────────────────────────────────────────────────────────────────────────────

function ensureAuditDependencies(db: Database): void {
  // agent_feedback table (also created by feedbackTools.ts — this is idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent       TEXT NOT NULL,
      category    TEXT NOT NULL,
      title       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent);
  `);

  // audit_state: singleton row (id=1 enforced by CHECK constraint)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_state (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      last_daily_audit_at   TEXT,
      last_weekly_audit_at  TEXT,
      last_daily_findings   TEXT,
      last_weekly_findings  TEXT
    );
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// agent_feedback insert with dedup guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a finding into agent_feedback.
 * Skips insertion if the same (agent='data-auditor', title) was already inserted today.
 */
function insertFeedbackIfNew(db: Database, finding: AuditFinding): void {
  const title = `[AUDIT] ${finding.check} — ${finding.table} (${finding.rowsAffected} rows)`;

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
  const gmt7 = new Date(now.getTime() + 7 * 3600_000);
  const yyyy = gmt7.getUTCFullYear();
  const mm = String(gmt7.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(gmt7.getUTCDate()).padStart(2, "0");
  const hh = String(gmt7.getUTCHours()).padStart(2, "0");
  const min = String(gmt7.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} GMT+7`;
}

function buildTelegramMessage(mode: "daily" | "weekly", findings: AuditFinding[], db: Database): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// Default production helpers
// ─────────────────────────────────────────────────────────────────────────────

async function defaultGetDb(): Promise<Database> {
  const { getDb } = await import("../infrastructure/db/schema.js");
  return getDb();
}

async function defaultSendTelegram(text: string): Promise<void> {
  try {
    const { mcpConfig } = await import("../infrastructure/config.js");
    if (!mcpConfig.telegram?.enabled) return;
    const { sendTelegramMessage } = await import("../infrastructure/notifiers/telegram.js");
    await sendTelegramMessage(text, { parseMode: "" });
  } catch { /* best-effort */ }
}

async function defaultGetCount(): Promise<number> {
  const { getCount } = await import("../infrastructure/rag/vectorstore.js");
  return getCount();
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily audit checks (D-1 through D-10)
// ─────────────────────────────────────────────────────────────────────────────

function runDailyChecks(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // D-1: Delete zero-price rows
  try {
    const result = db.prepare(
      "DELETE FROM market_prices WHERE price = 0 OR price IS NULL"
    ).run();
    findings.push({
      table: "market_prices",
      check: "zero_price_rows",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} rows with price = 0 or NULL from market_prices`,
    });
  } catch (err) {
    findings.push({
      table: "market_prices",
      check: "zero_price_rows",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-2: Delete stale price rows (>3 days old)
  try {
    const result = db.prepare(
      "DELETE FROM market_prices WHERE updated_at < date('now','-3 days')"
    ).run();
    findings.push({
      table: "market_prices",
      check: "stale_price_rows",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} stale market_prices rows older than 3 days`,
    });
  } catch (err) {
    findings.push({
      table: "market_prices",
      check: "stale_price_rows",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-3: Mark stale unread alerts as read (>30 days)
  try {
    const result = db.prepare(
      "UPDATE alerts SET read = 1 WHERE read = 0 AND triggered_at < datetime('now','-30 days')"
    ).run();
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Marked ${result.changes} unread alerts (>30 days) as read`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-4: Auto-expire unresolved alerts (>60 days)
  try {
    const result = db.prepare(`
      UPDATE alerts
      SET resolved_at = datetime('now'),
          resolution_notes = 'auto-expired by audit'
      WHERE resolved_at IS NULL
        AND triggered_at < datetime('now','-60 days')
    `).run();
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Auto-expired ${result.changes} unresolved alerts older than 60 days`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-5: Flag rag_analyses with missing sentiment or impact
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses WHERE sentiment IS NULL OR impact_score = 0 OR impact_score IS NULL"
    ).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "rag_analyses",
      check: "missing_sentiment_or_impact",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} rag_analyses rows missing sentiment or impact_score`,
    };
    findings.push(finding);
    if (cnt > 0) insertFeedbackIfNew(db, finding);
  } catch (err) {
    findings.push({
      table: "rag_analyses",
      check: "missing_sentiment_or_impact",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-6: Flag old rag_analyses with null source_url (>7 days)
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses WHERE source_url IS NULL AND created_at < datetime('now','-7 days')"
    ).get();
    const cnt = row?.cnt ?? 0;
    findings.push({
      table: "rag_analyses",
      check: "null_source_url_old",
      severity: "info",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} rag_analyses rows have null source_url and are older than 7 days`,
    });
  } catch (err) {
    findings.push({
      table: "rag_analyses",
      check: "null_source_url_old",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-7: Flag financial_reports with failed validation
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM financial_reports WHERE validation_status = 'failed'"
    ).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "financial_reports",
      check: "failed_validation_unfixed",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} financial_reports have validation_status = 'failed'`,
    };
    findings.push(finding);
    if (cnt > 0) insertFeedbackIfNew(db, finding);
  } catch (err) {
    findings.push({
      table: "financial_reports",
      check: "failed_validation_unfixed",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-8: Escalate stale 'new' feedback (>14 days, low/medium priority)
  try {
    const result = db.prepare(`
      UPDATE agent_feedback
      SET priority = 'high'
      WHERE status = 'new'
        AND created_at < datetime('now','-14 days')
        AND priority IN ('low','medium')
    `).run();
    const finding: AuditFinding = {
      table: "agent_feedback",
      check: "stale_new_feedback",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "escalated" : "none",
      detail: `Escalated ${result.changes} stale new feedback items to high priority`,
    };
    findings.push(finding);
    if (result.changes > 0) insertFeedbackIfNew(db, finding);
  } catch (err) {
    findings.push({
      table: "agent_feedback",
      check: "stale_new_feedback",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-9: Purge old system_logs (>60 days)
  try {
    const result = db.prepare(
      "DELETE FROM system_logs WHERE timestamp < datetime('now','-60 days')"
    ).run();
    findings.push({
      table: "system_logs",
      check: "old_log_purge",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} system_logs entries older than 60 days`,
    });
  } catch (err) {
    findings.push({
      table: "system_logs",
      check: "old_log_purge",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-10: Row count snapshot (7 major tables)
  for (const tableName of SNAPSHOT_TABLES) {
    try {
      const row = db.query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM ${tableName}`).get();
      const cnt = row?.cnt ?? 0;
      findings.push({
        table: tableName,
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: cnt,
        action: "none",
        detail: `${tableName} has ${cnt.toLocaleString("vi-VN")} rows`,
      });
    } catch (err) {
      findings.push({
        table: tableName,
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: 0,
        action: "none",
        detail: `Count failed for ${tableName}: ${(err as Error).message}`.slice(0, 200),
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly audit checks (W-1 through W-7)
// ─────────────────────────────────────────────────────────────────────────────

async function runWeeklyChecks(db: Database, getCountFn: GetCountFn): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  // W-1: Prune old commodity_prices_history (>180 days)
  try {
    const result = db.prepare(
      "DELETE FROM commodity_prices_history WHERE fetched_at < datetime('now','-180 days')"
    ).run();
    findings.push({
      table: "commodity_prices_history",
      check: "old_commodity_history",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} commodity_prices_history rows older than 180 days`,
    });
  } catch (err) {
    findings.push({
      table: "commodity_prices_history",
      check: "old_commodity_history",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // W-2: Prune old sbv_rates_history (>180 days)
  try {
    const result = db.prepare(
      "DELETE FROM sbv_rates_history WHERE fetched_at < datetime('now','-180 days')"
    ).run();
    findings.push({
      table: "sbv_rates_history",
      check: "old_sbv_history",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} sbv_rates_history rows older than 180 days`,
    });
  } catch (err) {
    findings.push({
      table: "sbv_rates_history",
      check: "old_sbv_history",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // W-3: Deduplicate market_prices_history — keep MAX(rowid) per (code, DATE(fetched_at))
  try {
    const result = db.prepare(`
      DELETE FROM market_prices_history
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
      )
      AND (code || '|' || DATE(fetched_at)) IN (
        SELECT code || '|' || DATE(fetched_at)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
        HAVING COUNT(*) > 1
      )
    `).run();
    findings.push({
      table: "market_prices_history",
      check: "duplicate_price_history",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Removed ${result.changes} duplicate market_prices_history rows (kept latest per code/day)`,
    });
  } catch (err) {
    findings.push({
      table: "market_prices_history",
      check: "duplicate_price_history",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // W-4: Deduplicate null-source-url rag_analyses (>30 days)
  try {
    const result = db.prepare(`
      DELETE FROM rag_analyses
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM rag_analyses
        WHERE source_url IS NULL AND created_at < datetime('now','-30 days')
        GROUP BY level, DATE(created_at), source_title
      )
      AND source_url IS NULL
      AND created_at < datetime('now','-30 days')
      AND (level || '|' || DATE(created_at) || '|' || COALESCE(source_title,'')) IN (
        SELECT level || '|' || DATE(created_at) || '|' || COALESCE(source_title,'')
        FROM rag_analyses
        WHERE source_url IS NULL AND created_at < datetime('now','-30 days')
        GROUP BY level, DATE(created_at), source_title
        HAVING COUNT(*) > 1
      )
    `).run();
    findings.push({
      table: "rag_analyses",
      check: "duplicate_null_source_url",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Removed ${result.changes} duplicate rag_analyses rows with null source_url (>30 days)`,
    });
  } catch (err) {
    findings.push({
      table: "rag_analyses",
      check: "duplicate_null_source_url",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // W-5: Outlier tracked_indicators values (table may not exist)
  try {
    const indicatorRows = db.prepare(
      `SELECT indicator, value FROM tracked_indicators WHERE indicator IN (${Object.keys(INDICATOR_RANGES).map(() => "?").join(",")})`
    ).all(...Object.keys(INDICATOR_RANGES)) as Array<{ indicator: string; value: number }>;

    const outliers: Array<{ indicator: string; value: number; range: typeof INDICATOR_RANGES[string] }> = [];
    for (const row of indicatorRows) {
      const range = INDICATOR_RANGES[row.indicator];
      if (!range) continue;
      if (row.value < range.min || row.value > range.max) {
        outliers.push({ indicator: row.indicator, value: row.value, range });
      }
    }

    if (outliers.length === 0) {
      findings.push({
        table: "tracked_indicators",
        check: "outlier_indicator_values",
        severity: "info",
        rowsAffected: 0,
        action: "none",
        detail: "All tracked indicator values are within plausible ranges",
      });
    } else {
      // Use the highest severity across all outliers
      const hasCritical = outliers.some((o) => o.range.severity === "critical");
      const topSeverity = hasCritical ? "critical" : "warning";
      const desc = outliers
        .map((o) => `${o.indicator}=${o.value} (valid: ${o.range.min}–${o.range.max})`)
        .join("; ");

      const finding: AuditFinding = {
        table: "tracked_indicators",
        check: "outlier_indicator_values",
        severity: topSeverity,
        rowsAffected: outliers.length,
        action: "flagged",
        detail: `Outlier values: ${desc}`.slice(0, 200),
      };
      findings.push(finding);
      insertFeedbackIfNew(db, finding);
    }
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Table may not exist — that is expected on first startup
    const isTableMissing = msg.includes("no such table");
    findings.push({
      table: "tracked_indicators",
      check: "outlier_indicator_values",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: isTableMissing
        ? "tracked_indicators table not yet created — skipping W-5"
        : `Check failed: ${msg}`.slice(0, 200),
    });
  }

  // W-6: Orphan alerts (analysis IDs not in rag_analyses)
  try {
    const row = db.query<{ cnt: number }, []>(`
      SELECT COUNT(DISTINCT je.value) as cnt
      FROM alerts, json_each(analysis_ids_json) je
      LEFT JOIN rag_analyses ra ON ra.id = je.value
      WHERE ra.id IS NULL
        AND analysis_ids_json IS NOT NULL
        AND analysis_ids_json != '[]'
    `).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "alerts",
      check: "orphan_alerts",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} alert analysis IDs reference missing rag_analyses rows`,
    };
    findings.push(finding);
    if (cnt > 0) insertFeedbackIfNew(db, finding);
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "orphan_alerts",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // W-7: LanceDB vs SQLite rag_analyses row count drift
  try {
    const lanceCount = await getCountFn();
    const sqliteRow = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses"
    ).get();
    const sqliteCount = sqliteRow?.cnt ?? 0;
    const delta = Math.abs(lanceCount - sqliteCount);

    const finding: AuditFinding = {
      table: "lancedb",
      check: "lancedb_rag_count_drift",
      severity: delta > 100 ? "warning" : "info",
      rowsAffected: delta,
      action: delta > 100 ? "flagged" : "none",
      detail: `LanceDB=${lanceCount}, SQLite rag_analyses=${sqliteCount}, delta=${delta}`,
    };
    findings.push(finding);
    if (delta > 100) insertFeedbackIfNew(db, finding);
  } catch (err) {
    const errMsg = (err as Error).message ?? String(err);
    findings.push({
      table: "lancedb",
      check: "lancedb_rag_count_drift",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `LanceDB count check skipped: ${errMsg}`.slice(0, 200),
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalize: system_logs + audit_state + Telegram
// ─────────────────────────────────────────────────────────────────────────────

function writeSystemLog(
  db: Database,
  mode: "daily" | "weekly",
  findings: AuditFinding[],
): void {
  try {
    const hasCritical = findings.some((f) => f.severity === "critical");
    const hasWarning = findings.some((f) => f.severity === "warning");
    const level = hasCritical ? "error" : hasWarning ? "warn" : "info";

    const cleaned = findings.filter((f) => f.action === "auto_cleaned").reduce((s, f) => s + f.rowsAffected, 0);
    const warnings = findings.filter((f) => (f.action === "flagged" || f.action === "escalated") && f.severity === "warning").length;
    const criticals = findings.filter((f) => (f.action === "flagged" || f.action === "escalated") && f.severity === "critical").length;
    const message = `${mode === "weekly" ? "Weekly" : "Daily"} audit complete: ${cleaned} cleaned, ${warnings} warnings, ${criticals} criticals`;

    db.prepare(`
      INSERT INTO system_logs (timestamp, level, source, message, details_json)
      VALUES (datetime('now'), ?, 'data-auditor', ?, ?)
    `).run(level, message, JSON.stringify(findings));
  } catch { /* never fail the audit for a log write error */ }
}

function upsertAuditState(
  db: Database,
  mode: "daily" | "weekly",
  findings: AuditFinding[],
): void {
  try {
    const findingsJson = JSON.stringify(findings);
    if (mode === "daily") {
      db.prepare(`
        INSERT INTO audit_state (id, last_daily_audit_at, last_daily_findings)
        VALUES (1, datetime('now'), ?)
        ON CONFLICT(id) DO UPDATE SET
          last_daily_audit_at = excluded.last_daily_audit_at,
          last_daily_findings = excluded.last_daily_findings
      `).run(findingsJson);
    } else {
      db.prepare(`
        INSERT INTO audit_state (id, last_daily_audit_at, last_weekly_audit_at, last_daily_findings, last_weekly_findings)
        VALUES (1, datetime('now'), datetime('now'), ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          last_weekly_audit_at  = excluded.last_weekly_audit_at,
          last_weekly_findings  = excluded.last_weekly_findings
      `).run(findingsJson, findingsJson);
    }
  } catch { /* never fail the audit for a state write error */ }
}

async function maybeSendTelegram(
  mode: "daily" | "weekly",
  findings: AuditFinding[],
  db: Database,
  telegramFn: TelegramFn,
): Promise<void> {
  // Send conditions:
  //   - at least one auto_cleaned finding with rowsAffected > 0, OR
  //   - at least one "flagged" or "escalated" finding
  // Row count snapshots (action="none") do NOT trigger a Telegram send on their own.
  const hasIssues =
    findings.some((f) => f.action === "auto_cleaned" && f.rowsAffected > 0) ||
    findings.some((f) => f.action === "flagged" || f.action === "escalated");

  if (!hasIssues) return; // silent on clean run

  try {
    const msg = buildTelegramMessage(mode, findings, db);
    await telegramFn(msg);
  } catch { /* best-effort — never crash the audit for Telegram */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the daily audit (D-1 through D-10).
 *
 * @param db          - Optional injected Database (for testing). Defaults to getDb() singleton.
 * @param telegramFn  - Optional injected Telegram send function (for testing).
 * @returns Promise<AuditFinding[]>
 */
export async function runDailyAudit(
  db?: Database,
  telegramFn?: TelegramFn,
): Promise<AuditFinding[]> {
  const database = db ?? await defaultGetDb();
  const telegram = telegramFn ?? defaultSendTelegram;

  ensureAuditDependencies(database);

  const findings = runDailyChecks(database);

  writeSystemLog(database, "daily", findings);
  upsertAuditState(database, "daily", findings);
  await maybeSendTelegram("daily", findings, database, telegram);

  // Clean expired agent signals (Sprint 038)
  try {
    const { cleanExpired } = await import("../infrastructure/db/agentSignalStore.js");
    const removed = cleanExpired(database);
    if (removed > 0) {
      findings.push({ table: "agent_signals", check: "expired_cleanup", severity: "info", rowsAffected: removed, action: "auto_cleaned", detail: `Removed ${removed} expired signals` });
    }
  } catch { /* agent_signals table may not exist yet */ }

  return findings;
}

/**
 * Run the weekly deep audit (daily checks + W-1 through W-7).
 *
 * @param db          - Optional injected Database (for testing). Defaults to getDb() singleton.
 * @param telegramFn  - Optional injected Telegram send function (for testing).
 * @param getCountFn  - Optional injected LanceDB count function (for testing).
 * @returns Promise<AuditFinding[]>
 */
export async function runWeeklyAudit(
  db?: Database,
  telegramFn?: TelegramFn,
  getCountFn?: GetCountFn,
): Promise<AuditFinding[]> {
  const database = db ?? await defaultGetDb();
  const telegram = telegramFn ?? defaultSendTelegram;
  const getCount = getCountFn ?? defaultGetCount;

  ensureAuditDependencies(database);

  // Run daily checks first (weekly is a superset)
  const dailyFindings = runDailyChecks(database);

  // Run weekly-specific checks
  const weeklyFindings = await runWeeklyChecks(database, getCount);

  const allFindings = [...dailyFindings, ...weeklyFindings];

  // LanceDB compaction — reduce fragmentation (6000+ files → fewer, larger files)
  try {
    const { compactVectorStore } = await import("../infrastructure/rag/vectorstore.js");
    const result = await compactVectorStore();
    if (result) {
      allFindings.push({
        table: "lancedb",
        check: "compaction",
        severity: "info",
        rowsAffected: result.rowCount,
        action: "auto_cleaned",
        detail: `Compacted: ${result.beforeFiles} → ${result.afterFiles} data files, ${result.rowCount} vectors`,
      });
    }
  } catch { /* best-effort — don't block audit on compaction failure */ }

  writeSystemLog(database, "weekly", allFindings);
  upsertAuditState(database, "weekly", allFindings);
  await maybeSendTelegram("weekly", allFindings, database, telegram);

  return allFindings;
}
