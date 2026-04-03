/**
 * Credit Flow MCP Tools — Task 251
 *
 * MCP tool: get_credit_flow_signal
 *   Analyzes NHNN credit data changes and returns a market impact signal
 *   for Vietnamese banking and real estate stocks.
 *
 * Layer: interface/mcp/tools — wraps domain service creditFlowAnalyzer
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  analyzeCreditFlow,
  type CreditData,
} from "../../../domain/services/creditFlowAnalyzer.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for direct testing)
// ─────────────────────────────────────────────────────────────────────────────

interface GetCreditFlowSignalInput {
  /** Current month RE credit outstanding (nghìn tỷ VND) */
  currentReCreditTrillion: number;
  /** Previous month RE credit outstanding (nghìn tỷ VND) */
  previousReCreditTrillion: number;
  /** Current month average mortgage rate (%) */
  currentMortgageRatePct: number;
  /** Previous month average mortgage rate (%) */
  previousMortgageRatePct: number;
  /** Current month YoY credit growth % (optional, defaults to 15) */
  currentYoyGrowthPct?: number | undefined;
  /** Previous month YoY credit growth % (optional, defaults to 12) */
  previousYoyGrowthPct?: number | undefined;
}

/**
 * Core handler logic — separated from MCP registration for testability.
 */
export async function getCreditFlowSignalHandler(
  input: GetCreditFlowSignalInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const current: CreditData = {
    totalCreditTrillion: input.currentReCreditTrillion * 5, // rough estimate
    reCreditTrillion: input.currentReCreditTrillion,
    reCreditRatioPct: 20,
    yoyGrowthPct: input.currentYoyGrowthPct ?? 15,
    avgMortgageRatePct: input.currentMortgageRatePct,
    date: new Date().toISOString().slice(0, 10),
  };

  const previous: CreditData = {
    totalCreditTrillion: input.previousReCreditTrillion * 5,
    reCreditTrillion: input.previousReCreditTrillion,
    reCreditRatioPct: 19,
    yoyGrowthPct: input.previousYoyGrowthPct ?? 12,
    avgMortgageRatePct: input.previousMortgageRatePct,
    date: new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10),
  };

  const signal = analyzeCreditFlow(current, previous);

  const severityLabel: Record<string, string> = {
    critical: "NGHIEM TRONG",
    high: "QUAN TRONG",
    medium: "LUU Y",
    low: "THONG TIN",
  };

  const dirLabel =
    signal.direction === "up"
      ? "TICH CUC"
      : signal.direction === "down"
        ? "TIEU CUC"
        : "TRUNG TINH";

  const lines: string[] = [
    `TIN DUNG BAT DONG SAN — PHAN TICH TAC DONG`,
    `Muc do: ${severityLabel[signal.severity] ?? signal.severity}`,
    `Xu huong: ${dirLabel}`,
    `Do tin cay: ${(signal.confidence * 100).toFixed(0)}%`,
    "",
    `Tom tat: ${signal.summary}`,
    "",
    `Co phieu bi anh huong:`,
  ];

  for (const s of signal.affectedStocks) {
    lines.push(`  ${s.code}: ${s.impact}`);
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_credit_flow_signal MCP tool on the server.
 */
export function registerCreditFlowTools(server: McpServer): void {
  server.tool(
    "get_credit_flow_signal",
    "Phan tich thay doi tin dung bat dong san cua NHNN va tao tin hieu thi truong cho co phieu ngan hang va BDS.",
    {
      currentReCreditTrillion: z
        .number()
        .describe("Du no tin dung BDS thang hien tai (nghin ty VND)"),
      previousReCreditTrillion: z
        .number()
        .describe("Du no tin dung BDS thang truoc (nghin ty VND)"),
      currentMortgageRatePct: z
        .number()
        .describe("Lai suat vay mua nha trung binh thang hien tai (%)"),
      previousMortgageRatePct: z
        .number()
        .describe("Lai suat vay mua nha trung binh thang truoc (%)"),
      currentYoyGrowthPct: z
        .number()
        .optional()
        .describe("Tang truong tin dung YoY thang hien tai (%)"),
      previousYoyGrowthPct: z
        .number()
        .optional()
        .describe("Tang truong tin dung YoY thang truoc (%)"),
    },
    async (input) => getCreditFlowSignalHandler(input),
  );
}
