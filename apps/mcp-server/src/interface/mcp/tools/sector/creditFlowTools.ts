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
 *
 * FDA-6 (structuredContent — real wire-level MCP CallToolResult field, unlike
 * the bespoke top-level keys above which a real MCP client's zod
 * CallToolResultSchema.parse silently strips — see energyTools.ts FDA-5
 * precedent for the same caveat): carries is_estimate/source_tier/
 * estimated_fields/mortgage_is_estimate/yoy_is_estimate/fully_estimated/
 * current_date/previous_date so a downstream consumer reading the payload
 * structurally — not just parsing the VN prose — sees both the estimate
 * provenance AND that current_date/previous_date are null (never a fresh
 * `new Date()` stamp) whenever mortgage and/or YoY fell back to a hardcoded
 * default. `fully_estimated` (mortgageIsEstimate && yoyIsEstimate) is a
 * dedicated machine-readable hook for a downstream consumer to fail-loud /
 * omit its own derived dish when NEITHER leg has any live backing — this
 * tool's own VN `content` text is left unchanged (still emits the disclosed
 * [ƯỚC TÍNH] analysis) to avoid a breaking behavior change on this P3/S fix.
 */
export async function getCreditFlowSignalHandler(
  input: GetCreditFlowSignalInput,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  survey_distribution: SurveyDistribution;
  direction: "up" | "down" | "neutral";
  is_estimate: boolean;
  structuredContent: {
    is_estimate: boolean;
    source_tier: 2 | 4;
    estimated_fields: string[];
    mortgage_is_estimate: boolean;
    yoy_is_estimate: boolean;
    /** true only when BOTH mortgage and YoY are hardcoded fallbacks — no live leg at all. */
    fully_estimated: boolean;
    direction: "up" | "down" | "neutral";
    current_date: string | null;
    previous_date: string | null;
  };
}> {
  const {
    signal,
    is_estimate: isEstimate,
    mortgageIsEstimate,
    yoyIsEstimate,
    survey_distribution,
    currentDate,
    previousDate,
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

  // FDA-6: reCreditRatioPct/totalCreditTrillion are ALWAYS static (never live,
  // no caller input feeds them at all) — listed unconditionally. mortgage/yoy
  // are only listed when their own fallback actually engaged.
  const estimatedFields: string[] = ["reCreditRatioPct", "totalCreditTrillion"];
  if (mortgageIsEstimate) estimatedFields.push("avgMortgageRatePct");
  if (yoyIsEstimate) estimatedFields.push("yoyGrowthPct");

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
    // FDA-6: same data, real MCP CallToolResult field — survives a wire hop
    // that would silently strip the bespoke top-level keys above.
    structuredContent: {
      is_estimate: isEstimate,
      source_tier: isEstimate ? 4 : 2,
      estimated_fields: estimatedFields,
      mortgage_is_estimate: mortgageIsEstimate,
      yoy_is_estimate: yoyIsEstimate,
      fully_estimated: mortgageIsEstimate && yoyIsEstimate,
      direction: signal.direction,
      current_date: currentDate,
      previous_date: previousDate,
    },
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
