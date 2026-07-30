#!/usr/bin/env bun
/**
 * scripts/migrations/dedupe-mislabeled-bctc-period.ts
 *
 * FIX-BCTC-INGEST-PERIOD-IDENTITY-UNVALIDATED-VS-CONTENT — AC-1 (DATA, time-
 * ordered FIRST per the task row's `time_gate`).
 *
 * WHY THIS SCRIPT EXISTS:
 *   report_id 5b0dad71-3b05-4455-9823-c2072442777d is stored as DPM_2025_Q4
 *   (financial_reports.action_code='DPM', sort_key='2025-Q4') but its content
 *   is unambiguously Q1-2026 (see the task row's full evidence). Live-probed
 *   2026-07-28: this is a BYTE-IDENTICAL duplicate of report_id
 *   3e2a26d9-525a-4dba-8ebe-fcaecc0cb28e (DPM_2026_Q1, sort_key='2026-Q1') —
 *   `md5sum DPM_2025_Q4.pdf DPM_2026_Q1.pdf` inside the running container
 *   both hash to bec27c511d3c643e97133c87be1af522. `bctc_vps_queue` confirms
 *   the root cause: the VPS-side (DPM, 2025, Q4) backfill target associated
 *   the WRONG source_url (the newest DPM filing — actually the Q1-2026 one)
 *   with an old empty backfill slot, then 48 minutes later the (DPM, 2026,
 *   Q1) target correctly fetched the SAME document under its real key. So
 *   there is no "real Q4-2025 filing" anywhere yet to recover — this is a
 *   pure duplicate under the wrong slot, not a corrupted-but-real filing.
 *
 *   The mislabelled row (5b0dad71) already has 22 bctc_refined_units windows
 *   at window_status='DONE' (agentic-refine work already completed against
 *   the real — Q1-2026 — content) while report-level `refine_status` is
 *   still 'PENDING' (finalize has not run — get_bctc_report_id(code="DPM")
 *   filters refine_status='DONE', so nothing is served/reachable yet, per
 *   the task row's `time_gate`). Simply DELETEing the row would discard that
 *   completed refine work for no reason; simply CORRECTING its period to
 *   2026-Q1 would collide with the already-existing 3e2a26d9 row (same
 *   action_code+sort_key UNIQUE constraint). The correct action is: migrate
 *   the completed refine windows onto the row that already correctly holds
 *   the (DPM, 2026-Q1) slot, then delete the duplicate, then reset the FREED
 *   (DPM, 2025, Q4) `bctc_vps_queue` row to 'pending' (status was 'done' with
 *   the wrong cached source_url) so a genuine future discovery pass can fetch
 *   the real Q4-2025 filing into the now-empty slot (AC-4).
 *
 * WHAT THIS SCRIPT DOES:
 *   1. VERIFY (always, read-only snapshot): reads both financial_reports rows
 *      (refine_status/confirm_status/action_code/sort_key/pdf_path), the
 *      source's bctc_refined_units count, the target's existing
 *      bctc_refined_units count, and — when both pdf_path files exist on
 *      disk — their md5 hashes (duplicate-confirmation signal).
 *   2. Decision gate (decideDedupe — pure function, unit-tested): refuses on
 *      any of — source not found (idempotent no-op: exit 0, already applied
 *      or wrong id), source refine_status='DONE' (time_gate — finalize
 *      already armed it, this script must NOT touch it, needs a human/PO
 *      call instead), target not found, target confirm_status='CONFIRMED',
 *      action_code mismatch, source.sort_key === target.sort_key (nothing to
 *      dedupe), target already has bctc_refined_units (manual reconciliation
 *      needed — NOT idempotent-safe to guess), or (when both files exist)
 *      the pdf md5 hashes differ (duplicate hypothesis unconfirmed — refuses
 *      rather than guessing). Only a clean "source pending + target empty +
 *      same-ticker + different-slot (+ pdf hashes match, when checkable)"
 *      snapshot is eligible to apply.
 *   3. Apply (--apply only, one transaction):
 *        a. Re-parent every bctc_refined_units row: report_id source -> target.
 *        b. DELETE the duplicate financial_reports row (source).
 *        c. Reset the FREED bctc_vps_queue row (source's original
 *           action_code/period_year/period_quarter) to status='pending',
 *           attempts=0, source_url=NULL, last_attempt=NULL — same reset shape
 *           as the reset-ppc-q4-2025.ts precedent (apps/mcp-server/src/
 *           migrations/reset-ppc-q4-2025.ts) — so the real filing for that
 *           slot can be genuinely re-discovered instead of being permanently
 *           shadowed by the stale 'done' status.
 *   4. AFTER snapshot: prints resulting counts for RAW-verify.
 *
 * Idempotency: running twice is safe. Second run finds source absent
 * (already deleted) -> noop_source_absent (exit 0).
 *
 * Usage:
 *   # Verify only (default — no writes):
 *   bun scripts/migrations/dedupe-mislabeled-bctc-period.ts
 *   bun scripts/migrations/dedupe-mislabeled-bctc-period.ts --source <id> --target <id>
 *
 *   # Apply:
 *   bun scripts/migrations/dedupe-mislabeled-bctc-period.ts --apply
 *
 *   # Against the live named-volume DB (docker exec — matches the
 *   # carry-forward-bctc-orphaned-rows.ts / reingest-bctc-report.ts precedent):
 *   docker cp scripts/migrations/dedupe-mislabeled-bctc-period.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/dedupe-mislabeled-bctc-period.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/dedupe-mislabeled-bctc-period.ts --apply
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/apps/mcp-server/data/market.db;
 *             set to /app/data/market.db by docker-compose inside the container).
 *
 * Defaults (CLI-overridable — never baked into any serve-path or domain code,
 * exist ONLY as this operational script's default arguments):
 *   --source 5b0dad71-3b05-4455-9823-c2072442777d (DPM, mislabelled 2025-Q4, real content 2026-Q1)
 *   --target 3e2a26d9-525a-4dba-8ebe-fcaecc0cb28e (DPM, correctly-labelled 2026-Q1)
 *
 * Exit codes:
 *   0 — verified clean / already applied (source absent) / apply succeeded
 *   1 — DB error / apply failed post-condition
 *   2 — refuse: target report_id not found
 *   3 — refuse: source refine_status='DONE' — already finalized, time_gate
 *       violated, this script must not touch it (needs a human/PO decision)
 *   4 — refuse: target confirm_status='CONFIRMED' — never touch
 *   5 — refuse: source/target action_code mismatch
 *   6 — refuse: source and target share the same sort_key — nothing to dedupe
 *   7 — refuse: target already has bctc_refined_units — manual reconciliation
 *   8 — refuse: pdf md5 hashes differ (or unreadable) — duplicate hypothesis unconfirmed
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 */

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** DPM incident defaults — CLI-overridable (see file header). */
const DEFAULT_SOURCE_REPORT_ID = "5b0dad71-3b05-4455-9823-c2072442777d";
const DEFAULT_TARGET_REPORT_ID = "3e2a26d9-525a-4dba-8ebe-fcaecc0cb28e";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSnapshot {
  found: boolean;
  actionCode: string | null;
  sortKey: string | null;
  periodYear: number | null;
  periodQuarter: number | null;
  refineStatus: string | null;
  confirmStatus: string | null;
  pdfPath: string | null;
  refinedUnitsCount: number;
}

