/**
 * Leadership Signal MCP Tools — Task 251
 *
 * MCP tool: get_insider_signals
 *   Analyzes insider transactions for a stock and returns classified
 *   leadership signals (buy/sell patterns, mass insider activity).
 *
 * Layer: interface/mcp/tools — wraps domain service leadershipSignal
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  classifyInsiderTransaction,
  detectMassInsiderBuy,
  type InsiderTransaction,
  type InsiderPosition,
  type LeadershipSignal,
} from "../../../../domain/services/leadershipSignal.js";
import { SEVERITY_VI } from "./severityLabels.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for direct testing)
// ─────────────────────────────────────────────────────────────────────────────

interface GetInsiderSignalsInput {
  /** Stock code to analyze, e.g. "VCB" */
  code: string;
  /** Outstanding shares (used to compute % of outstanding) */
  outstandingShares: number;
  /** Test-only: inject transactions directly */
  _testData?: InsiderTransaction[] | undefined;
  /** Window in days for mass insider buy detection (default: 30) */
  windowDays?: number | undefined;
}

/**
 * Core handler logic — separated from MCP registration for testability.
 */
export async function getInsiderSignalsHandler(
  input: GetInsiderSignalsInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // In real usage, transactions would be loaded from the insiderStore DB.
  // For MCP calls without _testData, we use an empty list as a safe fallback.
  const transactions: InsiderTransaction[] = input._testData ?? [];

  const windowDays = input.windowDays ?? 30;
  const signals: LeadershipSignal[] = [];

  // Classify individual transactions
  for (const tx of transactions) {
    if (tx.code !== input.code) continue;
    const signal = classifyInsiderTransaction(tx, input.outstandingShares);
    if (signal) signals.push(signal);
  }

  // Detect mass insider buy
  const codeTransactions = transactions.filter((t) => t.code === input.code);
  const massSignal = detectMassInsiderBuy(codeTransactions, windowDays);
  if (massSignal) signals.push(massSignal);

  if (signals.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Không có tín hiệu giao dịch nội bộ đáng kể cho ${input.code} trong thời gian gần đây.`,
        },
      ],
    };
  }

  const lines: string[] = [
    `TÍN HIỆU LÃNH ĐẠO / GIAO DỊCH NỘI BỘ — ${input.code}`,
    `Tổng số tín hiệu: ${signals.length}`,
    "",
  ];

  for (const s of signals) {
    lines.push(`[${SEVERITY_VI[s.severity] ?? s.severity}] ${s.type.toUpperCase()}`);
    lines.push(`  Lãnh đạo: ${s.insiderName} (${s.position})`);
    lines.push(`  Xu hướng: ${s.direction === "up" ? "TĂNG" : s.direction === "down" ? "GIẢM" : "TRUNG TÍNH"}`);
    lines.push(`  Độ tin cậy: ${(s.confidence * 100).toFixed(0)}%`);
    lines.push(`  Lý do: ${s.reasoning}`);
    lines.push("");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_insider_signals MCP tool on the server.
 */
export function registerLeadershipTools(server: McpServer): void {
  server.tool(
    "get_insider_signals",
    "Phân tích giao dịch nội bộ — phân loại các giao dịch insider thành tín hiệu mua/bán/mua ồ ạt. " +
      "REQUIRES caller to provide transactions[] array as input (pure classifier, no DB call, stateless). " +
      "Test-first design: pure classification logic with strength/confidence output. " +
      "Input: transactions[] from get_insider_transactions or external source. " +
      "Distinct from get_insider_transactions which is a DB-backed SSC lookup that returns raw disclosure rows. " +
      "Use get_insider_transactions to fetch raw DB rows; pipe output into get_insider_signals to classify signals.",
    {
      code: z.string().describe("Mã cổ phiếu, ví dụ VCB, HPG"),
      outstandingShares: z
        .number()
        .describe("Số cổ phiếu đang lưu hành (shares)"),
      windowDays: z
        .number()
        .optional()
        .describe("Cửa sổ thời gian cho mass insider buy (default: 30 ngày)"),
      transactions: z
        .array(
          z.object({
            insiderName: z.string(),
            position: z
              .enum(["CEO", "CFO", "Chairman", "Board", "Other"])
              .default("Other"),
            type: z.enum(["buy", "sell"]),
            volume: z.number(),
            registeredVolume: z.number(),
            price: z.number(),
            date: z.string(),
          }),
        )
        .optional()
        .describe("Danh sách giao dịch cần phân tích (nếu có)"),
    },
    async (input) => {
      const txs: InsiderTransaction[] | undefined = input.transactions?.map(
        (t) => ({
          code: input.code,
          insiderName: t.insiderName,
          position: t.position as InsiderPosition,
          type: t.type,
          volume: t.volume,
          registeredVolume: t.registeredVolume,
          price: t.price,
          date: t.date,
        }),
      );

      return getInsiderSignalsHandler({
        code: input.code,
        outstandingShares: input.outstandingShares,
        windowDays: input.windowDays,
        _testData: txs,
      });
    },
  );
}
