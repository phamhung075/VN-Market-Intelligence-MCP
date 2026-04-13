/**
 * Task 1144 — GET /api/foreign-flow-status diagnostic endpoint (Sprint 063)
 *
 * Extracts the core business logic into a pure function so it can be tested
 * without spinning up an HTTP server. The server.ts HTTP handler calls this
 * function and writes the result to the ServerResponse.
 *
 * Layer: interface/mcp
 */

import type { Database } from "bun:sqlite";

// ─── Response shape ───────────────────────────────────────────────────────────

export interface ForeignFlowStatusBody {
  configuredFields: {
    fbuyField: string;
    fsellField: string;
    roomField: string;
  };
  lastPushSummary: {
    receivedAt: string;
    itemCount: number;
    sampleRow: {
      code: string;
      foreign_volume: number;
      foreign_room: number;
      holding_ratio: number;
    } | null;
  } | null;
  tableRowCount: number;
  staleSince: string | null;
}

export interface ForeignFlowStatusResponse {
  status: 200 | 401;
  body: ForeignFlowStatusBody | { error: string };
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface BuildForeignFlowStatusOptions {
  /** The db instance to query against */
  db: Database;
  /** Expected API key (from VPS_PUSH_API_KEY env var) */
  apiKey: string | undefined;
  /** The key sent by the caller (from x-api-key header) */
  requestApiKey: string | undefined;
  /**
   * Optional env var overrides for testing; undefined value means "not set"
   * (fall back to default). When calling from production, pass {} and
   * the function reads Bun.env directly.
   */
  envOverride?: Partial<Record<
    "FOREIGN_FLOW_FBUY_FIELD" | "FOREIGN_FLOW_FSELL_FIELD" | "FOREIGN_FLOW_FROOM_FIELD",
    string | undefined
  >>;
}

// ─── Core logic (testable pure function) ─────────────────────────────────────

/**
 * Build the foreign-flow status response.
 *
 * Returns a plain object so tests can assert on it without HTTP.
 * server.ts calls this and writes the result to ServerResponse.
 */
export function buildForeignFlowStatusResponse(
  opts: BuildForeignFlowStatusOptions,
): ForeignFlowStatusResponse {
  const { db, apiKey, requestApiKey } = opts;
  const envOverride = opts.envOverride ?? {};

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (!apiKey || requestApiKey !== apiKey) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // ── Configured fields (env → default) ───────────────────────────────────────
  // When envOverride is provided (tests), use it; otherwise read Bun.env.
  const fbuyField =
    "FOREIGN_FLOW_FBUY_FIELD" in envOverride
      ? (envOverride.FOREIGN_FLOW_FBUY_FIELD ?? "fbuyVol")
      : (Bun.env.FOREIGN_FLOW_FBUY_FIELD ?? "fbuyVol");

  const fsellField =
    "FOREIGN_FLOW_FSELL_FIELD" in envOverride
      ? (envOverride.FOREIGN_FLOW_FSELL_FIELD ?? "fsellVol")
      : (Bun.env.FOREIGN_FLOW_FSELL_FIELD ?? "fsellVol");

  const roomField =
    "FOREIGN_FLOW_FROOM_FIELD" in envOverride
      ? (envOverride.FOREIGN_FLOW_FROOM_FIELD ?? "currentRoom")
      : (Bun.env.FOREIGN_FLOW_FROOM_FIELD ?? "currentRoom");

  const configuredFields = { fbuyField, fsellField, roomField };

  // ── Last push from vps_push_log ──────────────────────────────────────────────
  type LogRow = { pushed_at: string; items_count: number };
  const lastLog = db
    .prepare<LogRow, [string]>(
      `SELECT pushed_at, items_count FROM vps_push_log
       WHERE service = ? ORDER BY pushed_at DESC LIMIT 1`,
    )
    .get("foreign-flow") as LogRow | null;

  // ── Sample row from vnstock_trading_stats ────────────────────────────────────
  type SampleRow = {
    code: string;
    foreign_volume: number;
    foreign_room: number;
    holding_ratio: number;
  };
  const sampleRow = db
    .prepare<SampleRow, []>(
      `SELECT code, foreign_volume, foreign_room, holding_ratio
       FROM vnstock_trading_stats
       WHERE foreign_volume IS NOT NULL AND foreign_volume != 0
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get() as SampleRow | null;

  // ── Row count ────────────────────────────────────────────────────────────────
  type CountRow = { cnt: number };
  const countRow = db
    .prepare<CountRow, []>(
      `SELECT COUNT(*) as cnt FROM vnstock_trading_stats
       WHERE foreign_volume IS NOT NULL AND foreign_volume != 0`,
    )
    .get() as CountRow;

  // ── Stale check: > 48h since last push ──────────────────────────────────────
  let staleSince: string | null = null;
  if (lastLog?.pushed_at) {
    const ageMs = Date.now() - new Date(lastLog.pushed_at).getTime();
    if (ageMs > 48 * 60 * 60 * 1000) staleSince = lastLog.pushed_at;
  }

  // ── Assemble payload ─────────────────────────────────────────────────────────
  const payload: ForeignFlowStatusBody = {
    configuredFields,
    lastPushSummary: lastLog
      ? {
          receivedAt: lastLog.pushed_at,
          itemCount: lastLog.items_count,
          sampleRow: sampleRow ?? null,
        }
      : null,
    tableRowCount: countRow.cnt,
    staleSince,
  };

  return { status: 200, body: payload };
}
