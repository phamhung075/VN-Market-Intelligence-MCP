/**
 * MCP Tool: get_cash_flow — Task 1890a-A (guard added 1930b, API-bridge fix 1941a, NI bridge 1941d)
 *
 * Returns the full 4-line cash flow statement for a given VN stock ticker
 * plus the OCF/NI forensic ratio required by the FA G-step.
 *
 * OCF source priority (Task 1941a):
 *   1. operating_cash_flow (vnstock API bridge — written by bridgeOCFToFinancialReports)
 *   2. operating_cf (OCR/PDF extraction fallback)
 *   ocf_source field indicates which was used: "api_bridge" | "ocr"
 *
 * NI source priority (Task 1941d):
 *   1. net_profit_api_bridge (vnstock API bridge — written by bridgeNetProfitToFinancialReports)
 *   2. net_profit (OCR/PDF extraction fallback — often wrong, e.g. FPT Q4/2025 revenue stored as NI)
 *   ni_source field indicates which was used: "api_bridge" | "ocr"
 *
 * Fields returned:
 *   operating_cf      — effective operating cash flow (VND millions): API bridge if available, else OCR
 *   investing_cf      — investing cash flow (VND millions)
 *   financing_cf      — financing cash flow (VND millions)
 *   capex             — capital expenditure (VND millions, negative = outflow)
 *   free_cash_flow    — FCF = operating_cf + capex (VND millions)
 *   ocf_source        — "api_bridge" when operating_cash_flow used, "ocr" when falling back
 *   ni_source         — "api_bridge" when net_profit_api_bridge used, "ocr" when falling back
 *   ocf_ni_ratio      — operating_cf / net_profit (null if net_profit === 0 or null,
 *                       or if |raw ratio| > OCF_NI_RATIO_PLAUSIBILITY_LIMIT)
 *   ocf_ni_ratio_raw  — unguarded ratio (null only if not computable)
 *   ocf_ni_suppressed — true when raw ratio exists but exceeded plausibility limit
 *
 * JSON envelope:
 *   { source_tier: 1, code, period, quarter, ...fields }
 *   On no-row-found: { source_tier: 1, found: false, code, period, quarter }
 *
 * DDD: interface layer only — direct DB read, no domain service.
 * Pattern: follows computeAccrualsTool.ts (same module, injected _testDb).
 *
 * @module interface/mcp/tools/financial-reports/cashFlowTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "bun:sqlite";

import { getDb } from "../../../../infrastructure/db/schema.js";

// ── DB row type ───────────────────────────────────────────────────────────────

interface CashFlowRow {
  period_year: number;
  period_quarter: number | null;
  net_profit: number | null;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  /** Task 1878a API bridge: vnstock-sourced OCF in trieu VND. Preferred over operating_cf. */
  operating_cash_flow: number | null;
  /** Task 1941d API bridge: vnstock-sourced NI in trieu VND. Preferred over net_profit (OCR often wrong). */
  net_profit_api_bridge: number | null;
}

// ── Plausibility limit ────────────────────────────────────────────────────────

const OCF_NI_RATIO_PLAUSIBILITY_LIMIT = 20;

// ── Output envelope ───────────────────────────────────────────────────────────

interface CashFlowFound {
  source_tier: 1;
  found: true;
  code: string;
  period: string;
  period_year: number;
  period_quarter: number | null;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  /** Task 1941a: "api_bridge" when operating_cash_flow column used, "ocr" when falling back */
  ocf_source: "api_bridge" | "ocr";
  /** Task 1941d: "api_bridge" when net_profit_api_bridge column used, "ocr" when falling back */
  ni_source: "api_bridge" | "ocr";
  ocf_ni_ratio: number | null;
  ocf_ni_ratio_raw: number | null;
  ocf_ni_suppressed: boolean;
}

interface CashFlowNotFound {
  source_tier: 1;
  found: false;
  code: string;
  period: string;
  period_year: number | null;
  period_quarter: number | null;
}

