/**
 * Agent Signal Store — Task 242
 *
 * SQLite CRUD helpers for the `agent_signals` table.
 *
 * The agent signal bus lets analysis agents communicate with each other
 * by posting typed, TTL-bound messages into a shared SQLite table.
 *
 * All times are stored as UTC ISO-8601 strings (SQLite datetime format).
 * Numbers are in plain integers — no million-VND convention needed here.
 */

import type { Database } from "bun:sqlite";

// ── Types ──────────────────────────────────────────────────────────────────

/** Valid signal types that agents can exchange. */
export type SignalType = "urgent_news" | "price_anomaly" | "cross_validate" | "suppress";

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
  title: string;
  detail: string;
  impact_score?: number;
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

/** Input for posting a new signal. */
export interface PostSignalInput {
  fromAgent: string;
  toAgent: string;
  signalType: SignalType;
  stockCode?: string;
  payload: SignalPayload;
  /** Time-to-live in minutes from now. */
  ttlMinutes: number;
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

// ── postSignal ──────────────────────────────────────────────────────────────

/**
 * Insert a new agent signal and return its auto-increment ID.
 *
 * @param db    - Active bun:sqlite Database connection
 * @param input - Signal parameters including TTL
 * @returns     The newly created row ID (positive integer)
 */
export function postSignal(db: Database, input: PostSignalInput): number {
  const stmt = db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at)
    VALUES
      (?, ?, ?, ?, ?, 'unread', ?)
  `);

  const result = stmt.run(
    input.fromAgent,
    input.toAgent,
    input.signalType,
    input.stockCode ?? null,
    JSON.stringify(input.payload),
    expiresAt(input.ttlMinutes),
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
