#!/usr/bin/env bun
/**
 * scripts/migrations/backfill-predclaim-creation-price.ts
 *
 * FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE — deliverable (a) (2026-07-25,
 * standalone run per PO ruling 2026-07-25T12:07Z — see
 * docs/data/orch/orch-state.json .task_board for the full row).
 *
 * Background: FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT (in REVIEW,
 * REBUILD_REQUIRED, container rebuilds are user-gated) is the PRODUCER fix —
 * it stops NEW prediction_claims rows from being inserted with
 * creation_price=NULL. It left 11 already-live rows with creation_price=NULL
 * (6 already-excluded, 5 still-pending). This script is the CONSUMER-side
 * data repair: it backfills creation_price on already-inserted rows from the
 * real historical daily_ohlcv close for that ticker on the claim's
 * created_at trading date. It does NOT depend on the producer fix landing —
 * it is a pure data operation against existing rows.
 *
 * Scope (generic, no hardcoded ticker/date/id literals): every
 * `prediction_claims` row with `creation_price IS NULL AND is_excluded = 0`
 * (i.e. still-PENDING rows only — the 6 already-excluded rows are is_excluded=1
 * and are naturally out of this query's scope; deliverable (b)
 * reconstruct-the-excluded is a separate, not-yet-authorized task). This
 * makes the script reusable: if the producer path regresses again before
 * the rebuild lands, a second run picks up any newly-minted NULL pending
 * rows with zero code changes.
 *
 * Sourcing rule (HARD — never fabricate, precedent: no_fake_data policy):
 *   trading_date := date-portion of prediction_claims.created_at (created_at
 *   is stamped by `datetime('now')`, UTC, in the evening after VN market
 *   close — so the calendar date IS the trading date; no offset needed).
 *   source_bar := SELECT close FROM daily_ohlcv WHERE code = stock AND
 *                 date = trading_date AND close > 0 (excludes ALLZERO stub
 *                 rows — same guard as get_price_history's production query).
 *   EXACT date match only — no nearest-day / interpolated fallback. If no
 *   bar exists for that exact (code, date), the row is left untouched and
 *   reported as disposition "no_bar" (honest gap). A plausible-looking
 *   invented number is strictly worse than an honest gap.
 *
 * Write guard (idempotent): UPDATE ... WHERE id = ? AND creation_price IS NULL
 * — a second run finds 0 rows left to touch (already-backfilled rows have
 * creation_price NOT NULL and drop out of the candidate SELECT).
 *
 * Verification (CALLER'S responsibility, NOT this script's): per
 * feedback_host_cli_integrity_check_false_ok_verify_through_runtime, this
 * script's own read-back (querying the same DB file it just wrote) is NOT
 * sufficient proof the fix is live — the caller MUST additionally curl the
 * live served endpoint (GET /api/prediction-claims on the running
 * mcp-server container) and confirm creationPrice is non-null there, through
 * the server's own long-lived connection, before reporting PASS.
 *
 * Usage:
 *   # Dry-run (default — reports candidates + source bar or "no_bar", no writes):
 *   bun scripts/migrations/backfill-predclaim-creation-price.ts
 *   bun scripts/migrations/backfill-predclaim-creation-price.ts --dry-run
 *
 *   # Apply (UPDATE creation_price for every candidate with a real source bar):
 *   bun scripts/migrations/backfill-predclaim-creation-price.ts --apply
 *
 *   # Optional: restrict to specific claim ids (comma-separated) — still
 *   # requires creation_price IS NULL AND is_excluded = 0 on that row:
 *   bun scripts/migrations/backfill-predclaim-creation-price.ts --ids=13,14,15,16,17 --apply
 *
 *   # Against the live named-volume DB (docker exec — matches other
 *   # CANONICAL scripts in this zone, e.g. reap-dead-stranded-bctc-rows.ts):
 *   docker cp scripts/migrations/backfill-predclaim-creation-price.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-predclaim-creation-price.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/backfill-predclaim-creation-price.ts --apply
 *
 * Environment:
 *   DB_PATH — override DB path (default: <repo-root>/data/market.db)
 *
 * Exit codes:
 *   0 — success (dry-run or apply, including 0-candidate no-op)
 *   1 — DB open failure or SQL error
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface ClaimCandidate {
  id: number;
  stock: string;
  created_at: string;
}

export interface SourceBar {
  code: string;
  date: string;
  close: number;
}

export type Disposition = "backfilled" | "no_bar";

export interface BackfillResult {
  id: number;
  stock: string;
  tradingDate: string;
  disposition: Disposition;
  sourceBar: SourceBar | null;
}

/** Extract the YYYY-MM-DD date portion from a `datetime('now')`-formatted timestamp. */
export function toTradingDate(createdAt: string): string {
  return createdAt.slice(0, 10);
}

/**
 * Find still-pending prediction_claims rows with no creation_price baseline.
 * Generic — no ticker/date/id literals. is_excluded=0 naturally excludes the
 * 6 already-excluded legacy rows (out of scope for this deliverable).
 */
export function findNullCreationPriceCandidates(
  db: Database,
  ids?: number[],
): ClaimCandidate[] {
  let rows: ClaimCandidate[];
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    rows = db
      .query<ClaimCandidate, number[]>(
        `SELECT id, stock, created_at FROM prediction_claims
         WHERE creation_price IS NULL
           AND (is_excluded IS NULL OR is_excluded = 0)
           AND id IN (${placeholders})
         ORDER BY id`,
      )
      .all(...ids);
  } else {
    rows = db
      .query<ClaimCandidate, []>(
        `SELECT id, stock, created_at FROM prediction_claims
         WHERE creation_price IS NULL
           AND (is_excluded IS NULL OR is_excluded = 0)
         ORDER BY id`,
      )
      .all();
  }
  return rows;
}

