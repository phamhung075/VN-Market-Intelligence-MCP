/**
 * Feedback Tools — MCP tools for agent improvement feedback
 *
 * Allows cowork agents to submit improvement suggestions directly
 * to the server via MCP. Feedback is stored in SQLite and optionally
 * sent to Telegram for the user to review.
 *
 * Tools registered:
 *   1. submit_feedback — agent submits an improvement suggestion
 *   2. get_feedback — read recent feedback (for digest writer weekly review)
 *
 * @module interface/mcp/tools/feedbackTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

function ensureFeedbackTable(): void {
  const db = getDb();
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
    CREATE INDEX IF NOT EXISTS idx_feedback_agent ON agent_feedback(agent);
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerFeedbackTools(server: McpServer): void {

  // ── 1. submit_feedback ──────────────────────────────────────────────────
  server.tool(
    "submit_feedback",
    "Submit an improvement suggestion for the VN Market Intelligence system. " +
      "Use this when you find: missing cascade rules, wrong trade mappings, " +
      "data extraction errors, alert quality issues, or any system gap. " +
      "Feedback is stored in the database and sent to the user via Telegram.",
    {
      agent: z.string().min(1).max(30)
        .describe("Your agent name (e.g. 'news-scout', 'market-watcher', 'alert-commander')"),
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
        .describe("Short title of the issue (e.g. 'Missing cascade rule for EU tariff on steel')"),
      detail: z.string().max(1000).optional()
        .describe("Detailed description: what happened, what should happen, evidence"),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium")
        .describe("Priority: critical=blocks analysis, high=wrong results, medium=improvement, low=nice-to-have"),
    },
    async ({ agent, category, title, detail, priority }) => {
      try {
        await initDatabase();
        ensureFeedbackTable();
        const db = getDb();
        const now = new Date().toISOString();

        db.prepare(
          `INSERT INTO agent_feedback (agent, category, title, detail, priority, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'new', ?)`,
        ).run(agent, category, title, detail ?? "", priority, now);

        // Send HIGH/CRITICAL feedback to Telegram immediately
        if (priority === "high" || priority === "critical") {
          try {
            const { sendTelegramMessage } = await import("../../../infrastructure/notifiers/telegram.js");
            const emoji = priority === "critical" ? "🚨" : "🔧";
            const msg = `${emoji} FEEDBACK từ ${agent}\n[${category}] ${title}\n${detail ? detail.slice(0, 200) : ""}`;
            await sendTelegramMessage(msg, { parseMode: "" });
          } catch { /* best-effort */ }
        }

        logger.info("[feedback] submitted", { agent, category, title, priority });

        return {
          content: [{
            type: "text" as const,
            text: `Feedback submitted: [${priority.toUpperCase()}] ${title}\nStored in database. ${priority === "high" || priority === "critical" ? "Sent to Telegram." : "Will appear in weekly review."}`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  // ── 2. get_feedback ─────────────────────────────────────────────────────
  server.tool(
    "get_feedback",
    "Read recent agent feedback. Use this for weekly reviews or to check " +
      "what improvements have been suggested by the analysis team.",
    {
      status: z.enum(["new", "reviewed", "implemented", "all"]).default("new")
        .describe("Filter by status"),
      limit: z.number().int().min(1).max(50).default(20)
        .describe("Max number of feedback items to return"),
    },
    async ({ status, limit }) => {
      try {
        await initDatabase();
        ensureFeedbackTable();
        const db = getDb();

        const whereClause = status === "all" ? "" : `WHERE status = '${status}'`;
        const rows = db
          .prepare(
            `SELECT * FROM agent_feedback ${whereClause} ORDER BY created_at DESC LIMIT ?`,
          )
          .all(limit) as Array<{
            id: number; agent: string; category: string; title: string;
            detail: string; priority: string; status: string; created_at: string;
          }>;

        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No ${status} feedback found.` }],
          };
        }

        const lines: string[] = [
          `=== Agent Feedback (${status}) — ${rows.length} items ===`,
          "",
        ];

        // Group by category
        const byCategory = new Map<string, typeof rows>();
        for (const r of rows) {
          const list = byCategory.get(r.category) ?? [];
          list.push(r);
          byCategory.set(r.category, list);
        }

        for (const [cat, items] of byCategory) {
          lines.push(`--- ${cat} (${items.length}) ---`);
          for (const item of items) {
            const pIcon = item.priority === "critical" ? "🚨" : item.priority === "high" ? "🔴" : item.priority === "medium" ? "🟡" : "🟢";
            lines.push(`  ${pIcon} [${item.agent}] ${item.title}`);
            if (item.detail) lines.push(`    ${item.detail.slice(0, 100)}`);
          }
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
