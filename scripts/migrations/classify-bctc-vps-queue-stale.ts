/**
 * Migration: classify-bctc-vps-queue-stale
 *
 * Task: FIX-BCTC-VPS-QUEUE-STALE-TRIAGE (2026-06-08)
 * Signal: sau-c104-c16 + report 3095
 *
 * Problem:
 *   C-16 auditor check counts 338 `pending` rows older than 72h as stale.
 *   Bulk are BCTC-HIST-VPS-BACKFILL historical rows that CANNOT drain
 *   (sources gone/geo-dead) and Q1-2026 rows gated on pdf-extractor
 *   (A-20 CPU-cgroup starvation — do NOT trigger until architect fix lands).
 *
 * Actions (HARD RULE: NO silent row deletion):
 *   A) deferred_infra  — 329 historical pending rows (2023Q4–2025Q4)
 *      Criteria: status='pending' AND period_year < 2026 (or period_year=2025 AND period_quarter='Q4')
 *      Rationale: HIST-VPS-BACKFILL rows; sources geo-blocked/removed; 0 attempts; never drainable
 *
 *   B) blocked_pdf_extractor — 26 Q1-2026 pending rows
 *      Criteria: status='pending' AND period_year=2026 AND period_quarter='Q1'
 *      Rationale: VPS fetch was triggered, PDF extractor CPU-cgroup starvation (A-20, 3rd recurrence);
 *                 OCR load re-triggers starvation; re-queue ONLY after architect fix lands.
 *
 * Post-migration: C-16 query updated to exclude these statuses.
 * Re-queue precondition: architect fix for A-20 (CPU-cgroup) must land before
 *   blocked_pdf_extractor rows can be reset to pending.
 *
 * Usage:
 *   # Live DB (reads via docker exec — writes against /app/data/market.db in container):
 *   bun scripts/migrations/classify-bctc-vps-queue-stale.ts
 *
 *   # Dry-run (prints SQL plan, no writes):
 *   bun scripts/migrations/classify-bctc-vps-queue-stale.ts --dry-run
 *
 * NOTE: This script must be run FROM THE HOST and pipes SQL into the container
 *       via docker exec. The live DB is at /app/data/market.db inside
 *       vn-market-intelligence-mcp-mcp-server-1.
 */

import { spawnSync } from "child_process";

const DRY_RUN = Bun.argv.includes("--dry-run");
const CONTAINER = "vn-market-intelligence-mcp-mcp-server-1";
const DB_PATH = "/app/data/market.db";

interface Row {
  total: number;
  updated: number;
}

