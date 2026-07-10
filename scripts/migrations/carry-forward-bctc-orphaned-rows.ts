#!/usr/bin/env bun
/**
 * scripts/migrations/carry-forward-bctc-orphaned-rows.ts
 *
 * TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD — Track 1 of the
 * FIX-BCTC-BANK-SUMMARY-MAPPING sprint's W5 replacement (dual-task
 * reconciliation, AC-14, with the near-duplicate FIX-BCTC-BANK-SCALAR-MAPPING
 * task, which is closed as a duplicate pointer — this is the single forward
 * execution thread per pm decision 2026-07-10).
 *
 * Design reference: docs/architecture-briefs/2026-07-10-FIX-BCTC-BANK-SCALAR-MAPPING.md §2.5
 *
 * WHY THIS SCRIPT EXISTS:
 *   `financial_reports` has zero duplicate (action_code, sort_key) pairs —
 *   re-parsing a ticker+period hard-deletes the old row and mints a brand-new
 *   `id`, permanently orphaning any completed agentic-refine work under the
 *   old `id` (no FK cascade/migration). CTG's `96e36139-...` orphan is the
 *   exact same ticker+period (CTG, 2026-Q1) as the currently-served
 *   `e497f7d1-...` — its 451 bctc_table_rows are real, already-refined data
 *   that the currently-served report_id cannot see, so `total_assets` stays
 *   frozen at 0, `net_revenue` stays garbage (~3910), and `net_margin_pct`
 *   reports an impossible ~229157%.
 *
 *   The agentic re-refine path that would normally re-derive this data is
 *   blocked by a separate, out-of-repo harness defect (session-wide
 *   gateway-blind CLI/MCP-connection-lifecycle bug — see architect brief §1).
 *   This script is the deterministic, non-agentic substitute: it physically
 *   copies the orphaned rows onto the current report_id, then reuses the
 *   EXISTING backfill_bctc_scalars aggregator (buildBackfillBctcScalarsHandler,
 *   zero duplicated logic) to re-derive the scalar columns from the
 *   now-present table rows.
 *
 * WHAT THIS SCRIPT DOES:
 *   1. VERIFY (always, read-only snapshot): counts bctc_table_rows for both
 *      the source (orphaned) and target (current) report_id, plus the
 *      target's confirm_status/refine_status.
 *   2. Decision gate (decideMigration — pure function, unit-tested):
 *        - target report_id not found in financial_reports         → refuse (exit 2)
 *        - target confirm_status='CONFIRMED'                       → no-op, never touch (exit 0)
 *        - source has 0 bctc_table_rows                            → refuse, nothing to carry (exit 3)
 *        - target already has the SAME row count as source         → no-op, already migrated (exit 0)
 *        - target has a DIFFERENT nonzero row count than source    → refuse, needs manual reconciliation (exit 4)
 *        - target has 0 rows, source has >0 rows                   → apply
 *   3. Apply (--apply only): INSERT ... SELECT copies every bctc_table_rows
 *      column (except the surrogate `id`) from source to target, remapping
 *      only `report_id`. Source rows are untouched (copy, not move) — the
 *      orphan remains on disk as an audit trail.
 *   4. Scalar reflow: calls buildBackfillBctcScalarsHandler(db)({ report_id:
 *      target }) — the SAME production aggregator used by the live
 *      backfill_bctc_scalars tool (deregistered from the MCP surface per
 *      TOOL-SURFACE-UPGRADE U3, handler retained for direct invocation) — to
 *      derive total_assets/net_revenue/net_margin_pct/etc. from the
 *      newly-present rows. This ONLY sets refine_status='DONE' (and writes
 *      scalars) when all 3 statement sections (balance_sheet/general,
 *      income_statement, cash_flow) are present in the carried-forward rows
 *      (BEQ-6 section-completeness gate) — a correct, deliberate refusal to
 *      fabricate a false-DONE on an incomplete row set. When incomplete, it
 *      sets refine_status='PARTIAL' and leaves the existing (possibly still
 *      garbage) scalar columns untouched — see the KNOWN LIVE RESULT note
 *      below, this is not a script bug.
 *   5. AFTER snapshot: prints the resulting row counts + scalar values for
 *      RAW-verify.
 *
 * Idempotency: running twice is safe. Second run sees target row count ===
 * source row count → no-op (exit 0). Never double-inserts.
 *
 * KNOWN LIVE RESULT (CTG default target, 2026-07-10T00:40Z — TASK-W5-FIX-BCTC-
 * BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD execution): the 451 carried-forward
 * rows for report_id 96e36139-... are 208 income_statement + 173 cash_flow +
 * 70 notes rows — ZERO rows tagged balance_sheet/general. AC-TRACK1-2 (row
 * carry-forward) succeeded (451 rows now attached to the current report_id,
 * verified live), but AC-TRACK1-3 (total_assets/net_revenue/net_margin_pct
 * becoming plausible) did NOT resolve — the balance-sheet section is
 * genuinely absent from this refined dataset, so the BEQ-6 gate correctly
 * refuses to promote to DONE (refine_status is now 'PARTIAL', scalar columns
 * unchanged from their pre-migration garbage values). This is the escalation
 * path AC-TRACK1-3 itself anticipates ("if source rows are still corrupted,
 * this carry-forward uncovers that W2's fixes never reflow'd — escalate if
 * found") — the root defect is one level deeper than W2's row-repair scope:
 * the balance-sheet WINDOW was apparently never captured/tagged during the
 * original agentic-refine pass that produced the orphan, not merely
 * mis-valued within an existing balance-sheet row set. Needs a fresh
 * agentic-refine pass targeting CTG's balance-sheet page window once the
 * gateway-blind defect (architect brief §1) resolves — not re-runnable by
 * this script (no fake/synthesized balance-sheet data will be written here).
 *
 * Usage:
 *   # Verify only (default — no writes):
 *   bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts
 *   bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts --source <id> --target <id>
 *
 *   # Apply (copies rows + triggers scalar reflow):
 *   bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — matches the
 *   # reingest-bctc-report.ts / repair-ohlcv-seed-candle precedent):
 *   docker cp scripts/migrations/carry-forward-bctc-orphaned-rows.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/carry-forward-bctc-orphaned-rows.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/carry-forward-bctc-orphaned-rows.ts --apply
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/apps/mcp-server/data/market.db;
 *             set to /app/data/market.db by docker-compose inside the container).
 *
 * Defaults (CLI-overridable — never baked into any serve-path or domain code,
 * exist ONLY as this operational script's default arguments):
 *   --source e497f7d1-8717-49cc-bfa9-88804464d143's orphan, i.e.
 *            96e36139-5dac-414d-8e4d-20a4725890d1 (old CTG 2026-Q1, 451 rows)
 *   --target e497f7d1-8717-49cc-bfa9-88804464d143 (current CTG 2026-Q1,
 *            re-verify freshness live before relying on this default — AC-16,
 *            this ticker's report_id has already churned twice in a month
 *            per architect brief §2.4/§4).
 *
 * Exit codes:
 *   0 — verified clean / already migrated / confirmed no-op / apply succeeded
 *   1 — DB error / apply failed post-condition
 *   2 — refuse: target report_id not found
 *   3 — refuse: source report_id has 0 bctc_table_rows
 *   4 — refuse: target already has a conflicting (non-matching) row count
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type * as BackfillBctcScalarsModule from "../../apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.js";

// NOTE: the concrete `buildBackfillBctcScalarsHandler` value import is deliberately
// NOT a static top-level import (see resolveBackfillHandlerModule below, used only
// inside the CLI block). Two valid deployment layouts exist for this script and
// they resolve the same module at DIFFERENT relative depths:
//   (a) run from the repo root (`bun scripts/migrations/carry-forward-bctc-orphaned-rows.ts`)
//       → target is ../../apps/mcp-server/src/...
//   (b) `docker cp` flat to /app/ inside the container (the same single-file-cp
//       pattern reingest-bctc-report.ts / repair-ohlcv-seed-candle use), where
//       /app IS apps/mcp-server's own root → target is ./src/...
// A static import can only encode one of these paths; a static import here would
// break whichever context isn't literally matched. The `import type` above is
// erased at build/runtime (types only, zero module resolution cost) and exists
// purely so this file keeps full type-safety on the dynamically-imported module.

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sprint-canonical targets — CLI-overridable defaults only (see file header). */
const DEFAULT_SOURCE_REPORT_ID = "96e36139-5dac-414d-8e4d-20a4725890d1";
const DEFAULT_TARGET_REPORT_ID = "e497f7d1-8717-49cc-bfa9-88804464d143";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationSnapshot {
  targetFound: boolean;
  targetActionCode: string | null;
  targetSortKey: string | null;
  targetConfirmStatus: string | null;
  targetRefineStatus: string | null;
  sourceRowCount: number;
  targetRowCount: number;
}

