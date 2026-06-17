/**
 * System Tools — MCP diagnostic + log tools for AI self-debugging
 *
 * Tools registered:
 *   1. get_system_status  — merged: DB status + source health + data freshness + errors
 *
 * Internal helpers (exported for cron jobs and tests):
 *   - getSystemStatus()  — pure async function returning the merged text report
 *
 * @module interface/mcp/tools/systemTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { getAllBreakerStats } from "../../../../infrastructure/circuitBreakerRegistry.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger, getErrorSummary } from "../../../../infrastructure/logger.js";
import { globalSourceTracker, formatSourceHealthTable } from "../news-analysis/sourceHealthTools.js";
import { getDataFreshness } from "../market-data/dataFreshnessTools.js";
import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type
// ─────────────────────────────────────────────────────────────────────────────

interface SystemLogRow {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  resolved: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-section bounded fetch deadline.
 *
 * Races `work` against a `budgetMs` timer. If `work` resolves within the
 * budget, its value is returned unchanged. If the budget expires first, an
 * honest "timeout/unknown" diagnostic string is returned — never synthetic
 * "ok", never a hang.
 *
 * Applied GENERICALLY to EVERY async section in getSystemStatus(); no source
 * or section is whitelisted or special-cased. A slow source degrades cleanly
 * rather than blocking the aggregate.
 *
 * Exported for unit-testing (FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD).
 *
 * @param label    - Section label for the timeout message (diagnostic only).
 * @param work     - The async work to race.
 * @param budgetMs - Per-section deadline in milliseconds (default: 3000).
 * @returns The work result, or a timeout diagnostic string.
 */