/**
 * Look up the exact-date daily_ohlcv close for a ticker. EXACT match only —
 * no nearest-day fallback (never fabricate — see file header). close > 0
 * excludes ALLZERO stub/gap rows (same guard as get_price_history).
 */
export function findSourceBar(
  db: Database,
  code: string,
  date: string,
): SourceBar | null {
  const row = db
    .query<SourceBar, [string, string]>(
      `SELECT code, date, close FROM daily_ohlcv
       WHERE code = ? AND date = ? AND close > 0`,
    )
    .get(code, date);
  return row ?? null;
}

/**
 * Resolve every candidate against daily_ohlcv (read-only — no writes here).
 * Exported for testability independent of the UPDATE step.
 */
export function resolveCandidates(
  db: Database,
  candidates: ClaimCandidate[],
): BackfillResult[] {
  return candidates.map((c) => {
    const tradingDate = toTradingDate(c.created_at);
    const bar = findSourceBar(db, c.stock, tradingDate);
    return {
      id: c.id,
      stock: c.stock,
      tradingDate,
      disposition: bar ? "backfilled" : "no_bar",
      sourceBar: bar,
    };
  });
}

/**
 * Apply the backfill: UPDATE creation_price for every "backfilled"
 * disposition result. Idempotent guard: WHERE id = ? AND creation_price IS
 * NULL — a row already backfilled (e.g. re-run, or race) is a no-op.
 * Returns the number of rows actually changed.
 */
export function applyBackfill(db: Database, results: BackfillResult[]): number {
  let changed = 0;
  const stmt = db.prepare(
    `UPDATE prediction_claims SET creation_price = ? WHERE id = ? AND creation_price IS NULL`,
  );
  for (const r of results) {
    if (r.disposition !== "backfilled" || !r.sourceBar) continue;
    const result = stmt.run(r.sourceBar.close, r.id);
    changed += result.changes;
  }
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--apply");
  const idsArg = args.find((a) => a.startsWith("--ids="));
  const ids = idsArg
    ? idsArg
        .slice("--ids=".length)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : undefined;

  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "data", "market.db");

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[BACKFILL-PREDCLAIM] backfill-predclaim-creation-price`);
  log(`[BACKFILL-PREDCLAIM] mode=${isDryRun ? "DRY-RUN" : "APPLY"}`);
  log(`[BACKFILL-PREDCLAIM] DB_PATH=${DB_PATH}`);
  if (ids) log(`[BACKFILL-PREDCLAIM] ids filter=${ids.join(",")}`);

  if (!existsSync(DB_PATH)) {
    log(`[BACKFILL-PREDCLAIM] ERROR: DB not found at ${DB_PATH}`);
    log(`[BACKFILL-PREDCLAIM] For the live named-volume DB, run via docker exec:`);
    log(`[BACKFILL-PREDCLAIM]   docker cp scripts/migrations/backfill-predclaim-creation-price.ts \\`);
    log(`[BACKFILL-PREDCLAIM]     vn-market-intelligence-mcp-mcp-server-1:/app/backfill-predclaim-creation-price.ts`);
    log(`[BACKFILL-PREDCLAIM]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[BACKFILL-PREDCLAIM]     bun /app/backfill-predclaim-creation-price.ts --apply`);
    process.exit(1);
  }

  let db: Database;
  try {
    db = new Database(DB_PATH, { readwrite: !isDryRun, readonly: isDryRun });
  } catch (err) {
    log(`[BACKFILL-PREDCLAIM] ERROR: Cannot open DB: ${err}`);
    process.exit(1);
  }

  try {
    const candidates = findNullCreationPriceCandidates(db, ids);

    if (candidates.length === 0) {
      log(`[BACKFILL-PREDCLAIM] No NULL-creation_price pending candidates found — no-op (exit 0)`);
      db.close();
      process.exit(0);
    }

    const results = resolveCandidates(db, candidates);

    log(`[BACKFILL-PREDCLAIM] Found ${results.length} candidate(s):`);
    for (const r of results) {
      if (r.disposition === "backfilled" && r.sourceBar) {
        log(
          `[BACKFILL-PREDCLAIM]   id=${r.id} stock=${r.stock} tradingDate=${r.tradingDate} ` +
            `disposition=backfilled sourceBar={code:${r.sourceBar.code},date:${r.sourceBar.date},close:${r.sourceBar.close}}`,
        );
      } else {
        log(
          `[BACKFILL-PREDCLAIM]   id=${r.id} stock=${r.stock} tradingDate=${r.tradingDate} ` +
            `disposition=no_bar (no daily_ohlcv row for this ticker/date — left untouched, honest gap)`,
        );
      }
    }

    if (isDryRun) {
      log(`[BACKFILL-PREDCLAIM] DRY-RUN — no writes. Re-run with --apply to write backfilled values.`);
    } else {
      const changed = applyBackfill(db, results);
      log(`[BACKFILL-PREDCLAIM] APPLY — updated ${changed} row(s) creation_price`);
      log(
        `[BACKFILL-PREDCLAIM] REMINDER: this script's own read-back is NOT sufficient proof — ` +
          `verify through the LIVE served endpoint (GET /api/prediction-claims) before reporting PASS.`,
      );
    }

    db.close();
  } catch (err) {
    log(`[BACKFILL-PREDCLAIM] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
