/**
 * scripts/audit-bctc-confidence-1345b.ts
 *
 * Task 1345b — Post-deployment BCTC Confidence Audit Script.
 *
 * Queries all BCTC rows in financial_reports, re-applies
 * validateFinancialFigures() to detect historical corruption patterns.
 * Produces reports/BCTC_CONFIDENCE_AUDIT_1345b.md.
 *
 * Usage:
 *   bun run scripts/audit-bctc-confidence-1345b.ts
 *
 * Environment:
 *   DB_PATH — path to the SQLite database (defaults to data/financial.db)
 */

import { Database } from "bun:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { validateFinancialFigures } from "../apps/mcp-server/src/domain/services/financial-reports/financialFiguresValidator.js";

const DB_PATH = Bun.env["DB_PATH"] ?? join(import.meta.dir, "..", "data", "financial.db");
const REPORT_PATH = join(import.meta.dir, "..", "reports", "BCTC_CONFIDENCE_AUDIT_1345b.md");

interface ReportRow {
  id: string;
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  total_assets: number | null;
  equity_total: number | null;
  total_liabilities: number | null;
  operating_margin_pct: number | null;
  net_revenue: number | null;
  extraction_confidence: number | null;
  confidence_financial: number | null;
  validation_status: string | null;
  parsed_at: string | null;
}

interface AuditResult {
  id: string;
  action_code: string;
  period: string;
  confidence_financial_recomputed: number;
  confidence_financial_stored: number | null;
  extraction_confidence: number | null;
  composite_confidence: number;
  validation_status: string | null;
  flags: string[];
}

