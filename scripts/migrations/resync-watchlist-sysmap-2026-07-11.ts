#!/usr/bin/env bun
/**
 * scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts
 * WATCHLIST-DB-SYSMAP-DRIFT-FIX — one-time transactional watchlist resync
 *
 * WHY THIS SCRIPT EXISTS:
 *   The live `watchlist` table drifted from docs/data/system-map.json
 *   `.project.watchlist[]` (SSOT) — accumulated orphaned rows (VEA inactive,
 *   VNH mis-seeded, plus 17+ other stale seeder-only tickers) alongside 17+
 *   missing active SSOT tickers. Root cause (WATCHLIST-DB-SYSMAP-DRIFT-FIX):
 *   `seedWatchlist.ts`'s `WATCHLIST_SEED` used to be a SECOND hardcoded
 *   ticker array, independent of and badly diverged from system-map.json.
 *   That code-side defect is fixed in the same commit as this script —
 *   `WATCHLIST_SEED` now derives from system-map.json at module load (see
 *   seedWatchlist.ts). This script is the one-time DATA resync for whatever
 *   `watchlist` table it's pointed at (the code fix alone does not
 *   retroactively clean an already-drifted live table — schema.ts's
 *   seedWatchlist() call only INSERTs/UPSERTs, it never DELETEs orphans).
 *
 * WHY THE SSOT DERIVATION IS DUPLICATED HERE (not imported from seedWatchlist.ts):
 *   The mcp-server Docker IMAGE bakes `src/` at build time (Dockerfile
 *   `COPY apps/mcp-server/src/ ./src/`) — it is NOT live-synced from the
 *   host repo. `docs/data/` IS live-synced (docker-compose.yml
 *   `./docs/data:/app/docs/data`). That means the currently-RUNNING
 *   container's `seedWatchlist.ts` module still holds the OLD hardcoded
 *   WATCHLIST_SEED until ops rebuilds+swaps the image — dynamically
 *   importing it (as e.g. carry-forward-bctc-orphaned-rows.ts imports its
 *   aggregator) would silently compute the WRONG orphan/missing sets against
 *   stale code. Reading system-map.json directly here decouples this
 *   script's correctness from the image-deployment timing entirely — it can
 *   run safely against the live DB either before or after the ops swap. The
 *   `mapSectorToDomain` copy below is a deliberate, one-time-migration-frozen
 *   duplicate of seedWatchlist.ts's classifier — kept in sync only insofar as
 *   this script is re-run once, right after this commit; it does not need to
 *   track future changes to the canonical version.
 *
 * WHAT THIS SCRIPT DOES:
 *   1. VERIFY (always, read-only snapshot): live watchlist codes vs the SSOT
 *      set (read directly from system-map.json). Reports orphans (live-only)
 *      and missing (SSOT-only) ticker sets.
 *   2. Apply (--apply only), inside a single transaction:
 *        - DELETE orphaned rows (parameterized IN clause — bound params,
 *          never string interpolation)
 *        - UPSERT every SSOT row (INSERT missing + UPDATE existing) using
 *          the exact same statement shape as seedWatchlist.ts's seedWatchlist()
 *   3. AFTER snapshot + ticker-set diff vs SSOT (must be empty on success).
 *
 * Idempotent: a second run finds zero orphans and zero missing rows (the
 * DELETE affects 0 rows, the UPSERT writes the same values) — exit 0, no-op.
 *
 * Usage:
 *   bun scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts           # dry-run (default)
 *   bun scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts --apply   # apply
 *
 *   # Against the live named-volume DB (docker exec — matches the
 *   # reingest-bctc-report.ts / carry-forward-bctc-orphaned-rows.ts precedent).
 *   # Safe to run before OR after the ops image swap — see design note above.
 *   docker cp scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts \
 *     vn-market-intelligence-mcp-mcp-server-1:/app/resync-watchlist-sysmap.ts
 *   docker exec vn-market-intelligence-mcp-mcp-server-1 \
 *     bun /app/resync-watchlist-sysmap.ts --apply
 *
 * Environment:
 *   DB_PATH         — override DB path (default: <repo-root>/apps/mcp-server/data/market.db;
 *                      set to /app/data/market.db by docker-compose inside the container — this
 *                      env var is ALREADY set on the running mcp-server container, so the
 *                      import.meta.dir-based fallback below is only ever exercised locally).
 *   SYSTEM_MAP_PATH — override system-map.json path (default: bare relative "docs/data/system-map.json",
 *                      CWD-resolved — same convention as seedWatchlist.ts / boardDetailsJob.ts.
 *                      Resolves correctly in BOTH contexts: locally when invoked from the repo
 *                      root, and in-container where WORKDIR=/app and docs/data is bind-mounted
 *                      at /app/docs/data — deliberately NOT import.meta.dir-based, which would
 *                      break once this file is `docker cp`'d flat into /app).
 *
 * Exit codes:
 *   0 — verified clean / dry-run report printed / apply succeeded (post-condition met)
 *   1 — DB or system-map.json not found / DB error / apply failed post-condition
 *
 * CANONICAL SCRIPT — pointer lives in:
 *   docs/agents/dev-mcp-server/flow/main.md § Script Persistence
 */

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// SSOT derivation — deliberately duplicated from seedWatchlist.ts (see file
// header). DomainType values are NOT re-imported (no cross-image-boundary
// import) — inlined as a plain string union matching bctc-schema.ts's
// DomainType at the time of this migration.
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemMapWatchlistEntry {
  ticker: string;
  company?: string;
  sector: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  active?: boolean;
  note?: string;
}

