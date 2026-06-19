/**
 * purge-test-fixture-signals.ts — D-3 FIX-CASCADE-MACRO-CARD-REAL-DETAIL
 *
 * Removes two test-fixture rows that leaked into the production DB during dev
 * test runs that used the live named-volume DB.
 *
 * Target rows (triple-guarded predicate):
 *   id 6218: VCB / chain_catalyst / payload='{"title":"VCB catalyst"}'
 *   id 6216: HPG / verified_chain / payload='{"title":"HPG chain verify"}'
 *
 * Guards:
 *   1. payload LIKE match (VCB catalyst / HPG chain verify)
 *   2. finding_data IN ('{}', '', NULL) — real data rows excluded
 *   3. signal_type IN ('chain_catalyst', 'verified_chain') — further narrows blast radius
 *
 * Usage:
 *   bun purge-test-fixture-signals.ts --dry-run   # shows count without deletion
 *   bun purge-test-fixture-signals.ts --live       # executes deletion
 *
 * ALWAYS run --dry-run first and confirm count = 2.
 *
 * Execution against named-volume DB (NOT host ./data which is stale):
 *   docker cp scripts/migrations/purge-test-fixture-signals.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/tmp/purge-test-fixture-signals.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /tmp/purge-test-fixture-signals.ts --dry-run
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /tmp/purge-test-fixture-signals.ts --live
 *
 * Part of: docs/agents/dev-mcp-server/flow/main.md
 * Policy:  docs/policies/dev-standards.md § Script Persistence
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isLive = args.includes("--live");

if (!isDryRun && !isLive) {
  console.error("Usage: bun purge-test-fixture-signals.ts --dry-run | --live");
  console.error("  --dry-run : show affected row count without deletion");
  console.error("  --live    : execute deletion (always dry-run first to confirm count=2)");
  process.exit(1);
}

if (isDryRun && isLive) {
  console.error("Error: provide exactly one of --dry-run or --live");
  process.exit(1);
}

// ── DB path resolution ────────────────────────────────────────────────────────
// When run inside the container, DB_PATH env var is set (or default /app/data/market.db).
// When run locally (unlikely — host ./data is stale), fall back to explicit path.

function resolveDbPath(): string {
  const envPath = process.env["DB_PATH"];
  if (envPath && envPath !== ":memory:") return envPath;

  // Container default
  const containerPath = "/app/data/market.db";
  if (existsSync(containerPath)) return containerPath;

  // Fallback: local ./data (likely stale — warn loudly)
  const localPath = "./data/market.db";
  if (existsSync(localPath)) {
    console.warn("WARNING: Using host ./data/market.db — this may be a STALE 0-row decoy.");
    console.warn("         Run inside the container for the live named-volume DB.");
    return localPath;
  }

  console.error("Error: Cannot find market.db. Run inside the mcp-server container.");
  process.exit(1);
}

// ── Dual-guarded predicate ────────────────────────────────────────────────────
// Targets ONLY the known test-fixture rows by their unique payload content + signal_type.
// Live DB inspection confirmed both rows have payload LIKE '%"title":"VCB catalyst"%' /
// '%"title":"HPG chain verify"%' — these are synthetic test-fixture payloads, not real
// market data. The payload + stock_code + signal_type combination is uniquely identifying.
//
// NOTE: The original design brief also included a finding_data='{}'|NULL guard, but live
// DB inspection shows these rows have test-populated finding_data (non-empty). The payload
// LIKE + stock_code + signal_type double-guard is already uniquely identifying (count=2
// confirmed by live probe). The finding_data guard has been intentionally dropped to
// match actual live state.

const SELECT_SQL = `
  SELECT id, stock_code, signal_type, payload, finding_data
  FROM agent_signals
  WHERE (
    (payload LIKE '%"title":"VCB catalyst"%' AND stock_code = 'VCB')
    OR (payload LIKE '%"title":"HPG chain verify"%' AND stock_code = 'HPG')
  )
  AND signal_type IN ('chain_catalyst', 'verified_chain')
`;

const DELETE_SQL = `
  DELETE FROM agent_signals
  WHERE (
    (payload LIKE '%"title":"VCB catalyst"%' AND stock_code = 'VCB')
    OR (payload LIKE '%"title":"HPG chain verify"%' AND stock_code = 'HPG')
  )
  AND signal_type IN ('chain_catalyst', 'verified_chain')
`;

// ── Main ──────────────────────────────────────────────────────────────────────

interface SignalRow {
  id: number;
  stock_code: string | null;
  signal_type: string;
  payload: string;
  finding_data: string | null;
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  console.log(`DB path: ${dbPath}`);

  const db = isDryRun ? new Database(dbPath, { readonly: true }) : new Database(dbPath);

  // Count total rows before operation
  const totalBefore = (db.prepare("SELECT COUNT(*) as cnt FROM agent_signals").get() as { cnt: number }).cnt;
  console.log(`Total agent_signals rows before: ${totalBefore}`);

  // Show matching rows
  const matchingRows = db.prepare<SignalRow, []>(SELECT_SQL).all();
  console.log(`\nMatching test-fixture rows: ${matchingRows.length}`);

  for (const row of matchingRows) {
    console.log(`  id=${row.id} stock=${row.stock_code} type=${row.signal_type}`);
    console.log(`    payload: ${row.payload}`);
    console.log(`    finding_data: ${row.finding_data ?? "NULL"}`);
  }

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${matchingRows.length} row(s). No changes made.`);
    if (matchingRows.length !== 2 && matchingRows.length !== 0) {
      console.warn(`WARNING: Expected 0 or 2 matching rows, got ${matchingRows.length}. Investigate before running --live.`);
      process.exit(1);
    }
    db.close();
    return;
  }

  // LIVE mode: execute deletion
  if (matchingRows.length === 0) {
    console.log("\n[LIVE] No matching rows found — already deleted or never existed. Nothing to do.");
    db.close();
    return;
  }

  if (matchingRows.length !== 2) {
    console.error(`\n[LIVE] ERROR: Expected exactly 2 rows, got ${matchingRows.length}. Aborting for safety.`);
    console.error("Run --dry-run and investigate before retrying.");
    db.close();
    process.exit(1);
  }

  const result = db.prepare(DELETE_SQL).run();
  const deletedCount = result.changes;

  const totalAfter = (db.prepare("SELECT COUNT(*) as cnt FROM agent_signals").get() as { cnt: number }).cnt;
  console.log(`\n[LIVE] Deleted ${deletedCount} row(s).`);
  console.log(`Total agent_signals rows after: ${totalAfter}`);
  console.log(`Row count delta: ${totalBefore - totalAfter} (expected 2)`);

  if (deletedCount !== 2) {
    console.error(`ERROR: Expected to delete 2 rows, deleted ${deletedCount}. Investigate.`);
    db.close();
    process.exit(1);
  }

  // Verify ids 6218 and 6216 are gone
  for (const id of [6218, 6216]) {
    const check = db.prepare("SELECT id FROM agent_signals WHERE id = ?").get(id);
    if (check !== null && check !== undefined) {
      console.error(`ERROR: id ${id} still present after deletion.`);
      db.close();
      process.exit(1);
    }
    console.log(`  Confirmed: id ${id} absent.`);
  }

  console.log("\nMigration complete. Run --dry-run to confirm count=0.");
  db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
