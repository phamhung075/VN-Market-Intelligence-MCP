/**
 * Feedback Tools — MCP tools for agent improvement feedback
 *
 * Allows cowork agents to submit improvement suggestions via Telegram.
 * Feedback is sent to the Vn-market-report channel (TELEGRAM_REPORT_ID).
 * No database storage — Telegram is the single source of truth.
 *
 * Tools registered:
 *   1. submit_feedback — send improvement suggestion to report channel
 *   2. get_feedback — deprecated (returns message pointing to Telegram)
 *
 * @module interface/mcp/tools/feedbackTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerFeedbackTools(server: McpServer): void {

  // ── 1. submit_feedback ──────────────────────────────────────────────────
  server.tool(
    "submit_feedback",
    "Submit an improvement suggestion to the Vn-market-report Telegram channel. " +
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

        // Send to REPORT channel (TELEGRAM_REPORT_ID) — single source of truth
        let reportSent = false;
        try {
          const { sendTelegramReport } = await import("../../../infrastructure/notifiers/telegram.js");
          const emoji = priority === "critical" ? "🚨" : priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
          const recipient = to.startsWith("@") ? to : `@${to}`;
          const msg = [
            `${emoji} [${priority.toUpperCase()}] ${recipient}`,
            `📋 ${category}`,
            `From: ${agent}`,
            ``,
            `${title}`,
            detail ? `\n${detail.slice(0, 500)}` : "",
            ``,
            `🕐 ${now.slice(0, 16).replace("T", " ")} UTC`,
          ].filter(Boolean).join("\n");
          reportSent = await sendTelegramReport(msg);
        } catch { /* best-effort */ }

        // Also send HIGH/CRITICAL to the user alert channel
        if (priority === "high" || priority === "critical") {
          try {
            const { sendTelegramMessage } = await import("../../../infrastructure/notifiers/telegram.js");
            const emoji = priority === "critical" ? "🚨" : "🔧";
            const msg = `${emoji} FEEDBACK từ ${agent}\n[${category}] ${title}\n${detail ? detail.slice(0, 200) : ""}`;
            await sendTelegramMessage(msg, { parseMode: "" });
          } catch { /* best-effort */ }
        }

        logger.info("[feedback] submitted via Telegram", { agent, category, title, priority, to, reportSent });

        return {
          content: [{
            type: "text" as const,
            text: `Feedback submitted: [${priority.toUpperCase()}] ${title}\n` +
              `Recipient: ${to}\n` +
              `Report channel: ${reportSent ? "sent" : "failed (check TELEGRAM_REPORT_ID)"}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  // ── 2. get_feedback — points to Telegram channel ───────────────────────
  server.tool(
    "get_feedback",
    "Feedback is now managed via the Vn-market-report Telegram channel. " +
      "Read reports directly from the channel. This tool returns a reminder.",
    {
      status: z.enum(["new", "reviewed", "implemented", "all"]).default("new")
        .describe("Ignored — feedback is on Telegram now"),
      limit: z.number().int().min(1).max(50).default(20)
        .describe("Ignored — feedback is on Telegram now"),
    },
    async () => {
      return {
        content: [{
          type: "text" as const,
          text: "Feedback has moved to the Vn-market-report Telegram channel.\n" +
            "Read reports directly from: https://t.me/+gXd3gCcD5IhmMzY0\n" +
            "Use send_telegram_report to communicate with the team.\n" +
            "Use submit_feedback to send new improvement suggestions.",
        }],
      };
    },
  );
}
