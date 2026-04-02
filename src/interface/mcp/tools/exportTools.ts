/**
 * Export Tools — MCP tool for portfolio snapshot export
 *
 * Tools registered:
 *   1. export_portfolio_snapshot — dumps all portfolio data to a timestamped JSON file
 *
 * @module interface/mcp/tools/exportTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportPortfolioSnapshot } from "../../../application/usecases/exportPortfolioSnapshot.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerExportTools(server: McpServer): void {
  server.tool(
    "export_portfolio_snapshot",
    "Export all portfolio data (watchlist, positions, alerts, market prices, predictions) " +
      "to a timestamped JSON backup file. Returns the file path and a summary of what was exported. " +
      "Files are saved to data/exports/snapshot_YYYYMMDD_HHmmss.json.",
    {},
    async () => {
      try {
        const result = await exportPortfolioSnapshot();

        if (result.error) {
          const lines = [
            "Xuat du lieu that bai!",
            `Loi: ${result.error}`,
          ];
          return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        }

        const s = result.snapshot.summary;
        const lines = [
          "Xuat du lieu thanh cong!",
          `File: ${result.filePath}`,
          `Kich thuoc: ${result.fileSizeMb} MB`,
          `Thoi gian: ${result.snapshot.exported_at}`,
          "",
          "Noi dung:",
          `  - ${s.watchlist_count} watchlist`,
          `  - ${s.open_positions} vi the mo (tong ${result.snapshot.positions.length} vi the)`,
          `  - ${s.alert_count} canh bao (30 ngay qua)`,
          `  - ${result.snapshot.analysis_entries.length} phan tich tin tuc`,
          `  - ${result.snapshot.financial_reports.length} bao cao tai chinh`,
          `  - ${s.market_prices_count} gia thi truong`,
          `  - ${s.prediction_markets_count} prediction markets`,
          `  - ${s.prediction_signals_count} tin hieu (7 ngay qua)`,
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        logger.error("[export_portfolio_snapshot] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi xuat du lieu: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
