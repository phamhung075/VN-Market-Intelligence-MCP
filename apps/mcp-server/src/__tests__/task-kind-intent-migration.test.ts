/**
 * Migration 3 — 7-kind TaskKind enum + redispatch_count column
 *
 * Tests that 'intent', 'orphan-signal', and 'session-presence' are valid task_kinds
 * at the DB layer (CHECK constraint) AND at the TypeScript type level.
 * Also tests Migration-3 upgrades a 4-kind schema without losing rows,
 * and that redispatch_count is added with DEFAULT 0.
 *
 * Acceptance criteria:
 *   AC-1: intent kind accepted by CHECK constraint
 *   AC-2: orphan-signal kind accepted
 *   AC-3: session-presence kind accepted
 *   AC-4: all 4 original kinds still accepted (regression check)
 *   AC-5: Migration-3 upgrades 4-kind schema → 7-kind, existing rows preserved
 *   AC-6: Migration-3 is idempotent (double-call safe)
 *   AC-7: redispatch_count column exists with DEFAULT 0 after migration
 *   AC-8: redispatch_count is preserved when column already exists before migration
 *   AC-9: listHeldTasks returns redispatch_count field
 *   AC-10: migration from scratch (3-kind old schema) also reaches 7 kinds (all 3 migrations in one call)
 *
 * Sprint: CROSS-SESSION-MULTI-TEAM-ORCH
 * Task: TASK_1989 (FIX-COORD-TASKKIND-ENUM-INTENT-GATE)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  migrateCoordinationTable,
  claimTask,
  listHeldTasks,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with the CURRENT (7-kind) schema. */
function createCurrentDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

/**
 * Create a DB with the 4-kind schema (as it existed before Migration 3),
 * including owner_client_session (Migration 2 already applied).
 * Simulates a live DB after Migrations 1+2 but before Migration 3.
 */