export interface DedupeSnapshot {
  source: ReportSnapshot;
  target: ReportSnapshot;
  /** null = at least one pdf_path missing/unreadable — hash comparison skipped. */
  pdfHashesMatch: boolean | null;
}

export interface DedupeDecision {
  action:
    | "apply"
    | "noop_source_absent"
    | "refuse_target_not_found"
    | "refuse_source_finalized"
    | "refuse_target_confirmed"
    | "refuse_action_code_mismatch"
    | "refuse_same_sort_key"
    | "refuse_target_has_units"
    | "refuse_pdf_mismatch";
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only diagnostics
// ─────────────────────────────────────────────────────────────────────────────

interface FrRow {
  action_code: string;
  sort_key: string;
  period_year: number;
  period_quarter: number | null;
  refine_status: string | null;
  confirm_status: string | null;
  pdf_path: string | null;
}

function readReportSnapshot(db: Database, reportId: string): ReportSnapshot {
  const row = db
    .query<FrRow, [string]>(
      "SELECT action_code, sort_key, period_year, period_quarter, refine_status, confirm_status, pdf_path FROM financial_reports WHERE id = ?",
    )
    .get(reportId);

  const unitsRow = db
    .query<{ c: number }, [string]>("SELECT COUNT(*) as c FROM bctc_refined_units WHERE report_id = ?")
    .get(reportId);

  return {
    found: row !== null,
    actionCode: row?.action_code ?? null,
    sortKey: row?.sort_key ?? null,
    periodYear: row?.period_year ?? null,
    periodQuarter: row?.period_quarter ?? null,
    refineStatus: row?.refine_status ?? null,
    confirmStatus: row?.confirm_status ?? null,
    pdfPath: row?.pdf_path ?? null,
    refinedUnitsCount: unitsRow?.c ?? 0,
  };
}

/** md5 of a file on disk, or null when the path is missing/unreadable. */
export function safeMd5(path: string | null): string | null {
  if (!path) return null;
  try {
    if (!existsSync(path)) return null;
    return createHash("md5").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

export function readDedupeSnapshot(db: Database, sourceReportId: string, targetReportId: string): DedupeSnapshot {
  const source = readReportSnapshot(db, sourceReportId);
  const target = readReportSnapshot(db, targetReportId);
  const sourceHash = safeMd5(source.pdfPath);
  const targetHash = safeMd5(target.pdfPath);
  const pdfHashesMatch = sourceHash !== null && targetHash !== null ? sourceHash === targetHash : null;
  return { source, target, pdfHashesMatch };
}

/**
 * decideDedupe — pure decision function (exported for unit tests). Given a
 * snapshot, returns what this script should do — never performs I/O.
 */
export function decideDedupe(snap: DedupeSnapshot): DedupeDecision {
  if (!snap.source.found) {
    return {
      action: "noop_source_absent",
      reason: "source report_id not found — already deduped (idempotent no-op) or a wrong id was supplied.",
    };
  }
  if (!snap.target.found) {
    return { action: "refuse_target_not_found", reason: "target report_id not found in financial_reports." };
  }
  if (snap.source.refineStatus === "DONE") {
    return {
      action: "refuse_source_finalized",
      reason:
        "source refine_status='DONE' — already finalized (time_gate violated). This script must never delete a " +
        "finalized report; needs a human/PO decision, not an automatic script run.",
    };
  }
  if (snap.target.confirmStatus === "CONFIRMED") {
    return { action: "refuse_target_confirmed", reason: "target confirm_status=CONFIRMED — human-locked, never touch." };
  }
  if (snap.source.actionCode !== snap.target.actionCode) {
    return {
      action: "refuse_action_code_mismatch",
      reason: `source action_code=${snap.source.actionCode} !== target action_code=${snap.target.actionCode} — refusing a cross-ticker dedupe.`,
    };
  }
  if (snap.source.sortKey === snap.target.sortKey) {
    return {
      action: "refuse_same_sort_key",
      reason: `source and target share sort_key=${snap.source.sortKey} — nothing to dedupe (they are the same slot).`,
    };
  }
  if (snap.target.refinedUnitsCount > 0) {
    return {
      action: "refuse_target_has_units",
      reason: `target already has ${snap.target.refinedUnitsCount} bctc_refined_units rows — refusing to avoid conflicting data; needs manual reconciliation.`,
    };
  }
  if (snap.pdfHashesMatch === false) {
    return {
      action: "refuse_pdf_mismatch",
      reason: "source and target pdf files exist but have DIFFERENT md5 hashes — duplicate hypothesis unconfirmed, refusing to guess.",
    };
  }
  return {
    action: "apply",
    reason:
      snap.pdfHashesMatch === true
        ? "source pending + target empty + same ticker + different slot + pdf md5 CONFIRMED identical — safe to dedupe."
        : "source pending + target empty + same ticker + different slot (pdf hash unavailable to confirm — proceeding on DB-state evidence alone).",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path — the guarded operations
// ─────────────────────────────────────────────────────────────────────────────

/** Re-parent every bctc_refined_units row from sourceReportId to targetReportId. */
export function reparentRefinedUnits(db: Database, sourceReportId: string, targetReportId: string): number {
  const result = db
    .prepare("UPDATE bctc_refined_units SET report_id = ? WHERE report_id = ?")
    .run(targetReportId, sourceReportId);
  return result.changes;
}

/** Delete the duplicate financial_reports row. */
export function deleteReportRow(db: Database, reportId: string): number {
  const result = db.prepare("DELETE FROM financial_reports WHERE id = ?").run(reportId);
  return result.changes;
}

/**
 * Reset the freed bctc_vps_queue row (source's ORIGINAL action_code/period_year/
 * period_quarter) back to 'pending' so a genuine future fetch can populate it —
 * same reset shape as apps/mcp-server/src/migrations/reset-ppc-q4-2025.ts.
 */
export function resetFreedQueueRow(
  db: Database,
  key: { actionCode: string; periodYear: number; periodQuarter: number },
): number {
  const quarterStr = `Q${key.periodQuarter}`;
  const result = db
    .prepare(
      `UPDATE bctc_vps_queue SET status = 'pending', attempts = 0, source_url = NULL, last_attempt = NULL
       WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    )
    .run(key.actionCode, key.periodYear, quarterStr);
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtReport(label: string, r: ReportSnapshot): string {
  return (
    `  ${label}: found=${r.found} action_code=${r.actionCode ?? "?"} sort_key=${r.sortKey ?? "?"} ` +
    `refine_status=${r.refineStatus ?? "?"} confirm_status=${r.confirmStatus ?? "NULL"} ` +
    `refined_units=${r.refinedUnitsCount} pdf_path=${r.pdfPath ?? "NULL"}`
  );
}

function fmtSnapshot(label: string, s: DedupeSnapshot): string {
  return `[${label}]\n${fmtReport("source", s.source)}\n${fmtReport("target", s.target)}\n  pdfHashesMatch=${s.pdfHashesMatch}`;
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

  log(`[DEDUPE-BCTC-PERIOD] source=${sourceReportId} target=${targetReportId}`);
  log(`[DEDUPE-BCTC-PERIOD] mode=${isApply ? "APPLY" : "VERIFY (default — no writes)"}`);
  log(`[DEDUPE-BCTC-PERIOD] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[DEDUPE-BCTC-PERIOD] ERROR: DB not found at ${DB_PATH}`);
    log(`[DEDUPE-BCTC-PERIOD] For named-volume DB, run via docker exec:`);
    log(`[DEDUPE-BCTC-PERIOD]   docker cp scripts/migrations/dedupe-mislabeled-bctc-period.ts \\`);
    log(`[DEDUPE-BCTC-PERIOD]     vn-market-intelligence-mcp-mcp-server-1:/app/dedupe-mislabeled-bctc-period.ts`);
    log(`[DEDUPE-BCTC-PERIOD]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[DEDUPE-BCTC-PERIOD]     bun /app/dedupe-mislabeled-bctc-period.ts --apply`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  // NOTE: journal_mode is NOT set here (FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT,
  // 2026-07-30) — market.db's journal_mode is DELETE (schema.ts's getDb(), FIX-SQLITE-
  // JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION mitigation for recurring Docker-virt
  // WAL/SHM corruption). This is a one-shot migration script — it must not re-arm WAL and
  // silently undo that mitigation for the duration of its run.
  db.exec("PRAGMA foreign_keys = ON");

  try {
    const before = readDedupeSnapshot(db, sourceReportId, targetReportId);
    log(fmtSnapshot("BEFORE", before));

    const decision = decideDedupe(before);
    log(`[DEDUPE-BCTC-PERIOD] decision=${decision.action} — ${decision.reason}`);

    const refuseExitCodes: Record<string, number> = {
      refuse_target_not_found: 2,
      refuse_source_finalized: 3,
      refuse_target_confirmed: 4,
      refuse_action_code_mismatch: 5,
      refuse_same_sort_key: 6,
      refuse_target_has_units: 7,
      refuse_pdf_mismatch: 8,
    };
    if (decision.action in refuseExitCodes) {
      db.close();
      process.exit(refuseExitCodes[decision.action]!);
    }
    if (decision.action === "noop_source_absent") {
      log(`[DEDUPE-BCTC-PERIOD] OK — no action needed.`);
      db.close();
      process.exit(0);
    }

    // decision.action === 'apply'
    if (!isApply) {
      log(
        `[DEDUPE-BCTC-PERIOD] DRY-RUN (VERIFY mode) — would re-parent ${before.source.refinedUnitsCount} ` +
          `bctc_refined_units rows, delete source report, and reset the freed bctc_vps_queue ` +
          `(${before.source.actionCode}, ${before.source.periodYear}, Q${before.source.periodQuarter}) row to pending.`,
      );
      log(`[DEDUPE-BCTC-PERIOD] Re-run with --apply to execute.`);
      db.close();
      process.exit(0);
    }

    const freedKey = {
      actionCode: before.source.actionCode!,
      periodYear: before.source.periodYear!,
      periodQuarter: before.source.periodQuarter!,
    };

    const reparented = reparentRefinedUnits(db, sourceReportId, targetReportId);
    log(`[DEDUPE-BCTC-PERIOD] re-parented ${reparented} bctc_refined_units rows: ${sourceReportId} -> ${targetReportId}`);

    const deleted = deleteReportRow(db, sourceReportId);
    log(`[DEDUPE-BCTC-PERIOD] deleted ${deleted} financial_reports row(s) for ${sourceReportId}`);

    const queueReset = resetFreedQueueRow(db, freedKey);
    log(
      `[DEDUPE-BCTC-PERIOD] reset ${queueReset} bctc_vps_queue row(s) for ` +
        `(${freedKey.actionCode}, ${freedKey.periodYear}, Q${freedKey.periodQuarter}) to pending`,
    );

    const after = readDedupeSnapshot(db, sourceReportId, targetReportId);
    log(fmtSnapshot("AFTER", after));

    db.close();

    const postConditionMet =
      !after.source.found && after.target.refinedUnitsCount === before.source.refinedUnitsCount && deleted === 1;
    if (postConditionMet) {
      log(`[DEDUPE-BCTC-PERIOD] POST-CONDITION MET: source deleted, ${after.target.refinedUnitsCount} units on target, queue freed.`);
      process.exit(0);
    } else {
      log(`[DEDUPE-BCTC-PERIOD] POST-CONDITION NOT MET — inspect the AFTER snapshot above.`);
      process.exit(1);
    }
  } catch (err) {
    log(`[DEDUPE-BCTC-PERIOD] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