export function withSectionDeadline(
  label: string,
  work: Promise<string>,
  budgetMs = 3000,
): Promise<string> {
  const deadline = new Promise<string>((resolve) =>
    setTimeout(
      () =>
        resolve(
          `[${label}] timeout/unknown — section exceeded ${budgetMs}ms deadline`,
        ),
      budgetMs,
    ),
  );
  return Promise.race([work, deadline]);
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Format uptime seconds into d h m s. */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Get DB file size, returns null if not accessible (e.g. :memory:). */
function getDbFileSize(dbPath: string): string {
  try {
    const abs = resolve(process.cwd(), dbPath);
    const stat = statSync(abs);
    return formatBytes(stat.size);
  } catch {
    return "N/A";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (exported so cron jobs and tests can call it directly)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for getSystemStatus.
 */
export interface SystemStatusOptions {
  /** When true, includes the RECENT ERRORS section from the global log. Default: true. */
  includeErrors: boolean;
  /** Number of WARN/ERROR log lines to include in the errors section. Default: 10. */
  errorLines: number;
}

/**
 * Assemble the merged system status report.
 *
 * Calls the underlying implementations of the four previously-separate tools:
 *   1. DB STATUS     — circuit breaker, WAL, alert stats, audit, sigma readiness
 *   2. SOURCE HEALTH — per-source ok/degraded/down (in-memory tracker)
 *   3. DATA FRESHNESS — per-table staleness from SQLite
 *   4. RECENT ERRORS  — last N WARN/ERROR lines from global.log (optional)
 *
 * @param opts - Control options.
 * @returns Formatted plain-text report with labeled sections.
 */
/**
 * Per-section deadline budget in milliseconds.
 *
 * 3 000 ms is comfortably below the market-watcher smoke-probe / gateway
 * timeout (~60 s) and well within any reasonable interactive SLA.  Each of
 * the four sections in getSystemStatus() races against this budget
 * independently — so the theoretical worst-case wall time is
 * 4 × SECTION_DEADLINE_MS  ≈  12 s, still safely under the 60 s gateway limit.
 */
const SECTION_DEADLINE_MS = 3_000;

export async function getSystemStatus(opts: SystemStatusOptions): Promise<string> {
  const sections: string[] = [];

  // ── Section 0: VN TRADING WINDOW banner ──────────────────────────────────
  // Analysis agents must distinguish "outside trading window (expected empty)"
  // from "inside trading window (data feed broken)" when reading freshness.
  sections.push(`=== VN TRADING WINDOW ===\n${tradingWindowLabel()}`);

  // ── Section 1: DB STATUS ──────────────────────────────────────────────────
  // Wrapped in withSectionDeadline so a slow/locked DB cannot block the
  // aggregate beyond SECTION_DEADLINE_MS.
  sections.push("=== DB STATUS ===");
  sections.push(
    await withSectionDeadline(
      "DB_STATUS",
      (async (): Promise<string> => {
        await initDatabase();
        const db = getDb();

        const dbLines: string[] = [
          `Generated: ${new Date().toISOString()}`,
          `uptime: ${formatUptime(Math.floor(process.uptime()))}`,
          "",
        ];

        // Circuit Breaker Status
        dbLines.push("--- Circuit Breaker Status ---");
        const stats = getAllBreakerStats();
        const stateIcon = (s: string) => s === "closed" ? "[OK]" : s === "open" ? "[OPEN]" : "[HALF]";
        for (const [source, info] of Object.entries(stats)) {
          dbLines.push(
            `  ${source.padEnd(20)} ${stateIcon(info.state).padEnd(8)} failures: ${info.failures}`,
          );
        }
        dbLines.push("");

        // Database Info
        dbLines.push("--- Database ---");
        const dbPath = Bun.env["DB_PATH"] ?? "./data/market.db";
        dbLines.push(`  path:  ${dbPath}`);
        dbLines.push(`  size:  ${getDbFileSize(dbPath)}`);
        const walPath = `${dbPath}-wal`;
        dbLines.push(`  WAL:   ${getDbFileSize(walPath)}`);
        dbLines.push("");

        // Recent System Errors (last 10 unresolved from SQLite)
        dbLines.push("--- Recent System Errors (last 10 unresolved) ---");
        let errorRows: SystemLogRow[] = [];
        try {
          errorRows = db
            .query<SystemLogRow, []>(
              `SELECT id, timestamp, level, source, message, resolved
               FROM system_logs
               WHERE level IN ('error', 'warn') AND resolved = 0
               ORDER BY timestamp DESC
               LIMIT 10`,
            )
            .all();
        } catch {
          // system_logs table may not exist yet
        }

        if (errorRows.length === 0) {
          dbLines.push("  (none)");
        } else {
          for (const row of errorRows) {
            const ts = row.timestamp.slice(0, 19);
            dbLines.push(`  [${row.level.toUpperCase()}] ${ts}  ${row.source}: ${row.message.slice(0, 120)}`);
          }
        }
        dbLines.push("");

        // Alert Stats (last 24h)
        dbLines.push("--- Alert Stats (last 24h) ---");
        try {
          const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
          const totalAlerts = db.query<{ cnt: number }, [string]>(
            "SELECT COUNT(*) as cnt FROM alerts WHERE triggered_at >= ?",
          ).get(since24h);
          const highCritical = db.query<{ cnt: number }, [string]>(
            "SELECT COUNT(*) as cnt FROM alerts WHERE triggered_at >= ? AND severity IN ('high', 'critical')",
          ).get(since24h);
          const unnotified = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM alerts WHERE notified_telegram = 0 AND severity IN ('high', 'critical')",
          ).get();
          const lastTelegram = db.query<{ triggered_at: string }, []>(
            "SELECT triggered_at FROM alerts WHERE notified_telegram = 1 ORDER BY triggered_at DESC LIMIT 1",
          ).get();

          dbLines.push(`  Total (24h):        ${totalAlerts?.cnt ?? 0}`);
          dbLines.push(`  HIGH/CRITICAL (24h): ${highCritical?.cnt ?? 0}`);
          dbLines.push(`  Unnotified:         ${unnotified?.cnt ?? 0}`);
          // NOTE: this only tracks alerts-table notifications (price/volume alerts).
          // Briefings, digests, feedback, WORK/BUG messages do NOT update this row.
          // "never" here means "no HIGH/CRITICAL alert has been Telegram-notified",
          // NOT "Telegram is broken". See telegramEnvStatus below for liveness.
          dbLines.push(`  Last alert→Telegram: ${lastTelegram?.triggered_at ?? "never (no alert notified yet)"}`);
        } catch {
          dbLines.push("  (alerts table not ready)");
        }
        dbLines.push("");

        // Telegram env (liveness) — reads env at call-time, no secrets printed.
        dbLines.push("--- Telegram Env (live) ---");
        const telegramEnv = {
          TELEGRAM_BOT_TOKEN: (Bun.env.TELEGRAM_BOT_TOKEN ?? "").length > 0,
          TELEGRAM_INFO_MARKET_GROUP_ID: (Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID ?? "").length > 0,
          TELEGRAM_INFO_WORK_CHANNEL_ID: (Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID ?? "").length > 0,
          TELEGRAM_REPORT_BUG_CHANNEL_ID: (Bun.env.TELEGRAM_REPORT_BUG_CHANNEL_ID ?? "").length > 0,
        };
        for (const [k, v] of Object.entries(telegramEnv)) {
          dbLines.push(`  ${k}: ${v ? "SET" : "MISSING"}`);
        }
        dbLines.push("");

        // DB Audit
        dbLines.push("--- DB Audit ---");
        try {
          const auditRow = db.query<{
            last_daily_audit_at: string | null;
            last_weekly_audit_at: string | null;
          }, []>(
            "SELECT last_daily_audit_at, last_weekly_audit_at FROM audit_state WHERE id = 1",
          ).get();

          const pendingFeedback = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new'",
          ).get();
          const openWarnings = db.query<{ cnt: number }, []>(
            "SELECT COUNT(*) as cnt FROM agent_feedback WHERE status = 'new' AND priority IN ('high', 'critical')",
          ).get();

          dbLines.push(`  last_daily_audit:   ${auditRow?.last_daily_audit_at ?? "never"}`);
          dbLines.push(`  last_weekly_audit:  ${auditRow?.last_weekly_audit_at ?? "never"}`);
          dbLines.push(`  pending_feedback:   ${pendingFeedback?.cnt ?? 0} new items`);
          dbLines.push(`  open_warnings:      ${openWarnings?.cnt ?? 0} high/critical items`);
        } catch {
          dbLines.push("  (audit_state table not yet created — no audit has run)");
        }
        dbLines.push("");

        // Auto-tracked Indicators
        dbLines.push("--- Auto-tracked Indicators ---");
        try {
          const indicators = db.query<{ indicator: string; value: number; cnt: number }, []>(
            `SELECT indicator, value, (SELECT COUNT(*) FROM tracked_indicators t2 WHERE t2.indicator = t1.indicator) as cnt
             FROM tracked_indicators t1
             WHERE extracted_at = (SELECT MAX(extracted_at) FROM tracked_indicators t3 WHERE t3.indicator = t1.indicator)
             GROUP BY indicator ORDER BY cnt DESC LIMIT 10`,
          ).all();
          if (indicators.length === 0) {
            dbLines.push("  (none yet — will populate after first news cycle)");
          } else {
            for (const ind of indicators) {
              dbLines.push(`  ${ind.indicator.padEnd(22)} ${String(ind.value).padEnd(12)} (${ind.cnt} data points)`);
            }
          }
        } catch {
          dbLines.push("  (table not ready)");
        }
        dbLines.push("");

        // Threshold Readiness (σ data)
        dbLines.push("--- Threshold Readiness (σ data) ---");
        try {
          const commodityCount = db.query<{ cnt: number }, []>(
            "SELECT COUNT(DISTINCT fetched_at) as cnt FROM commodity_prices_history",
          ).get();
          const sbvCount = db.query<{ cnt: number }, []>(
            "SELECT COUNT(DISTINCT fetched_at) as cnt FROM sbv_rates_history",
          ).get();
          const need = 30;
          const cPts = commodityCount?.cnt ?? 0;
          const sPts = sbvCount?.cnt ?? 0;
          const cReady = cPts >= need;
          const sReady = sPts >= need;
          dbLines.push(`  Commodity σ:  ${cPts}/${need} points ${cReady ? "✅ READY" : `⏳ ${need - cPts} more needed`}`);
          dbLines.push(`  SBV rates σ:  ${sPts}/${need} points ${sReady ? "✅ READY" : `⏳ ${need - sPts} more needed`}`);

          const stockCounts = db.query<{ code: string; cnt: number }, []>(
            `SELECT code, COUNT(*) as cnt FROM market_prices_history
             GROUP BY code ORDER BY cnt DESC LIMIT 10`,
          ).all();
          if (stockCounts.length > 0) {
            for (const s of stockCounts) {
              dbLines.push(`  ${s.code.padEnd(8)} σ:  ${s.cnt}/${need} ${s.cnt >= need ? "✅" : "⏳"}`);
            }
          }
        } catch {
          dbLines.push("  (history tables not ready)");
        }
        dbLines.push("");

        // Summary
        const openBreakers = Object.values(stats).filter(s => s.state === "open").length;
        const halfOpenBreakers = Object.values(stats).filter(s => s.state === "half-open").length;
        dbLines.push("--- Summary ---");
        dbLines.push(`  Open circuits:      ${openBreakers}`);
        dbLines.push(`  Half-open circuits: ${halfOpenBreakers}`);
        dbLines.push(`  Unresolved errors:  ${errorRows.length}`);

        return dbLines.join("\n");
      })().catch((err: unknown) => {
        logger.error("[getSystemStatus] DB STATUS error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error retrieving DB status: ${(err as Error).message}`;
      }),
      SECTION_DEADLINE_MS,
    ),
  );

  // ── Section 2: SOURCE HEALTH ──────────────────────────────────────────────
  // Wrapped in withSectionDeadline for uniform deadline enforcement across all
  // sections (getAllHealth() is synchronous/in-memory but the wrapper ensures
  // no future async refactor can silently remove the bound).
  sections.push("\n=== SOURCE HEALTH ===");
  sections.push(
    await withSectionDeadline(
      "SOURCE_HEALTH",
      (async (): Promise<string> => {
        const sources = globalSourceTracker.getAllHealth();
        return formatSourceHealthTable(sources);
      })().catch((err: unknown) => {
        logger.error("[getSystemStatus] SOURCE HEALTH error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error retrieving source health: ${(err as Error).message}`;
      }),
      SECTION_DEADLINE_MS,
    ),
  );

  // ── Section 3: DATA FRESHNESS ─────────────────────────────────────────────
  // Wrapped in withSectionDeadline so a slow/locked DB cannot block the
  // aggregate beyond SECTION_DEADLINE_MS.
  sections.push("\n=== DATA FRESHNESS ===");
  sections.push(
    await withSectionDeadline(
      "DATA_FRESHNESS",
      (async (): Promise<string> => {
        await initDatabase();
        const db = getDb();
        return getDataFreshness(db);
      })().catch((err: unknown) => {
        logger.error("[getSystemStatus] DATA FRESHNESS error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error retrieving data freshness: ${(err as Error).message}`;
      }),
      SECTION_DEADLINE_MS,
    ),
  );

  // ── Section 4: RECENT ERRORS (optional) ──────────────────────────────────
  // Wrapped in withSectionDeadline for uniform enforcement — getErrorSummary
  // reads from the global in-memory log buffer (synchronous), but the wrapper
  // provides a safety net for any future async refactor.
  if (opts.includeErrors) {
    sections.push("\n=== RECENT ERRORS ===");
    sections.push(
      await withSectionDeadline(
        "RECENT_ERRORS",
        (async (): Promise<string> => {
          return getErrorSummary(opts.errorLines);
        })().catch((err: unknown) => {
          logger.error("[getSystemStatus] RECENT ERRORS error", {
            error: err instanceof Error ? err.message : String(err),
          });
          return `Error retrieving error log: ${(err as Error).message}`;
        }),
        SECTION_DEADLINE_MS,
      ),
    );
  }

  return sections.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register system MCP tools.
 *
 * Registers: get_system_status (merged from get_system_health + get_source_health
 * + get_data_freshness + get_error_summary).
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerSystemTools(server: McpServer): void {

  // ── get_system_status — merged 4-in-1 diagnostic ────────────────────────
  server.tool(
    "get_system_status",
    "Full system diagnostic — DB status, source health, data freshness, and recent errors " +
      "in a single call. Replaces the four separate tools: get_system_health, get_source_health, " +
      "get_data_freshness, and get_error_summary.",
    {
      includeErrors: z.boolean().default(true)
        .describe("Include recent WARN/ERROR log lines section (default: true)"),
      errorLines: z.coerce.number().int().min(1).max(200).default(10)
        .describe("Number of WARN/ERROR log lines to include when includeErrors=true (default: 10)"),
    },
    async ({ includeErrors, errorLines }) => {
      try {
        const text = await getSystemStatus({
          includeErrors: includeErrors ?? true,
          errorLines: errorLines ?? 10,
        });
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error("[get_system_status] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving system status: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── get_pipeline_health — MOVED to pipelineHealthTools.ts (task 1367)
  // OHLCV-aware implementation supersedes the old news-pipeline-only version.

  // ── get_global_log — REMOVED (sprint-036 task 230)
  // Internal log access is forbidden for AI agents.

  // ── get_tool_log — REMOVED (sprint-036 task 230)
  // Internal log access is forbidden for AI agents.

  // ── get_system_health — REMOVED (sprint-036 task 234, merged into get_system_status)
  // ── get_error_summary — REMOVED (sprint-036 task 234, merged into get_system_status)
  // ── get_source_health — REMOVED (sprint-036 task 234, merged into get_system_status)
  // ── get_data_freshness — REMOVED (sprint-036 task 234, merged into get_system_status)
}
