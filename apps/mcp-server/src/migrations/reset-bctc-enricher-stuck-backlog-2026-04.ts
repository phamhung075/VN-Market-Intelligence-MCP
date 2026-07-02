// apps/mcp-server/src/migrations/reset-bctc-enricher-stuck-backlog-2026-04.ts
//
// One-shot: reset the 21 stuck HOSE Q4-2025 `url_not_found` rows created
// 2026-04-28 that were false-terminalized BEFORE the FIX-BCTC-ENRICHER-STUCK-BACKLOG
// last_attempt fix shipped (their last_attempt is NULL, so the enricher's Arm 2
// grace-period retry could structurally never re-select them — see
// bctcQueueEnricherJob.ts and docs/vps-sources/bctc-discover-stale-15d/enricher-liveness.md).
//
// Generalization of the reset-ppc-q4-2025.ts one-row hand patch (same bug
// class, 2nd occurrence) — this is a bounded, explicit-predicate reset, not a
// bare-status sweep. It intentionally does NOT touch:
//   - the 15 genuine HNX/UPCOM non-filer rows (BDI/DAG/DLC/JSH/SIS/VDC/VNH/VEA
//     + Q4-2025/Q1-2026 variants) — excluded by both the explicit ticker list
//     AND the exchange-agnostic created_at/last_attempt predicate (those rows
//     have last_attempt=NULL too, but were created earlier and are NOT in the
//     ticker allowlist below).
//   - the 2 VCB `enrich_failed` rows (Q1-2025, Q1-2026) — excluded by the
//     `status = 'url_not_found'` predicate; those rows already have
//     last_attempt set (by bctcPdfPullJob's enrich_failed marker) and are now
//     correctly covered by the enricher's extended Arm 2 (status IN
//     ('url_not_found','enrich_failed')) — no manual reset needed for them.
//
// NOT registered in runMigrations() / initFinancialReportsTables() — invoke
// explicitly:
//   bun run src/migrations/reset-bctc-enricher-stuck-backlog-2026-04.ts --dry-run   (report only, no writes)
//   bun run src/migrations/reset-bctc-enricher-stuck-backlog-2026-04.ts             (live write)
//
// Idempotency guard: WHERE status = 'url_not_found' → second run matches 0 rows
// (rows are already 'pending' after the first run), matching the reset-ppc-q4-2025.ts
// idempotency pattern.

import { getDb } from "../infrastructure/db/schema.js";

// Explicit ticker allowlist — the 21 HOSE tickers from the enricher-liveness.md
// dump (§2, "NEW since 2026-06-25 — 23 rows" table) that are url_not_found.
// The table lists 23 rows total; 2 of those (VCB Q1-2025, VCB Q1-2026) are
// status='enrich_failed', NOT 'url_not_found', and are excluded here by both
// the ticker list AND the status predicate (handled by the enricher's new
// Arm 2 extension instead — see bctcQueueEnricherJob.ts).
const STUCK_HOSE_TICKERS = [
  "ACB", "ACV", "BID", "CTG", "D2D", "DHG", "EIB", "GAS", "GVR", "HCM",
  "HSG", "HVN", "MBB", "NKG", "POW", "SSI", "VCI", "VHM", "VIC", "VPB", "VRE",
] as const;

const PERIOD_YEAR = 2025;
const PERIOD_QUARTER = "Q4";
const CREATED_AT_WINDOW_START = "2026-04-28 00:00:00";
const CREATED_AT_WINDOW_END = "2026-04-30 23:59:59";

const DRY_RUN = Bun.argv.includes("--dry-run");

const db = getDb();

const tickerPlaceholders = STUCK_HOSE_TICKERS.map(() => "?").join(", ");

// Explicit predicate — status + last_attempt IS NULL + created_at window +
// exact ticker allowlist + period. Never a bare `WHERE status = 'url_not_found'`
// sweep (that would also match the 15 genuine HNX/UPCOM non-filer rows, which
// legitimately have no discoverable filing and must stay terminal).
const SELECT_SQL = `
  SELECT id, action_code, period_year, period_quarter, status, attempts, source_url, last_attempt, created_at
  FROM bctc_vps_queue
  WHERE status = 'url_not_found'
    AND last_attempt IS NULL
    AND period_year = ?
    AND period_quarter = ?
    AND created_at BETWEEN ? AND ?
    AND action_code IN (${tickerPlaceholders})
  ORDER BY action_code ASC`;

const selectParams = [
  PERIOD_YEAR,
  PERIOD_QUARTER,
  CREATED_AT_WINDOW_START,
  CREATED_AT_WINDOW_END,
  ...STUCK_HOSE_TICKERS,
];

type QueueRow = {
  id: number;
  action_code: string;
  period_year: number;
  period_quarter: string;
  status: string;
  attempts: number;
  source_url: string | null;
  last_attempt: string | null;
  created_at: string;
};

const matched = db.query<QueueRow, typeof selectParams>(SELECT_SQL).all(...selectParams);

console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Matched ${matched.length} row(s) against the explicit predicate:`);
console.log(JSON.stringify(matched, null, 2));

if (matched.length !== STUCK_HOSE_TICKERS.length) {
  console.warn(
    `WARN: expected ${STUCK_HOSE_TICKERS.length} matches (one per allowlisted ticker) but found ${matched.length}. ` +
      `This is expected on a 2nd run (idempotency guard: rows already reset to 'pending' → 0 matches) ` +
      `or if live-DB state has drifted since enricher-liveness.md was written. Investigate before assuming a bug.`,
  );
}

if (DRY_RUN) {
  console.log("\n[DRY-RUN] No writes performed. Re-run without --dry-run to apply.");
  process.exit(0);
}

if (matched.length === 0) {
  console.log("\nNo matching rows — nothing to reset (already applied, or predicate matched 0 rows).");
  process.exit(0);
}

const resetStmt = db.prepare<void, [number]>(
  `UPDATE bctc_vps_queue
   SET status = 'pending', attempts = 0, last_attempt = NULL
   WHERE id = ? AND status = 'url_not_found'`,
);

let changed = 0;
for (const row of matched) {
  const result = resetStmt.run(row.id);
  changed += result.changes;
}

console.log(`\nRows reset to pending/attempts=0/last_attempt=NULL: ${changed} / ${matched.length} matched`);

if (changed === matched.length) {
  console.log("PASS: all matched rows reset.");
} else {
  console.error(`WARN: only ${changed} of ${matched.length} matched rows were updated — investigate.`);
  process.exit(1);
}