async function main(): Promise<void> {
  console.log(`[audit-1345b] Connecting to DB: ${DB_PATH}`);

  let db: Database;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error(`[audit-1345b] Cannot open DB: ${err}`);
    process.exit(1);
  }

  // Check if new 1345b columns exist (they are added by schema migration at startup)
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(financial_reports)").all();
  const colNames = new Set(cols.map((c) => c.name));
  const hasConfFinancial = colNames.has("confidence_financial");
  const hasOcrConf = colNames.has("ocr_confidence");

  const selectCols = [
    "id", "action_code", "period_year", "period_quarter",
    "total_assets", "equity_total", "total_liabilities",
    "operating_margin_pct", "net_revenue",
    "extraction_confidence",
    hasConfFinancial ? "confidence_financial" : "NULL as confidence_financial",
    "validation_status", "parsed_at",
  ].join(", ");

  if (!hasConfFinancial) {
    console.warn("[audit-1345b] WARNING: confidence_financial column missing — DB not yet migrated. Showing recomputed values only.");
  }
  if (!hasOcrConf) {
    console.warn("[audit-1345b] WARNING: ocr_confidence column missing — DB not yet migrated.");
  }

  const rows = db
    .query<ReportRow, []>(`
      SELECT ${selectCols}
      FROM financial_reports
      ORDER BY action_code, period_year, period_quarter
    `)
    .all();

  console.log(`[audit-1345b] Loaded ${rows.length} BCTC rows.`);

  const results: AuditResult[] = [];

  for (const row of rows) {
    const period = row.period_quarter
      ? `${row.period_year}-Q${row.period_quarter}`
      : `${row.period_year}`;

    // operating_margin_pct is stored as percentage; convert to ratio for validator
    const operatingMarginRatio =
      row.operating_margin_pct !== null ? row.operating_margin_pct / 100 : null;

    const recomputed = validateFinancialFigures({
      totalAssets: row.total_assets,
      totalEquity: row.equity_total,
      totalLiabilities: row.total_liabilities,
      operatingMargin: operatingMarginRatio,
      netRevenue: row.net_revenue,
    });

    const extractionConf = row.extraction_confidence ?? 1.0;
    const composite = Math.min(extractionConf, recomputed);

    const flags: string[] = [];
    if (recomputed === 0.0) flags.push("HARD_VIOLATION");
    if (composite <= 0.3) flags.push("COMPOSITE_LOW");
    if (row.total_assets !== null && row.equity_total !== null &&
        row.total_assets > 0 && row.equity_total > 0 &&
        row.total_assets < row.equity_total) {
      flags.push("BCTC-VAL-01:assets<equity");
    }
    if (row.total_assets !== null && row.total_assets < 0) flags.push("BCTC-VAL-02:assets<0");
    if (row.total_liabilities !== null && row.total_liabilities < 0) flags.push("BCTC-VAL-04:liabilities<0");
    if (operatingMarginRatio !== null &&
        !(operatingMarginRatio > -5.0 && operatingMarginRatio < 1.0)) {
      flags.push(`BCTC-VAL-03:margin=${operatingMarginRatio.toFixed(2)}`);
    }
    if (row.net_revenue !== null && row.net_revenue <= 0) flags.push("BCTC-VAL-05:revenue<=0");
    if (row.equity_total !== null && row.equity_total < 0) flags.push("BCTC-VAL-06:equity<0");

    results.push({
      id: row.id,
      action_code: row.action_code,
      period,
      confidence_financial_recomputed: recomputed,
      confidence_financial_stored: row.confidence_financial,
      extraction_confidence: row.extraction_confidence,
      composite_confidence: composite,
      validation_status: row.validation_status,
      flags,
    });
  }

  // Summarize
  const total = results.length;
  const hardViolations = results.filter((r) => r.confidence_financial_recomputed === 0.0);
  const compositeLow = results.filter((r) => r.composite_confidence <= 0.3);
  const softOnly = results.filter(
    (r) => r.confidence_financial_recomputed > 0.0 && r.confidence_financial_recomputed < 1.0,
  );
  const clean = results.filter((r) => r.confidence_financial_recomputed === 1.0);

  // Build report markdown
  const lines: string[] = [
    `# BCTC Confidence Audit — Task 1345b`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**DB:** ${DB_PATH}`,
    `**Total rows:** ${total}`,
    ``,
    `## Summary`,
    ``,
    `| Category | Count | % |`,
    `|----------|-------|---|`,
    `| Clean (confidence=1.0) | ${clean.length} | ${pct(clean.length, total)} |`,
    `| Hard violations (0.0) | ${hardViolations.length} | ${pct(hardViolations.length, total)} |`,
    `| Soft penalties (0.1–0.9) | ${softOnly.length} | ${pct(softOnly.length, total)} |`,
    `| Composite <= 0.3 (signal skip) | ${compositeLow.length} | ${pct(compositeLow.length, total)} |`,
    ``,
    `## Hard Violations (BCTC-VAL-01 / VAL-02 / VAL-04)`,
    ``,
  ];

  if (hardViolations.length === 0) {
    lines.push(`_No hard violations detected._`);
  } else {
    lines.push(`| Ticker | Period | Flags | Extraction Conf | Stored Fin Conf |`);
    lines.push(`|--------|--------|-------|-----------------|-----------------|`);
    for (const r of hardViolations) {
      lines.push(
        `| ${r.action_code} | ${r.period} | ${r.flags.join(", ")} | ${r.extraction_confidence?.toFixed(2) ?? "null"} | ${r.confidence_financial_stored?.toFixed(2) ?? "null"} |`,
      );
    }
  }

  lines.push(``, `## Soft Violations (confidence < 1.0 but > 0.0)`, ``);

  if (softOnly.length === 0) {
    lines.push(`_No soft violations detected._`);
  } else {
    lines.push(`| Ticker | Period | Conf | Flags |`);
    lines.push(`|--------|--------|------|-------|`);
    for (const r of softOnly.slice(0, 50)) {
      // Cap to 50 rows for readability
      lines.push(
        `| ${r.action_code} | ${r.period} | ${r.confidence_financial_recomputed.toFixed(2)} | ${r.flags.join(", ")} |`,
      );
    }
    if (softOnly.length > 50) {
      lines.push(``, `_... and ${softOnly.length - 50} more rows (truncated)_`);
    }
  }

  lines.push(
    ``,
    `## Conclusion`,
    ``,
    `- Hard violations indicate OCR extraction corruption (VNM/VEA pattern).`,
    `- All rows with composite_confidence <= 0.3 should NOT have generated conviction signals.`,
    `- After this migration, new extractions will store \`confidence_financial\` in the DB.`,
    `- Run \`UPDATE financial_reports SET confidence_financial = <recomputed>\` for historical rows if needed.`,
    ``,
    `_Report generated by Task 1345b audit script._`,
  );

  const reportContent = lines.join("\n");

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, reportContent, "utf8");

  console.log(`[audit-1345b] Report written to: ${REPORT_PATH}`);
  console.log(`[audit-1345b] Summary: ${total} rows, ${hardViolations.length} hard, ${softOnly.length} soft, ${compositeLow.length} low-composite`);

  db.close();
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

await main();
