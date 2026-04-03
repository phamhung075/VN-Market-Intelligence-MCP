/**
 * Agent Signal Store — Task 242 + Enrichment Chain Extension
 *
 * SQLite CRUD helpers for the `agent_signals` table.
 *
 * The agent signal bus lets analysis agents communicate with each other
 * by posting typed, TTL-bound messages into a shared SQLite table.
 *
 * Provides:
 *   - postSignal()           — insert a new signal into agent_signals
 *   - getSignals()           — retrieve pending signals for an agent
 *   - recordOutcome()        — record processing outcome for a signal
 *   - getSignalEffectiveness() — aggregate effectiveness metrics
 *   - cleanExpired()         — delete expired signals
 *   - computeCycleId()       — generate a 15-min window cycle ID
 *   - getChainFindings()     — get all findings in a cycle window
 *   - getChainFromRoot()     — follow causal_ref links from a root finding
 *   - getOpenChainFindings() — get unsynthesized findings for agent enrichment
 *
 * Signal types include enrichment chain types:
 *   chain_catalyst, fundamental_validation, price_confirmation, verified_chain
 *
 * All times are stored as UTC ISO-8601 strings (SQLite datetime format).
 * Numbers are in plain integers — no million-VND convention needed here.
 */

import type { Database } from "bun:sqlite";

// ── Types ──────────────────────────────────────────────────────────────────

/** Valid signal types that agents can exchange (includes enrichment chain types). */
export type SignalType =
  | "urgent_news"
  | "price_anomaly"
  | "cross_validate"
  | "suppress"
  | "chain_catalyst"
  | "fundamental_validation"
  | "price_confirmation"
  | "verified_chain";

/** Outcome values for a signal once it has been processed. */
export type SignalOutcome = "fired" | "suppressed" | "confirmed" | "false_positive";

/** Per-group effectiveness metrics returned by getSignalEffectiveness. */
export interface SignalEffectiveness {
  fromAgent: string;
  signalType: string;
  total: number;
  fired: number;
  confirmed: number;
  false_positive: number;
  /** confirmed / (confirmed + false_positive), or null when denominator is 0. */
  precision: number | null;
}

/** Payload carried by an agent signal. */
export interface SignalPayload {
  title?: string;
  detail?: string;
  impact_score?: number;
  [key: string]: unknown;
}

/** A fully hydrated agent signal row returned by getSignals. */
export interface AgentSignal {
  id: number;
  fromAgent: string;
  toAgent: string;
  signalType: SignalType;
  stockCode: string | null;
  payload: SignalPayload;
  status: "unread" | "read";
  createdAt: string;
  expiresAt: string;
}

