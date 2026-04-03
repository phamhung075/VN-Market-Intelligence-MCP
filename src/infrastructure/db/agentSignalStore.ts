/**
 * Agent Signal Store — multi-agent coordination bus persistence helpers.
 *
 * Provides:
 *   - postSignal()           — insert a new signal into agent_signals
 *   - getChainFindings()     — get all findings in a cycle window
 *   - getChainFromRoot()     — follow causal_ref links from a root finding
 *   - getOpenChainFindings() — get unsynthesized findings for agent enrichment
 *   - computeCycleId()       — generate a 15-min window cycle ID
 *
 * Signal types are extended to include enrichment chain types:
 *   chain_catalyst, fundamental_validation, price_confirmation, verified_chain
 */

import type { Database } from "bun:sqlite";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalType =
  | "urgent_news"
  | "price_anomaly"
  | "cross_validate"
  | "suppress"
  | "chain_catalyst"
  | "fundamental_validation"
  | "price_confirmation"
  | "verified_chain";

export interface SignalPayload {
  title?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface PostSignalInput {
  fromAgent: string;
  toAgent: string;
  signalType: SignalType | string;
  stockCode?: string | null;
  payload: SignalPayload | Record<string, unknown>;
  ttlMinutes?: number;
  /** 15-min cycle window identifier, e.g. "20260404-0900". Auto-computed if omitted. */
  cycleId?: string;
  /** Structured finding metrics validated by the agent */
  findingData?: Record<string, unknown>;
  /** FK to parent signal ID (for chain traversal) */
  causalRef?: number;
  /** 0=catalyst, 1=validation, 2=confirmation, 3=synthesis */
  chainDepth?: number;
}

export interface ChainFinding {
  id: number;
  fromAgent: string;
  signalType: SignalType | string;
  stockCode: string | null;
  payload: SignalPayload;
  findingData: Record<string, unknown>;
  causalRef: number | null;
  chainDepth: number;
  createdAt: string;
}

// ── computeCycleId ────────────────────────────────────────────────────────────

/**
 * Generates a 15-min cycle window identifier from a Date.
 *
 * Format: "YYYYMMDD-HHMM" where MM is rounded down to 0, 15, 30, or 45.
 *
 * @param date - Defaults to `new Date()` if omitted.
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

// ── postSignal ────────────────────────────────────────────────────────────────

/**
 * Insert a new agent signal into the `agent_signals` table.
 *
 * @returns The rowid (integer PK) of the inserted row.
 */
export function postSignal(db: Database, input: PostSignalInput): number {
  const {
    fromAgent,
    toAgent,
    signalType,
    stockCode = null,
    payload,
    ttlMinutes,
    cycleId,
    findingData = {},
    causalRef = null,
    chainDepth = 0,
  } = input;

  const now = new Date().toISOString();
  const expiresAt =
    ttlMinutes != null
      ? new Date(Date.now() + ttlMinutes * 60_000).toISOString()
      : null;

  const stmt = db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload_json,
       created_at, expires_at, processed, cycle_id, finding_data,
       causal_ref, chain_depth)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    fromAgent,
    toAgent,
    signalType,
    stockCode,
    JSON.stringify(payload),
    now,
    expiresAt,
    cycleId ?? null,
    JSON.stringify(findingData),
    causalRef,
    chainDepth,
  );

  return Number(result.lastInsertRowid);
}

// ── Row deserialization helper ────────────────────────────────────────────────

interface RawRow {
  id: number;
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  payload_json: string;
  finding_data: string | null;
  causal_ref: number | null;
  chain_depth: number;
  created_at: string;
}

function deserializeRow(row: RawRow): ChainFinding {
  let payload: SignalPayload = {};
  let findingData: Record<string, unknown> = {};

  try { payload = JSON.parse(row.payload_json) as SignalPayload; } catch {}
  try { findingData = JSON.parse(row.finding_data ?? "{}") as Record<string, unknown>; } catch {}

  return {
    id: row.id,
    fromAgent: row.from_agent,
    signalType: row.signal_type as SignalType,
    stockCode: row.stock_code,
    payload,
    findingData,
    causalRef: row.causal_ref,
    chainDepth: row.chain_depth ?? 0,
    createdAt: row.created_at,
  };
}

// ── getChainFindings ──────────────────────────────────────────────────────────

/**
 * Get all findings in a specific cycle window.
 *
 * Use this to collect all agent findings within a 15-min cycle so the
 * chain synthesizer can group them by stock_code.
 *
 * @param db      - Active bun:sqlite Database connection
 * @param cycleId - 15-min window identifier, e.g. "20260404-0900"
 */
export function getChainFindings(
  db: Database,
  cycleId: string,
): ChainFinding[] {
  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id = ?
    ORDER BY chain_depth ASC, id ASC
  `);
  const rows = stmt.all(cycleId) as RawRow[];
  return rows.map(deserializeRow);
}

// ── getChainFromRoot ──────────────────────────────────────────────────────────

/**
 * Get a complete chain by following causal_ref links from a root finding.
 *
 * Returns the root signal first, then all signals that directly reference it
 * via causal_ref. Note: only follows one level of the chain (direct children)
 * because the depth structure provides ordering.
 *
 * @param db     - Active bun:sqlite Database connection
 * @param rootId - ID of the root (depth=0) signal
 */
export function getChainFromRoot(
  db: Database,
  rootId: number,
): ChainFinding[] {
  // Get root
  const rootStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE id = ?
  `);
  const root = rootStmt.get(rootId) as RawRow | null;
  if (!root) return [];

  // Get all children (direct references to root)
  const childStmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE causal_ref = ?
    ORDER BY chain_depth ASC, id ASC
  `);
  const children = childStmt.all(rootId) as RawRow[];

  return [root, ...children].map(deserializeRow);
}

// ── getOpenChainFindings ──────────────────────────────────────────────────────

/**
 * Get open chain findings (not yet synthesized) for agents to enrich.
 *
 * Returns signals with enrichment chain columns (cycle_id IS NOT NULL)
 * created within the last `minutesBack` minutes and not yet marked as
 * processed (i.e., not yet synthesized into a verified_chain).
 *
 * @param db          - Active bun:sqlite Database connection
 * @param minutesBack - Lookback window in minutes (default 30)
 */
export function getOpenChainFindings(
  db: Database,
  minutesBack: number = 30,
): ChainFinding[] {
  const cutoff = new Date(Date.now() - minutesBack * 60_000).toISOString();

  const stmt = db.prepare(`
    SELECT id, from_agent, signal_type, stock_code, payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id IS NOT NULL
      AND created_at >= ?
      AND processed = 0
      AND signal_type != 'verified_chain'
    ORDER BY chain_depth ASC, id ASC
  `);
  const rows = stmt.all(cutoff) as RawRow[];
  return rows.map(deserializeRow);
}
