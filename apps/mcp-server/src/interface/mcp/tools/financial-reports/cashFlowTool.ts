/**
 * MCP Tool: get_cash_flow — Task 1890a-A
 *
 * Returns the full 4-line cash flow statement for a given VN stock ticker
 * plus the OCF/NI forensic ratio required by the FA G-step.
 *
 * Fields returned:
 *   operating_cf   — operating cash flow (VND millions)
 *   investing_cf   — investing cash flow (VND millions)
 *   financing_cf   — financing cash flow (VND millions)
 *   capex          — capital expenditure (VND millions, negative = outflow)
 *   free_cash_flow — FCF = operating_cf + capex (VND millions)
 *   ocf_ni_ratio   — operating_cf / net_profit (null if net_profit === 0 or null)
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
}

// ── Output envelope ───────────────────────────────────────────────────────────

interface CashFlowFound {
  source_tier: 1;
  found: true;
  code: string;
  period: string;         // e.g. "Q1/2025"
  period_year: number;
  period_quarter: number | null;
  operating_cf: number | null;
  investing_cf: number | null;
  financing_cf: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  ocf_ni_ratio: number | null;
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
    .describe("Quarter filter: Q1–Q4. Omit to return the latest available quarter."),
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

function computeOcfNiRatio(
  operating_cf: number | null,
  net_profit: number | null,
): number | null {
  if (operating_cf === null || net_profit === null) return null;
  if (net_profit === 0) return null;
  return operating_cf / net_profit;
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

    // Map "Q1" → 1, etc.
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
        free_cash_flow
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

    const ocf_ni_ratio = computeOcfNiRatio(row.operating_cf, row.net_profit);

    const envelope: CashFlowFound = {
      source_tier: 1,
      found: true,
      code: ticker,
      period: periodLabel(row.period_year, row.period_quarter),
      period_year: row.period_year,
      period_quarter: row.period_quarter,
      operating_cf: row.operating_cf,
      investing_cf: row.investing_cf,
      financing_cf: row.financing_cf,
      capex: row.capex,
      free_cash_flow: row.free_cash_flow,
      ocf_ni_ratio,
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
      "Forensic field: ocf_ni_ratio = operating_cf / net_profit (null if net_profit is zero or null). " +
      "Use for FA G-step: OCF vs NI forensic check. " +
      "Call AFTER get_bctc_full (not instead of it) — get_bctc_full provides sentiment + comparison; " +
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
        .describe("Quarter: Q1–Q4. Omit for latest."),
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
