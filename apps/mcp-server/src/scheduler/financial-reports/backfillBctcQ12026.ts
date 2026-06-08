/**
 * backfillBctcQ12026.ts — Sprint 1953c
 *
 * One-shot Q1-2026 BCTC queue backfill.
 *
 * Inserts a bctc_vps_queue row (source_url=NULL) for every watchlist ticker
 * at year=2026 quarter=Q1, status=pending, attempts=0.
 *
 * INSERT OR IGNORE: safe to run multiple times — idempotent.
 *
 * After insertion:
 *   - bctcQueueEnricherJob (every 15 min) discovers the real PDF URL via VPS
 *   - bctcPdfPullJob (every 30 min) downloads the PDF from VPS
 *   - bctcReparseJob (daily 09:30 UTC) extracts text + writes financial_reports row
 *
 * Usage (from monorepo root, container or local):
 *   bun run apps/mcp-server/src/scheduler/financial-reports/backfillBctcQ12026.ts
 *
 * Prerequisite: container must be running (market.db must be present at DB_PATH).
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Watchlist ────────────────────────────────────────────────────────────────

function readWatchlistTickers(): string[] {
  const classificationPath = resolve(
    process.cwd(),
    "docs/data/stock-classification.json",
  );
  const raw = readFileSync(classificationPath, "utf-8");
  const parsed = JSON.parse(raw) as { watchlist?: Array<{ ticker: string }> };
  return (parsed.watchlist ?? []).map((e) => e.ticker);
}

// ─── Backfill logic ───────────────────────────────────────────────────────────

/**
 * Insert OR IGNORE one bctc_vps_queue row per ticker for Q1-2026.
 *
 * source_url is intentionally inserted as NULL so that bctcQueueEnricherJob's
 * WHERE clause (source_url IS NULL OR ...) picks it up on the next run and
 * populates the real discovered PDF URL.
 *
 * FIX-BCTC-ENRICHER-PLACEHOLDER-URL: a previous version inserted a
 * placeholder VPS URL (`http://125.212.251.27:8765/bctc-files/<TICKER>/...`)
 * that the enricher's WHERE clause did NOT match, causing the pull job to
 * 404-loop forever on those rows.
 *
 * @returns number of rows inserted (0 if all already present)
 */
export function backfillBctcQ12026(db = getDb()): number {
  const tickers = readWatchlistTickers();

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, source_url, status, attempts, created_at)
    VALUES
      (?, ?, ?, NULL, ?, ?, datetime('now'))
  `);

  let inserted = 0;
  for (const ticker of tickers) {
    const result = stmt.run(ticker, 2026, "Q1", "pending", 0) as { changes: number };
    inserted += result.changes;
  }

  console.log(
    `[backfillBctcQ12026] Inserted ${inserted} / ${tickers.length} rows` +
      ` (${tickers.length - inserted} already present — INSERT OR IGNORE skipped them)`,
  );
  return inserted;
}

// ─── Entrypoint (when run directly) ──────────────────────────────────────────

// This block only runs when the file is executed directly (not imported as a module).
// `import.meta.path` is the absolute path of this file.
// When called via `bun run backfillBctcQ12026.ts`, Bun sets argv[1] to the file path.
if (process.argv[1] && import.meta.path.endsWith(process.argv[1].replace(/^.*\//, ""))) {
  console.log("[backfillBctcQ12026] Starting Q1-2026 BCTC queue backfill...");
  try {
    const count = backfillBctcQ12026();
    console.log(`[backfillBctcQ12026] Done. ${count} rows queued for VPS enrichment.`);
    process.exit(0);
  } catch (err) {
    console.error("[backfillBctcQ12026] FATAL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
