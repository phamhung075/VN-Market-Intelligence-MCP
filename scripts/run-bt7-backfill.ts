/**
 * BT-7 re-backfill runner — one-shot script
 *
 * Invokes backfillBctcTables() against the live pdf-extractor (localhost:5001)
 * and the local market.db so that the BT-7 section-filter + period-fix code
 * (commit 210a0a62) is applied to all 12 eligible docs.
 *
 * Run from repo root:
 *   cd apps/mcp-server && bun scripts/run-bt7-backfill.ts
 *
 * ENV-ISOLATION guard (EI-P1-2):
 *   DB path is resolved from DB_PATH env var (falls back to repo-relative market.db).
 *   If the resolved path does NOT end with "market.db", the script refuses to run
 *   unless --force-dev is passed — prevents accidental writes to a dev/test datastore.
 *   Resolved DB path and APP_ENV are always printed before any write (fail-loud).
 */

import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { backfillBctcTables } from "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/application/usecases/bctcBatchTableBackfillJob";

const PROJECT_ROOT = resolve(import.meta.dir, "..");

// Resolve DB path from env — never hardcode a machine-specific absolute path.
const DB_PATH =
  process.env.DB_PATH ??
  resolve(PROJECT_ROOT, "apps", "mcp-server", "data", "market.db");

const APP_ENV = process.env.APP_ENV ?? "production";
const FORCE_DEV = process.argv.includes("--force-dev");

const EXTRACT_TABLE_URL = "http://localhost:5001";

// --- ENV-ISOLATION GUARD (fail-loud per docs/protocols/fail-loud-protocol.md) ---
console.log(`[run-bt7-backfill] APP_ENV=${APP_ENV}`);
console.log(`[run-bt7-backfill] DB_PATH (resolved)=${DB_PATH}`);

if (!DB_PATH.endsWith("market.db")) {
  if (!FORCE_DEV) {
    console.error(
      `[run-bt7-backfill] REFUSED: resolved DB path "${DB_PATH}" does not end with "market.db".` +
        ` Looks like a dev/test datastore. Pass --force-dev to override.`
    );
    process.exit(1);
  }
  console.warn(
    `[run-bt7-backfill] WARNING: running against non-production DB "${DB_PATH}" (--force-dev supplied).`
  );
}
// ---------------------------------------------------------------------------------

async function main() {
  console.log(`[run-bt7-backfill] Opening DB: ${DB_PATH}`);
  const db = new Database(DB_PATH, { readwrite: true, create: false });

  // WAL mode check
  const walMode = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
  console.log(`[run-bt7-backfill] journal_mode=${walMode.journal_mode}`);

  console.log(`[run-bt7-backfill] Calling backfillBctcTables(extractTableUrl=${EXTRACT_TABLE_URL}) ...`);
  const result = await backfillBctcTables(db, EXTRACT_TABLE_URL, "balance_sheet");

  console.log("\n[run-bt7-backfill] === BACKFILL COMPLETE ===");
  console.log(JSON.stringify(result, null, 2));

  // Per-doc summary
  console.log("\n[run-bt7-backfill] === PER-DOC OUTCOMES ===");
  for (const o of result.outcomes) {
    const label = `${o.action_code} ${o.period_year}Q${o.period_quarter ?? "?"}`;
    if (o.status === "success") {
      console.log(`  OK    ${label} (${o.doc_id.slice(0, 8)}): rows_stored=${o.rows_stored} balance_pass=${o.balance_pass}`);
    } else {
      console.log(`  ${o.status.toUpperCase().padEnd(16)} ${label} (${o.doc_id.slice(0, 8)}): ${o.error ?? o.blocked_reason ?? ""}`);
    }
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[run-bt7-backfill] FATAL:", err);
  process.exit(1);
});