type CashFlowEnvelope = CashFlowFound | CashFlowNotFound;

// ── Zod input schema ─────────────────────────────────────────────────────────

const InputSchema = z.object({
  ticker: z
    .string()
    .min(1, "ticker is required")
    .max(10)
    .transform((v) => v.toUpperCase())
    .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive."),
  period: z
    .enum(["Q1", "Q2", "Q3", "Q4"])
    .optional()
    .describe("Quarter filter: Q1-Q4. Omit to return the latest available quarter."),
  year: z
    .coerce.number()
    .int()
    .min(2000)
    .max(2099)
    .optional()
    .describe("Fiscal year (e.g. 2025). Omit to return the latest available year."),
});

export type GetCashFlowInput = z.input<typeof InputSchema>;

export type GetCashFlowOutput = {
  content: [{ type: "text"; text: string }];
};

// ── OCF/NI ratio helper ───────────────────────────────────────────────────────

interface OcfNiResult {
  ratio: number | null;
  rawRatio: number | null;
}

function computeOcfNiRatio(
  operating_cf: number | null,
  net_profit: number | null,
): OcfNiResult {
  if (operating_cf === null || net_profit === null) {
    return { ratio: null, rawRatio: null };
  }
  if (net_profit === 0) {
    return { ratio: null, rawRatio: null };
  }
  const raw = operating_cf / net_profit;
  if (Math.abs(raw) > OCF_NI_RATIO_PLAUSIBILITY_LIMIT) {
    return { ratio: null, rawRatio: raw };
  }
  return { ratio: raw, rawRatio: raw };
}

// ── Period label helper ───────────────────────────────────────────────────────

function periodLabel(year: number | null, quarter: number | null): string {
  if (year === null) return "unknown";
  if (quarter === null) return `${year}`;
  return `Q${quarter}/${year}`;
}

// ── Handler factory (testable — accepts injected DB) ─────────────────────────