export interface MigrationDecision {
  action:
    | "apply"
    | "noop_already_migrated"
    | "noop_confirmed"
    | "refuse_target_not_found"
    | "refuse_no_source_rows"
    | "refuse_conflicting_rows";
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only diagnostics (pure w.r.t. caller — DB reads only)
// ─────────────────────────────────────────────────────────────────────────────

interface FrRow {
  action_code: string;
  sort_key: string;
  confirm_status: string | null;
  refine_status: string | null;
}

export function readMigrationSnapshot(
  db: Database,
  sourceReportId: string,
  targetReportId: string,
): MigrationSnapshot {
  const target = db
    .query<FrRow, [string]>(
      "SELECT action_code, sort_key, confirm_status, refine_status FROM financial_reports WHERE id = ?",
    )
    .get(targetReportId);

  const sourceCountRow = db
    .query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_table_rows WHERE report_id = ?")
    .get(sourceReportId);
  const targetCountRow = db
    .query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_table_rows WHERE report_id = ?")
    .get(targetReportId);

  return {
    targetFound: target !== null,
    targetActionCode: target?.action_code ?? null,
    targetSortKey: target?.sort_key ?? null,
    targetConfirmStatus: target?.confirm_status ?? null,
    targetRefineStatus: target?.refine_status ?? null,
    sourceRowCount: sourceCountRow?.c ?? 0,
    targetRowCount: targetCountRow?.c ?? 0,
  };
}

/**
 * decideMigration — pure decision function (exported for unit tests). Given
 * a snapshot, returns what this script should do — never performs I/O.
 */
export function decideMigration(snap: MigrationSnapshot): MigrationDecision {
  if (!snap.targetFound) {
    return {
      action: "refuse_target_not_found",
      reason:
        "target report_id not found in financial_reports — re-verify AC-16 report_id freshness " +
        "(the current CTG/target id may have churned) before retrying with the correct id.",
    };
  }
  if (snap.targetConfirmStatus === "CONFIRMED") {
    return {
      action: "noop_confirmed",
      reason: "target confirm_status=CONFIRMED — human-locked, never touch.",
    };
  }
  if (snap.sourceRowCount === 0) {
    return {
      action: "refuse_no_source_rows",
      reason: "source report_id has 0 bctc_table_rows — nothing to carry forward.",
    };
  }
  if (snap.targetRowCount === snap.sourceRowCount) {
    return {
      action: "noop_already_migrated",
      reason: `target already has ${snap.targetRowCount} rows matching the source count — carry-forward already applied.`,
    };
  }
  if (snap.targetRowCount > 0) {
    return {
      action: "refuse_conflicting_rows",
      reason:
        `target already has ${snap.targetRowCount} bctc_table_rows (source has ${snap.sourceRowCount}) — ` +
        `refusing to avoid duplicating/conflicting data; needs manual reconciliation.`,
    };
  }
  return {
    action: "apply",
    reason: `target has 0 rows, source has ${snap.sourceRowCount} — safe to carry forward.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path — the ONE guarded copy operation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * copyOrphanedRows — INSERT...SELECT every bctc_table_rows column (except the
 * surrogate `id`) from sourceReportId to targetReportId, remapping only
 * `report_id`. Source rows are left untouched (copy, not move). Caller MUST
 * gate this behind decideMigration(...).action === 'apply' — this function
 * performs no eligibility checks itself (kept pure/mechanical for testability).
 *
 * @returns number of rows inserted (bun:sqlite Statement.run().changes)
 */
export function copyOrphanedRows(db: Database, sourceReportId: string, targetReportId: string): number {
  const stmt = db.prepare(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, period_prior, value_prior, unit, is_summary_row, extracted_at)
    SELECT ?, page_number, statement_section, row_order, code, label,
           period_current, value_current, period_prior, value_prior, unit, is_summary_row, extracted_at
    FROM bctc_table_rows
    WHERE report_id = ?
  `);
  const result = stmt.run(targetReportId, sourceReportId);
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic module resolution (CLI-only — see the import-type comment above)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveBackfillHandlerModule(): Promise<typeof BackfillBctcScalarsModule> {
  const candidates = [
    // (a) repo-root execution: scripts/migrations/ -> repo root -> apps/mcp-server/src/...
    resolve(import.meta.dir, "../../apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts"),
    // (b) docker-cp flat-to-/app execution: /app IS apps/mcp-server's own root
    resolve(import.meta.dir, "./src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return (await import(candidate)) as typeof BackfillBctcScalarsModule;
    }
  }
  throw new Error(
    `[CARRY-FORWARD] cannot locate backfillBctcScalarsTool module — tried: ${candidates.join(", ")}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSnapshot(label: string, s: MigrationSnapshot): string {
  return (
    `[${label}] target_found=${s.targetFound} action_code=${s.targetActionCode ?? "?"} sort_key=${s.targetSortKey ?? "?"}\n` +
    `  confirm_status=${s.targetConfirmStatus ?? "NULL"} refine_status=${s.targetRefineStatus ?? "?"}\n` +
    `  sourceRowCount=${s.sourceRowCount} targetRowCount=${s.targetRowCount}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = Bun.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx === -1 ? undefined : args[idx + 1];
  }

  const sourceReportId = getArg("--source") ?? DEFAULT_SOURCE_REPORT_ID;
  const targetReportId = getArg("--target") ?? DEFAULT_TARGET_REPORT_ID;
  const isApply = args.includes("--apply");

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "apps", "mcp-server", "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[CARRY-FORWARD] source=${sourceReportId} target=${targetReportId}`);
  log(`[CARRY-FORWARD] mode=${isApply ? "APPLY" : "VERIFY (default — no writes)"}`);
  log(`[CARRY-FORWARD] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[CARRY-FORWARD] ERROR: DB not found at ${DB_PATH}`);
    log(`[CARRY-FORWARD] For named-volume DB, run via docker exec:`);
    log(`[CARRY-FORWARD]   docker cp scripts/migrations/carry-forward-bctc-orphaned-rows.ts \\`);
    log(`[CARRY-FORWARD]     vn-market-intelligence-mcp-mcp-server-1:/app/carry-forward-bctc-orphaned-rows.ts`);
    log(`[CARRY-FORWARD]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[CARRY-FORWARD]     bun /app/carry-forward-bctc-orphaned-rows.ts --apply`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  try {
    const before = readMigrationSnapshot(db, sourceReportId, targetReportId);
    log(fmtSnapshot("BEFORE", before));

    const decision = decideMigration(before);
    log(`[CARRY-FORWARD] decision=${decision.action} — ${decision.reason}`);

    if (decision.action === "refuse_target_not_found") {
      db.close();
      process.exit(2);
    }
    if (decision.action === "refuse_no_source_rows") {
      db.close();
      process.exit(3);
    }
    if (decision.action === "refuse_conflicting_rows") {
      db.close();
      process.exit(4);
    }
    if (decision.action === "noop_confirmed" || decision.action === "noop_already_migrated") {
      log(`[CARRY-FORWARD] OK — no action needed.`);
      db.close();
      process.exit(0);
    }

    // decision.action === 'apply'
    if (!isApply) {
      log(`[CARRY-FORWARD] DRY-RUN (VERIFY mode) — would copy ${before.sourceRowCount} rows and trigger scalar reflow.`);
      log(`[CARRY-FORWARD] Re-run with --apply to execute.`);
      db.close();
      process.exit(0);
    }

    const inserted = copyOrphanedRows(db, sourceReportId, targetReportId);
    log(`[CARRY-FORWARD] copied ${inserted} rows: report_id ${sourceReportId} -> ${targetReportId}`);

    log(`[CARRY-FORWARD] triggering backfill_bctc_scalars reflow (reuses production aggregator, zero duplicated logic)...`);
    const { buildBackfillBctcScalarsHandler } = await resolveBackfillHandlerModule();
    const backfillHandler = buildBackfillBctcScalarsHandler(db);
    const backfillResult = await backfillHandler({ report_id: targetReportId });
    const backfillText = backfillResult.content[0]?.text ?? "{}";
    log(`[CARRY-FORWARD] backfill_bctc_scalars result: ${backfillText}`);

    const after = readMigrationSnapshot(db, sourceReportId, targetReportId);
    log(fmtSnapshot("AFTER", after));

    db.close();

    const backfillBody = JSON.parse(backfillText) as { ok?: boolean };
    const postConditionMet = after.targetRowCount === after.sourceRowCount && backfillBody.ok === true;
    if (postConditionMet) {
      log(`[CARRY-FORWARD] POST-CONDITION MET: ${after.targetRowCount} rows carried forward, scalar reflow ok=true.`);
      process.exit(0);
    } else {
      log(`[CARRY-FORWARD] POST-CONDITION NOT MET — inspect the AFTER snapshot and backfill result above.`);
      process.exit(1);
    }
  } catch (err) {
    log(`[CARRY-FORWARD] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
