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

    // Flush WAL → main DB file so that migration writes from the previous
    // process are durable to the main file on every startup.  Without this,
    // SQLite WAL mode retains migration frames in the WAL file; a fresh cold
    // start that opens the DB before the WAL is auto-checkpointed reads the
    // pre-migration schema from the main DB page cache — the "WAL-ghost"
    // recurrence class (TASK_1989 / FIX-COORD-WAL-CHECKPOINT-POST-MIGRATION).
    // TRUNCATE mode resets the WAL to zero bytes after checkpointing, which is
    // optimal for startup: the next writer starts with a clean WAL.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.info("[coordinationStore] WAL checkpoint (TRUNCATE) complete — coordination.db fully flushed to main file");

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
      task_id              TEXT    NOT NULL,
      task_kind            TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex','intent','orphan-signal','session-presence')),
      owner_session        TEXT    NOT NULL,
      owner_agent          TEXT    NOT NULL,
      owner_client_session TEXT,
      claimed_at           INTEGER NOT NULL,
      expires_at           INTEGER NOT NULL,
      heartbeat_at         INTEGER NOT NULL,
      ttl_seconds          INTEGER NOT NULL DEFAULT 3600,
      payload              TEXT,
      redispatch_count     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (task_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);

  // Migration 4: scheduled_tasks table (deferred one-shot scheduler)
  // SCAR AC-1: fire_at/deadline_at/created_at/fired_at = INTEGER epoch-seconds UTC. NEVER ISO8601.
  // SCAR AC-2: dedup_key TEXT UNIQUE declared HERE in CREATE TABLE — NEVER via ADD COLUMN
  //            (SQLite silently drops UNIQUE on ADD COLUMN: feedback_sqlite_add_column_unique_silent_noop).
  // No new task_kind on task_locks (AC-7): this table is a separate entity.
  // Same coordination.db — no new DB file.
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id             TEXT    NOT NULL PRIMARY KEY,
      agent          TEXT    NOT NULL,
      team           TEXT    NOT NULL CHECK(team IN ('COWORK','DEV')),
      intent         TEXT    NOT NULL,
      prompt         TEXT    NOT NULL,
      fire_at        INTEGER NOT NULL,
      deadline_at    INTEGER,
      dedup_key      TEXT    UNIQUE,
      reason         TEXT    NOT NULL,
      origin_ref     TEXT,
      max_attempts   INTEGER NOT NULL DEFAULT 1,
      attempts       INTEGER NOT NULL DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','firing','fired','done','failed','expired','cancelled')),
      created_at     INTEGER NOT NULL,
      fired_at       INTEGER,
      sweep_tick     TEXT,
      error          TEXT
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_fire_at
      ON scheduled_tasks(status, fire_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_dedup_key
      ON scheduled_tasks(dedup_key) WHERE dedup_key IS NOT NULL
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_team_status
      ON scheduled_tasks(team, status)
  `);

  // Run in-place migrations for already-created tables with older schemas.
  migrateCoordinationTable(db);
}

/**
 * Migrate an existing task_locks table through all pending schema changes.
 * Safe to call on every startup — each migration is individually idempotent.
 *
 * Migration 1 — add 'commit-mutex' task_kind (CHECK constraint widen):
 *   SQLite cannot ALTER a CHECK constraint in-place.  We use the canonical
 *   approach: CREATE new table with updated CHECK → copy rows → DROP old → RENAME.
 *   All inside a single transaction so zero rows are lost on failure.
 *   Detection: read CREATE statement from sqlite_master; no-op if 'commit-mutex' present.
 *
 * Migration 2 — add owner_client_session column (P1-MCP-1, CROSS-SESSION-MULTI-TEAM-ORCH):
 *   Adds nullable TEXT column for per-client-session ownership discriminator.
 *   NOT UNIQUE: SQLite silently drops UNIQUE on ADD COLUMN (feedback_sqlite_add_column_unique_silent_noop).
 *   Detection: PRAGMA table_info guard — no-op if column already present.
 *   Existing rows get NULL (backward-compatible; matching ladder falls through to owner_agent).
 */
export function migrateCoordinationTable(db: Database): void {
  const schemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_locks'")
    .get() as { sql: string } | null;

  if (!schemaRow) return; // table does not exist yet (brand-new DB) — ensureCoordinationTable will create it

  // ---- Migration 1: add 'commit-mutex' kind to CHECK constraint ----
  // Requires table-recreate (SQLite cannot ALTER a CHECK in-place).
  if (!schemaRow.sql.includes("'commit-mutex'")) {
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

  // ---- Migration 2: add owner_client_session column (P1-MCP-1) ----
  // Uses ADD COLUMN — no table-recreate needed; idempotent via PRAGMA table_info guard.
  // nullable TEXT, NOT UNIQUE (UNIQUE is silently dropped on ADD COLUMN in SQLite —
  // see feedback_sqlite_add_column_unique_silent_noop).
  // Existing rows get NULL; matching ladder in heartbeatTask/releaseTask falls through
  // to owner_agent for un-migrated callers (backward-compatible).
  const columns = db
    .prepare("PRAGMA table_info(task_locks)")
    .all() as Array<{ name: string }>;

  const hasOwnerClientSession = columns.some((col) => col.name === "owner_client_session");

  if (!hasOwnerClientSession) {
    db.exec("ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT");
    console.info("[coordinationStore] Migrated task_locks: added owner_client_session column (nullable TEXT, P1-MCP-1).");
  }

  // ---- Migration 3: widen CHECK to 7 kinds + add redispatch_count column ----
  // Adds 'intent' (P1 router pre-claim gate), 'orphan-signal' (P1.5 reaper),
  // 'session-presence' (P2 roster — inert, no caller yet).
  // Also folds in redispatch_count INTEGER DEFAULT 0 (absorbed from TASK_1982, P1.5 reaper).
  // Requires table-recreate (SQLite cannot ALTER a CHECK in-place) — same pattern as Migration 1.
  // Detection: guard on 'intent' absent from sqlite_master.sql; no-op if already widened.
  // CRITICAL: do NOT re-use the Migration-1 guard ('commit-mutex') — that guard already passed on
  // live DBs and will never fire again. This migration needs its OWN detection expression.
  if (!schemaRow.sql.includes("'intent'")) {
    // Detect whether redispatch_count already exists (absorbed from TASK_1982; defensive guard).
    // Must read PRAGMA fresh here — table may have been recreated by Migration 1 in this same call.
    const preMig3Cols = db
      .prepare("PRAGMA table_info(task_locks)")
      .all() as Array<{ name: string }>;
    const hasRedispatchCount = preMig3Cols.some((c) => c.name === "redispatch_count");

    db.exec("BEGIN");
    try {
      db.exec(`
        CREATE TABLE task_locks_v3 (
          task_id              TEXT    NOT NULL,
          task_kind            TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex','intent','orphan-signal','session-presence')),
          owner_session        TEXT    NOT NULL,
          owner_agent          TEXT    NOT NULL,
          owner_client_session TEXT,
          claimed_at           INTEGER NOT NULL,
          expires_at           INTEGER NOT NULL,
          heartbeat_at         INTEGER NOT NULL,
          ttl_seconds          INTEGER NOT NULL DEFAULT 3600,
          payload              TEXT,
          redispatch_count     INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (task_id)
        )
      `);
      // Copy all existing rows; use column value when already present, else default 0.
      const redispatchSrc = hasRedispatchCount ? "redispatch_count" : "0";
      db.exec(`
        INSERT INTO task_locks_v3
          SELECT task_id, task_kind, owner_session, owner_agent, owner_client_session,
                 claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, ${redispatchSrc}
          FROM task_locks
      `);
      db.exec("DROP TABLE task_locks");
      db.exec("ALTER TABLE task_locks_v3 RENAME TO task_locks");
      // Recreate indexes (dropped with the original table)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);
      db.exec("COMMIT");
      console.info(
        "[coordinationStore] Migration 3: task_locks widened to 7 kinds " +
          "(+intent, +orphan-signal, +session-presence) + redispatch_count column added.",
      );
    } catch (err) {
      db.exec("ROLLBACK");
      console.error("[coordinationStore] Migration 3 failed — rolled back. Existing rows preserved.", err);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskKind =
  | "cowork-slot"
  | "sprint-task"
  | "dashboard-row"
  | "commit-mutex"
  | "intent"          // P1 router pre-claim gate (CROSS-SESSION-MULTI-TEAM-ORCH)
  | "orphan-signal"   // P1.5 reaper — signals stale orphaned tasks (no caller until TASK_1983)
  | "session-presence"; // P2 roster — session liveness probe (no caller yet, inert CHECK value)

export interface ClaimInput {
  task_id: string;
  task_kind: TaskKind;
  owner_session: string;
  owner_agent: string;
  /** P1-FINAL (TASK_1980): REQUIRED per-client-session discriminator (CLAUDE_CODE_SESSION_ID). Sole ownership key. */
  owner_client_session: string;
  ttl_seconds?: number;
  payload?: string | null;
}

export type ClaimResult =
  | { claimed: true; stolen?: boolean }
  | { claimed: false; current_holder?: CurrentHolder; error?: string };

export interface CurrentHolder {
  owner_session: string;
  owner_agent: string;
  /** P1-MCP-2: populated for new-style claims; NULL for pre-P1 rows. */
  owner_client_session: string | null;
  claimed_at: number;
  expires_at: number;
  heartbeat_at: number;
}

export interface HeartbeatResult {
  ok: boolean;
  expires_at: number;
}

/**
 * P1-MCP-2: discriminated union — {ok:true, released:0|1} | {ok:false, error?:string}.
 * released=1: row was actually deleted.
 * released=0: no-op (wrong owner, non-existent task) — NOT an error.
 * ok=false: DB error only (fail-loud).
 */
export type ReleaseResult =
  | { ok: true; released: 0 | 1 }
  | { ok: false; error?: string };

export interface OrphanReleaseResult {
  released: boolean;
  reason: string;
  prior_owner_session?: string;
  heartbeat_age?: number;
}

export interface LockRow {
  task_id: string;
  task_kind: string;
  owner_session: string;
  owner_agent: string;
  /** P1-MCP-2: per-client-session discriminator; NULL for pre-P1 rows. */
  owner_client_session: string | null;
  claimed_at: number;
  expires_at: number;
  heartbeat_at: number;
  ttl_seconds: number;
  payload: string | null;
  /** P1.5 reaper: incremented when a task is force-redispatched; default 0. Added in Migration 3. */
  redispatch_count: number;
}

export interface ListResult {
  locks: LockRow[];
  count: number;
}

// ---------------------------------------------------------------------------
// GC helpers
// ---------------------------------------------------------------------------

/**
 * ALLOW-LIST for orphan-signal emission (DoD-P15-4).
 *
 * Only task_kinds with a defined resume contract (§6.5.5 table) may emit
 * orphan-signals before GC. New kinds default to NOT-emitting — must opt-in
 * by adding to this list. This prevents runaway adoption signals for kinds
 * that have no adoption mechanism.
 *
 * 'cron-tick-with-published-checkpoint' is listed in the §6.5.5 resume table
 * but is not yet in the DB CHECK constraint. It is included here for
 * forward-compatibility — the IN() predicate will simply never match until
 * the schema is widened to include that kind.
 *
 * Explicitly NOT in the allow-list (silent GC only):
 *   - 'intent'                    : transient router pre-claim gate — NOT adoptable work
 *   - 'commit-mutex'              : short-lived git-index lock — NOT adoptable work
 *   - 'orphan-signal'             : the signal itself — never re-signal a signal
 *   - 'session-presence'          : P2 roster liveness probe — NOT adoptable work
 *   - 'published:*' ids           : dedup sentinels — NOT work units
 *   - 'cron:*' ids                : fire-election coordination markers (e.g. cron:dev-team:<TICK>)
 *                                   carry task_kind=sprint-task but are NOT adoptable work units;
 *                                   orphan-minting them causes bogus zone-agent spawns in Step 0a-B.
 *                                   Excluded by task_id prefix scan guard (NOT by kind — kind is
 *                                   intentionally reused to avoid enum-drift).
 *   - 'dev-team-cron-singleton'   : SF-1 leader-election singleton — same class as cron:* above.
 */
const ORPHAN_EMIT_ALLOW_LIST = [
  "sprint-task",
  "cowork-slot",
  "cron-tick-with-published-checkpoint", // future-compat; not yet in CHECK enum
  "dashboard-row",
] as const;

/**
 * Delete expired tombstone rows from the task_locks table.
 *
 * P1.5-MCP-2 (TASK_1983): pre-GC phase emits 'orphan-signal' rows for expired
 * adoptable locks BEFORE deleting them, enabling peer sessions to detect and
 * adopt stranded work. Emission is ALLOW-LIST gated (DoD-P15-4): only kinds
 * in ORPHAN_EMIT_ALLOW_LIST produce signals; all others are silently GC'd.
 *
 * Atomicity: the entire pre-GC emit + DELETE runs inside a single SQLite
 * transaction (all-or-nothing). If the transaction fails, no orphan-signals
 * are emitted and the original rows are preserved.
 *
 * Only removes rows whose `expires_at + graceSeconds` has elapsed (i.e.
 * `expires_at + grace < unixepoch('now')`). The grace window prevents racing
 * a row that just expired but whose owner may still be finishing a release.
 *
 * Safe to call frequently (on every task_claim) because:
 *   - Expired rows are by definition free to reclaim.
 *   - The grace window (default 300 s) provides ample room for a just-expired
 *     session to complete its release before we vacuum it.
 *   - The DELETE is bounded to the expired subset (no full-table scan on large
 *     active sets) thanks to the `idx_task_locks_expires_at` index.
 *   - `excludeTaskId` protects the specific row being claimed: the claim path
 *     itself handles that row via the stale-steal UPDATE (Step 2), so we must
 *     not GC it before Step 2 runs. Other expired rows are fair game.
 *
 * FU-LOCKSTORE-EXPIRED-GC (2026-06-05).
 *
 * @param db            Open coordination.db instance.
 * @param graceSeconds  Seconds past expiry before a row is eligible for GC.
 *                      Default: 300 (5 min). Must be >= 0.
 * @param excludeTaskId Optional task_id to skip (used by claimTask to protect
 *                      the row it is about to steal via the Step-2 UPDATE).
 * @returns Number of rows deleted (all expired rows, including non-adoptable).
 */
export function gcExpiredLocks(db: Database, graceSeconds = 300, excludeTaskId?: string): number {
  const grace = Math.max(0, graceSeconds);
  try {
    db.exec("BEGIN");
    try {
      // ---- Phase 1: pre-GC scan — emit orphan-signals for expired adoptable rows ----
      //
      // ALLOW-LIST filter (DoD-P15-4): only kinds with a defined resume contract.
      // The scan also excludes:
      //   - 'published:*' task_ids   : dedup sentinels, not work units
      //   - 'cron:*' task_ids        : fire-election coordination markers (cron:dev-team:<TICK>)
      //                                — NOT adoptable work; would cause bogus zone-agent spawns
      //   - 'dev-team-cron-singleton': SF-1 singleton coordination marker — same class
      // and the excludeTaskId row being claimed right now (stale-steal path handles it).
      const kindPlaceholders = ORPHAN_EMIT_ALLOW_LIST.map(() => "?").join(",");
      const excludeClause = excludeTaskId !== undefined ? " AND task_id != ?" : "";
      const scanParams: (number | string)[] = [grace, ...ORPHAN_EMIT_ALLOW_LIST];
      if (excludeTaskId !== undefined) scanParams.push(excludeTaskId);

      const expiredAdoptable = db
        .prepare(
          `SELECT task_id, task_kind, owner_agent, owner_client_session, payload, redispatch_count
           FROM task_locks
           WHERE expires_at + ? < unixepoch('now')
             AND task_kind IN (${kindPlaceholders})
             AND task_id NOT LIKE 'published:%'
             AND task_id NOT LIKE 'cron:%'
             AND task_id != 'dev-team-cron-singleton'
             ${excludeClause}`,
        )
        .all(...scanParams) as Array<{
        task_id: string;
        task_kind: string;
        owner_agent: string;
        owner_client_session: string | null;
        payload: string | null;
        redispatch_count: number;
      }>;

      if (expiredAdoptable.length > 0) {
        // One prepared statement reused for all rows (efficiency).
        // owner_session = 'server-reaper' (synthetic server-side identity; NOT NULL column).
        // owner_client_session = NULL (available for any session to adopt).
        // expires_at = now + 7200 (2h adoption window, per §6.5.2).
        // INSERT OR REPLACE: idempotent — a second GC cycle overwrites the stale signal.
        const insertOrphan = db.prepare(`
          INSERT OR REPLACE INTO task_locks
            (task_id, task_kind, owner_session, owner_agent, owner_client_session,
             claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count)
          VALUES
            (?, 'orphan-signal', 'server-reaper', ?, NULL,
             unixepoch('now'), unixepoch('now') + 7200, unixepoch('now'), 7200, ?, 0)
        `);

        for (const row of expiredAdoptable) {
          // Carry-forward redispatch_count (DoD-P15-3): increment prior column value.
          // Default 0 if absent/NULL on pre-column rows (defensive guard).
          const priorCount = row.redispatch_count ?? 0;
          const signalPayload = JSON.stringify({
            original_task_id: row.task_id,
            original_task_kind: row.task_kind,
            original_owner_client_session: row.owner_client_session,
            owner_agent: row.owner_agent,
            last_payload: row.payload,
            orphaned_at: Math.floor(Date.now() / 1000),
            redispatch_count: priorCount + 1,
          });
          insertOrphan.run(
            `orphan-signal:${row.task_id}`,
            row.owner_agent,
            signalPayload,
          );
          console.info(
            `[coordinationStore] gcExpiredLocks: orphan-signal emitted` +
              ` task_id=orphan-signal:${row.task_id}` +
              ` kind=${row.task_kind}` +
              ` redispatch_count=${priorCount + 1}`,
          );
        }
      }

      // ---- Phase 2: delete ALL expired rows (adoptable + non-adoptable) ----
      // Non-adoptable kinds (intent, commit-mutex, session-presence, orphan-signal)
      // and published:* dedup sentinels are silently deleted without emitting.
      let result;
      if (excludeTaskId !== undefined) {
        result = db
          .prepare(
            `DELETE FROM task_locks WHERE expires_at + ? < unixepoch('now') AND task_id != ?`,
          )
          .run(grace, excludeTaskId);
      } else {
        result = db
          .prepare(`DELETE FROM task_locks WHERE expires_at + ? < unixepoch('now')`)
          .run(grace);
      }

      db.exec("COMMIT");
      return result.changes;
    } catch (innerErr) {
      db.exec("ROLLBACK");
      throw innerErr;
    }
  } catch (err) {
    // Non-fatal — log only; GC failure must not block the claim path.
    console.warn("[coordinationStore] gcExpiredLocks error (non-fatal)", err);
    return 0;
  }
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
 *
 * Opportunistic GC (FU-LOCKSTORE-EXPIRED-GC): deletes tombstone rows whose
 * TTL expired > 300 s ago before attempting the claim. Keeps the table lean
 * without a separate always-on timer (avoids 16 GB host pressure).
 */
export function claimTask(input: ClaimInput): ClaimResult {
  const db = getCoordinationDb();
  if (!db) return { claimed: false, error: "db_unavailable" };

  // Opportunistic GC: vacuum tombstone rows that expired > 300 s ago.
  // Exclude input.task_id so the stale-steal path (Step 2 UPDATE) can still
  // handle the specifically-claimed row if it is expired — preserving the
  // stolen:true diagnostic signal and the steal semantics.
  // Failure is non-fatal (gcExpiredLocks swallows its own errors).
  gcExpiredLocks(db, 300, input.task_id);

  // Max TTL: 8 days (691200s) — covers weekly published markers (digest-sunday, tnb-audit)
  // per ARCH-DECIDE-D: PUBLISHED_MARKER_WEEKLY_TTL_SECONDS = 691200 (8 days).
  // Daily markers use 100800s (28h); weekly markers use 691200s (8 days).
  // 604800s (7 days) was the prior cap — insufficient for the 8-day weekly belt.
  const ttl = Math.min(Math.max(input.ttl_seconds ?? 3600, 60), 691200);

  try {
    // Step 1 — INSERT OR IGNORE
    // P1-MCP-2: include owner_client_session column (nullable; NULL for backward-compat callers).
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds, payload)
      VALUES
        (?, ?, ?, ?, ?, unixepoch('now'), unixepoch('now') + ?, unixepoch('now'), ?, ?)
    `);

    const insertResult = insertStmt.run(
      input.task_id,
      input.task_kind,
      input.owner_session,
      input.owner_agent,
      input.owner_client_session,
      ttl,
      ttl,
      input.payload ?? null,
    );

    if (insertResult.changes === 1) {
      // INSERT won — we own the lock
      return { claimed: true };
    }

    // Step 2 — Stale-steal: UPDATE WHERE expires_at < unixepoch('now')
    // P1-MCP-2: also SET owner_client_session on steal so the new holder's session is recorded.
    const stealStmt = db.prepare(`
      UPDATE task_locks
      SET
        owner_session        = ?,
        owner_agent          = ?,
        owner_client_session = ?,
        claimed_at           = unixepoch('now'),
        expires_at           = unixepoch('now') + ?,
        heartbeat_at         = unixepoch('now'),
        ttl_seconds          = ?
      WHERE
        task_id    = ?
        AND expires_at < unixepoch('now')
    `);

    const stealResult = stealStmt.run(
      input.owner_session,
      input.owner_agent,
      input.owner_client_session,
      ttl,
      ttl,
      input.task_id,
    );

    if (stealResult.changes === 1) {
      // Stale lock stolen successfully
      return { claimed: true, stolen: true };
    }

    // Step 3 — Lock genuinely held by another session. Read current holder.
    // P1-MCP-2: include owner_client_session in the holder response so callers can see
    // the discriminator of the winning session.
    const holderRow = db.prepare(`
      SELECT owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at
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
 * P1-FINAL (TASK_1980): sole matching key is owner_client_session (per-CLAUDE_CODE_SESSION_ID UUID).
 * Fallback rungs (owner_agent, owner_session) removed — wrong session cannot renew another's lock.
 *
 * Returns {ok:false, expires_at:0} when:
 *   - owner_client_session does not match the row (anti-theft)
 *   - lock has expired (let caller TTL-recover)
 *   - DB unavailable
 */
export function heartbeatTask(
  task_id: string,
  owner_client_session: string,  // REQUIRED — P1-FINAL (TASK_1980); sole ownership key
): HeartbeatResult {
  const db = getCoordinationDb();
  if (!db) return { ok: false, expires_at: 0 };

  try {
    const result = db.prepare(`
      UPDATE task_locks
      SET
        heartbeat_at  = unixepoch('now'),
        expires_at    = unixepoch('now') + ttl_seconds
      WHERE
        task_id              = ?
        AND owner_client_session = ?
        AND expires_at >= unixepoch('now')
    `).run(task_id, owner_client_session);

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
 * P1-FINAL (TASK_1980): sole matching key is owner_client_session (per-CLAUDE_CODE_SESSION_ID UUID).
 * Fallback rungs (owner_agent, owner_session) removed — wrong session cannot release another's lock.
 *
 * Return shape:
 *   {ok:true, released:1}  — row was deleted (lock released by correct owner).
 *   {ok:true, released:0}  — no-op: wrong owner, non-existent task, or expired+GC'd (NOT an error).
 *   {ok:false, error}      — DB failure only (fail-loud).
 */
export function releaseTask(
  task_id: string,
  owner_client_session: string,  // REQUIRED — P1-FINAL (TASK_1980); sole ownership key
): ReleaseResult {
  const db = getCoordinationDb();
  if (!db) return { ok: false, error: "db_unavailable" };

  try {
    const result = db.prepare(`
      DELETE FROM task_locks
      WHERE task_id              = ?
        AND owner_client_session = ?
    `).run(task_id, owner_client_session);

    // changes()=0 is a clean no-op (wrong owner, non-existent, or GC'd) — NOT an error.
    return { ok: true, released: result.changes === 1 ? 1 : 0 };
  } catch (err) {
    console.error("[coordinationStore] releaseTask error", err);
    return { ok: false, error: "db_error" };
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
      SELECT task_id, task_kind, owner_session, owner_agent, owner_client_session,
             claimed_at, expires_at, heartbeat_at, ttl_seconds, payload, redispatch_count
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
 * Force-release an orphaned lock whose heartbeat has gone stale.
 *
 * P1-FINAL (TASK_1980): sole matching key is owner_client_session. Fallback rungs removed.
 *
 * Safety gate:
 *   DELETE only when ALL conditions hold:
 *     1. task_id AND owner_client_session match exactly
 *     2. heartbeat_at < unixepoch('now') - orphanThresholdSeconds
 *        (stale heartbeat = process died; a live session heartbeats continuously)
 *
 * Returns {released:false} WITHOUT modifying the DB when the heartbeat is fresh
 * (≤ orphanThresholdSeconds old) — live-session safety invariant.
 *
 * Default orphanThresholdSeconds = 600 (10 min). Minimum enforced = 120 s.
 */
export function releaseOrphanTask(
  task_id: string,
  owner_client_session: string,  // REQUIRED — P1-FINAL (TASK_1980); sole ownership key
  orphanThresholdSeconds = 600,
): OrphanReleaseResult {
  const db = getCoordinationDb();
  if (!db) return { released: false, reason: "db_unavailable" };

  // Enforce minimum threshold — prevent accidental near-instant orphan-steal.
  const threshold = Math.max(orphanThresholdSeconds, 120);

  try {
    // Read the current lock row (filtered by ownership) before attempting deletion.
    const row = db.prepare(`
      SELECT owner_session, heartbeat_at,
             CAST(unixepoch('now') - heartbeat_at AS INTEGER) AS heartbeat_age
      FROM task_locks
      WHERE task_id = ? AND owner_client_session = ?
    `).get(task_id, owner_client_session) as {
      owner_session: string;
      heartbeat_at: number;
      heartbeat_age: number;
    } | null;

    if (!row) {
      // Not found OR owned by a different session (owner_client_session mismatch).
      return { released: false, reason: "lock_not_found" };
    }

    // Guard: heartbeat is fresh — live process holds the lock; do NOT steal.
    if (row.heartbeat_age <= threshold) {
      return {
        released: false,
        reason: "heartbeat_fresh",
        prior_owner_session: row.owner_session,
        heartbeat_age: row.heartbeat_age,
      };
    }

    // Stale heartbeat — perform the conditional DELETE.
    // WHERE clause re-checks the stale condition atomically so a concurrent heartbeat
    // that arrives between our SELECT and DELETE is not lost.
    const result = db.prepare(`
      DELETE FROM task_locks
      WHERE task_id              = ?
        AND owner_client_session = ?
        AND heartbeat_at < unixepoch('now') - ?
    `).run(task_id, owner_client_session, threshold);

    if (result.changes === 1) {
      return {
        released: true,
        reason: "orphan_released",
        prior_owner_session: row.owner_session,
        heartbeat_age: row.heartbeat_age,
      };
    }

    // Race: another concurrent call already released or heartbeated between
    // our SELECT and DELETE — the lock is either gone or refreshed.
    return {
      released: false,
      reason: "lost_race_or_heartbeat_refreshed",
      prior_owner_session: row.owner_session,
      heartbeat_age: row.heartbeat_age,
    };
  } catch (err) {
    console.error("[coordinationStore] releaseOrphanTask error", err);
    return { released: false, reason: "db_error" };
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

// ---------------------------------------------------------------------------
// Scheduled Tasks — ST-3: Internal helpers (NOT registered as MCP tools directly)
// These are called by the gateway-registered MCP tool wrappers in scheduledTaskTools.ts
// (which ARE registered — see scheduledTaskTools.ts § Privileged Gateway Tools).
// ---------------------------------------------------------------------------

/** Scheduled task row shape returned from queries. */
export interface ScheduledTaskRow {
  id: string;
  agent: string;
  team: string;
  intent: string;
  prompt: string;
  fire_at: number;
  deadline_at: number | null;
  dedup_key: string | null;
  reason: string;
  origin_ref: string | null;
  max_attempts: number;
  attempts: number;
  status: string;
  created_at: number;
  fired_at: number | null;
  sweep_tick: string | null;
  error: string | null;
}

/**
 * ST-3: Atomic pending→firing flip for all due rows.
 *
 * Single-statement UPDATE...RETURNING — atomic on WAL-mode SQLite.
 * SCAR AC-1: nowEpoch MUST be a bound INTEGER parameter (Math.floor(Date.now()/1000)).
 *            NEVER use datetime() or string comparison.
 * SCAR AC-3: After this call, callers MUST check deadline_at before routing
 *            (deadline check done by the MCP tool wrapper or sweeper Step 0b.3).
 *
 * Returns only rows that were just claimed (status flipped from pending→firing).
 * Each row can only be claimed once (status='pending' is the exclusive gate).
 */
export function claimDueScheduledTasks(
  db: Database,
  nowEpoch: number,
): ScheduledTaskRow[] {
  try {
    const rows = db
      .prepare(
        `UPDATE scheduled_tasks
           SET status   = 'firing',
               fired_at = ?,
               attempts = attempts + 1
         WHERE status = 'pending'
           AND fire_at <= ?
         RETURNING id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
                   reason, origin_ref, max_attempts, attempts, status, created_at,
                   fired_at, sweep_tick, error`,
      )
      .all(nowEpoch, nowEpoch) as ScheduledTaskRow[];
    return rows;
  } catch (err) {
    console.error("[coordinationStore] claimDueScheduledTasks error", err);
    return [];
  }
}

/**
 * ST-3: Mark a scheduled task as fired (success path).
 * Terminal state for MVP (D1: done is reserved for Phase-2 confirmation callback).
 */
export function completeScheduledTask(
  db: Database,
  id: string,
  status: "fired" | "done",
  sweepTick?: string,
): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = ?, sweep_tick = ? WHERE id = ?`,
    ).run(status, sweepTick ?? null, id);
  } catch (err) {
    console.error("[coordinationStore] completeScheduledTask error", err);
  }
}

