/**
 * Task 271 — Pharma MCP Tools
 *
 * Interface layer: registers the get_pharma_signals tool.
 *
 * Tool registered:
 *   - get_pharma_signals — query recent pharma events (drug approvals, outbreaks,
 *     tenders, price regulation, FDI) with optional stock filter and day lookback.
 *
 * Layer: interface/mcp/tools — may import from infrastructure/ and domain/.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import {
  initPharmaStore,
  getPharmaEvents,
  type PharmaEventRecord,
} from "../../../infrastructure/db/pharmaStore.js";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map event_type to a Vietnamese label. */
const EVENT_TYPE_LABEL: Record<string, string> = {
  drug_approval: "Phê duyệt thuốc",
  hospital_tender: "Đấu thầu bệnh viện",
  outbreak: "Dịch bệnh / Outbreak",
  price_regulation: "Quy định giá thuốc",
  fdi_pharma: "FDI / M&A Dược phẩm",
};

/** Map severity to Vietnamese emoji-free label. */
const SEVERITY_LABEL: Record<string, string> = {
  low: "[THAP]",
  medium: "[TRUNG BINH]",
  high: "[CAO]",
  critical: "[NGIEM TRONG]",
};

/**
 * Format a single pharma event row as a text block.
 */
function formatEvent(row: PharmaEventRecord): string {
  const lines: string[] = [];
  const typeLabel = EVENT_TYPE_LABEL[row.event_type] ?? row.event_type;
  const severityLabel = SEVERITY_LABEL[row.severity] ?? row.severity.toUpperCase();
  const date = row.created_at.slice(0, 10);

  lines.push(`${severityLabel} ${typeLabel} | ${date}`);
  if (row.stock_code) lines.push(`  Ma co phieu : ${row.stock_code}`);
  if (row.drug_name) lines.push(`  Ten thuoc    : ${row.drug_name}`);
  if (row.manufacturer) lines.push(`  Nha san xuat: ${row.manufacturer}`);
  if (row.approval_date) lines.push(`  Ngay phe duyet: ${row.approval_date}`);
  lines.push(`  Mo ta        : ${row.description}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register pharma MCP tools on the given McpServer instance.
 *
 * @param server - McpServer to register on
 * @param dbOverride - Optional injected DB (for testing); defaults to getDb()
 */
export function registerPharmaTools(server: McpServer, dbOverride?: Database): void {
  // ── get_pharma_signals ─────────────────────────────────────────────────────
  server.tool(
    "get_pharma_signals",
    "Get recent pharma sector signals: drug approvals (DAV), disease outbreaks, hospital tenders, price regulations, FDI. Filter by stock code and time window.",
    {
      stock: z
        .string()
        .optional()
        .describe(
          "Filter by stock code (e.g. 'DHG', 'IMP', 'DBD'). Omit for all pharma stocks.",
        ),
      days: z
        .number()
        .int()
        .positive()
        .optional()
        .default(30)
        .describe("Lookback window in days (default: 30, max: 365)"),
    },
    async (args) => {
      try {
        const db = dbOverride ?? getDb();

        // Ensure table exists (idempotent)
        initPharmaStore(db);

        const lookbackDays = Math.min(args.days ?? 30, 365);
        const rows = getPharmaEvents(db, {
          ...(args.stock !== undefined ? { stockCode: args.stock } : {}),
          days: lookbackDays,
          limit: 50,
        });

        const lines: string[] = [
          "=== Tin hieu duoc pham (Pharma Signals) ===",
          `Ky han: ${lookbackDays} ngay | So tin hieu: ${rows.length}`,
          "",
        ];

        if (rows.length === 0) {
          lines.push("Khong co tin hieu duoc pham nao trong ky han nay.");
          if (args.stock) {
            lines.push(`(Loc theo co phieu: ${args.stock})`);
          }
        } else {
          if (args.stock) {
            lines.push(`Loc theo co phieu: ${args.stock}`, "");
          }
          for (const row of rows) {
            lines.push(formatEvent(row));
            lines.push("");
          }
        }

        const text = lines.join("\n").trim();

        logger.debug("[get_pharma_signals] returning results", {
          count: rows.length,
          stock: args.stock,
          days: lookbackDays,
        });

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("[get_pharma_signals] failed", { error: errMsg });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching pharma signals: ${errMsg}`,
            },
          ],
        };
      }
    },
  );
}
