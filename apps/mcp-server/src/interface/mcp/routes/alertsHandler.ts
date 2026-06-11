/**
 * alertsHandler.ts — GET /api/alerts
 *
 * TASK-17 Alerts page — ENDPOINT WAVE:
 * Serve the live `alerts` table to the frontend.
 *
 * Source: `alerts` SQLite table — ordered by triggered_at DESC, limit param.
 * Schema evolution: confidence_score, validated_at, outcome, outcome_at,
 * outcome_detail are added via idempotent ALTER TABLE in schema-alerts.ts;
 * columns may be absent in test-fresh DBs.  Guard with try/catch probe.
 *
 * Response shape (200 OK):
 *   {
 *     items: [
 *       {
 *         id:              string,
 *         triggeredAt:     string,       // ISO 8601 triggered_at
 *         severity:        string,       // low | medium | high | critical
 *         signals:         string[],     // parsed from signals_json ([] on null/error)
 *         affectedActions: Array<{code:string, expectedImpact:string, confidence:number}>,
 *         message:         string | null,
 *         read:            number,       // 0 | 1
 *         sentBy:          string,
 *         confidenceScore: number | null,
 *         outcome:         string | null
 *       },
 *       ...
 *     ],
 *     count:     number,   // items.length
 *     fetchedAt: string    // ISO 8601 server clock
 *   }
 *
 * Query params:
 *   ?limit=N    — default 50, clamped [1, 200]
 *   ?severity=X — optional exact-match filter (low|medium|high|critical)
 *
 * 200 + empty items[] when no rows exist (no error).
 * 500 on DB error.
 *
 * DDD Layer: interface — imports only from bun:sqlite (DB type), never from
 * domain/.  db is injected by server.ts (no getDb() call here).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from alerts table. */
interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  message: string | null;
  read: number;
  sent_by: string;
  confidence_score: number | null;
  outcome: string | null;
}

/** One affected action in the parsed response. */
export interface AffectedAction {
  code: string;
  expectedImpact: string;
  confidence: number;
}

/** One alert item in the response envelope. */
export interface AlertItem {
  id: string;
  triggeredAt: string;
  severity: string;
  signals: string[];
  affectedActions: AffectedAction[];
  message: string | null;
  read: number;
  sentBy: string;
  confidenceScore: number | null;
  outcome: string | null;
}

/** Full response body for GET /api/alerts. */
export interface AlertsResponse {
  items: AlertItem[];
  count: number;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a JSON string that should be a string[] into a string[].
 * Returns [] on null, empty, or any parse error — never throws.
 */
export function parseSignalsJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * Parse a JSON string that should be an AffectedAction[] into AffectedAction[].
 * Returns [] on null, empty, or any parse error — never throws.
 */
export function parseAffectedActionsJson(raw: string | null): AffectedAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: AffectedAction[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        result.push({
          code: typeof item.code === "string" ? item.code : "",
          expectedImpact: typeof item.expectedImpact === "string" ? item.expectedImpact : "",
          confidence: typeof item.confidence === "number" ? item.confidence : 0,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query alerts from the DB, newest triggered_at first.
 *
 * @param db       - SQLite database instance (injected)
 * @param limit    - Max rows to return (default 50, clamped [1, 200])
 * @param severity - Optional exact-match severity filter
 * @returns Array of AlertItem[], newest first
 */
export function queryAlerts(
  db: Database,
  limit: number = DEFAULT_LIMIT,
  severity?: string,
): AlertItem[] {
  const clampedLimit = Math.min(MAX_LIMIT, Math.max(1, isNaN(limit) ? DEFAULT_LIMIT : limit));

  // Probe for optional columns that are added via ALTER TABLE in schema-alerts.ts.
  // Fresh test DBs (initDatabase) may not have them if the migration hasn't run yet.
  let hasConfidenceScore = false;
  let hasOutcome = false;
  try {
    db.prepare("SELECT confidence_score FROM alerts LIMIT 0").all();
    hasConfidenceScore = true;
  } catch { /* column absent */ }
  try {
    db.prepare("SELECT outcome FROM alerts LIMIT 0").all();
    hasOutcome = true;
  } catch { /* column absent */ }

  const confidenceCol = hasConfidenceScore ? ", confidence_score" : "";
  const outcomeCol = hasOutcome ? ", outcome" : "";

  const havingSeverity = typeof severity === "string" && severity.length > 0;

  const sql = havingSeverity
    ? `SELECT id, triggered_at, severity, signals_json, affected_actions_json,
              message, read, sent_by${confidenceCol}${outcomeCol}
       FROM alerts
       WHERE severity = ?
       ORDER BY triggered_at DESC
       LIMIT ?`
    : `SELECT id, triggered_at, severity, signals_json, affected_actions_json,
              message, read, sent_by${confidenceCol}${outcomeCol}
       FROM alerts
       ORDER BY triggered_at DESC
       LIMIT ?`;

  const rows = havingSeverity
    ? (db.prepare<AlertRow, [string, number]>(sql).all(severity!, clampedLimit) as AlertRow[])
    : (db.prepare<AlertRow, [number]>(sql).all(clampedLimit) as AlertRow[]);

  return rows.map((row) => ({
    id: row.id,
    triggeredAt: row.triggered_at,
    severity: row.severity,
    signals: parseSignalsJson(row.signals_json),
    affectedActions: parseAffectedActionsJson(row.affected_actions_json),
    message: row.message ?? null,
    read: row.read,
    sentBy: row.sent_by,
    confidenceScore: hasConfidenceScore ? (row.confidence_score ?? null) : null,
    outcome: hasOutcome ? (row.outcome ?? null) : null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/alerts.
 *
 * @param req  - Incoming HTTP request (reads ?limit= and ?severity= query params)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetAlerts(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const severityParam = url.searchParams.get("severity") ?? undefined;

    const items = queryAlerts(db, limit, severityParam);

    const body: AlertsResponse = {
      items,
      count: items.length,
      fetchedAt: now.toISOString(),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
