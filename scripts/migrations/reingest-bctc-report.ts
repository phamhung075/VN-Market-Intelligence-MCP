#!/usr/bin/env bun
/**
 * scripts/migrations/reingest-bctc-report.ts
 *
 * FIX-BCTC-BANK-SUMMARY-MAPPING — W5 (AC-10) operational re-ingest runbook.
 *
 * WHY THIS SCRIPT EXISTS:
 *   A code fix alone does NOT unfreeze a bank report's total_assets once
 *   BLOCK-1's Case-2 logic ("aggregator returned null AND column is not
 *   notApplicable → SKIP the UPDATE, preserve prior value") has frozen a
 *   bad/stale scalar in `financial_reports` — the frozen value only gets
 *   overwritten the NEXT time `finalize_bctc_refine` actually runs against
 *   that report_id. This script triggers that re-run safely, once the
 *   W1-W5 code fixes (this sprint) are deployed (container rebuilt).
 *
 *   CANONICAL TARGET (this sprint): CTG 2026-Q1,
 *   report_id=96e36139-5dac-414d-8e4d-20a4725890d1 — total_assets frozen
 *   at 0 (architect brief 2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING §2).
 *   The report_id is a CLI arg / default constant HERE only — never baked
 *   into any serve-path or domain code (genericity requirement).
 *
 * WHAT THIS SCRIPT DOES (read-only diagnostics + ONE guarded write path):
 *   1. VERIFY (always, read-only): snapshot financial_reports scalars +
 *      validation_status + refine_status + confirm_status, and count
 *      bctc_refined_units by window_status (DONE-with-markdown vs FAILED).
 *   2. Idempotency guard: if the row already looks plausible (total_assets
 *      resolvable and passing the SAME simple identity check the FR-5 serve
 *      guard uses — total_assets > 0 AND total_assets >= equity_total) OR
 *      confirm_status='CONFIRMED' (human-locked, never touch) → no-op, exit 0.
 *   3. DATA-LOSS GUARD (safety-critical): finalize_bctc_refine's main
 *      transaction DELETEs existing bctc_table_rows and re-INSERTs only from
 *      DONE windows. If there are ZERO DONE windows with non-empty markdown
 *      for this report_id (this IS the live state for CTG as of 2026-07-01 —
 *      all 56 windows show window_status='FAILED', markdown empty), calling
 *      finalize now would WIPE the existing table rows and write NOTHING
 *      back. This script REFUSES to call finalize in that case (exit 3) and
 *      prints the required manual step instead — it does NOT fabricate or
 *      guess a "fixed" transcription.
 *   4. Apply (--apply only, requires >=1 DONE window with markdown): calls
 *      the LIVE `finalize_bctc_refine` MCP tool over the running server's
 *      Streamable HTTP endpoint (reuses the REAL, deployed, fixed production
 *      code path — zero logic duplicated here, no drift risk). report_status
 *      is computed from the window counts (DONE only → "DONE"; mixed →
 *      "PARTIAL"), matching the tool's own contract ("caller determines
 *      report_status based on window aggregation").
 *   5. AFTER snapshot + honest post-condition check: prints whether
 *      total_assets != 0 now holds. This is NOT guaranteed by this script
 *      alone — total_assets only resolves if the underlying refined markdown
 *      actually contains a "Tổng tài sản" grand-total row (or a corporate
 *      code 280/440 row). If the DONE windows being finalized still lack
 *      that row (architect brief §2: confirmed ABSENT for both CTG and VCB
 *      as of the last live probe), total_assets will legitimately still
 *      resolve to null → BLOCK-1 Case-2 → stays frozen. That is a REAL
 *      finding to report, not a script bug — see step 3's manual-step
 *      message for the remaining action (fresh agentic-refine transcription
 *      pass, which requires a live subagent and is outside this script's
 *      reach by design — no fake data, no fabricated transcription).
 *
 * Idempotency: running twice is safe. Second run either (a) sees the
 * report already plausible → no-op, or (b) sees the same zero-DONE-window
 * state → refuses again with the same exit 3 message. Never double-applies.
 *
 * Usage:
 *   # Verify only (default — no writes, no MCP call):
 *   bun scripts/migrations/reingest-bctc-report.ts
 *   bun scripts/migrations/reingest-bctc-report.ts --report-id <id>
 *
 *   # Apply (calls finalize_bctc_refine over the live MCP server — ONLY
 *   # safe/useful once the DONE-window precondition holds; see step 3):
 *   bun scripts/migrations/reingest-bctc-report.ts --apply
 *
 * Environment:
 *   DB_PATH        — override DB path (default: <repo-root>/data/market.db;
 *                     set to /app/data/market.db by docker-compose inside
 *                     the container — read-only diagnostics only, no writes
 *                     via this connection).
 *   MCP_SERVER_URL — base URL of the running mcp-server (default:
 *                     http://localhost:3000) — used ONLY for the --apply
 *                     finalize_bctc_refine call (step 4), over /mcp
 *                     (Streamable HTTP transport, same endpoint Claude.ai
 *                     connectors use).
 *
 * Exit codes:
 *   0 — verified clean / already plausible / apply succeeded
 *   1 — DB or MCP call error
 *   2 — report_id not found
 *   3 — refused to apply (zero DONE windows with markdown — manual fresh
 *       agentic-refine transcription pass required first; see printed step)
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Sprint-canonical target — CLI-overridable. Never referenced from serve-path
 * or domain code (that would violate the genericity requirement); this
 * constant exists ONLY as this operational script's default argument. */
