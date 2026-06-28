/**
 * P1-MCP-1 — owner_client_session column migration test
 *
 * Sprint: CROSS-SESSION-MULTI-TEAM-ORCH
 * Brief: docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §7 P1-MCP-1
 * Handoff: docs/handoffs/TASK_1973-p1-mcp-1-migration-sql.md
 *
 * Tests that migrateCoordinationTable() adds owner_client_session (nullable TEXT,
 * NOT UNIQUE) to task_locks via an idempotent PRAGMA table_info guard.
 *
 * Acceptance criteria:
 *   AC-1: Column is added on a post-commit-mutex DB (the common upgrade path)
 *   AC-2: Existing rows survive with NULL in the new column (backward-compatible)
 *   AC-3: Migration is idempotent — double-call is a no-op (no error, no data loss)
 *   AC-4: Column added on a brand-new DB (ensureCoordinationTable path)
 *   AC-5: owner_client_session is nullable (INSERT with NULL succeeds)
 *   AC-6: Migration 1 (commit-mutex) + Migration 2 (owner_client_session) chain
 *         from an old pre-commit-mutex schema — both apply in sequence
 *
 * Constraints verified:
 *   - NOT UNIQUE: column does NOT have a unique index (ADD COLUMN UNIQUE is silently
 *     dropped by SQLite — feedback_sqlite_add_column_unique_silent_noop)
 *   - Nullable: no NOT NULL constraint, no DEFAULT required
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  migrateCoordinationTable,
  claimTask,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with the CURRENT full schema (runs all migrations). */
function createCurrentDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

/**
 * Create a DB that already has the commit-mutex migration but NOT owner_client_session.
 * Simulates a DB that was created with an intermediate code version.
 */
function createPostCommitMutexDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // Schema after Migration 1 (commit-mutex) but before Migration 2 (owner_client_session)
  db.exec(`
    CREATE TABLE task_locks (
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
  return db;
}

/** Create a DB with the OLD pre-commit-mutex schema (simulates earliest version). */
function createOldPreCommitMutexDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE task_locks (
      task_id          TEXT    NOT NULL,
      task_kind        TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row')),
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
  return db;
}

function getColumns(db: Database): string[] {
  const rows = db.prepare("PRAGMA table_info(task_locks)").all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function getUniqueIndexes(db: Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_locks' AND sql LIKE '%UNIQUE%'")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createCurrentDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// AC-1: Column added on post-commit-mutex DB
// ---------------------------------------------------------------------------

describe("AC-1: owner_client_session column added on post-commit-mutex DB", () => {
  it("migrateCoordinationTable adds owner_client_session when column is absent", () => {
    _resetCoordinationDbState();
    const db = createPostCommitMutexDb();

    // Column must NOT exist before migration
    const colsBefore = getColumns(db);
    expect(colsBefore).not.toContain("owner_client_session");

    migrateCoordinationTable(db);

    // Column MUST exist after migration
    const colsAfter = getColumns(db);
    expect(colsAfter).toContain("owner_client_session");

    db.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-2: Existing rows survive with NULL in the new column
// ---------------------------------------------------------------------------

describe("AC-2: Existing rows survive migration with NULL in owner_client_session", () => {
  it("pre-migration rows get NULL in owner_client_session after migration", () => {
    _resetCoordinationDbState();
    const db = createPostCommitMutexDb();

    // Seed rows before migration
    db.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('sprint-task:1973', 'sprint-task', 'sess-A', 'dev-mcp-server', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600)
    `).run();
    db.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-B', 'dev-ta-server', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();

    const countBefore = (db.prepare("SELECT COUNT(*) as cnt FROM task_locks").get() as { cnt: number }).cnt;
    expect(countBefore).toBe(2);

    migrateCoordinationTable(db);

    // Row count unchanged
    const countAfter = (db.prepare("SELECT COUNT(*) as cnt FROM task_locks").get() as { cnt: number }).cnt;
    expect(countAfter).toBe(2);

    // Existing rows have NULL in owner_client_session
    const rows = db
      .prepare("SELECT task_id, owner_client_session FROM task_locks ORDER BY task_id")
      .all() as Array<{ task_id: string; owner_client_session: string | null }>;

    for (const row of rows) {
      expect(row.owner_client_session).toBeNull();
    }

    db.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-3: Migration is idempotent
// ---------------------------------------------------------------------------

