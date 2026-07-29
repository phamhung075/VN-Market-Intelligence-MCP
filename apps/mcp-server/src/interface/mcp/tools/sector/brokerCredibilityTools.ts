/**
 * Task 915 — Broker Credibility MCP Tool
 *
 * Registers the `get_broker_credibility` tool on a McpServer.
 *
 * Given a broker name (+ optional base confidence), returns the discounted
 * confidence score based on currently-active SSC sanctions stored in the
 * `broker_sanctions` table.
 *
 * @module interface/mcp/tools/brokerCredibilityTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { listBrokerSanctions } from "../../../../infrastructure/db/brokerSanctionStore.js";
import { forecastConfidenceScore } from "../../../../domain/services/forecastConfidenceScore.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerBrokerCredibilityTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_broker_credibility",
    "Check if a Vietnamese securities broker (công ty chứng khoán) is currently under SSC sanction and compute a discounted forecast confidence. Use before trusting a broker's bullish sector / stock forecast.",
    {
      broker: z
        .string()
        .min(1)
        .describe("Broker name, e.g. 'Chứng khoán Tân Việt' or 'TVS'"),
      baseConfidence: z
        .coerce
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(1)
        .describe("Base confidence 0.0-1.0 (default 1.0) — the tool returns base * multiplier"),
      asOf: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Evaluation date YYYY-MM-DD (default: today)"),
    },
    // Redundant with the zod `.default(1)` above (belt-and-suspenders destructuring default).
    // metric-mask-allow: caller-facing input default per the docstring above, not a fabricated metric.
    async ({ broker, baseConfidence = 1, asOf }) => {
      const db = _testDb ?? getDb();
      const evalDate = asOf ?? todayIso();

      try {
        const sanctions = listBrokerSanctions(db, broker);
        const result = forecastConfidenceScore(
          broker,
          baseConfidence,
          sanctions,
          evalDate,
        );

        const lines: string[] = [];
        lines.push(`Broker: ${broker}`);
        lines.push(`Đánh giá ngày: ${evalDate}`);
        lines.push(`Confidence gốc: ${result.baseConfidence.toFixed(2)}`);
        lines.push(`Hệ số: ${result.multiplier.toFixed(2)}`);
        lines.push(`Confidence điều chỉnh: ${result.adjustedConfidence.toFixed(2)}`);
        lines.push(`Lý do: ${result.reason}`);
        if (result.activeSanction) {
          lines.push(
            `Chế tài: ${result.activeSanction.severity} (${result.activeSanction.sanctionStart}${
              result.activeSanction.sanctionEnd
                ? ` → ${result.activeSanction.sanctionEnd}`
                : " → mở"
            })`,
          );
          if (result.activeSanction.source) {
            lines.push(`Nguồn: ${result.activeSanction.source}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_broker_credibility] error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: "Lỗi khi truy vấn thông tin chế tài broker.",
            },
          ],
        };
      }
    },
  );
}
