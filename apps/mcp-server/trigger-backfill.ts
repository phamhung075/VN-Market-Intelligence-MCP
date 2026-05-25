/**
 * One-shot trigger for bctcBatchTableBackfillJob
 * Usage: bun run trigger-backfill.ts
 */

import { Database } from "bun:sqlite";
import { backfillBctcTables } from "./src/application/usecases/bctcBatchTableBackfillJob.js";

const dbPath = process.env.DB_PATH || "/app/data/market.db";
const extractTableUrl = process.env.PDF_EXTRACTOR_URL || "http://pdf-extractor:5001";

console.log(`[trigger-backfill] Opening DB at ${dbPath}`);
const db = new Database(dbPath);

console.log(`[trigger-backfill] Starting backfill from ${extractTableUrl}/extract-tables`);
const result = await backfillBctcTables(db, extractTableUrl, "balance_sheet");

console.log("\n=== BACKFILL RESULT ===");
console.log(JSON.stringify(result, null, 2));

// Detailed outcome report
if (result.outcomes.length > 0) {
  console.log("\n=== PER-DOC OUTCOMES ===");
  for (const outcome of result.outcomes) {
    const status = outcome.status;
    const label = `${outcome.action_code} ${outcome.period_year}Q${outcome.period_quarter ?? "?"}`;
    if (status === "success") {
      console.log(`✓ ${label}: ${outcome.rows_stored} rows, balance=${outcome.balance_pass}`);
    } else if (status === "gate_blocked") {
      console.log(`⊘ ${label}: BLOCKED — ${outcome.blocked_reason}`);
    } else if (status === "error") {
      console.log(`✗ ${label}: ERROR — ${outcome.error}`);
    } else if (status === "skipped_no_file") {
      console.log(`⊘ ${label}: SKIPPED (PDF file not found)`);
    }
  }
}

db.close();
process.exit(result.failed > 0 ? 1 : 0);
