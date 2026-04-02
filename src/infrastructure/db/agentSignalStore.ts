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
