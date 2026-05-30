/**
 * Coordination Store — Task-Lock System (Phase 1)
 *
 * Provides a DB-backed cross-session lock mechanism for multi-session
 * collision prevention. Extends the intra-process scheduler_locks concept
 * (schedulerLockStore.ts) to span separate Claude Code OS processes.
 *
 * Database: coordination.db (separate from market.db — see brief §2)
 * Path resolved from COORDINATION_DB_PATH env var or defaults to sibling
 * of market.db at /app/data/coordination.db.
 *
 * Claim protocol (brief §3):
 *   Step 1: INSERT OR IGNORE — if changes()=1, claim succeeded.
 *   Step 2: UPDATE WHERE expires_at < now — stale-steal attempt if Step 1 returned 0.
 *   Step 3: SELECT current holder — read who holds it when steal also fails.
 *
 * Session UUID:
 *   owner_session is the Claude Code session ID injected by the MCP gateway
 *   (coordinationTools.ts). This module never reads or generates session IDs —
 *   callers always pass it in. This enforces server-side session stamping.
 *
 * Error contract:
 *   All public functions are try/catch guarded. DB unavailability returns
 *   {claimed: false, error: 'db_unavailable'} — never throws to the MCP tool layer.
 *   This implements the F3 failure mode from brief §8: refuse-all mode when DB
 *   is corrupt/unavailable.
 *
 * Layer: infrastructure/db — SQLite access only, no domain imports.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// DB singleton (coordination.db is separate from market.db)
// ---------------------------------------------------------------------------

let _coordDb: Database | null = null;
let _coordDbUnavailable = false;  // Fail-loud flag: once set, all claims return false

/**
 * Resolve the coordination.db path.
 * Priority: COORDINATION_DB_PATH env var > sibling of DB_PATH > default.
 */
function resolveCoordinationDbPath(): string {
  if (Bun.env["COORDINATION_DB_PATH"]) {
    return Bun.env["COORDINATION_DB_PATH"];
  }
  // Sibling of market.db — works both in Docker (/app/data/) and host
  const marketPath = Bun.env["DB_PATH"];
  if (marketPath && marketPath !== ":memory:") {
    const dir = dirname(resolve(marketPath));
    return resolve(dir, "coordination.db");
  }
  // Fallback: relative to this file's directory (apps/mcp-server/data/)
  const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..");
  return resolve(PROJECT_ROOT, "data", "coordination.db");
}

/**
 * Open (or return cached) coordination.db with WAL mode.
 * Returns null if unavailable — callers handle the null case.
 */
