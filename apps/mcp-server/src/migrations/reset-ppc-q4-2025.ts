// apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts
// One-shot: reset PPC Q4-2025 stuck row (id=255887). Run once. Idempotent.
// NOT registered in runMigrations() sequence — invoke explicitly via:
//   docker exec <container> bun run src/migrations/reset-ppc-q4-2025.ts
//
// Context: row exhausted 6 enricher attempts before FIX-CTG-1 + FIX-VPS-SSC-CURL-SCRAPER
// shipped. last_attempt=NULL means Arm 2 (grace-period) can never fire. Manual reset required.
// Idempotency guard: WHERE status='url_not_found' → second run matches 0 rows, no-op.

import { getDb } from "../infrastructure/db/schema.js";

const db = getDb();

// BEFORE state — read for audit log
const before = db
  .query(
    "SELECT id, status, attempts, source_url, last_attempt FROM bctc_vps_queue WHERE id = ?",
  )
  .get(255887) as Record<string, unknown> | null;

console.log("BEFORE:", JSON.stringify(before));

// Idempotent UPDATE — bound parameters only, no interpolation
const result = db.run(
  `UPDATE bctc_vps_queue
   SET status = 'pending', attempts = 0, source_url = NULL, last_attempt = NULL
   WHERE id = ? AND status = 'url_not_found'`,
  [255887],
);

console.log(`Rows affected: ${result.changes}`);
// Expected: 1 on first run, 0 on subsequent runs

// AFTER state — verify
const after = db
  .query(
    "SELECT id, status, attempts, source_url, last_attempt FROM bctc_vps_queue WHERE id = ?",
  )
  .get(255887) as Record<string, unknown> | null;

console.log("AFTER:", JSON.stringify(after));

if (result.changes === 1) {
  console.log("PASS: row reset to pending/0/NULL/NULL");
} else if (result.changes === 0) {
  const s = (after as { status?: string } | null)?.status;
  if (s === "pending") {
    console.log("PASS (no-op): row already pending — idempotent guard fired");
  } else {
    console.error(`WARN: 0 rows affected but status is '${s}' — unexpected state`);
    process.exit(1);
  }
}
