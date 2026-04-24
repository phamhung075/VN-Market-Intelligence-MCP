/**
 * Use case — exportPortfolioSnapshot
 *
 * Dumps all key tables to a timestamped JSON file in the configured
 * export directory. Tables exported:
 *
 *   - watchlist          — all rows
 *   - positions          — all rows
 *   - alerts             — last 30 days
 *   - rag_analyses       — all rows (analysis_entries)
 *   - financial_reports  — all rows
 *   - market_prices      — all rows
 *   - prediction_markets — all rows
 *   - prediction_signals — last 7 days
 *
 * Output JSON schema version "1.0".
 *
 * @module application/usecases/exportPortfolioSnapshot
 */

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Top-level snapshot JSON structure. */
export interface PortfolioSnapshot {
  exported_at: string;
  schema_version: "1.0";
  watchlist: unknown[];
  positions: unknown[];
  alerts: unknown[];
  analysis_entries: unknown[];
  financial_reports: unknown[];
  market_prices: unknown[];
  prediction_markets: unknown[];
  prediction_signals: unknown[];
  summary: SnapshotSummary;
}

/** Summary counts embedded in the snapshot. */
export interface SnapshotSummary {
  watchlist_count: number;
  open_positions: number;
  alert_count: number;
  financial_reports_count: number;
  market_prices_count: number;
  prediction_markets_count: number;
  prediction_signals_count: number;
}

/** Result returned by exportPortfolioSnapshot(). */
export interface SnapshotResult {
  /** The in-memory snapshot object (always present, even on write error). */
  snapshot: PortfolioSnapshot;
  /** Absolute path to the written file. Empty string on error. */
  filePath: string;
  /** File size in MB (1 decimal place). 0 on error. */
  fileSizeMb: number;
  /** Set when the file could not be written. Contains "(không thể ghi file)". */
  error?: string;
}

/** Options accepted by exportPortfolioSnapshot(). */
export interface ExportSnapshotOptions {
  /** Injected database (supports test isolation). If omitted, opens the app DB. */
  db?: Database;
  /**
   * Directory to write snapshots into.
   * Defaults to `data/exports` relative to the working directory.
   */
  exportDir?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a Date as YYYYMMDD_HHmmss in local time.
 * Used to build the snapshot filename.
 */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const YYYY = d.getFullYear();
  const MM   = pad(d.getMonth() + 1);
  const DD   = pad(d.getDate());
  const HH   = pad(d.getHours());
  const mm   = pad(d.getMinutes());
  const ss   = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
}

/**
 * Safely queries all rows from a table. Returns empty array if table
 * does not exist or any other error occurs.
 */
function safeQueryAll(db: Database, sql: string, params: unknown[] = []): unknown[] {
  try {
    return db.prepare(sql).all(...(params as Parameters<typeof db.prepare>["0"][])) as unknown[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exports all portfolio data to a timestamped JSON snapshot file.
 *
 * @param options - Injection points for database and export directory.
 * @returns SnapshotResult with the in-memory object, file path, and size.
 */
export async function exportPortfolioSnapshot(
  options: ExportSnapshotOptions = {},
): Promise<SnapshotResult> {
  // ── Resolve DB ─────────────────────────────────────────────────────────────
  let db: Database;
  let ownDb = false;

  if (options.db) {
    db = options.db;
  } else {
    const { getDb, initDatabase } = await import("../../infrastructure/db/schema.js");
    await initDatabase();
    db = getDb();
    ownDb = false; // singleton — do not close
  }

  // ── Date filters ──────────────────────────────────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000).toISOString();

  // ── Query tables ──────────────────────────────────────────────────────────
  const watchlist         = safeQueryAll(db, "SELECT * FROM watchlist ORDER BY code");
  const positions         = safeQueryAll(db, "SELECT * FROM positions ORDER BY id");
  const alerts            = safeQueryAll(
    db,
    "SELECT * FROM alerts WHERE triggered_at >= ? ORDER BY triggered_at DESC",
    [thirtyDaysAgo],
  );
  const analysisEntries   = safeQueryAll(db, "SELECT * FROM rag_analyses ORDER BY created_at DESC");
  const financialReports  = safeQueryAll(db, "SELECT * FROM financial_reports ORDER BY created_at DESC");
  const marketPrices      = safeQueryAll(db, "SELECT * FROM market_prices ORDER BY code");
  const predictionMarkets = safeQueryAll(db, "SELECT * FROM prediction_markets ORDER BY updated_at DESC");
  const predictionSignals = safeQueryAll(
    db,
    "SELECT * FROM prediction_signals WHERE detected_at >= ? ORDER BY detected_at DESC",
    [sevenDaysAgo],
  );

  // ── Open positions count ───────────────────────────────────────────────────
  let openPositions = 0;
  try {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM positions WHERE closed_at IS NULL").get() as { cnt: number } | null;
    openPositions = row?.cnt ?? 0;
  } catch {
    openPositions = (positions as Array<{ closed_at: unknown }>).filter((p) => p.closed_at == null).length;
  }

  // ── Assemble snapshot ─────────────────────────────────────────────────────
  const summary: SnapshotSummary = {
    watchlist_count:          watchlist.length,
    open_positions:           openPositions,
    alert_count:              alerts.length,
    financial_reports_count:  financialReports.length,
    market_prices_count:      marketPrices.length,
    prediction_markets_count: predictionMarkets.length,
    prediction_signals_count: predictionSignals.length,
  };

  const snapshot: PortfolioSnapshot = {
    exported_at:        now.toISOString(),
    schema_version:     "1.0",
    watchlist,
    positions,
    alerts,
    analysis_entries:   analysisEntries,
    financial_reports:  financialReports,
    market_prices:      marketPrices,
    prediction_markets: predictionMarkets,
    prediction_signals: predictionSignals,
    summary,
  };

  // ── Write file ────────────────────────────────────────────────────────────
  const exportDir = options.exportDir ?? "data/exports";
  const filename  = `snapshot_${formatTimestamp(now)}.json`;
  const filePath  = join(exportDir, filename);
  const json      = JSON.stringify(snapshot, null, 2);

  try {
    mkdirSync(exportDir, { recursive: true });
    writeFileSync(filePath, json, "utf-8");
    const stats = statSync(filePath);
    const fileSizeMb = Math.round((stats.size / 1_048_576) * 10) / 10;

    return { snapshot, filePath, fileSizeMb };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      snapshot,
      filePath: "",
      fileSizeMb: 0,
      error: `(không thể ghi file): ${msg}`,
    };
  }
}