function createPreMig3Db(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE task_locks (
      task_id              TEXT    NOT NULL,
      task_kind            TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex')),
      owner_session        TEXT    NOT NULL,
      owner_agent          TEXT    NOT NULL,
      owner_client_session TEXT,
      claimed_at           INTEGER NOT NULL,
      expires_at           INTEGER NOT NULL,
      heartbeat_at         INTEGER NOT NULL,
      ttl_seconds          INTEGER NOT NULL DEFAULT 3600,
      payload              TEXT,
      PRIMARY KEY (task_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);
  return db;
}

/**
 * Create a DB with the 3-kind schema (oldest, before Migration 1).
 * Used in AC-10 to verify the full 3-migration cascade.
 */
function createPreMig1Db(): Database {
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
  const cols = db.prepare("PRAGMA table_info(task_locks)").all() as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

function getSchemaSQL(db: Database): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_locks'")
    .get() as { sql: string } | null;
  return row?.sql ?? "";
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
// AC-1: intent kind accepted
// ---------------------------------------------------------------------------

describe("AC-1: 'intent' is a valid task_kind (CHECK allows it)", () => {
  it("task_claim with task_kind='intent' returns claimed=true", () => {
    const result = claimTask({
      task_id: "intent:po:sprint-decompose",
      task_kind: "intent",
      owner_session: "session-router-A",
      owner_agent: "po",
      owner_client_session: "test-intent-AC1-uuid",
      ttl_seconds: 600,
      payload: JSON.stringify({ site: "router", intent: "sprint-decompose" }),
    });

    expect(result.claimed).toBe(true);

    const row = testDb
      .prepare("SELECT task_kind FROM task_locks WHERE task_id = ?")
      .get("intent:po:sprint-decompose") as { task_kind: string } | null;
    expect(row).not.toBeNull();
    expect(row!.task_kind).toBe("intent");
  });

  it("direct SQL INSERT with task_kind='intent' succeeds (CHECK allows)", () => {
    const r = testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('intent:test:direct', 'intent', 'sess', 'agent', 'cs-uuid', unixepoch('now'), unixepoch('now')+600, unixepoch('now'), 600)
    `).run();
    expect(r.changes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC-2: orphan-signal kind accepted
// ---------------------------------------------------------------------------

describe("AC-2: 'orphan-signal' is a valid task_kind", () => {
  it("task_claim with task_kind='orphan-signal' returns claimed=true", () => {
    const result = claimTask({
      task_id: "orphan-signal:TASK_1983:stale",
      task_kind: "orphan-signal",
      owner_session: "session-reaper",
      owner_agent: "system-reaper",
      owner_client_session: "test-orphan-AC2-uuid",
      ttl_seconds: 300,
    });

    expect(result.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-3: session-presence kind accepted
// ---------------------------------------------------------------------------

describe("AC-3: 'session-presence' is a valid task_kind", () => {
  it("task_claim with task_kind='session-presence' returns claimed=true", () => {
    const result = claimTask({
      task_id: "session-presence:cowork-team:sess-abc123",
      task_kind: "session-presence",
      owner_session: "session-X",
      owner_agent: "cowork-team",
      owner_client_session: "test-sp-AC3-uuid",
      ttl_seconds: 900,
    });

    expect(result.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-4: original 4 kinds still accepted (regression check)
// ---------------------------------------------------------------------------

describe("AC-4: original 4 kinds are still accepted (no regression)", () => {
  const originalKinds: Array<{ kind: "cowork-slot" | "sprint-task" | "dashboard-row" | "commit-mutex"; taskId: string; ttl: number }> = [
    { kind: "cowork-slot",    taskId: "cowork-slot:news-scout:20260628T000000Z", ttl: 900 },
    { kind: "sprint-task",    taskId: "task:1989",                               ttl: 3600 },
    { kind: "dashboard-row",  taskId: "dash:unified-agent:row-42",               ttl: 300 },
    { kind: "commit-mutex",   taskId: "commit-mutex:main",                       ttl: 60 },
  ];

  for (const { kind, taskId, ttl } of originalKinds) {
    it(`task_kind='${kind}' still returns claimed=true`, () => {
      const result = claimTask({
        task_id: taskId,
        task_kind: kind,
        owner_session: "session-regression",
        owner_agent: "test-agent",
        owner_client_session: `test-regression-${kind}`,
        ttl_seconds: ttl,
      });
      expect(result.claimed).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// AC-5: Migration-3 upgrades 4-kind schema, preserves rows
// ---------------------------------------------------------------------------

describe("AC-5: migrateCoordinationTable() Migration-3 upgrades 4-kind DB to 7-kind, rows intact", () => {
  it("migrates pre-Migration-3 DB, existing rows survive, all 7 kinds accepted", () => {
    _resetCoordinationDbState();
    const preDb = createPreMig3Db();

    // Insert rows with original kinds
    preDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('cowork-slot:watcher:20260628', 'cowork-slot', 'sess-A', 'cowork-team', 'cs-A', unixepoch('now'), unixepoch('now')+900, unixepoch('now'), 900)
    `).run();
    preDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-B', 'dev-mcp-server', 'cs-B', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();

    const countBefore = (preDb.prepare("SELECT COUNT(*) as n FROM task_locks").get() as { n: number }).n;
    expect(countBefore).toBe(2);

    // Verify 'intent' is REJECTED before migration
    const rejectResult = preDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('intent:po:test', 'intent', 'sess', 'agent', 'cs-x', unixepoch('now'), unixepoch('now')+600, unixepoch('now'), 600)
    `).run();
    expect(rejectResult.changes).toBe(0); // silently rejected by 4-kind CHECK

    // Run migration
    migrateCoordinationTable(preDb);

    // Existing rows preserved
    const countAfter = (preDb.prepare("SELECT COUNT(*) as n FROM task_locks").get() as { n: number }).n;
    expect(countAfter).toBe(2);

    const rows = preDb
      .prepare("SELECT task_id, task_kind, redispatch_count FROM task_locks ORDER BY task_id")
      .all() as Array<{ task_id: string; task_kind: string; redispatch_count: number }>;
    const ids = rows.map((r) => r.task_id);
    expect(ids).toContain("cowork-slot:watcher:20260628");
    expect(ids).toContain("commit-mutex:main");
    // redispatch_count defaulted to 0 for existing rows
    for (const row of rows) {
      expect(row.redispatch_count).toBe(0);
    }

    // 'intent' is NOW accepted
    const acceptResult = preDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('intent:po:test', 'intent', 'sess', 'agent', 'cs-x', unixepoch('now'), unixepoch('now')+600, unixepoch('now'), 600)
    `).run();
    expect(acceptResult.changes).toBe(1);

    // 'orphan-signal' and 'session-presence' also accepted
    const osResult = preDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('orphan-signal:test:1', 'orphan-signal', 'sess', 'reaper', 'cs-y', unixepoch('now'), unixepoch('now')+300, unixepoch('now'), 300)
    `).run();
    expect(osResult.changes).toBe(1);

    const spResult = preDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('session-presence:sess-abc', 'session-presence', 'sess', 'agent', 'cs-z', unixepoch('now'), unixepoch('now')+900, unixepoch('now'), 900)
    `).run();
    expect(spResult.changes).toBe(1);

    preDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });

  it("schema sql after Migration-3 contains all 7 kind strings", () => {
    _resetCoordinationDbState();
    const preDb = createPreMig3Db();
    migrateCoordinationTable(preDb);

    const sql = getSchemaSQL(preDb);
    expect(sql).toContain("'intent'");
    expect(sql).toContain("'orphan-signal'");
    expect(sql).toContain("'session-presence'");
    // original 4 still present
    expect(sql).toContain("'cowork-slot'");
    expect(sql).toContain("'sprint-task'");
    expect(sql).toContain("'dashboard-row'");
    expect(sql).toContain("'commit-mutex'");

    preDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Migration-3 is idempotent
// ---------------------------------------------------------------------------

describe("AC-6: migrateCoordinationTable() is idempotent after Migration-3", () => {
  it("calling migrate twice on a 7-kind DB does not throw and preserves rows", () => {
    // testDb is already 7-kind (created by createCurrentDb via ensureCoordinationTable)
    // Seed a row
    claimTask({
      task_id: "intent:po:idempotent-test",
      task_kind: "intent",
      owner_session: "sess-idem",
      owner_agent: "po",
      owner_client_session: "cs-idem-uuid",
      ttl_seconds: 600,
    });

    // Call migrate again — must be a no-op
    expect(() => migrateCoordinationTable(testDb)).not.toThrow();

    const row = testDb
      .prepare("SELECT task_id FROM task_locks WHERE task_id = ?")
      .get("intent:po:idempotent-test") as { task_id: string } | null;
    expect(row).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-7: redispatch_count column exists with DEFAULT 0
// ---------------------------------------------------------------------------

describe("AC-7: redispatch_count column present with DEFAULT 0", () => {
  it("new DB has redispatch_count column", () => {
    const cols = getColumns(testDb);
    expect(cols).toContain("redispatch_count");
  });

  it("claimed row has redispatch_count=0 (DEFAULT)", () => {
    claimTask({
      task_id: "intent:test:redispatch-default",
      task_kind: "intent",
      owner_session: "sess-rd",
      owner_agent: "router",
      owner_client_session: "cs-rd-uuid",
      ttl_seconds: 600,
    });

    const row = testDb
      .prepare("SELECT redispatch_count FROM task_locks WHERE task_id = ?")
      .get("intent:test:redispatch-default") as { redispatch_count: number } | null;
    expect(row).not.toBeNull();
    expect(row!.redispatch_count).toBe(0);
  });

  it("after Migration-3 on 4-kind DB, redispatch_count column is present", () => {
    _resetCoordinationDbState();
    const preDb = createPreMig3Db();

    const colsBefore = getColumns(preDb);
    expect(colsBefore).not.toContain("redispatch_count");

    migrateCoordinationTable(preDb);

    const colsAfter = getColumns(preDb);
    expect(colsAfter).toContain("redispatch_count");

    preDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-8: redispatch_count preserved when column already exists before migration
// ---------------------------------------------------------------------------

describe("AC-8: redispatch_count preserved if column already exists before Migration-3", () => {
  it("existing redispatch_count values survive the Migration-3 table-recreate", () => {
    // Build a DB that already has redispatch_count (edge case: TASK_1982 partially shipped before cancel)
    _resetCoordinationDbState();
    const partialDb = new Database(":memory:");
    partialDb.exec("PRAGMA journal_mode = WAL");
    partialDb.exec("PRAGMA foreign_keys = ON");
    // 4-kind schema + redispatch_count (simulate if TASK_1982 had ADD COLUMN but not widened CHECK)
    partialDb.exec(`
      CREATE TABLE task_locks (
        task_id              TEXT    NOT NULL,
        task_kind            TEXT    NOT NULL CHECK(task_kind IN ('cowork-slot','sprint-task','dashboard-row','commit-mutex')),
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
    partialDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_expires_at ON task_locks(expires_at)`);
    partialDb.exec(`CREATE INDEX IF NOT EXISTS idx_task_locks_kind_agent ON task_locks(task_kind, owner_agent)`);

    // Insert a row with non-zero redispatch_count
    partialDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds, redispatch_count)
      VALUES ('task:9999', 'sprint-task', 'sess-X', 'dev-agent', 'cs-X', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600, 3)
    `).run();

    // Run migration — Migration-3 should detect redispatch_count exists and copy it
    migrateCoordinationTable(partialDb);

    const row = partialDb
      .prepare("SELECT redispatch_count FROM task_locks WHERE task_id = ?")
      .get("task:9999") as { redispatch_count: number } | null;
    expect(row).not.toBeNull();
    expect(row!.redispatch_count).toBe(3); // preserved

    partialDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-9: listHeldTasks returns redispatch_count field
// ---------------------------------------------------------------------------

describe("AC-9: listHeldTasks includes redispatch_count in returned rows", () => {
  it("returns redispatch_count=0 for a freshly claimed intent lock", () => {
    claimTask({
      task_id: "intent:po:list-test",
      task_kind: "intent",
      owner_session: "sess-list",
      owner_agent: "po",
      owner_client_session: "cs-list-uuid",
      ttl_seconds: 600,
    });

    const result = listHeldTasks({ kind: "intent" });
    expect(result.count).toBe(1);
    expect(result.locks[0]!.task_id).toBe("intent:po:list-test");
    expect(result.locks[0]!.task_kind).toBe("intent");
    expect(result.locks[0]!.redispatch_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-10: 3-kind old DB → full cascade (Migrations 1+2+3 in one call)
// ---------------------------------------------------------------------------

describe("AC-10: migrateCoordinationTable() applies all 3 migrations to a 3-kind old DB", () => {
  it("fully upgrades oldest schema to 7-kind + owner_client_session + redispatch_count", () => {
    _resetCoordinationDbState();
    const oldDb = createPreMig1Db();

    // Seed a 3-kind row (valid before any migration)
    oldDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('cowork-slot:old:20260628', 'cowork-slot', 'sess-old', 'cowork-team', unixepoch('now'), unixepoch('now')+900, unixepoch('now'), 900)
    `).run();

    migrateCoordinationTable(oldDb);

    // Row preserved
    const row = oldDb
      .prepare("SELECT task_id, redispatch_count FROM task_locks WHERE task_id = ?")
      .get("cowork-slot:old:20260628") as { task_id: string; redispatch_count: number } | null;
    expect(row).not.toBeNull();
    expect(row!.redispatch_count).toBe(0);

    // owner_client_session column present
    const cols = getColumns(oldDb);
    expect(cols).toContain("owner_client_session");
    expect(cols).toContain("redispatch_count");

    // Schema has all 7 kinds
    const sql = getSchemaSQL(oldDb);
    expect(sql).toContain("'intent'");
    expect(sql).toContain("'orphan-signal'");
    expect(sql).toContain("'session-presence'");
    expect(sql).toContain("'commit-mutex'");

    // All 7 kinds now accepted
    for (const kind of ["intent", "orphan-signal", "session-presence", "cowork-slot", "sprint-task", "dashboard-row", "commit-mutex"] as const) {
      const r = oldDb.prepare(`
        INSERT OR IGNORE INTO task_locks
          (task_id, task_kind, owner_session, owner_agent, owner_client_session, claimed_at, expires_at, heartbeat_at, ttl_seconds)
        VALUES (?, ?, 'sess', 'agent', 'cs-uuid', unixepoch('now'), unixepoch('now')+300, unixepoch('now'), 300)
      `).run(`test-kind:${kind}`, kind);
      expect(r.changes).toBe(1);
    }

    oldDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});