export interface WatchlistSeedEntry {
  code: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  domain: string;
}

/** Frozen copy of seedWatchlist.ts's mapSectorToDomain — see file header. */
export function mapSectorToDomain(sector: string): string {
  const firstSegment = (sector.split("/")[0] ?? "").trim().toLowerCase();

  const rules: Array<[string, string]> = [
    ["real estate", "real_estate"],
    ["bank", "banking"],
    ["steel", "steel"],
    ["aviation", "aviation"],
    ["retail", "retail"],
    ["tech", "tech"],
    ["utilities", "utilities"],
    ["securities", "securities"],
    ["insurance", "insurance"],
    ["pharma", "pharmaceutical"],
    ["logistics", "logistics"],
    ["gold", "gold_mining"],
    ["automotive", "automotive"],
    ["construction", "construction"],
    ["energy", "energy"],
    ["machinery", "machinery"],
    ["chemicals", "chemicals"],
    ["oil", "oil_gas"],
    ["gas", "oil_gas"],
    ["food", "agriculture"],
    ["agriculture", "agriculture"],
  ];

  for (const [keyword, domain] of rules) {
    if (firstSegment.includes(keyword)) return domain;
  }
  return "other";
}

export function deriveSsotWatchlist(entries: SystemMapWatchlistEntry[]): WatchlistSeedEntry[] {
  return entries
    .filter((e) => e.active !== false)
    .map((e) => ({
      code: e.ticker.toUpperCase().trim(),
      exchange: e.exchange,
      domain: mapSectorToDomain(e.sector),
    }));
}