function runInContainer(script: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("docker", ["exec", CONTAINER, "bun", "-e", script], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function countByStatus(): void {
  const script = `
import { Database } from 'bun:sqlite';
const db = new Database('${DB_PATH}', { readonly: true });
const rows = db.query("SELECT status, period_year, period_quarter, count(*) as cnt FROM bctc_vps_queue WHERE status NOT IN ('done','completed','success') GROUP BY status, period_year, period_quarter ORDER BY period_year, period_quarter, status").all();
console.log(JSON.stringify(rows));
db.close();
`.trim();

  const result = runInContainer(script);
  if (result.exitCode !== 0) {
    console.error("Failed to query DB:", result.stderr);
    process.exit(1);
  }
  const rows = JSON.parse(result.stdout) as Array<{ status: string; period_year: number; period_quarter: string; cnt: number }>;
  console.log("\n=== PRE-MIGRATION STATUS COUNTS ===");
  for (const r of rows) {
    console.log(`  ${r.period_year} ${r.period_quarter} | ${r.status.padEnd(25)} | ${r.cnt}`);
  }
}

function applyClassifications(): { deferredInfra: number; blockedPdfExtractor: number } {
  const script = `
import { Database } from 'bun:sqlite';
const db = new Database('${DB_PATH}');

// Count before
const beforeDeferred = db.query("SELECT count(*) as cnt FROM bctc_vps_queue WHERE status='pending' AND NOT (period_year=2026 AND period_quarter='Q1')").get().cnt;
const beforeBlocked = db.query("SELECT count(*) as cnt FROM bctc_vps_queue WHERE status='pending' AND period_year=2026 AND period_quarter='Q1'").get().cnt;

${DRY_RUN ? `
// DRY-RUN: report plan only, no writes
console.log(JSON.stringify({ deferredInfra: beforeDeferred, blockedPdfExtractor: beforeBlocked, dryRun: true }));
` : `
// A) Historical backfill (2023Q4–2025Q4): status → deferred_infra
const deferredResult = db.run("UPDATE bctc_vps_queue SET status='deferred_infra' WHERE status='pending' AND NOT (period_year=2026 AND period_quarter='Q1')");

// B) Q1-2026 gated on pdf-extractor: status → blocked_pdf_extractor
const blockedResult = db.run("UPDATE bctc_vps_queue SET status='blocked_pdf_extractor' WHERE status='pending' AND period_year=2026 AND period_quarter='Q1'");

console.log(JSON.stringify({ deferredInfra: deferredResult.changes, blockedPdfExtractor: blockedResult.changes, dryRun: false }));
`}

db.close();
`.trim();

  const result = runInContainer(script);
  if (result.exitCode !== 0) {
    console.error("Failed to apply classifications:", result.stderr);
    process.exit(1);
  }
  return JSON.parse(result.stdout) as { deferredInfra: number; blockedPdfExtractor: number };
}

function verifyC16(): { staleActionable: number } {
  const script = `
import { Database } from 'bun:sqlite';
const db = new Database('${DB_PATH}', { readonly: true });
const r = db.query("SELECT count(*) as cnt FROM bctc_vps_queue WHERE status='pending' AND created_at < datetime('now','-72 hours')").get();
console.log(JSON.stringify({ staleActionable: r.cnt }));
db.close();
`.trim();

  const result = runInContainer(script);
  if (result.exitCode !== 0) {
    console.error("Failed to verify C-16:", result.stderr);
    process.exit(1);
  }
  return JSON.parse(result.stdout) as { staleActionable: number };
}

function postMigrationCounts(): void {
  const script = `
import { Database } from 'bun:sqlite';
const db = new Database('${DB_PATH}', { readonly: true });
const rows = db.query("SELECT status, count(*) as cnt FROM bctc_vps_queue GROUP BY status ORDER BY cnt DESC").all();
console.log(JSON.stringify(rows));
db.close();
`.trim();

  const result = runInContainer(script);
  if (result.exitCode !== 0) {
    console.error("Failed to get post-migration counts:", result.stderr);
    return;
  }
  const rows = JSON.parse(result.stdout) as Array<{ status: string; cnt: number }>;
  console.log("\n=== POST-MIGRATION STATUS TOTALS ===");
  for (const r of rows) {
    console.log(`  ${r.status.padEnd(25)} | ${r.cnt}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`classify-bctc-vps-queue-stale migration — ${DRY_RUN ? "DRY-RUN" : "LIVE WRITE"}`);
console.log(`Container: ${CONTAINER}`);
console.log(`DB: ${DB_PATH}`);

// Step 1: pre-migration snapshot
countByStatus();

// Step 2: apply classifications
const result = applyClassifications();
console.log(`\n=== CLASSIFICATION RESULT ===`);
if (result.dryRun) {
  console.log(`  [DRY-RUN] Would set deferred_infra:         ${result.deferredInfra} rows`);
  console.log(`  [DRY-RUN] Would set blocked_pdf_extractor:  ${result.blockedPdfExtractor} rows`);
} else {
  console.log(`  Applied deferred_infra:         ${result.deferredInfra} rows`);
  console.log(`  Applied blocked_pdf_extractor:  ${result.blockedPdfExtractor} rows`);
}

// Step 3: verify C-16 post-migration
if (!DRY_RUN) {
  const c16 = verifyC16();
  console.log(`\n=== C-16 POST-MIGRATION ===`);
  console.log(`  Stale actionable pending >72h: ${c16.staleActionable}`);
  if (c16.staleActionable === 0) {
    console.log("  PASS — C-16 will pass on next auditor run");
  } else {
    console.warn(`  WARN — ${c16.staleActionable} rows still actionable-pending (investigate)`);
  }
  postMigrationCounts();
}

console.log("\nDone.");
