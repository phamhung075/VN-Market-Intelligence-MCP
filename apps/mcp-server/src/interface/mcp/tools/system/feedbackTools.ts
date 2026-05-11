/**
 * Feedback Tools — MCP tools for agent improvement feedback
 *
 * Allows cowork agents to submit improvement suggestions via Telegram.
 * Feedback is sent to the BUG channel (TELEGRAM_REPORT_BUG_CHANNEL_ID) and
 * persisted in telegram_reports for the Dev Team autonomous loop.
 *
 * Tools registered:
 *   1. submit_feedback — send improvement suggestion to report channel
 *   2. get_feedback — deprecated (returns message pointing to Telegram)
 *
 * @module interface/mcp/tools/feedbackTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1317: Retry helper for transient Telegram API failures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retry a function up to `maxRetries` times on transient errors.
 *
 * Transient errors: ECONNRESET, ETIMEDOUT, HTTP 429 (rate limit), HTTP 503.
 * Non-transient errors (e.g. invalid token, 401, 404) fail immediately.
 *
 * Exported for unit testing.
 *
 * @param fn         - Async function to execute
 * @param maxRetries - Number of retries after first failure (1 = 2 total attempts)
 * @param delayMs    - Delay in milliseconds between attempts
 */
export async function retryOnTransient<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      const msg = e instanceof Error ? e.message : String(e);
      const isTransient =
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("429") ||
        msg.includes("503");

      if (!isTransient || attempt === maxRetries) {
        throw e;
      }

      logger.warn("[feedback] Telegram send failed, retrying...", {
        attempt: attempt + 1,
        error: msg,
        delayMs,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error("retryOnTransient: unknown error");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerFeedbackTools(server: McpServer): void {

  // ── 1. submit_feedback ──────────────────────────────────────────────────
  server.tool(
    "submit_feedback",
    "Submit an improvement suggestion to the BUG Telegram channel (TELEGRAM_REPORT_BUG_CHANNEL_ID). " +
      "Use this when you find: missing cascade rules, wrong trade mappings, " +
      "data extraction errors, alert quality issues, or any system gap. " +
      "Tag a recipient: @team (all), @po (Product Owner), @dev, @qa, etc.",
    {
      agent: z.string().min(1).max(30)
        .describe("Your agent name (e.g. 'news-scout', 'market-watcher', 'unified-agent')"),
      category: z.enum([
        "cascade_rule_gap",
        "trade_map_gap",
        "sentiment_error",
        "data_extraction_error",
        "alert_quality",
        "threshold_issue",
        "sector_peer_issue",
        "new_indicator",
        "performance_issue",
        "other",
      ]).describe("Category of the improvement suggestion"),
      title: z.string().min(5).max(200)
        .describe("Short title of the issue"),
      detail: z.string().max(1000).optional()
        .describe("Detailed description: what happened, what should happen, evidence"),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium")
        .describe("Priority: critical=blocks analysis, high=wrong results, medium=improvement, low=nice-to-have"),
      to: z.string().max(30).default("@po")
        .describe("Recipient: @team, @po, @dev, @qa, @ba, @architect"),
    },
    async ({ agent, category, title, detail, priority, to }) => {
      try {
        const now = new Date().toISOString();

        // ── Task 1860b: dedup check before Telegram send ──────────────────
        const { insertReportDeduped } = await import("../../../../infrastructure/db/telegramReportStore.js");
        const { getDb } = await import("../../../../infrastructure/db/index.js");
        const db = getDb();

        const emoji = priority === "critical" ? "🚨" : priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
        const recipient = to.startsWith("@") ? to : `@${to}`;
        const headerFooter = [
          `${emoji} [${priority.toUpperCase()}] ${recipient}`,
          `📋 ${category}`,
          `From: ${agent}`,
          `${title}`,
          `🕐 ${now.slice(0, 16).replace("T", " ")} UTC`,
        ].join("\n");

        const detailMaxChars = Math.max(1000, 4096 - headerFooter.length - 100);
        const msg = [
          headerFooter,
          detail ? `\n${detail.slice(0, detailMaxChars)}` : "",
        ].filter(Boolean).join("\n");

        // Use msg as the dedup key (first 50 chars of full message)
        const dedupResult = insertReportDeduped(db, msg, agent, 0, "normal");
        if (!dedupResult.inserted) {
          logger.info("[feedback] suppressed duplicate", {
            agent, category, title, suppressedBy: dedupResult.suppressedBy,
          });
          return {
            content: [{
              type: "text" as const,
              text: `Duplicate report suppressed (existing report #${dedupResult.suppressedBy} from ${dedupResult.suppressedAt})`,
            }],
          };
        }

        // Send to BUG channel (TELEGRAM_REPORT_BUG_CHANNEL_ID) — single source of truth
        let msgId = 0;
        try {
          const { sendTelegramBug } = await import("../../../../infrastructure/notifiers/telegram.js");
          // Bug 1317: retry once with 2s delay on transient Telegram API failures.
          msgId = await retryOnTransient(() => sendTelegramBug(msg), 1, 2000);
        } catch { /* best-effort after retry */ }

        // BUG channel is for problems/hotfix only — never cross-post to MARKET

        logger.info("[feedback] submitted via Telegram", { agent, category, title, priority, to, msgId });

        return {
          content: [{
            type: "text" as const,
            text: `Feedback submitted: [${priority.toUpperCase()}] ${title}\n` +
              `Recipient: ${to}\n` +
              `BUG channel: ${msgId > 0 ? "sent" : "failed (check TELEGRAM_REPORT_BUG_CHANNEL_ID)"}\n` +
              `message_id: ${msgId} (process_telegram_report removes it when resolved)`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  // ── 2. get_feedback — REMOVED (sprint-036 task 230)
  // Feedback is managed via the BUG channel. Use read_telegram_reports instead.
  // Implementation kept below for reference; not registered as MCP tool.
}
