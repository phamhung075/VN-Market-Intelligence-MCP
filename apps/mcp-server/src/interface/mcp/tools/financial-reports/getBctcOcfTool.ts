/**
 * MCP Tool: get_bctc_ocf — Task 1909b
 *
 * Returns the 3 OCF sections (operating/investing/financing) from the
 * financial_reports table for a given VN stock ticker + period. Designed
 * for the forensic-gate (FA Layer 7) OCF vs NI check.
 *
 * Fields returned:
 *   ocf_operating  — operating cash flow (VND millions)
 *   ocf_investing  — investing cash flow (VND millions)
 *   ocf_financing  — financing cash flow (VND millions)
 *   confidence     — extraction confidence score (0–1)
 *   extraction_method — REAL DB column value (pdf-parse|ocr-200|ocr-300|news_inference|null)
 *
 * JSON envelope:
 *   { source_tier: 1, found: true, code, period_year, period_quarter, ...fields }
 *   On no-row-found: { source_tier: 1, found: false, code, period_year, period_quarter }
 *
 * CRITICAL (Architect SD-2): extraction_method is a REAL column in financial_reports.
 * DO NOT hardcode any constant — SELECT the actual DB value.
 *
 * DDD: interface layer only — direct DB read, no domain service calls.
 * Pattern: follows cashFlowTool.ts (U-4 DB injection — getDb() inside handler).
 *
 * NFR-4: get_cash_flow (1890a-A) MUST NOT be removed or modified. Both tools coexist.
 * Use get_bctc_ocf for focused OCF forensic-gate; use get_cash_flow for full CF statement + FCF.
 *
 * @module interface/mcp/tools/financial-reports/getBctcOcfTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "bun:sqlite";

import { getDb } from "../../../../infrastructure/db/schema.js";

// ── DB row type ───────────────────────────────────────────────────────────────

interface BctcOcfRow {
  ocf_operating: number | null;   // aliased from operating_cf
  ocf_investing: number | null;   // aliased from investing_cf
  ocf_financing: number | null;   // aliased from financing_cf
  confidence: number;             // aliased from extraction_confidence
  extraction_method: string | null;  // REAL DB column — per architect SD-2
}

// ── Output envelopes ──────────────────────────────────────────────────────────

interface BctcOcfFound {
  source_tier: 1;
  found: true;
  code: string;
  period_year: number;
  period_quarter: number;
  ocf_operating: number | null;
  ocf_investing: number | null;
  ocf_financing: number | null;
  confidence: number;
  extraction_method: string | null;
}

interface BctcOcfNotFound {
  source_tier: 1;
  found: false;
  code: string;
  period_year: number;
  period_quarter: number;
}

type BctcOcfEnvelope = BctcOcfFound | BctcOcfNotFound;

// ── Zod input schema ─────────────────────────────────────────────────────────

const InputSchema = z.object({
  code: z
    .string()
    .min(1, "code is required")
    .max(10)
    .transform((v) => v.toUpperCase())
    .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive."),
  period_year: z
    .number()
    .int()
    .min(2000)
    .max(2099)
    .describe("Fiscal year (e.g. 2025)."),
  period_quarter: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe("Quarter (1–4)."),
});

export type GetBctcOcfInput = z.input<typeof InputSchema>;

export type GetBctcOcfOutput = {
  content: [{ type: "text"; text: string }];
};

// ── Handler factory (testable — accepts injected DB) ─────────────────────────

export function buildGetBctcOcfHandler(
  db: InstanceType<typeof Database>,
): (input: GetBctcOcfInput) => Promise<GetBctcOcfOutput> {
  return async (rawInput: GetBctcOcfInput): Promise<GetBctcOcfOutput> => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                source_tier: 1 as const,
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

    const { code, period_year, period_quarter } = parsed.data;

    // SELECT extraction_method from DB — REAL column (architect SD-2: do NOT hardcode)
    // FIX-GET-BCTC-OCF-SQL-COLUMN: live schema uses operating_cf/investing_cf/financing_cf
    // and extraction_confidence; alias to match BctcOcfRow interface and output envelope.
    const sql = `
      SELECT
        operating_cf   AS ocf_operating,
        investing_cf   AS ocf_investing,
        financing_cf   AS ocf_financing,
        extraction_confidence AS confidence,
        extraction_method
      FROM financial_reports
      WHERE action_code = ?
        AND period_year = ?
        AND period_quarter = ?
      ORDER BY id DESC
      LIMIT 1
    `;

    const row = db
      .prepare<BctcOcfRow, [string, number, number]>(sql)
      .get(code, period_year, period_quarter);

    if (!row) {
      const envelope: BctcOcfNotFound = {
        source_tier: 1,
        found: false,
        code,
        period_year,
        period_quarter,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
      };
    }

    const envelope: BctcOcfFound = {
      source_tier: 1,
      found: true,
      code,
      period_year,
      period_quarter,
      ocf_operating: row.ocf_operating,
      ocf_investing: row.ocf_investing,
      ocf_financing: row.ocf_financing,
      confidence: row.confidence,
      extraction_method: row.extraction_method,  // REAL DB column value
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(envelope, null, 2) }],
    };
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerGetBctcOcfTool(server: McpServer): void {
  server.tool(
    "get_bctc_ocf",
    "Return the 3 OCF cash flow sections (operating/investing/financing) for a VN stock ticker. " +
      "Fields: ocf_operating, ocf_investing, ocf_financing (VND millions), confidence (0–1), " +
      "extraction_method (pdf-parse|ocr-200|ocr-300|news_inference). " +
      "source_tier=1 (SSC portal, tier-1 official source). " +
      "Use for FA Layer 7 G-step: focused OCF forensic check. " +
      "For full CF statement (operating_cf + capex + FCF + OCF/NI ratio), use get_cash_flow instead. " +
      "On no-row-found: returns { source_tier: 1, found: false, code, period_year, period_quarter }.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("VN stock ticker (e.g. VCB, FPT). Case-insensitive."),
      period_year: z
        .number()
        .int()
        .min(2000)
        .max(2099)
        .describe("Fiscal year (e.g. 2025)."),
      period_quarter: z
        .number()
        .int()
        .min(1)
        .max(4)
        .describe("Quarter (1–4)."),
    },
    async ({ code, period_year, period_quarter }) => {
      const db = getDb();
      const handler = buildGetBctcOcfHandler(db);
      return handler({ code, period_year, period_quarter });
    },
  );
}