/**
 * ST-3: Mark a scheduled task as expired (deadline gate).
 */
export function expireScheduledTask(db: Database, id: string, sweepTick?: string): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = 'expired', sweep_tick = ? WHERE id = ?`,
    ).run(sweepTick ?? null, id);
  } catch (err) {
    console.error("[coordinationStore] expireScheduledTask error", err);
  }
}

/**
 * ST-3: Mark a scheduled task as failed (routing error path).
 */
export function failScheduledTask(
  db: Database,
  id: string,
  error: string,
  sweepTick?: string,
): void {
  try {
    db.prepare(
      `UPDATE scheduled_tasks SET status = 'failed', error = ?, sweep_tick = ? WHERE id = ?`,
    ).run(error, sweepTick ?? null, id);
  } catch (err) {
    console.error("[coordinationStore] failScheduledTask error", err);
  }
}

/**
 * ST-3: Cancel a scheduled task by id (status → 'cancelled').
 * Returns true if a row was actually updated.
 */
export function cancelScheduledTaskById(db: Database, id: string): boolean {
  try {
    const result = db.prepare(
      `UPDATE scheduled_tasks
         SET status = 'cancelled'
       WHERE id = ?
         AND status IN ('pending','firing')`,
    ).run(id);
    return result.changes === 1;
  } catch (err) {
    console.error("[coordinationStore] cancelScheduledTaskById error", err);
    return false;
  }
}

/**
 * Get the current status + id of a scheduled task by dedup_key.
 * Returns null if not found.
 */
export function getScheduledTaskByDedupKey(
  db: Database,
  dedupKey: string,
): Pick<ScheduledTaskRow, "id" | "status"> | null {
  try {
    return db
      .prepare(`SELECT id, status FROM scheduled_tasks WHERE dedup_key = ?`)
      .get(dedupKey) as Pick<ScheduledTaskRow, "id" | "status"> | null;
  } catch (err) {
    console.error("[coordinationStore] getScheduledTaskByDedupKey error", err);
    return null;
  }
}

/**
 * Get a scheduled task row by id.
 * Returns null if not found.
 */
export function getScheduledTaskById(
  db: Database,
  id: string,
): ScheduledTaskRow | null {
  try {
    return db
      .prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`)
      .get(id) as ScheduledTaskRow | null;
  } catch (err) {
    console.error("[coordinationStore] getScheduledTaskById error", err);
    return null;
  }
}