export function buildGetCashFlowHandler(
  db: InstanceType<typeof Database>,
): (input: GetCashFlowInput) => Promise<GetCashFlowOutput> {
  return async (rawInput: GetCashFlowInput): Promise<GetCashFlowOutput> => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                source_tier: 1,
                error: "validation_error",
                details: parsed.error.issues,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const { ticker, period, year } = parsed.data;

    // Map "Q1" -> 1, etc.
    const quarterNum = period ? parseInt(period.slice(1), 10) : null;

    // Build query: filter by ticker + optional year/quarter
    const conditions: string[] = [
      "action_code = ?",
      "period_quarter IS NOT NULL",
      "period_quarter BETWEEN 1 AND 4",
    ];
    const params: (string | number)[] = [ticker];

    if (year !== undefined) {
      conditions.push("period_year = ?");
      params.push(year);
    }
    if (quarterNum !== null) {
      conditions.push("period_quarter = ?");
      params.push(quarterNum);
    }

    const whereClause = conditions.join(" AND ");
    const sql = `
      SELECT
        period_year,
        period_quarter,
        net_profit,
        operating_cf,
        investing_cf,
        financing_cf,
        capex,
        free_cash_flow,
        operating_cash_flow,
        net_profit_api_bridge
      FROM financial_reports
      WHERE ${whereClause}
      ORDER BY period_year DESC, period_quarter DESC
      LIMIT 1
    `;

    const row = db.prepare<CashFlowRow, (string | number)[]>(sql).get(...params);

    if (!row) {
      const envelope: CashFlowNotFound = {
        source_tier: 1,
        found: false,
        code: ticker,
        period: periodLabel(
          year !== undefined ? year : null,
          quarterNum,
        ),
        period_year: year !== undefined ? year : null,
        period_quarter: quarterNum,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
      };
    }

    // Task 1941a: prefer API-bridge OCF over OCR OCF.
    // operating_cash_flow (Task 1878a) is vnstock-sourced and correct.
    // operating_cf (PDF/OCR) is often corrupted (VCB=1.23e15, FPT unit mismatch).
    const effectiveOcf: number | null =
      row.operating_cash_flow !== null ? row.operating_cash_flow : row.operating_cf;
    const ocfSource: "api_bridge" | "ocr" =
      row.operating_cash_flow !== null ? "api_bridge" : "ocr";

    // Task 1941d: prefer API-bridge NI over OCR net_profit for OCF/NI ratio.
    // net_profit_api_bridge (Task 1941d) is vnstock-sourced and correct.
    // net_profit (PDF/OCR) can be wrong -- FPT Q4/2025: revenue stored as NI (20,225
    // trieu instead of correct 2,509,520 trieu), keeping ratio falsely suppressed at 203x.
    const effectiveNi: number | null =
      row.net_profit_api_bridge !== null ? row.net_profit_api_bridge : row.net_profit;
    const niSource: "api_bridge" | "ocr" =
      row.net_profit_api_bridge !== null ? "api_bridge" : "ocr";

    const { ratio: ocf_ni_ratio, rawRatio: ocf_ni_ratio_raw } =
      computeOcfNiRatio(effectiveOcf, effectiveNi);

    // Suppressed = raw is computable but exceeded the plausibility limit
    const ocf_ni_suppressed =
      ocf_ni_ratio_raw !== null && ocf_ni_ratio === null;

    const envelope: CashFlowFound = {
      source_tier: 1,
      found: true,
      code: ticker,
      period: periodLabel(row.period_year, row.period_quarter),
      period_year: row.period_year,
      period_quarter: row.period_quarter,
      operating_cf: effectiveOcf,
      investing_cf: row.investing_cf,
      financing_cf: row.financing_cf,
      capex: row.capex,
      free_cash_flow: row.free_cash_flow,
      ocf_source: ocfSource,
      ni_source: niSource,
      ocf_ni_ratio,
      ocf_ni_ratio_raw,
      ocf_ni_suppressed,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
    };
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerGetCashFlowTool(server: McpServer): void {
  server.tool(
    "get_cash_flow",
    "Return the full 4-line cash flow statement for a VN stock ticker. " +
      "Fields: operating_cf, investing_cf, financing_cf, capex, free_cash_flow (all VND millions). " +
      "operating_cf uses the vnstock API bridge value when available (ocf_source='api_bridge'), " +
      "otherwise falls back to OCR/PDF extraction (ocf_source='ocr'). " +
      "NI for ratio uses net_profit_api_bridge (vnstock, ni_source='api_bridge') when available, " +
      "otherwise falls back to OCR net_profit (ni_source='ocr'). " +
      "Forensic fields: ocf_ni_ratio = operating_cf / net_profit (null if net_profit is zero or null); " +
      "ocf_ni_ratio is null when |raw_ratio| > 20 (data quality guard); use ocf_ni_ratio_raw to inspect suppressed values. " +
      "ocf_ni_suppressed=true when raw ratio exists but exceeded the plausibility limit. " +
      "Use for FA G-step: OCF vs NI forensic check. " +
      "Call AFTER get_bctc_full (not instead of it) -- get_bctc_full provides sentiment + comparison; " +
      "get_cash_flow provides full CF statement + OCF/NI ratio for accrual forensics. " +
      "On no-row-found: returns { source_tier: 1, found: false, code, period }. " +
      "Defaults: latest available quarter when period/year are omitted.",
    {
      ticker: z
        .string()
        .min(1)
        .max(10)
        .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive."),
      period: z
        .enum(["Q1", "Q2", "Q3", "Q4"])
        .optional()
        .describe("Quarter: Q1-Q4. Omit for latest."),
      year: z
        .coerce.number()
        .int()
        .min(2000)
        .max(2099)
        .optional()
        .describe("Fiscal year (e.g. 2025). Omit for latest."),
    },
    async ({ ticker, period, year }) => {
      const db = getDb();
      const handler = buildGetCashFlowHandler(db);
      return handler({ ticker, period, year });
    },
  );
}