function getCoordinationDb(): Database | null {
  if (_coordDbUnavailable) return null;
  if (_coordDb) return _coordDb;

  const dbPath = resolveCoordinationDbPath();

  try {
    if (dbPath !== ":memory:") {
      const dir = dirname(dbPath);
      mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");

    // Create table on first open (idempotent)
    ensureCoordinationTable(db);

    _coordDb = db;
    return _coordDb;
  } catch (err) {
    // Any open error → switch to refuse-all mode (brief §8 F3)
    console.error("[coordinationStore] Failed to open coordination.db — refuse-all mode activated", err);
    _coordDbUnavailable = true;
    return null;
  }
}

/**
 * Close and reset the coordination.db singleton.
 * Intended for use in tests only.
 */
export function closeCoordinationDb(): void {
  if (_coordDb) {
    try { _coordDb.close(); } catch { /* ignore */ }
    _coordDb = null;
  }
  _coordDbUnavailable = false;
}

/**
 * Override the DB unavailability flag (for testing only).
 */
export function _resetCoordinationDbState(): void {
  _coordDb = null;
  _coordDbUnavailable = false;
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

/**
 * Create the task_locks table and indexes if they don't exist,
 * then run any pending in-place migrations.
 * Idempotent — safe to call on every startup.
 */
export function ensureCoordinationTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_locks (
      task_id          TEXT    NOT NULL,
      task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex')),
      owner_session    TEXT    NOT NULL,
      owner_agent      TEXT    NOT NULL,
      claimed_at       INTEGER NOT NULL,
      expires_at       INTEGER NOT NULL,
      heartbeat_at     INTEGER NOT NULL,
      ttl_seconds      INTEGER NOT NULL DEFAULT 3600,
      payload          TEXT,
      PRIMARY KEY (task_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);

  // Run in-place migrations for already-created tables with older schemas.
  migrateCoordinationTable(db);
}

/**
 * Migrate an existing task_locks table to add the 'commit-mutex' task_kind.
 *
 * SQLite cannot ALTER a CHECK constraint in-place.  We use the canonical
 * SQLite approach:
 *   1. CREATE new table with updated CHECK → copy existing rows → DROP old → RENAME.
 *   All inside a single transaction so zero rows are lost on failure.
 *
 * Detection: read the existing CREATE statement from sqlite_master.
 * If it already contains 'commit-mutex' in the CHECK clause → no-op (idempotent).
 * This function is safe to call on every startup.
 */
export function migrateCoordinationTable(db: Database): void {
  const schemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_locks'")
    .get() as { sql: string } | null;

  if (!schemaRow) return; // table does not exist yet (brand-new DB) — ensureCoordinationTable will create it

  if (schemaRow.sql.includes("'commit-mutex'")) {
    return; // already migrated — idempotent no-op
  }

  // Migration needed: recreate table with updated CHECK constraint.
  // Wrapped in a transaction so existing rows are preserved on any failure.
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE task_locks_v2 (
        task_id          TEXT    NOT NULL,
        task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex')),
        owner_session    TEXT    NOT NULL,
        owner_agent      TEXT    NOT NULL,
        claimed_at       INTEGER NOT NULL,
        expires_at       INTEGER NOT NULL,
        heartbeat_at     INTEGER NOT NULL,
        ttl_seconds      INTEGER NOT NULL DEFAULT 3600,
        payload          TEXT,
        PRIMARY KEY (task_id)
      )
    `);
    db.exec(`
      INSERT INTO task_locks_v2
        SELECT task_id, task_kind, owner_session, owner_agent,
               claimed_at, expires_at, heartbeat_at, ttl_seconds, payload
        FROM task_locks
    `);
    db.exec("DROP TABLE task_locks");
    db.exec("ALTER TABLE task_locks_v2 RENAME TO task_locks");
    // Recreate indexes (dropped with the original table)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);
    db.exec("COMMIT");
    console.info("[coordinationStore] Migrated task_locks CHECK constraint: added 'commit-mutex' kind.");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[coordinationStore] Migration failed — rolled back. Existing rows preserved.", err);
    throw err; // propagate so callers can enter refuse-all mode
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskKind = "cowork-slot" | "sprint-task" | "dashboard-row" | "commit-mutex";

export interface ClaimInput {
  task_id: string;
  task_kind: TaskKind;
  owner_session: string;
  owner_agent: string;
  ttl_seconds?: number;
  payload?: string | null;
}

export type ClaimResult =
  | { claimed: true; stolen?: boolean }
  | { claimed: false; current_holder?: CurrentHolder; error?: string };

export interface CurrentHolder {
  owner_session: string;
  owner_agent: string;
  claimed_at: number;
  expires_at: number;
  heartbeat_at: number;
}

export interface HeartbeatResult {
  ok: boolean;
  expires_at: number;
}

export interface ReleaseResult {
  ok: boolean;
}

export interface LockRow {
  task_id: string;
  task_kind: string;
  owner_session: string;
  owner_agent: string;
  claimed_at: number;
  expires_at: number;
  heartbeat_at: number;
  ttl_seconds: number;
  payload: string | null;
}

export interface ListResult {
  locks: LockRow[];
  count: number;
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Attempt to claim a coordination lock (brief §3 two-statement protocol).
 *
 * Step 1: INSERT OR IGNORE — wins if row is absent.
 * Step 2: UPDATE WHERE expires_at < now — stale-steal if step 1 lost.
 * Step 3: SELECT current holder — return when both steps fail.
 */
export function claimTask(input: ClaimInput): ClaimResult {
  const db = getCoordinationDb();
  if (!db) return { claimed: false, error: "db_unavailable" };

  // Max TTL: 8 days (691200s) — covers weekly published markers (digest-sunday, tnb-audit)
  // per ARCH-DECIDE-D: PUBLISHED_MARKER_WEEKLY_TTL_SECONDS = 691200 (8 days).
  // Daily markers use 100800s (28h); weekly markers use 691200s (8 days).
  // 604800s (7 days) was the prior cap — insufficient for the 8-day weekly belt.
  const ttl = Math.min(Math.max(input.ttl_seconds ?? 3600, 60), 691200);

  try {
    // Step 1 — INSERT OR IGNORE
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, payload)
      VALUES
        (?, ?, ?, ?, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?)
    `);

    const insertResult = insertStmt.run(
      input.task_id,
      input.task_kind,
      input.owner_session,
      input.owner_agent,
      ttl,
      ttl,
      input.payload ?? null,
    );

    if (insertResult.changes === 1) {
      // INSERT won — we own the lock
      return { claimed: true };
    }

    // Step 2 — Stale-steal: UPDATE WHERE expires_at < unixepoch('now')
    const stealStmt = db.prepare(`
      UPDATE task_locks
      SET
        owner_session = ?,
        owner_agent   = ?,
        claimed_at    = unixepoch('now'),
        expires_at    = unixepoch('now') + ?,
        heartbeat_at  = unixepoch('now'),
        ttl_seconds   = ?
      WHERE
        task_id    = ?
        AND expires_at < unixepoch('now')
    `);

    const stealResult = stealStmt.run(
      input.owner_session,
      input.owner_agent,
      ttl,
      ttl,
      input.task_id,
    );

    if (stealResult.changes === 1) {
      // Stale lock stolen successfully
      return { claimed: true, stolen: true };
    }

    // Step 3 — Lock genuinely held by another session. Read current holder.
    const holderRow = db.prepare(`
      SELECT owner_session, owner_agent, claimed_at, expires_at, heartbeat_at
      FROM task_locks
      WHERE task_id = ?
    `).get(input.task_id) as CurrentHolder | null;

    return holderRow
      ? { claimed: false, current_holder: holderRow }
      : { claimed: false };
  } catch (err) {
    console.error("[coordinationStore] claimTask error", err);
    return { claimed: false, error: "db_error" };
  }
}

