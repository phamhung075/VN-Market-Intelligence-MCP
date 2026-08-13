/** Enrichment-chain query functions: cycle windows, causal-ref traversal, open findings, migration. */

import type { Database } from "bun:sqlite";
import { deserializeChainRow, type ChainFinding, type RawChainRow } from "./chainRowSerializer.js";

/**
 * Generates a 15-min cycle window identifier from a Date.
 * Format: "YYYYMMDD-HHMM" where MM is rounded down to 0, 15, 30, or 45.
 * @example computeCycleId(new Date("2026-04-04T09:17:00Z")) // "20260404-0915"
 */
export function computeCycleId(date?: Date): string {
  const d = date ?? new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const rawMin = d.getUTCMinutes();
  const min = Math.floor(rawMin / 15) * 15;
  const minStr = String(min).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${minStr}`;
}

/** Get all findings in a specific 15-min cycle window (for the chain synthesizer). */
export function getChainFindings(db: Database, cycleId: string): ChainFinding[] {
  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id = ?
      AND stock_code IS NOT NULL
      AND stock_code != 'unknown'
    ORDER BY chain_depth ASC, id ASC
  `);
  return (stmt.all(cycleId) as RawChainRow[]).map(deserializeChainRow);
}

/**
 * Get a complete chain by following causal_ref links from a root finding.
 * Returns the root signal first, then all direct children (one level only —
 * depth structure provides ordering).
 */
export function getChainFromRoot(db: Database, rootId: number): ChainFinding[] {
  const rootStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE id = ?
  `);
  const root = rootStmt.get(rootId) as RawChainRow | null;
  if (!root) return [];

  const childStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE causal_ref = ?
    ORDER BY chain_depth ASC, id ASC
  `);
  const children = childStmt.all(rootId) as RawChainRow[];

  return [root, ...children].map(deserializeChainRow);
}

/** Get open chain findings (not yet synthesized) for agents to enrich. */
export function getOpenChainFindings(db: Database, minutesBack: number = 30): ChainFinding[] {
  const cutoff = new Date(Date.now() - minutesBack * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  let useProcessed = true;
  try {
    db.prepare("SELECT processed FROM agent_signals LIMIT 0").all();
  } catch {
    useProcessed = false;
  }
  const processedClause = useProcessed ? "AND processed = 0" : "AND status = 'unread'";

  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id IS NOT NULL
      AND created_at >= ?
      ${processedClause}
      AND signal_type != 'verified_chain'
    ORDER BY chain_depth ASC, id ASC
  `);
  return (stmt.all(cutoff) as RawChainRow[]).map(deserializeChainRow);
}

/**
 * Bug 1313: One-time migration helper — NULLs pre-1334 `stock_code = 'unknown'`
 * sentinel rows so getChainFindings() correctly excludes them. Idempotent.
 */
export function migrateUnknownStockCodes(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(`UPDATE agent_signals SET stock_code = NULL WHERE stock_code = 'unknown'`).run();
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}