describe("AC-3: migrateCoordinationTable() is idempotent for owner_client_session", () => {
  it("calling migrate twice on an already-migrated DB does not throw or lose rows", () => {
    _resetCoordinationDbState();
    const db = createCurrentDb(); // already has owner_client_session

    // Seed a row
    db.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('sprint-task:idempotent', 'sprint-task', 'sess-Z', 'dev-mcp-server', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600)
    `).run();

    // Second migration call must not throw and must not drop the row
    expect(() => migrateCoordinationTable(db)).not.toThrow();

    const row = db.prepare("SELECT task_id FROM task_locks WHERE task_id = ?")
      .get("sprint-task:idempotent") as { task_id: string } | null;
    expect(row).not.toBeNull();

    // Column still present after second call
    const cols = getColumns(db);
    expect(cols).toContain("owner_client_session");

    db.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });

  it("calling ensureCoordinationTable twice on the same DB does not throw", () => {
    // ensureCoordinationTable calls migrateCoordinationTable internally
    expect(() => ensureCoordinationTable(testDb)).not.toThrow();
    const cols = getColumns(testDb);
    expect(cols).toContain("owner_client_session");
  });
});

// ---------------------------------------------------------------------------
// AC-4: Column added on a brand-new DB (ensureCoordinationTable path)
// ---------------------------------------------------------------------------

describe("AC-4: owner_client_session present on brand-new DB created via ensureCoordinationTable", () => {
  it("fresh DB has owner_client_session in schema", () => {
    const cols = getColumns(testDb);
    expect(cols).toContain("owner_client_session");
  });

  it("claimTask works on fresh DB (schema is complete)", () => {
    const result = claimTask({
      task_id: "sprint-task:1973-smoke",
      task_kind: "sprint-task",
      owner_session: "sess-fresh",
      owner_agent: "dev-mcp-server",
      owner_client_session: "test-p1mcp1-fresh",
      ttl_seconds: 3600,
    });
    expect(result.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-5: owner_client_session is nullable (INSERT with NULL succeeds)
// ---------------------------------------------------------------------------

describe("AC-5: owner_client_session is nullable — INSERT with explicit NULL succeeds", () => {
  it("can INSERT a row with NULL owner_client_session", () => {
    const result = testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, owner_client_session)
      VALUES
        ('sprint-task:null-test', 'sprint-task', 'sess-A', 'dev-mcp-server',
         unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600, NULL)
    `).run();
    expect(result.changes).toBe(1);

    const row = testDb.prepare("SELECT owner_client_session FROM task_locks WHERE task_id = ?")
      .get("sprint-task:null-test") as { owner_client_session: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.owner_client_session).toBeNull();
  });

  it("can INSERT a row with a non-null owner_client_session value", () => {
    const sessionId = "14f8039a-51ce-44f8-a7d9-0ddbe73b994e";
    const result = testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, owner_client_session)
      VALUES
        ('sprint-task:session-test', 'sprint-task', 'sess-B', 'dev-mcp-server',
         unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600, ?)
    `).run(sessionId);
    expect(result.changes).toBe(1);

    const row = testDb.prepare("SELECT owner_client_session FROM task_locks WHERE task_id = ?")
      .get("sprint-task:session-test") as { owner_client_session: string | null } | null;
    expect(row).not.toBeNull();
    expect(row!.owner_client_session).toBe(sessionId);
  });

  it("owner_client_session does NOT have a UNIQUE index (ADD COLUMN UNIQUE is silently dropped)", () => {
    // Verify no UNIQUE index exists on owner_client_session
    const uniqueIndexes = getUniqueIndexes(testDb);
    const hasUniqueOnClientSession = uniqueIndexes.some((name) =>
      name.toLowerCase().includes("owner_client_session")
    );
    expect(hasUniqueOnClientSession).toBe(false);

    // Two rows with the same owner_client_session must both insert (no UNIQUE violation)
    const sessionId = "shared-session-uuid";
    testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, owner_client_session)
      VALUES ('lock-A', 'sprint-task', 's', 'agent', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600, ?)
    `).run(sessionId);
    testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds, owner_client_session)
      VALUES ('lock-B', 'sprint-task', 's', 'agent', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600, ?)
    `).run(sessionId);

    const count = (testDb.prepare("SELECT COUNT(*) as cnt FROM task_locks WHERE owner_client_session = ?")
      .get(sessionId) as { cnt: number }).cnt;
    expect(count).toBe(2); // Both rows must exist — no UNIQUE collision
  });
});

// ---------------------------------------------------------------------------
// AC-6: Full chain — old pre-commit-mutex schema through both migrations
// ---------------------------------------------------------------------------

describe("AC-6: Both migrations apply in sequence from pre-commit-mutex schema", () => {
  it("old 3-kind DB ends up with commit-mutex kind + owner_client_session column", () => {
    _resetCoordinationDbState();
    const db = createOldPreCommitMutexDb();

    // Seed a row with old kinds
    db.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('cowork-slot:scout:20260628T000000Z', 'cowork-slot', 'sess-old', 'cowork-team', unixepoch('now'), unixepoch('now')+900, unixepoch('now'), 900)
    `).run();

    migrateCoordinationTable(db);

    // Migration 1: commit-mutex must now be accepted
    const insertResult = db.prepare(`
      INSERT OR IGNORE INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-X', 'agent-X', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();
    expect(insertResult.changes).toBe(1); // Must succeed after Migration 1

    // Migration 2: owner_client_session column must be present
    const cols = getColumns(db);
    expect(cols).toContain("owner_client_session");

    // Old row must survive with NULL in the new column
    const oldRow = db
      .prepare("SELECT owner_client_session FROM task_locks WHERE task_id = ?")
      .get("cowork-slot:scout:20260628T000000Z") as { owner_client_session: string | null } | null;
    expect(oldRow).not.toBeNull();
    expect(oldRow!.owner_client_session).toBeNull();

    db.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});