/**
 * Renew a held lock's TTL (brief §4 heartbeat protocol).
 *
 * The AND owner_session predicate means a stolen lock silently affects 0 rows,
 * which the agent detects as a stolen-lock signal (ok=false).
 */
export function heartbeatTask(task_id: string, owner_session: string): HeartbeatResult {
  const db = getCoordinationDb();
  if (!db) return { ok: false, expires_at: 0 };

  try {
    const result = db.prepare(`
      UPDATE task_locks
      SET
        heartbeat_at = unixepoch('now'),
        expires_at   = unixepoch('now') + ttl_seconds
      WHERE
        task_id       = ?
        AND owner_session = ?
    `).run(task_id, owner_session);

    if (result.changes === 0) {
      return { ok: false, expires_at: 0 };
    }

    // Read the new expires_at
    const row = db.prepare(`SELECT expires_at FROM task_locks WHERE task_id = ?`)
      .get(task_id) as { expires_at: number } | null;

    return { ok: true, expires_at: row?.expires_at ?? 0 };
  } catch (err) {
    console.error("[coordinationStore] heartbeatTask error", err);
    return { ok: false, expires_at: 0 };
  }
}

/**
 * Release a held lock (brief §5 release protocol).
 *
 * The AND owner_session predicate prevents cross-session accidental release.
 * changes()=0 means lock was already stolen or expired — not an error.
 */
export function releaseTask(task_id: string, owner_session: string): ReleaseResult {
  const db = getCoordinationDb();
  if (!db) return { ok: false };

  try {
    const result = db.prepare(`
      DELETE FROM task_locks
      WHERE task_id      = ?
        AND owner_session = ?
    `).run(task_id, owner_session);

    return { ok: result.changes === 1 };
  } catch (err) {
    console.error("[coordinationStore] releaseTask error", err);
    return { ok: false };
  }
}

/**
 * List held locks with optional filters.
 * Does not modify any locks — read-only diagnostic operation.
 */
export function listHeldTasks(filter?: {
  kind?: string;
  owner_agent?: string;
  expired?: boolean;
}): ListResult {
  const db = getCoordinationDb();
  if (!db) return { locks: [], count: 0 };

  try {
    const conditions: string[] = [];
    const params: (string | number | boolean)[] = [];

    if (filter?.kind) {
      conditions.push("task_kind = ?");
      params.push(filter.kind);
    }
    if (filter?.owner_agent) {
      conditions.push("owner_agent = ?");
      params.push(filter.owner_agent);
    }
    if (filter?.expired === true) {
      conditions.push("expires_at < unixepoch('now')");
    } else if (filter?.expired === false) {
      conditions.push("expires_at >= unixepoch('now')");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT task_id, task_kind, owner_session, owner_agent, claimed_at,
             expires_at, heartbeat_at, ttl_seconds, payload
      FROM task_locks
      ${where}
      ORDER BY claimed_at DESC
    `;

    const rows = db.prepare(sql).all(...params) as LockRow[];
    return { locks: rows, count: rows.length };
  } catch (err) {
    console.error("[coordinationStore] listHeldTasks error", err);
    return { locks: [], count: 0 };
  }
}

/**
 * Inject a pre-opened Database for testing.
 * Allows tests to use an in-memory DB instead of the real coordination.db.
 */
export function _injectCoordinationDb(db: Database): void {
  _coordDb = db;
  _coordDbUnavailable = false;
}