/** Insert a new scheduled task row (used by schedule_task MCP tool). */
export function insertScheduledTask(
  db: Database,
  row: Omit<ScheduledTaskRow, "attempts" | "status" | "fired_at" | "sweep_tick" | "error">,
): void {
  db.prepare(`
    INSERT INTO scheduled_tasks
      (id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
       reason, origin_ref, max_attempts, attempts, status, created_at,
       fired_at, sweep_tick, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, NULL, NULL, NULL)
  `).run(
    row.id, row.agent, row.team, row.intent, row.prompt,
    row.fire_at, row.deadline_at ?? null, row.dedup_key ?? null,
    row.reason, row.origin_ref ?? null, row.max_attempts, row.created_at,
  );
}

/** List scheduled tasks with optional filters (AC-10 audit). */
export function listScheduledTasksDb(
  db: Database,
  filter?: {
    status?: string;
    team?: string;
    due_before?: number;
    limit?: number;
  },
): ScheduledTaskRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter?.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }
  if (filter?.team) {
    conditions.push("team = ?");
    params.push(filter.team);
  }
  if (filter?.due_before !== undefined) {
    conditions.push("fire_at <= ?");
    params.push(filter.due_before);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitVal = Math.min(filter?.limit ?? 50, 500);

  return db
    .prepare(`
      SELECT id, agent, team, intent, prompt, fire_at, deadline_at, dedup_key,
             reason, origin_ref, max_attempts, attempts, status, created_at,
             fired_at, sweep_tick, error
      FROM scheduled_tasks
      ${where}
      ORDER BY fire_at ASC
      LIMIT ?
    `)
    .all(...params, limitVal) as ScheduledTaskRow[];
}

