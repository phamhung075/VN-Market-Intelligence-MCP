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
} from "../../../../domain/services/creditFlowAnalyzer.js";
import { SEVERITY_VI } from "./severityLabels.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants / DB-fallback helpers (Task 1254)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default RE credit outstanding (nghìn tỷ VND).
 * Based on SBV 2024 data: total outstanding RE credit ~2,800 nghìn tỷ VND.
 * Used when DB has no better data available.
 */
export const DEFAULT_RE_CREDIT_TRILLION = 2_800;

/**
 * Typical mortgage-rate spread over SBV refinancing rate.
 * Vietnamese commercial banks price mortgages at refi + 2-3%.
 * Using 2.5% as midpoint.
 */
const MORTGAGE_SPREAD_PCT = 2.5;

/**
 * Derive a mortgage rate estimate from the SBV refinancing rate.
 * mortgage ≈ refinancingRate + 2.5%
 *
 * @param refinancingRatePct - SBV refinancing rate in percent
 */
export function deriveMortgageRateFromSbv(refinancingRatePct: number): number {
  return refinancingRatePct + MORTGAGE_SPREAD_PCT;
}

/**
 * Read the latest SBV refinancing rate from DB.
 * Returns null if DB is not available or has no data.
 */
async function readSbvRefinancingRate(): Promise<{ current: number; previous: number } | null> {
  try {
    await initDatabase();
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT refinancing_rate_pct, fetched_at
         FROM sbv_rates_history
         ORDER BY fetched_at DESC
         LIMIT 60`,
      )
      .all() as Array<{ refinancing_rate_pct: number; fetched_at: string }>;

    if (rows.length === 0) return null;

    const current = rows[0]!.refinancing_rate_pct;
    // Use row ~30 days ago as "previous" — approximately 30 rows back at 30min interval
    const previous = rows[Math.min(rows.length - 1, 48)]!.refinancing_rate_pct;

    if (current <= 0) return null;
    return { current, previous: previous > 0 ? previous : current };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for direct testing)
// ─────────────────────────────────────────────────────────────────────────────

interface GetCreditFlowSignalInput {
  /** Current month RE credit outstanding (nghìn tỷ VND) — optional, falls back to DB/default */
  currentReCreditTrillion?: number | undefined;
  /** Previous month RE credit outstanding (nghìn tỷ VND) — optional, falls back to DB/default */
  previousReCreditTrillion?: number | undefined;
  /** Current month average mortgage rate (%) — optional, derived from SBV rates in DB */
  currentMortgageRatePct?: number | undefined;
  /** Previous month average mortgage rate (%) — optional, derived from SBV rates in DB */
  previousMortgageRatePct?: number | undefined;
  /** Current month YoY credit growth % (optional, defaults to 15) */
  currentYoyGrowthPct?: number | undefined;
  /** Previous month YoY credit growth % (optional, defaults to 12) */
  previousYoyGrowthPct?: number | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// survey_distribution type (VMT-6)
// Carries VIRA/VARA bank-survey consensus data.
// is_estimate=true until a machine-readable source is confirmed (BLOCKER-6 deferred).
// ─────────────────────────────────────────────────────────────────────────────

export interface SurveyDistribution {
  source: "VIRA" | "VARA" | null;
  period: string | null;
  mean_pct: number | null;
  dispersion_pct: number | null;
  hawk_outliers: string[];
  dove_outliers: string[];
  survey_topic: string | null;
  is_estimate: boolean;
  note: string | null;
}

/**
 * Core handler logic — separated from MCP registration for testability.
 *
 * All 4 main params are optional (Task 1254). When not provided:
 *   - Mortgage rates: derived from latest SBV refinancing rate in DB (refi + 2.5%)
 *   - RE credit outstanding: uses DEFAULT_RE_CREDIT_TRILLION constant
 */
export async function getCreditFlowSignalHandler(
  input: GetCreditFlowSignalInput,
): Promise<{ content: Array<{ type: "text"; text: string }>; survey_distribution: SurveyDistribution }> {
  // ── DB fallback for mortgage rates (Task 1254) ───────────────────────────
  let resolvedCurrentMortgage = input.currentMortgageRatePct;
  let resolvedPreviousMortgage = input.previousMortgageRatePct;

  // DSI-S3 C1: track whether any field uses a hardcoded fallback (no live source).
  let mortgageIsEstimate = false;
  let yoyIsEstimate = false;

  if (resolvedCurrentMortgage === undefined || resolvedPreviousMortgage === undefined) {
    const sbv = await readSbvRefinancingRate();
    if (sbv) {
      resolvedCurrentMortgage ??= deriveMortgageRateFromSbv(sbv.current);
      resolvedPreviousMortgage ??= deriveMortgageRateFromSbv(sbv.previous);
    } else {
      // Final fallback: use VN typical mortgage rates (2024 avg ~10.5%).
      // DSI-S3 C1: these are estimates — flag response so consumers know.
      resolvedCurrentMortgage ??= 10.5;
      resolvedPreviousMortgage ??= 11.0;
      mortgageIsEstimate = true;
    }
  }

  // DSI-S3 C1: flag when yoyGrowthPct is missing — defaults are fabricated ±15%.
  const currentYoyResolved = input.currentYoyGrowthPct;
  const previousYoyResolved = input.previousYoyGrowthPct;
  if (currentYoyResolved === undefined || previousYoyResolved === undefined) {
    yoyIsEstimate = true;
  }

  // ── Default RE credit outstanding when not provided ──────────────────────
  const resolvedCurrentCredit = input.currentReCreditTrillion ?? DEFAULT_RE_CREDIT_TRILLION;
  const resolvedPreviousCredit = input.previousReCreditTrillion ?? (DEFAULT_RE_CREDIT_TRILLION * 0.98);

  const current: CreditData = {
    totalCreditTrillion: resolvedCurrentCredit * 5, // rough estimate
    reCreditTrillion: resolvedCurrentCredit,
    // DSI-S3 C1: reCreditRatioPct 20/19 are static constants, not live data.
    reCreditRatioPct: 20,
    yoyGrowthPct: currentYoyResolved ?? 15,
    avgMortgageRatePct: resolvedCurrentMortgage,
    date: new Date().toISOString().slice(0, 10),
  };

  const previous: CreditData = {
    totalCreditTrillion: resolvedPreviousCredit * 5,
    reCreditTrillion: resolvedPreviousCredit,
    reCreditRatioPct: 19,
    yoyGrowthPct: previousYoyResolved ?? -15,
    avgMortgageRatePct: resolvedPreviousMortgage,
    date: new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10),
  };

  const signal = analyzeCreditFlow(current, previous);

  const dirLabel =
    signal.direction === "up"
      ? "TÍCH CỰC"
      : signal.direction === "down"
        ? "TIÊU CỰC"
        : "TRUNG TÍNH";

  // DSI-S3 C1: build provenance disclaimer lines for any estimate inputs.
  const isEstimate = mortgageIsEstimate || yoyIsEstimate;
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

  // VMT-6: survey_distribution stub — DEGRADED mode (BLOCKER-6 deferred).
  // is_estimate=true: no machine-readable VIRA/VARA source is confirmed yet.
  // If/when a source is found, a viraSurveyFetcher.ts in infrastructure/fetchers/
  // will populate these fields (no schema change needed at that point).
  // const surveyDist = await fetchViraSurvey(); // TODO: implement after source confirmed
  const survey_distribution: SurveyDistribution = {
    source: null,
    period: null,
    mean_pct: null,
    dispersion_pct: null,
    hawk_outliers: [],
    dove_outliers: [],
    survey_topic: null,
    is_estimate: true,
    note: "VIRA/VARA no machine-readable source confirmed — manual data required",
  };

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    survey_distribution,
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