export function loadSsotWatchlist(systemMapPath: string): WatchlistSeedEntry[] {
  const raw = readFileSync(systemMapPath, "utf-8");
  const parsed = JSON.parse(raw) as { project?: { watchlist?: SystemMapWatchlistEntry[] } };
  const entries = parsed.project?.watchlist ?? [];
  return deriveSsotWatchlist(entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure diff logic (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchlistDiff {
  liveCodes: string[];
  ssotCodes: string[];
  orphans: string[]; // live-only — must be DELETEd
  missing: string[]; // SSOT-only — will be INSERTed by the UPSERT
}

export function computeWatchlistDiff(liveCodes: string[], ssotCodes: string[]): WatchlistDiff {
  const liveSet = new Set(liveCodes);
  const ssotSet = new Set(ssotCodes);
  return {
    liveCodes: [...liveSet].sort(),
    ssotCodes: [...ssotSet].sort(),
    orphans: [...liveSet].filter((c) => !ssotSet.has(c)).sort(),
    missing: [...ssotSet].filter((c) => !liveSet.has(c)).sort(),
  };
}

/**
 * DELETEs the given orphan codes from watchlist via a single parameterized
 * IN clause (bound params — never string interpolation). No-op (does not
 * even prepare a statement) when orphans is empty.
 *
 * @returns number of rows deleted
 */
export function deleteOrphanedWatchlistRows(db: Database, orphans: string[]): number {
  if (orphans.length === 0) return 0;
  const placeholders = orphans.map(() => "?").join(",");
  const result = db.prepare(`DELETE FROM watchlist WHERE code IN (${placeholders})`).run(...orphans);
  return result.changes;
}

/**
 * Upserts every SSOT row — identical statement shape to seedWatchlist.ts's
 * seedWatchlist() (default thresholds dropPct=-3, risePct=5, impactScore=5;
 * ON CONFLICT(code) DO UPDATE to be idempotent).
 *
 * @returns number of rows written (bun:sqlite Statement.run().changes summed)
 */
export function upsertSsotWatchlistRows(db: Database, ssot: WatchlistSeedEntry[]): number {
  const stmt = db.prepare(`
    INSERT INTO watchlist
      (code, exchange, domain, notes, added_at,
       alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
    VALUES (?, ?, ?, NULL, datetime('now'), -3, 5, 5, 1)
    ON CONFLICT(code) DO UPDATE SET
      exchange         = excluded.exchange,
      domain           = excluded.domain,
      alert_drop_pct   = excluded.alert_drop_pct,
      alert_rise_pct   = excluded.alert_rise_pct,
      alert_impact_min = excluded.alert_impact_min,
      alert_report_new = excluded.alert_report_new
  `);
  let written = 0;
  for (const entry of ssot) {
    written += stmt.run(entry.code, entry.exchange, entry.domain).changes;
  }
  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const isApply = args.includes("--apply");

  // NOTE: PROJECT_ROOT (import.meta.dir-based) is only correct when this file
  // is run from its repo-tree location (scripts/migrations/) — it breaks once
  // `docker cp`'d flat into /app. DB_PATH is always set as a real env var on
  // the running container (docker-compose.yml), so that fallback is only
  // exercised locally. SYSTEM_MAP_PATH intentionally does NOT use PROJECT_ROOT
  // — see the env var doc comment above.
  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
  const DB_PATH = Bun.env["DB_PATH"] ?? resolve(PROJECT_ROOT, "apps", "mcp-server", "data", "market.db");
  const SYSTEM_MAP_PATH = Bun.env["SYSTEM_MAP_PATH"] ?? "docs/data/system-map.json";

  function log(msg: string): void {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }

  log(`[RESYNC-WATCHLIST] mode=${isApply ? "APPLY" : "VERIFY (default — no writes)"}`);
  log(`[RESYNC-WATCHLIST] DB_PATH=${DB_PATH}`);
  log(`[RESYNC-WATCHLIST] SYSTEM_MAP_PATH=${SYSTEM_MAP_PATH}`);

  if (!existsSync(DB_PATH)) {
    log(`[RESYNC-WATCHLIST] ERROR: DB not found at ${DB_PATH}`);
    log(`[RESYNC-WATCHLIST] For the named-volume DB, run via docker exec:`);
    log(`[RESYNC-WATCHLIST]   docker cp scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts \\`);
    log(`[RESYNC-WATCHLIST]     vn-market-intelligence-mcp-mcp-server-1:/app/resync-watchlist-sysmap.ts`);
    log(`[RESYNC-WATCHLIST]   docker exec vn-market-intelligence-mcp-mcp-server-1 \\`);
    log(`[RESYNC-WATCHLIST]     bun /app/resync-watchlist-sysmap.ts --apply`);
    process.exit(1);
  }

  if (!existsSync(SYSTEM_MAP_PATH)) {
    log(`[RESYNC-WATCHLIST] ERROR: system-map.json not found at ${SYSTEM_MAP_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  // NOTE: journal_mode is NOT set here (FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT,
  // 2026-07-30) — market.db's journal_mode is DELETE (schema.ts's getDb(), FIX-SQLITE-
  // JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION mitigation for recurring Docker-virt
  // WAL/SHM corruption). This is a one-shot migration script — it must not re-arm WAL and
  // silently undo that mitigation for the duration of its run.

  try {
    const ssot = loadSsotWatchlist(SYSTEM_MAP_PATH);
    if (ssot.length === 0) {
      log(`[RESYNC-WATCHLIST] FATAL: derived SSOT watchlist is empty — refusing to resync against ` +
          `an empty SSOT (would delete every live row). Check ${SYSTEM_MAP_PATH} .project.watchlist[].`);
      db.close();
      process.exit(1);
    }

    const liveCodesBefore = (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map(
      (r) => r.code,
    );
    const ssotCodes = ssot.map((e) => e.code);
    const before = computeWatchlistDiff(liveCodesBefore, ssotCodes);

    log(`[RESYNC-WATCHLIST] BEFORE: live=${before.liveCodes.length} ssot=${before.ssotCodes.length}`);
    log(`[RESYNC-WATCHLIST] BEFORE: orphans(${before.orphans.length})=${before.orphans.join(",") || "(none)"}`);
    log(`[RESYNC-WATCHLIST] BEFORE: missing(${before.missing.length})=${before.missing.join(",") || "(none)"}`);

    if (!isApply) {
      log(`[RESYNC-WATCHLIST] DRY-RUN — would DELETE ${before.orphans.length} orphan row(s) and ` +
          `UPSERT ${ssotCodes.length} SSOT row(s) (${before.missing.length} new INSERT, ` +
          `${ssotCodes.length - before.missing.length} existing UPDATE).`);
      log(`[RESYNC-WATCHLIST] Re-run with --apply to execute.`);
      db.close();
      process.exit(0);
    }

    log(`[RESYNC-WATCHLIST] APPLY — starting transaction...`);
    db.exec("BEGIN");
    try {
      const deleted = deleteOrphanedWatchlistRows(db, before.orphans);
      log(`[RESYNC-WATCHLIST] deleted ${deleted} orphan row(s)`);
      const written = upsertSsotWatchlistRows(db, ssot);
      log(`[RESYNC-WATCHLIST] upserted ${written} SSOT row(s)`);
      db.exec("COMMIT");
      log(`[RESYNC-WATCHLIST] transaction committed`);
    } catch (txErr) {
      db.exec("ROLLBACK");
      throw txErr;
    }

    const liveCodesAfter = (db.prepare("SELECT code FROM watchlist").all() as { code: string }[]).map(
      (r) => r.code,
    );
    const after = computeWatchlistDiff(liveCodesAfter, ssotCodes);
    log(`[RESYNC-WATCHLIST] AFTER: live=${after.liveCodes.length} ssot=${after.ssotCodes.length}`);
    log(`[RESYNC-WATCHLIST] AFTER: orphans(${after.orphans.length})=${after.orphans.join(",") || "(none)"}`);
    log(`[RESYNC-WATCHLIST] AFTER: missing(${after.missing.length})=${after.missing.join(",") || "(none)"}`);

    db.close();

    const postConditionMet = after.orphans.length === 0 && after.missing.length === 0;
    if (postConditionMet) {
      log(`[RESYNC-WATCHLIST] POST-CONDITION MET: live watchlist ticker set exactly equals SSOT (${after.liveCodes.length} tickers).`);
      process.exit(0);
    } else {
      log(`[RESYNC-WATCHLIST] POST-CONDITION NOT MET — inspect the AFTER snapshot above.`);
      process.exit(1);
    }
  } catch (err) {
    log(`[RESYNC-WATCHLIST] FATAL: ${err}`);
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
