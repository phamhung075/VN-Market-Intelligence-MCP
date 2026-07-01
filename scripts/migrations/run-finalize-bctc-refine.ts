/**
 * scripts/migrations/run-finalize-bctc-refine.ts
 *
 * One-shot re-finalize script for reports whose bctc_refined_units are all DONE
 * but refine_status is still PARTIAL (due to parser section-detection bug).
 *
 * Usage (inside container or with correct DB_PATH):
 *   bun scripts/migrations/run-finalize-bctc-refine.ts [--report-id <uuid>] [--dry-run]
 *
 * Without --report-id: processes ALL PARTIAL reports that have at least one DONE unit
 *   and fewer than 1 PENDING/IN_PROGRESS unit (i.e., finalize-stuck PARTIALs).
 * With --report-id: processes only that specific report.
 *
 * Safety:
 *   - Skips CONFIRMED reports (finalizeBctcRefineHandler layer 1 guard)
 *   - Skips reports where refine_status = 'DONE' or 'REJECTED_SANITY'
 *   - --dry-run prints which reports would be processed, makes no DB writes
 *
 * Context: FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { buildFinalizeBctcRefineHandler } from "../../apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

const args = Bun.argv.slice(2);
const dryRun = args.includes("--dry-run");
const reportIdArg = args.includes("--report-id")
  ? args[args.indexOf("--report-id") + 1]
  : undefined;

const dbPath = Bun.env["DB_PATH"] ?? resolve(import.meta.dir, "../../apps/mcp-server/data/market.db");
console.log(`[run-finalize-bctc-refine] DB: ${dbPath} | dry-run: ${dryRun} | reportId: ${reportIdArg ?? "all-partial"}`);

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

interface CandidateRow {
  id: string;
  action_code: string;
  period_type: string;
  period_year: number;
  refine_status: string;
}

let candidates: CandidateRow[];

if (reportIdArg) {
  candidates = db.query<CandidateRow, [string]>(`
    SELECT id, action_code, period_type, period_year, refine_status
    FROM financial_reports
    WHERE id = ?
      AND refine_status != 'DONE'
      AND refine_status != 'REJECTED_SANITY'
      AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  `).all(reportIdArg);
} else {
  // All PARTIAL reports that have at least 1 DONE unit and 0 PENDING/IN_PROGRESS units
  // These are "stuck PARTIAL" due to BEQ-7 misfire from parser section-detection bug.
  candidates = db.query<CandidateRow, []>(`
    SELECT fr.id, fr.action_code, fr.period_type, fr.period_year, fr.refine_status
    FROM financial_reports fr
    WHERE fr.refine_status = 'PARTIAL'
      AND fr.text_status = 'COMPLETE'
      AND (fr.confirm_status IS NULL OR fr.confirm_status != 'CONFIRMED')
      AND EXISTS (
        SELECT 1 FROM bctc_refined_units u
        WHERE u.report_id = fr.id AND u.window_status = 'DONE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM bctc_refined_units u
        WHERE u.report_id = fr.id AND u.window_status NOT IN ('DONE', 'FAILED')
      )
    ORDER BY fr.action_code, fr.period_year
  `).all();
}

console.log(`[run-finalize-bctc-refine] candidates: ${candidates.length}`);
for (const c of candidates) {
  console.log(`  ${c.action_code} ${c.period_year}/${c.period_type} (${c.id}) — ${c.refine_status}`);
}

if (dryRun) {
  console.log("[run-finalize-bctc-refine] --dry-run: no writes");
  db.close();
  process.exit(0);
}

const handler = buildFinalizeBctcRefineHandler(db);
let succeeded = 0;
let failed = 0;

for (const report of candidates) {
  console.log(`\n[run-finalize-bctc-refine] processing ${report.action_code} ${report.period_year}/${report.period_type} (${report.id})`);
  try {
    const result = await handler({ report_id: report.id, report_status: "DONE" });
    const text = result.content[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    console.log(`  result: ${JSON.stringify(parsed)}`);
    if (parsed.ok) {
      succeeded++;
    } else {
      console.warn(`  WARN: ok=false for ${report.action_code} — ${text.substring(0, 200)}`);
      failed++;
    }
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

db.close();
console.log(`\n[run-finalize-bctc-refine] done — succeeded=${succeeded} failed=${failed}`);
