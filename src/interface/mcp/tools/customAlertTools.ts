/**
 * Task 219 — Custom Alert Rules MCP Tools
 *
 * Interface layer: registers three MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. add_alert_rule    — Create a custom alert rule for a stock
 *   2. list_alert_rules  — List all rules with status
 *   3. delete_alert_rule — Delete a rule by ID
 *
 * @module interface/mcp/tools/customAlertTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase, ensureCustomAlertRulesTable } from "../../../infrastructure/db/schema.js";
import {
  insertCustomAlertRule,
  listCustomAlertRules,
  deleteCustomAlertRule,
} from "../../../infrastructure/db/customAlertRuleStore.js";
import { ALERT_PREDICATES } from "../../../domain/services/customAlertEvaluator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a threshold value for display.
 * Prices (price_above / price_below) are shown as integer VND with commas.
 * Volumes are shown as integer with commas.
 * Ratios (pe, roe) are shown with 1 decimal place.
 */
function formatThreshold(predicate: string, threshold: number): string {
  if (predicate === "price_above" || predicate === "price_below") {
    return threshold.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (predicate === "volume_above") {
    return threshold.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  // pe_above, pe_below, roe_above
  return threshold.toFixed(1);
}

/**
 * Translate predicate to Vietnamese display label.
 */
function predicateLabel(predicate: string): string {
  const labels: Record<string, string> = {
    price_above: "Gia tren",
    price_below: "Gia duoi",
    volume_above: "KL tren",
    pe_above:    "P/E tren",
    pe_below:    "P/E duoi",
    roe_above:   "ROE tren",
  };
  return labels[predicate] ?? predicate;
}

/**
 * Translate status to Vietnamese display label.
 */
function statusLabel(status: string, triggeredAt: string | null): string {
  if (status === "triggered") {
    const date = triggeredAt ? triggeredAt.slice(0, 10).replace(/-/g, "/").split("/").reverse().join("/") : "?";
    return `Da kich hoat (${date})`;
  }
  if (status === "disabled") return "Da tat";
  return "Hoat dong";
}

/**
 * Build the list_alert_rules table output string.
 */
function buildRuleListText(
  rows: Array<{
    id: number;
    code: string;
    predicate: string;
    threshold: number;
    status: string;
    triggered_at: string | null;
    notes: string | null;
  }>,
): string {
  const active = rows.filter((r) => r.status === "active").length;
  const total = rows.length;

  if (total === 0) {
    return "Chua co quy tac canh bao tuy chinh nao.";
  }

  const lines: string[] = [
    `Quy tac canh bao tuy chinh (${active} dang hoat dong / ${total} tong cong)`,
    "",
    "ID  | Ma    | Dieu kien   | Nguong      | Trang thai",
    "----|-------|-------------|-------------|-------------------------------",
  ];

  for (const row of rows) {
    const id    = String(row.id).padEnd(3);
    const code  = row.code.padEnd(5);
    const pred  = predicateLabel(row.predicate).padEnd(11);
    const thr   = formatThreshold(row.predicate, row.threshold).padEnd(11);
    const stat  = statusLabel(row.status, row.triggered_at);
    lines.push(`${id} | ${code} | ${pred} | ${thr} | ${stat}`);
  }

  if (rows.some((r) => r.notes)) {
    lines.push("");
    lines.push("Ghi chu:");
    for (const row of rows) {
      if (row.notes) {
        lines.push(`  ID ${row.id} (${row.code}): ${row.notes}`);
      }
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register custom alert rule MCP tools on the given McpServer instance.
 *
 * @param server - The McpServer instance to register tools on
 */
export function registerCustomAlertTools(server: McpServer): void {

  // ── 1. add_alert_rule ───────────────────────────────────────────────────────
  server.tool(
    "add_alert_rule",
    "Create a custom alert rule for a stock. " +
    "Supported predicates: price_above, price_below, volume_above, pe_above, pe_below, roe_above. " +
    "The rule will be evaluated during every intelligence cycle.",
    {
      actionCode: z
        .string()
        .min(1)
        .max(10)
        .describe("Vietnamese stock ticker code (e.g. VCB, FPT, HPG)"),
      predicate: z
        .enum(ALERT_PREDICATES as [string, ...string[]])
        .describe(
          "Condition type: price_above | price_below | volume_above | pe_above | pe_below | roe_above",
        ),
      threshold: z
        .number()
        .describe(
          "Numeric threshold. Prices in VND (e.g. 90000). Volume as unit count. P/E and ROE as decimal (e.g. 15.0).",
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional notes for this rule"),
    },
    async ({ actionCode, predicate, threshold, notes }) => {
      try {
        const db = getDb();
        ensureCustomAlertRulesTable(db);

        const payload =
          notes !== undefined
            ? { code: actionCode, predicate, threshold, notes }
            : { code: actionCode, predicate, threshold };

        const id = insertCustomAlertRule(payload, db);

        const result = {
          id,
          code: actionCode.toUpperCase(),
          predicate,
          threshold,
          notes: notes ?? null,
          status: "active",
          message: `Quy tac canh bao da duoc tao (ID: ${id}).`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        console.error("[add_alert_rule] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tao quy tac: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. list_alert_rules ─────────────────────────────────────────────────────
  server.tool(
    "list_alert_rules",
    "List all custom alert rules with their current status. " +
    "Shows triggered date for rules that have already fired.",
    {},
    async () => {
      try {
        const db = getDb();
        ensureCustomAlertRulesTable(db);

        const rows = listCustomAlertRules(db);
        const text = buildRuleListText(rows);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[list_alert_rules] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay danh sach quy tac: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. delete_alert_rule ────────────────────────────────────────────────────
  server.tool(
    "delete_alert_rule",
    "Delete a custom alert rule by its ID. Use list_alert_rules to find the ID.",
    {
      id: z
        .number()
        .int()
        .positive()
        .describe("The numeric ID of the rule to delete"),
    },
    async ({ id }) => {
      try {
        const db = getDb();
        ensureCustomAlertRulesTable(db);

        const deleted = deleteCustomAlertRule(id, db);

        if (!deleted) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Khong tim thay quy tac co ID ${id}.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Quy tac ID ${id} da duoc xoa thanh cong.`,
            },
          ],
        };
      } catch (err) {
        console.error("[delete_alert_rule] Failed:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi xoa quy tac: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