/** Input for posting a new signal (extended with enrichment chain fields). */
export interface PostSignalInput {
  fromAgent: string;
  toAgent: string;
  signalType: SignalType | string;
  stockCode?: string | null;
  payload: SignalPayload | Record<string, unknown>;
  /** Time-to-live in minutes from now. */
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

/** Deserialized chain finding row. */
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute an ISO-8601 UTC datetime string for `now + ttlMinutes`.
 * SQLite stores datetimes without a timezone suffix — we strip the trailing Z.
 */
function expiresAt(ttlMinutes: number): string {
  const ms = Date.now() + ttlMinutes * 60 * 1000;
  // SQLite datetime() format: "YYYY-MM-DD HH:MM:SS" (no Z)
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

// ── Row deserialization helper ────────────────────────────────────────────────

interface RawChainRow {
  id: number;
  from_agent: string;
  signal_type: string;
  stock_code: string | null;
  payload_json?: string;
  payload?: string;
  finding_data: string | null;
  causal_ref: number | null;
  chain_depth: number;
  created_at: string;
}

function deserializeChainRow(row: RawChainRow): ChainFinding {
  let payload: SignalPayload = {};
  let findingData: Record<string, unknown> = {};

  const rawPayload = row.payload_json ?? row.payload ?? "{}";
  try { payload = JSON.parse(rawPayload) as SignalPayload; } catch {}
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

// ── postSignal ──────────────────────────────────────────────────────────────

/**
 * Insert a new agent signal and return its auto-increment ID.
 *
 * Supports both the original signal bus fields and the enrichment chain
 * extension fields (cycleId, findingData, causalRef, chainDepth).
 *
 * @param db    - Active bun:sqlite Database connection
 * @param input - Signal parameters including TTL
 * @returns     The newly created row ID (positive integer)
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

  // Check if the enrichment chain columns exist by trying to use them.
  // If they don't exist (old schema), fall back to the base insert.
  const hasChainColumns = (() => {
    try {
      db.prepare("SELECT cycle_id FROM agent_signals LIMIT 0").all();
      return true;
    } catch {
      return false;
    }
  })();

  if (hasChainColumns) {
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    const expires =
      ttlMinutes != null
        ? expiresAt(ttlMinutes)
        : null;

    const stmt = db.prepare(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, status,
         created_at, expires_at, cycle_id, finding_data, causal_ref, chain_depth)
      VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      fromAgent,
      toAgent,
      signalType,
      stockCode,
      JSON.stringify(payload),
      now,
      expires ?? expiresAt(ttlMinutes ?? 120),
      cycleId ?? null,
      JSON.stringify(findingData),
      causalRef,
      chainDepth,
    );

    return Number(result.lastInsertRowid);
  }

  // Fallback: base schema without chain columns
  const stmt = db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at)
    VALUES
      (?, ?, ?, ?, ?, 'unread', ?)
  `);

  const result = stmt.run(
    fromAgent,
    toAgent,
    signalType,
    stockCode,
    JSON.stringify(payload),
    expiresAt(ttlMinutes ?? 120),
  );

  return Number(result.lastInsertRowid);
}

// ── getSignals ──────────────────────────────────────────────────────────────

/** Options for filtering getSignals results. */
export interface GetSignalsOptions {
  /** "unread" (default) returns only unread; "all" returns all statuses. */
  status?: "unread" | "all";
}

/**
 * Retrieve signals for a given agent, filtered by expiry and optionally by status.
 *
 * - Always filters out expired signals (expires_at <= now).
 * - Includes signals addressed directly to `agent` OR to the special value `"all"`.
 * - If status is "unread" (default), marks returned rows as "read" atomically.
 *
 * @param db    - Active bun:sqlite Database connection
 * @param agent - The receiving agent name
 * @param opts  - Optional status filter
 * @returns     Array of hydrated AgentSignal objects (payload parsed from JSON)
 */
export function getSignals(
  db: Database,
  agent: string,
  opts: GetSignalsOptions = {},
): AgentSignal[] {
  const statusFilter = opts.status ?? "unread";

  const statusClause =
    statusFilter === "unread" ? "AND s.status = 'unread'" : "";

  const rows = db
    .query<
      {
        id: number;
        from_agent: string;
        to_agent: string;
        signal_type: string;
        stock_code: string | null;
        payload: string;
        status: string;
        created_at: string;
        expires_at: string;
      },
      [string]
    >(
      `SELECT id, from_agent, to_agent, signal_type, stock_code, payload, status,
              created_at, expires_at
       FROM agent_signals s
       WHERE (s.to_agent = ? OR s.to_agent = 'all')
         AND s.expires_at > datetime('now')
         ${statusClause}
       ORDER BY s.id ASC`,
    )
    .all(agent);

  // Mark unread rows as read (only when we fetched in unread mode)
  if (statusFilter === "unread" && rows.length > 0) {
    const ids = rows.map((r) => r.id).join(",");
    db.exec(`UPDATE agent_signals SET status = 'read' WHERE id IN (${ids})`);
  }

  return rows.map((r) => ({
    id: r.id,
    fromAgent: r.from_agent,
    toAgent: r.to_agent,
    signalType: r.signal_type as SignalType,
    stockCode: r.stock_code,
    payload: JSON.parse(r.payload) as SignalPayload,
    status: (statusFilter === "unread" ? "read" : r.status) as "unread" | "read",
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

// ── recordOutcome ───────────────────────────────────────────────────────────

/**
 * Record the processing outcome for a signal row.
 *
 * Sets `outcome`, `outcome_at` (UTC now), and optionally `outcome_detail`
 * on the row identified by `signalId`.
 *
 * @param db       - Active bun:sqlite Database connection
 * @param signalId - Primary key of the target agent_signals row
 * @param outcome  - One of: fired | suppressed | confirmed | false_positive
 * @param detail   - Optional free-text explanation stored in outcome_detail
 */
export function recordOutcome(
  db: Database,
  signalId: number,
  outcome: SignalOutcome,
  detail?: string,
): void {
  db.prepare(
    `UPDATE agent_signals
        SET outcome        = ?,
            outcome_at     = datetime('now'),
            outcome_detail = ?
      WHERE id = ?`,
  ).run(outcome, detail ?? null, signalId);
}

// ── getSignalEffectiveness ──────────────────────────────────────────────────

/** Options for filtering getSignalEffectiveness results. */
export interface GetEffectivenessOptions {
  /** Only include signals from this agent. */
  fromAgent?: string;
  /** Only include signals of this type. */
  signalType?: string;
  /** Look-back window in days from now (default 7). */
  days?: number;
}

/**
 * Aggregate signal effectiveness metrics grouped by (from_agent, signal_type).
 *
 * Only rows with a non-null `outcome` within the look-back window are counted.
 *
 * @param db   - Active bun:sqlite Database connection
 * @param opts - Optional filters (fromAgent, signalType, days)
 * @returns    Array of SignalEffectiveness records, one per group
 */
export function getSignalEffectiveness(
  db: Database,
  opts: GetEffectivenessOptions = {},
): SignalEffectiveness[] {
  const days = opts.days ?? 7;

  const conditions: string[] = [
    "outcome IS NOT NULL",
    `created_at >= datetime('now', '-${days} days')`,
  ];

  if (opts.fromAgent) conditions.push(`from_agent = '${opts.fromAgent.replace(/'/g, "''")}'`);
  if (opts.signalType) conditions.push(`signal_type = '${opts.signalType.replace(/'/g, "''")}'`);

  const where = conditions.join(" AND ");

  type Row = {
    from_agent: string;
    signal_type: string;
    total: number;
    fired: number;
    confirmed: number;
    false_positive: number;
  };

  const rows = db
    .query<Row, []>(
      `SELECT
         from_agent,
         signal_type,
         COUNT(*)                                              AS total,
         SUM(CASE WHEN outcome = 'fired'         THEN 1 ELSE 0 END) AS fired,
         SUM(CASE WHEN outcome = 'confirmed'     THEN 1 ELSE 0 END) AS confirmed,
         SUM(CASE WHEN outcome = 'false_positive'THEN 1 ELSE 0 END) AS false_positive
       FROM agent_signals
       WHERE ${where}
       GROUP BY from_agent, signal_type
       ORDER BY from_agent, signal_type`,
    )
    .all();

  return rows.map((r) => {
    const denom = r.confirmed + r.false_positive;
    const precision = denom > 0 ? r.confirmed / denom : null;
    return {
      fromAgent: r.from_agent,
      signalType: r.signal_type,
      total: r.total,
      fired: r.fired,
      confirmed: r.confirmed,
      false_positive: r.false_positive,
      precision,
    };
  });
}

// ── cleanExpired ────────────────────────────────────────────────────────────

/**
 * Delete all expired agent signals and return the number of rows removed.
 *
 * Should be called periodically (e.g. from the data audit job) to prevent
 * unbounded table growth.
 *
 * @param db - Active bun:sqlite Database connection
 * @returns  Number of rows deleted
 */
export function cleanExpired(db: Database): number {
  const result = db
    .prepare("DELETE FROM agent_signals WHERE expires_at < datetime('now')")
    .run();
  return result.changes;
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
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE cycle_id = ?
    ORDER BY chain_depth ASC, id ASC
  `);
  const rows = stmt.all(cycleId) as RawChainRow[];
  return rows.map(deserializeChainRow);
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
    SELECT id, from_agent, signal_type, stock_code, payload AS payload_json,
           finding_data, causal_ref, chain_depth, created_at
    FROM agent_signals
    WHERE id = ?
  `);
  const root = rootStmt.get(rootId) as RawChainRow | null;
  if (!root) return [];

  // Get all children (direct references to root)
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
  // Use SQLite-compatible format to match datetime('now') DEFAULT in schema
  const cutoff = new Date(Date.now() - minutesBack * 60_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");

  // Check if 'processed' column exists; fall back to status-based filter
  let useProcessed = true;
  try {
    db.prepare("SELECT processed FROM agent_signals LIMIT 0").all();
  } catch {
    useProcessed = false;
  }

  const processedClause = useProcessed
    ? "AND processed = 0"
    : "AND status = 'unread'";

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
  const rows = stmt.all(cutoff) as RawChainRow[];
  return rows.map(deserializeChainRow);
}