const DEFAULT_REPORT_ID = "96e36139-5dac-414d-8e4d-20a4725890d1";

// ─────────────────────────────────────────────────────────────────────────────
// Types (exported for test imports)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSnapshot {
  found: boolean;
  report_id: string;
  action_code: string | null;
  sort_key: string | null;
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  validation_status: string | null;
  refine_status: string | null;
  confirm_status: string | null;
  extraction_confidence: number | null;
  /** bctc_refined_units rows with window_status='DONE' AND non-empty markdown. */
  done_units_with_markdown: number;
  failed_units: number;
  total_units: number;
}

export interface ReingestDecision {
  action: "noop_already_plausible" | "noop_confirmed" | "refuse_no_done_windows" | "apply";
  reason: string;
  /** report_status to pass to finalize_bctc_refine, only meaningful when action='apply'. */
  reportStatus?: "DONE" | "PARTIAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only diagnostics
// ─────────────────────────────────────────────────────────────────────────────

interface FrRow {
  action_code: string;
  sort_key: string;
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  validation_status: string | null;
  refine_status: string | null;
  confirm_status: string | null;
  extraction_confidence: number | null;
}

interface UnitCountsRow {
  done_with_md: number;
  failed: number;
  total: number;
}

export function readSnapshot(db: Database, reportId: string): ReportSnapshot {
  const fr = db
    .prepare<FrRow, [string]>(
      `SELECT action_code, sort_key, total_assets, total_liabilities, equity_total,
              validation_status, refine_status, confirm_status, extraction_confidence
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId);

  if (!fr) {
    return {
      found: false,
      report_id: reportId,
      action_code: null,
      sort_key: null,
      total_assets: null,
      total_liabilities: null,
      equity_total: null,
      validation_status: null,
      refine_status: null,
      confirm_status: null,
      extraction_confidence: null,
      done_units_with_markdown: 0,
      failed_units: 0,
      total_units: 0,
    };
  }

  const counts = db
    .prepare<UnitCountsRow, [string]>(
      `SELECT
         SUM(CASE WHEN window_status = 'DONE' AND markdown IS NOT NULL AND length(markdown) > 0 THEN 1 ELSE 0 END) AS done_with_md,
         SUM(CASE WHEN window_status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
         COUNT(*) AS total
       FROM bctc_refined_units WHERE report_id = ?`,
    )
    .get(reportId);

  return {
    found: true,
    report_id: reportId,
    action_code: fr.action_code,
    sort_key: fr.sort_key,
    total_assets: fr.total_assets,
    total_liabilities: fr.total_liabilities,
    equity_total: fr.equity_total,
    validation_status: fr.validation_status,
    refine_status: fr.refine_status,
    confirm_status: fr.confirm_status,
    extraction_confidence: fr.extraction_confidence,
    done_units_with_markdown: counts?.done_with_md ?? 0,
    failed_units: counts?.failed ?? 0,
    total_units: counts?.total ?? 0,
  };
}

/**
 * isPlausible — mirrors the FR-5 canonical identity guard's simple predicate
 * (domain/services/financial-reports/bctcIdentityGuard.ts checkBctcIdentityGuard):
 * total_assets > 0 AND total_assets >= equity_total. Kept as an independent,
 * intentionally-duplicated read-only check (this script never imports
 * mcp-server domain code — it must run standalone against any DB_PATH,
 * inside or outside the container). If bctcIdentityGuard.ts's predicate ever
 * changes, update this comment + this function together.
 */
export function isPlausible(totalAssets: number | null, equityTotal: number | null): boolean {
  if (totalAssets == null) return false;
  const eq = equityTotal ?? 0;
  return totalAssets > 0 && totalAssets >= eq;
}

/**
 * decide — pure decision function (exported for unit tests). Given a
 * snapshot, returns what this script should do — never performs I/O.
 */
export function decide(snap: ReportSnapshot): ReingestDecision {
  if (snap.confirm_status === "CONFIRMED") {
    return { action: "noop_confirmed", reason: "confirm_status=CONFIRMED — human-locked, never touch." };
  }
  if (isPlausible(snap.total_assets, snap.equity_total)) {
    return {
      action: "noop_already_plausible",
      reason: `total_assets=${snap.total_assets} already passes the FR-5 identity check (>0, >=equity_total=${snap.equity_total}) — already fixed, no re-ingest needed.`,
    };
  }
  if (snap.done_units_with_markdown === 0) {
    return {
      action: "refuse_no_done_windows",
      reason:
        `0 of ${snap.total_units} bctc_refined_units rows are DONE-with-markdown ` +
        `(${snap.failed_units} FAILED). Calling finalize_bctc_refine now would DELETE ` +
        `existing bctc_table_rows and insert NOTHING — refusing to apply.`,
    };
  }
  const reportStatus: "DONE" | "PARTIAL" =
    snap.failed_units === 0 && snap.done_units_with_markdown === snap.total_units ? "DONE" : "PARTIAL";
  return {
    action: "apply",
    reason: `${snap.done_units_with_markdown} DONE window(s) with markdown found — safe to re-run finalize_bctc_refine.`,
    reportStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live MCP call (production code reuse — no logic duplicated here)
// ─────────────────────────────────────────────────────────────────────────────

export async function callFinalizeBctcRefine(
  mcpServerUrl: string,
  reportId: string,
  reportStatus: "DONE" | "PARTIAL",
): Promise<{ ok: boolean; text: string }> {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", mcpServerUrl));
  const client = new Client({ name: "reingest-bctc-report-script", version: "1.0.0" });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "finalize_bctc_refine",
      arguments: { report_id: reportId, report_status: reportStatus },
    });
    const content = Array.isArray(result.content) ? result.content : [];
    const first = content[0] as { type?: string; text?: string } | undefined;
    const text = first?.text ?? JSON.stringify(result);
    return { ok: true, text };
  } finally {
    await client.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtSnapshot(label: string, s: ReportSnapshot): string {
  if (!s.found) return `[${label}] report_id=${s.report_id} — NOT FOUND`;
  return (
    `[${label}] ${s.action_code ?? "?"} ${s.sort_key ?? "?"} (${s.report_id})\n` +
    `  total_assets=${s.total_assets} total_liabilities=${s.total_liabilities} equity_total=${s.equity_total}\n` +
    `  validation_status=${s.validation_status} refine_status=${s.refine_status} confirm_status=${s.confirm_status ?? "NULL"}\n` +
    `  extraction_confidence=${s.extraction_confidence}\n` +
    `  bctc_refined_units: done_with_markdown=${s.done_units_with_markdown} failed=${s.failed_units} total=${s.total_units}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);

  function getArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  }

  const reportId = getArg("--report-id") ?? DEFAULT_REPORT_ID;
  const isApply = args.includes("--apply");

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");
  const MCP_SERVER_URL = Bun.env["MCP_SERVER_URL"] ?? "http://localhost:3000";

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[REINGEST] reingest-bctc-report — report_id=${reportId}`);
  log(`[REINGEST] mode=${isApply ? "APPLY" : "VERIFY (default — no writes)"}`);
  log(`[REINGEST] DB_PATH=${DB_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[REINGEST] ERROR: DB not found at ${DB_PATH}`);
    log(`[REINGEST] For named-volume DB, run via docker exec:`);
    log(`[REINGEST]   docker cp scripts/migrations/reingest-bctc-report.ts \\`);
    log(`[REINGEST]     vn-market-intelligence-mcp-mcp-server-1:/app/reingest-bctc-report.ts`);
    log(`[REINGEST]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[REINGEST]     bun /app/reingest-bctc-report.ts --report-id ${reportId}`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    log(`[REINGEST] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    const before = readSnapshot(db, reportId);
    log(fmtSnapshot("BEFORE", before));

    if (!before.found) {
      log(`[REINGEST] ERROR: report_id=${reportId} not found in financial_reports`);
      db.close();
      process.exit(2);
    }

    const decision = decide(before);
    log(`[REINGEST] decision=${decision.action} — ${decision.reason}`);

    if (decision.action === "noop_already_plausible" || decision.action === "noop_confirmed") {
      log(`[REINGEST] OK — no action needed.`);
      db.close();
      process.exit(0);
    }

    if (decision.action === "refuse_no_done_windows") {
      log(`[REINGEST] REFUSING to apply — manual step required first:`);
      log(`[REINGEST]   1. Trigger a fresh agentic-refine transcription pass for this report_id`);
      log(`[REINGEST]      (get_bctc_pending_refine accepts report_id directly — this BYPASSES`);
      log(`[REINGEST]      the standard queue-eligibility filters by design, RF-3 — so a manual`);
      log(`[REINGEST]      dev-mcp-server / fleet-cron pass targeting report_id=${reportId} works`);
      log(`[REINGEST]      even though the default queue query currently excludes this report`);
      log(`[REINGEST]      — all its windows are already DONE/FAILED).`);
      log(`[REINGEST]   2. push_bctc_refined_unit for each window (with the W1-W5 fixes deployed,`);
      log(`[REINGEST]      the row-repair (W2) and section guard (W3) apply automatically).`);
      log(`[REINGEST]   3. Re-run this script with --apply — it will then find DONE windows with`);
      log(`[REINGEST]      markdown and safely call finalize_bctc_refine.`);
      log(`[REINGEST] This script deliberately does NOT fabricate or guess a transcription —`);
      log(`[REINGEST] that would violate the no-fake-data policy.`);
      db.close();
      process.exit(3);
    }

    // decision.action === 'apply'
    if (!isApply) {
      log(`[REINGEST] DRY-RUN (VERIFY mode) — would call finalize_bctc_refine(report_status=${decision.reportStatus}).`);
      log(`[REINGEST] Re-run with --apply to execute.`);
      db.close();
      process.exit(0);
    }

    db.close(); // release the readonly handle before the live server writes

    log(`[REINGEST] Calling finalize_bctc_refine via ${MCP_SERVER_URL}/mcp (report_status=${decision.reportStatus})...`);
    const result = await callFinalizeBctcRefine(MCP_SERVER_URL, reportId, decision.reportStatus!);
    log(`[REINGEST] finalize_bctc_refine response: ${result.text}`);

    const dbAfter = new Database(DB_PATH, { readonly: true });
    const after = readSnapshot(dbAfter, reportId);
    dbAfter.close();
    log(fmtSnapshot("AFTER", after));

    // Expected post-condition (self-documented, honestly reported — not guaranteed,
    // see file header step 5): total_assets != 0 for this report.
    const postConditionMet = after.total_assets !== null && after.total_assets !== 0;
    if (postConditionMet) {
      log(`[REINGEST] POST-CONDITION MET: total_assets=${after.total_assets} (!= 0).`);
      process.exit(0);
    } else {
      log(`[REINGEST] POST-CONDITION NOT YET MET: total_assets=${after.total_assets}.`);
      log(`[REINGEST] This means the refined markdown that was just finalized still lacks a`);
      log(`[REINGEST] resolvable "Tổng tài sản" (or corporate code 280/440) row — the aggregator`);
      log(`[REINGEST] correctly returned null and BLOCK-1's Case-2 preserved the prior value.`);
      log(`[REINGEST] validation_status/extraction_confidence ARE now truthful (W5 fix — see`);
      log(`[REINGEST] AFTER snapshot), which is this script's guaranteed contract; total_assets`);
      log(`[REINGEST] recovery depends on the transcription actually capturing that row — report`);
      log(`[REINGEST] this finding upstream (architect/BA) rather than re-running blindly.`);
      process.exit(0);
    }
  } catch (err) {
    log(`[REINGEST] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
