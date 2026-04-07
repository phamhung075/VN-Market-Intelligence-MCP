/**
 * Task 245 — Policy Signals MCP Tool
 *
 * Registers the `get_policy_signals` tool on a McpServer.
 * Queries recent policy-related news and classifies them using policyImpactMapper.
 *
 * @module interface/mcp/tools/policyTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";
import { getDb } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";
import { classifyPolicy, type PolicySignal } from "../../../domain/services/policyImpactMapper.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface RagRow {
  id: string;
  created_at: string;
  source_title: string | null;
  summary: string | null;
  level: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function queryRecentNews(db: Database, days: number): RagRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  try {
    return db.prepare(`
      SELECT id, created_at, source_title, summary, level
      FROM rag_analyses
      WHERE created_at >= ?
        AND level IN ('country', 'domain', 'global')
      ORDER BY created_at DESC
      LIMIT 100
    `).all(cutoffStr) as RagRow[];
  } catch (err) {
    logger.error("[policyTools] query error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function formatPolicySignals(
  signals: Array<{ signal: PolicySignal; createdAt: string; title: string }>,
  sector: string | undefined,
): string {
  const filtered = sector
    ? signals.filter((s) =>
        s.signal.affectedSectors.some((sec) => sec.toLowerCase().includes(sector.toLowerCase()))
      )
    : signals;

  if (filtered.length === 0) {
    return `Không có tín hiệu chính sách${sector ? ` cho ngành ${sector}` : ""} trong khoảng thời gian này.`;
  }

  const lines: string[] = [`Tìm thấy ${filtered.length} tín hiệu chính sách:\n`];
  for (const { signal, createdAt, title } of filtered) {
    const dirLabel =
      signal.direction === "up" ? "TÍCH CỰC" :
      signal.direction === "down" ? "TIÊU CỰC" : "TRUNG TÍNH";

    lines.push(`[${dirLabel}] ${createdAt.slice(0, 16)} — ${signal.policyType}`);
    lines.push(`  Tóm tắt: ${signal.summary}`);
    lines.push(`  Ngành: ${signal.affectedSectors.join(", ")}`);
    lines.push(`  Cổ phiếu liên quan: ${signal.affectedStocks.join(", ")}`);
    lines.push(`  Nguồn: ${title}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_policy_signals` MCP tool.
 */
export function registerPolicyTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_policy_signals",
    "Get recent government policy signals (Nghị định, Thông tư, Quyết định) and their sector impact. Returns Vietnamese plain-text analysis.",
    {
      sector: z.string().optional().describe("Filter by sector (e.g. 'banking', 'real_estate'). Omit for all sectors."),
      days: z.coerce.number().int().min(1).max(90).optional().default(30).describe("Look-back window in days (default: 30)"),
    },
    async ({ sector, days = 30 }) => {
      const db = _testDb ?? getDb();

      try {
        const rows = queryRecentNews(db, days);

        const policySignals: Array<{ signal: PolicySignal; createdAt: string; title: string }> = [];
        for (const row of rows) {
          const title = row.source_title ?? "";
          const body = row.summary ?? "";
          const signal = classifyPolicy(title, body);
          if (signal) {
            policySignals.push({ signal, createdAt: row.created_at, title });
          }
        }

        const text = formatPolicySignals(policySignals, sector);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_policy_signals] error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [{ type: "text" as const, text: "Lỗi khi truy vấn tín hiệu chính sách." }],
        };
      }
    },
  );
}
