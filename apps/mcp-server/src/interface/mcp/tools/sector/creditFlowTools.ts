/**
 * Credit Flow MCP Tools — Task 251
 *
 * MCP tool: get_credit_flow_signal
 *   Analyzes NHNN credit data changes and returns a market impact signal
 *   for Vietnamese banking and real estate stocks.
 *
 * Layer: interface/mcp/tools — wraps domain service creditFlowAnalyzer via
 * application/usecases/computeCreditFlowSignal.ts (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL,
 * 2026-07-29 — the protocol-agnostic computation was extracted there so
 * application-layer consumers, e.g. getMoneyRadarComposite.ts, no longer need
 * to reach up into this interface-layer file — Fence-B fix). This file now
 * owns only the Vietnamese `content` text formatting + MCP registration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SEVERITY_VI } from "./severityLabels.js";
import {
  computeCreditFlowSignal,
  DEFAULT_RE_CREDIT_TRILLION,
  deriveMortgageRateFromSbv,
  type ComputeCreditFlowSignalInput,
  type SurveyDistribution,
} from "../../../../application/usecases/computeCreditFlowSignal.js";

// Re-exported unchanged for existing tests that import these from this path.
export { DEFAULT_RE_CREDIT_TRILLION, deriveMortgageRateFromSbv };
export type { SurveyDistribution };

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for direct testing)
// ─────────────────────────────────────────────────────────────────────────────

type GetCreditFlowSignalInput = ComputeCreditFlowSignalInput;

/**
 * Core handler logic — separated from MCP registration for testability.
 *
 * All 4 main params are optional (Task 1254). When not provided:
 *   - Mortgage rates: derived from latest SBV refinancing rate in DB (refi + 2.5%)
 *   - RE credit outstanding: uses DEFAULT_RE_CREDIT_TRILLION constant
 *
 * MONEY-RADAR-P0-T2-COMPOSITE (additive, non-breaking): the return object also
 * carries `direction` ("up"|"down"|"neutral") and `is_estimate` (true when
 * mortgage rate and/or YoY growth fell back to a hardcoded default — C3/HN-3)
 * as structured fields, alongside the existing `content`/`survey_distribution`.
 * The MCP tool registration below still returns only `content` to the wire
 * protocol (extra object fields are ignored by the MCP SDK transport); the
 * money-radar composite usecase now calls computeCreditFlowSignal directly
 * in-process (application-layer, Fence-B compliant) and reads the structured
 * fields directly instead of parsing the Vietnamese text block.
 */
export async function getCreditFlowSignalHandler(
  input: GetCreditFlowSignalInput,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  survey_distribution: SurveyDistribution;
  direction: "up" | "down" | "neutral";
  is_estimate: boolean;
}> {
  const {
    signal,
    is_estimate: isEstimate,
    mortgageIsEstimate,
    yoyIsEstimate,
    survey_distribution,
  } = await computeCreditFlowSignal(input);

  const dirLabel =
    signal.direction === "up"
      ? "TÍCH CỰC"
      : signal.direction === "down"
        ? "TIÊU CỰC"
        : "TRUNG TÍNH";

  // DSI-S3 C1: build provenance disclaimer lines for any estimate inputs.
  const provenanceLines: string[] = [];
  if (mortgageIsEstimate) {
    provenanceLines.push(`[ƯỚC TÍNH] Lãi suất vay mua nhà: dùng mặc định VN 2024 (~10.5%/11.0%) — không có dữ liệu SBV DB. is_estimate=true, source_tier=4`);
  }
  if (yoyIsEstimate) {
    provenanceLines.push(`[ƯỚC TÍNH] Tăng trưởng tín dụng YoY: dùng mặc định ±15% — không có dữ liệu NHNN thực. is_estimate=true, source_tier=4`);
  }
  // reCreditRatioPct 20/19 is always a static constant
  provenanceLines.push(`[static_seed] Tỷ lệ tín dụng BĐS: 20%/19% là hằng số ước tính (không từ nguồn NHNN trực tiếp)`);

  const lines: string[] = [
    `TÍN DỤNG BẤT ĐỘNG SẢN — PHÂN TÍCH TÁC ĐỘNG${isEstimate ? " [ƯỚC TÍNH]" : ""}`,
    `Mức độ: ${SEVERITY_VI[signal.severity] ?? signal.severity}`,
    `Xu hướng: ${dirLabel}`,
    `Độ tin cậy: ${(signal.confidence * 100).toFixed(0)}%`,
    "",
    `Tóm tắt: ${signal.summary}`,
    "",
    `Cổ phiếu bị ảnh hưởng:`,
  ];

  for (const s of signal.affectedStocks) {
    lines.push(`  ${s.code}: ${s.impact}`);
  }

  // DSI-S3 C1: append provenance disclaimer section
  if (provenanceLines.length > 0) {
    lines.push("", "--- Nguồn dữ liệu ---");
    lines.push(...provenanceLines);
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    survey_distribution,
    // MONEY-RADAR-P0-T2-COMPOSITE: structured fields for in-process consumers.
    // isEstimate here covers mortgage-rate/YoY-growth fallback (C3/HN-3) — the
    // reCreditRatioPct 20/19 static seed and DEFAULT_RE_CREDIT_TRILLION amount
    // are always-on constants (never live), so is_estimate is effectively true
    // whenever the caller omits explicit YoY inputs (the composite always does).
    direction: signal.direction,
    is_estimate: isEstimate,
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
    "Phân tích thay đổi tín dụng bất động sản của NHNN và tạo tín hiệu thị trường cho cổ phiếu ngân hàng và BDS. " +
    "Tất cả tham số đều tùy chọn — nếu không cung cấp, công cụ tự đọc lãi suất tái cấp từ DB SBV và dùng giá trị mặc định cho dư nợ tín dụng.",
    {
      currentReCreditTrillion: z.coerce
        .number()
        .optional()
        .describe("Dư nợ tín dụng BDS tháng hiện tại (nghìn tỷ VND) — tùy chọn, mặc định ~2800"),
      previousReCreditTrillion: z.coerce
        .number()
        .optional()
        .describe("Dư nợ tín dụng BDS tháng trước (nghìn tỷ VND) — tùy chọn, mặc định ~2744"),
      currentMortgageRatePct: z.coerce
        .number()
        .optional()
        .describe("Lãi suất vay mua nhà trung bình tháng hiện tại (%) — tùy chọn, tự động lấy từ bảng sbv_rates"),
      previousMortgageRatePct: z.coerce
        .number()
        .optional()
        .describe("Lãi suất vay mua nhà trung bình tháng trước (%) — tùy chọn, tự động lấy từ bảng sbv_rates"),
      currentYoyGrowthPct: z.coerce
        .number()
        .optional()
        .describe("Tăng trưởng tín dụng YoY tháng hiện tại (%)"),
      previousYoyGrowthPct: z.coerce
        .number()
        .optional()
        .describe("Tăng trưởng tín dụng YoY tháng trước (%)"),
    },
    async (input) => getCreditFlowSignalHandler(input),
  );
}
