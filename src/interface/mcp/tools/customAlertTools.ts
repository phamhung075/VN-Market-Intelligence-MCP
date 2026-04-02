/**
 * Task 219 — Custom Alert Rules MCP Tools
 * Task 241 — add_alert_rule and delete_alert_rule removed (user-only mutation tools)
 *
 * Interface layer: registers one MCP tool on a McpServer instance.
 *
 * Tools registered:
 *   1. list_alert_rules  — List all rules with status
 *
 * Tools removed (task 241):
 *   - add_alert_rule    — use TASKS.md / analyst workflow instead
 *   - delete_alert_rule — use TASKS.md / analyst workflow instead
 *
 * @module interface/mcp/tools/customAlertTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getDb, ensureCustomAlertRulesTable } from "../../../infrastructure/db/schema.js";
import {
  listCustomAlertRules,
} from "../../../infrastructure/db/customAlertRuleStore.js";

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

  // ── add_alert_rule REMOVED (task 241) ─────────────────────────────────────
  // User-only mutation tool. Manage rules through analyst workflow instead.

  // ── 1. list_alert_rules ─────────────────────────────────────────────────────
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

  // ── delete_alert_rule REMOVED (task 241) ─────────────────────────────────
  // User-only mutation tool. Manage rules through analyst workflow instead.
}
