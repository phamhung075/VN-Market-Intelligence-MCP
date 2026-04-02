/**
 * Task 233 — System Changelog MCP Tools
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. log_fix          — Dev Team logs a fix to the system_changelog table
 *   2. get_recent_fixes — Analysis Team checks recently-fixed issues before re-reporting
 *
 * Purpose (Gap 2 fix):
 *   When the Analysis Team is about to report a problem, they should first
 *   call get_recent_fixes to see if it was already addressed by the Dev Team.
 *   This avoids duplicate work and noisy Report Channel traffic.
 *
 * @module interface/mcp/tools/changelogTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import {
  ensureChangelogTable,
  insertChangelog,
  getRecentChangelogs,
  type ChangelogEntry,
} from "../../../infrastructure/db/changelogStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a ChangelogEntry as a human-readable Vietnamese/English string
 * for inclusion in the get_recent_fixes response.
 */
function formatEntry(entry: ChangelogEntry, index: number): string {
  const lines: string[] = [
    `${index + 1}. [${entry.fix_type.toUpperCase()}] ${entry.title}`,
    `   fixed_at: ${entry.fixed_at}`,
  ];
  if (entry.detail) {
    lines.push(`   detail: ${entry.detail}`);
  }
  if (entry.files.length > 0) {
    lines.push(`   files: ${entry.files.join(", ")}`);
  }
  if (entry.commit_hash) {
    lines.push(`   commit: ${entry.commit_hash}`);
  }
  if (entry.related_feedback_id != null) {
    lines.push(`   feedback_id: ${entry.related_feedback_id}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the log_fix and get_recent_fixes MCP tools.
 *
 * @param server - McpServer instance to register tools on
 */
export function registerChangelogTools(server: McpServer): void {
  // ── log_fix ───────────────────────────────────────────────────────────────
  server.tool(
    "log_fix",
    "Dev Team ghi lai mot sua loi vao bang system_changelog. " +
      "Analysis Team co the dung get_recent_fixes de kiem tra truoc khi bao cao lai van de da duoc xu ly.",
    {
      title: z
        .string()
        .min(1)
        .describe("Ten ngan mo ta sua loi (bat buoc)"),
      detail: z
        .string()
        .optional()
        .default("")
        .describe("Mo ta chi tiet ve thay doi (tuy chon)"),
      fix_type: z
        .string()
        .optional()
        .default("bugfix")
        .describe("Loai sua loi: 'bugfix', 'hotfix', 'feature', 'docs', 'refactor' (mac dinh: bugfix)"),
      files: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Danh sach cac file da thay doi (duong dan tuong doi)"),
      commit_hash: z
        .string()
        .optional()
        .describe("Git commit hash tuong ung (tuy chon)"),
      related_feedback_id: z
        .number()
        .int()
        .optional()
        .describe("ID cua bao cao telegram_reports lien quan (tuy chon)"),
    },
    async ({ title, detail, fix_type, files, commit_hash, related_feedback_id }) => {
      try {
        await initDatabase();
        const db = getDb();
        ensureChangelogTable(db);

        const input: Parameters<typeof insertChangelog>[1] = {
          fixType: fix_type ?? "bugfix",
          title,
          detail: detail ?? "",
          files: files ?? [],
        };
        if (commit_hash !== undefined) input.commitHash = commit_hash;
        if (related_feedback_id !== undefined) input.relatedFeedbackId = related_feedback_id;
        const id = insertChangelog(db, input);

        return {
          content: [
            {
              type: "text" as const,
              text: `Fix logged successfully (id=${id}): ${title}`,
            },
          ],
        };
      } catch (err) {
        console.error("[log_fix] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi ghi sua loi: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── get_recent_fixes ──────────────────────────────────────────────────────
  server.tool(
    "get_recent_fixes",
    "Lay danh sach cac sua loi gan nhat tu Dev Team. " +
      "Analysis Team nen goi tool nay truoc khi bao cao van de de tranh bao cao trung lap. " +
      "Tra ve cac sua loi moi nhat truoc (DESC).",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe("So ban ghi toi da tra ve (1-50, mac dinh 10)"),
    },
    async ({ limit }) => {
      try {
        await initDatabase();
        const db = getDb();
        ensureChangelogTable(db);

        const resolvedLimit = limit ?? 10;
        const entries = getRecentChangelogs(db, resolvedLimit);

        if (entries.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Chua co sua loi nao duoc ghi lai.",
              },
            ],
          };
        }

        const formatted = entries.map(formatEntry).join("\n\n");
        const header = `=== ${entries.length} sua loi gan nhat (moi nhat truoc) ===\n\n`;

        return {
          content: [
            {
              type: "text" as const,
              text: header + formatted,
            },
          ],
        };
      } catch (err) {
        console.error("[get_recent_fixes] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi doc lich su sua loi: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