/**
 * Expose the coordination DB for use by scheduled task MCP tools.
 * Returns null if DB is unavailable — callers handle the null case.
 */
export function getCoordinationDbForScheduler(): Database | null {
  return getCoordinationDb();
}

// ---------------------------------------------------------------------------
// P1.5-MCP-3 (TASK_1984) — Server-side periodic reaper
// ---------------------------------------------------------------------------

/**
 * Execute one reaper tick: get the coordination DB and call gcExpiredLocks.
 *
 * Exported for unit testing: callers can pass a `dbOverride` to test the
 * reaping logic directly without a real 600s wait. In production the
 * startPeriodicReaper interval calls this with no arguments.
 *
 * Returns the count of rows deleted (0 if DB unavailable).
 */
export function _reaperTick(dbOverride?: Database): number {
  const db = dbOverride ?? getCoordinationDb();
  if (!db) {
    console.warn("[coordinationStore] [reaper] DB unavailable — skipping tick");
    return 0;
  }
  return gcExpiredLocks(db, 300);
}

/**
 * Arm the server-side periodic reaper.
 *
 * Calls `gcExpiredLocks(db, 300)` every 600 seconds (10 minutes) so that
 * orphan-signals are emitted and expired locks are GC'd even when NO client
 * session is present (the "all sessions dead" case described in §6.5.1).
 *
 * DoD-P15-5: the interval callback wraps the tick in try/catch + logs errors
 * on failure. ONE uncaught error inside the callback MUST NOT kill the
 * interval — the timer must keep firing on subsequent 600s ticks.
 *
 * The `gcExpiredLocks` function is already try/catch guarded; the outer
 * try/catch in the callback is a belt-and-suspenders for unexpected throws
 * from future refactors.
 *
 * Intended to be called ONCE at server startup (after the coordination DB
 * is open and migrations have run). Calling it multiple times produces
 * multiple independent timers — callers are responsible for avoiding that.
 *
 * @returns The interval ID. Pass it to `clearInterval()` on shutdown to
 *          prevent timer leaks in tests or when the server closes cleanly.
 */
export function startPeriodicReaper(): ReturnType<typeof setInterval> {
  // Eagerly open the coordination DB so the startup WAL checkpoint
  // (PRAGMA wal_checkpoint(TRUNCATE) in getCoordinationDb) runs immediately
  // at server startup — not lazily on first tool call.  This ensures
  // migration frames are flushed to the main DB file before any reader
  // could see a stale schema (WAL-ghost recurrence class, TASK_1989).
  getCoordinationDb();

  console.info(
    "[coordinationStore] [reaper] periodic reaper armed" +
      " (interval=600s, grace=300s, allow-list=sprint-task|cowork-slot|dashboard-row)",
  );
  return setInterval(() => {
    try {
      const deleted = _reaperTick();
      if (deleted > 0) {
        console.info(`[coordinationStore] [reaper] tick: ${deleted} expired row(s) GC'd`);
      }
    } catch (err) {
      // DoD-P15-5: log + continue; MUST NOT kill the interval on transient errors
      console.error(
        "[coordinationStore] [reaper] gcExpiredLocks error (non-fatal — timer continues)",
        err,
      );
    }
  }, 600_000);
}
