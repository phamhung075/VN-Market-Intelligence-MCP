/**
 * commit-mutex lock kind — coordinationStore tests
 *
 * Tests that 'commit-mutex' is a valid task_kind at the DB layer
 * (CHECK constraint allows it) AND at the TypeScript type level.
 * Also tests the migrateCoordinationTable() function (schema upgrade
 * from old 3-kind CHECK to new 4-kind CHECK).
 *
 * Acceptance criteria:
 *   AC-1: commit-mutex claim succeeds (CHECK allows the kind)
 *   AC-2: singleton deny — 2nd claim returns claimed=false WITH current_holder
 *   AC-3: release → re-claim succeeds (TTL=60 reclaim pattern)
 *   AC-4: stale-steal after simulated TTL expiry (60s timeout)
 *   AC-5: migrateCoordinationTable() upgrades an old schema without losing rows
 *   AC-6: migrateCoordinationTable() is idempotent (double-call safe)
 *   AC-7: listHeldTasks({ kind: "commit-mutex" }) works after migration
 *
 * Design: docs/architecture-briefs/2026-05-24-commit-mutex-on-main/00-design.md
 * PO decision: docs/po-decisions/2026-05-24-commit-mutex-smoke-test-hold.md
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  migrateCoordinationTable,
  claimTask,
  releaseTask,
  listHeldTasks,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with the CURRENT (4-kind) schema. */
function createNewDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureCoordinationTable(db);
  return db;
}

/** Create a fresh in-memory DB with the OLD (3-kind) schema (no commit-mutex). */
function createOldDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // Old schema — the CHECK constraint that was the bug
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

function manipulateExpiry(db: Database, task_id: string, epochSeconds: number): void {
  db.prepare("UPDATE task_locks SET expires_at = ? WHERE task_id = ?").run(epochSeconds, task_id);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createNewDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// AC-1: commit-mutex claim succeeds (CHECK allows the kind)
// ---------------------------------------------------------------------------

describe("AC-1: commit-mutex is a valid task_kind (CHECK allows it)", () => {
  it("task_claim with task_kind='commit-mutex' returns claimed=true", () => {
    const result = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-agent-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
      payload: JSON.stringify({ paths: ["apps/mcp-server/src/foo.ts"], intent: "test commit" }),
    });

    expect(result.claimed).toBe(true);
    // Verify row exists in DB with correct kind
    const row = testDb.prepare("SELECT task_kind, ttl_seconds FROM task_locks WHERE task_id = ?")
      .get("commit-mutex:main") as { task_kind: string; ttl_seconds: number } | null;
    expect(row).not.toBeNull();
    expect(row!.task_kind).toBe("commit-mutex");
    expect(row!.ttl_seconds).toBe(60);
  });

  it("old-style INSERT OR IGNORE against new schema also succeeds (no silent rejection)", () => {
    // Directly test the SQL path that was silently failing before migration
    const result = testDb.prepare(`
      INSERT OR IGNORE INTO task_locks
        (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES
        ('commit-mutex:main', 'commit-mutex', 'sess', 'agent', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();
    expect(result.changes).toBe(1); // Must be 1 — was 0 before fix (CHECK constraint silently rejected it)
  });
});

// ---------------------------------------------------------------------------
// AC-2: singleton deny — 2nd claim returns claimed=false WITH current_holder
// ---------------------------------------------------------------------------

describe("AC-2: singleton deny returns claimed=false WITH current_holder (not bare false)", () => {
  it("2nd claim on held commit-mutex returns current_holder populated", () => {
    // Agent A acquires
    const r1 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
    });
    expect(r1.claimed).toBe(true);

    // Agent B attempts — must be denied WITH holder info (not bare {claimed:false})
    const r2 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-B",
      owner_agent: "dev-ta-server",
      ttl_seconds: 60,
    });
    expect(r2.claimed).toBe(false);

    // CRITICAL: current_holder must be populated (distinguishes "contended" from "mechanism broken")
    const r2typed = r2 as { claimed: false; current_holder?: { owner_agent: string; owner_session: string }; error?: string };
    expect(r2typed.current_holder).toBeDefined();
    expect(r2typed.current_holder!.owner_agent).toBe("dev-mcp-server");
    expect(r2typed.current_holder!.owner_session).toBe("session-A");
    // Must NOT have an error field (that would be the C-2 path, not contention)
    expect(r2typed.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC-3: release → re-claim succeeds
// ---------------------------------------------------------------------------

describe("AC-3: release → re-claim cycle works for commit-mutex", () => {
  it("agent B can claim after agent A releases", () => {
    // A claims
    const r1 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
    });
    expect(r1.claimed).toBe(true);

    // A releases (FIX-CWK-LEADER-LOCK-REBIND: pass owner_agent not owner_session)
    const rel = releaseTask("commit-mutex:main", "dev-mcp-server");
    expect(rel.ok).toBe(true);

    // B claims after release
    const r2 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-B",
      owner_agent: "dev-ta-server",
      ttl_seconds: 60,
    });
    expect(r2.claimed).toBe(true);
    expect((r2 as { stolen?: boolean }).stolen).toBeUndefined(); // not a steal — clean acquire
  });
});

// ---------------------------------------------------------------------------
// AC-4: stale-steal after simulated TTL expiry (60s timeout)
// ---------------------------------------------------------------------------

describe("AC-4: stale-steal reclaim after TTL expiry", () => {
  it("agent B steals a stale commit-mutex lock (expires_at set to past)", () => {
    // A claims with ttl=60
    const r1 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
    });
    expect(r1.claimed).toBe(true);

    // Simulate TTL expiry: set expires_at to far past
    manipulateExpiry(testDb, "commit-mutex:main", 1000);

    // B should successfully steal the stale lock
    const r2 = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-B",
      owner_agent: "dev-ta-server",
      ttl_seconds: 60,
    });
    expect(r2.claimed).toBe(true);
    expect((r2 as { stolen?: boolean }).stolen).toBe(true);

    // Row now owned by session-B
    const row = testDb.prepare("SELECT owner_session, owner_agent FROM task_locks WHERE task_id = ?")
      .get("commit-mutex:main") as { owner_session: string; owner_agent: string } | null;
    expect(row).not.toBeNull();
    expect(row!.owner_session).toBe("session-B");
    expect(row!.owner_agent).toBe("dev-ta-server");
  });
});

// ---------------------------------------------------------------------------
// AC-5: migrateCoordinationTable() upgrades old schema without losing rows
// ---------------------------------------------------------------------------

describe("AC-5: migrateCoordinationTable() upgrades old schema, preserves rows", () => {
  it("migrates old 3-kind schema to 4-kind, existing rows intact, commit-mutex now accepted", () => {
    // Setup: old DB with existing rows
    _resetCoordinationDbState();
    const oldDb = createOldDb();

    // Insert some rows with the old kinds (they're valid in old schema)
    oldDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('cowork-slot:news-scout:20260524T000000Z', 'cowork-slot', 'sess-A', 'cowork-team', unixepoch('now'), unixepoch('now')+900, unixepoch('now'), 900)
    `).run();
    oldDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('task:1999', 'sprint-task', 'sess-B', 'dev-mcp-server', unixepoch('now'), unixepoch('now')+3600, unixepoch('now'), 3600)
    `).run();

    const rowCountBefore = (oldDb.prepare("SELECT COUNT(*) as cnt FROM task_locks").get() as { cnt: number }).cnt;
    expect(rowCountBefore).toBe(2);

    // Verify commit-mutex is REJECTED before migration
    const rejectResult = oldDb.prepare(`
      INSERT OR IGNORE INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-X', 'agent-X', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();
    expect(rejectResult.changes).toBe(0); // silently rejected by old CHECK — the bug

    // Run migration
    migrateCoordinationTable(oldDb);

    // Verify existing rows are preserved
    const rowCountAfter = (oldDb.prepare("SELECT COUNT(*) as cnt FROM task_locks").get() as { cnt: number }).cnt;
    expect(rowCountAfter).toBe(2); // no rows lost

    const rows = oldDb.prepare("SELECT task_id, task_kind FROM task_locks ORDER BY task_id").all() as Array<{ task_id: string; task_kind: string }>;
    const ids = rows.map(r => r.task_id);
    expect(ids).toContain("cowork-slot:news-scout:20260524T000000Z");
    expect(ids).toContain("task:1999");

    // Verify commit-mutex is NOW ACCEPTED after migration
    const acceptResult = oldDb.prepare(`
      INSERT OR IGNORE INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-X', 'agent-X', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();
    expect(acceptResult.changes).toBe(1); // accepted after migration

    oldDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb); // restore for other tests
  });

  it("schema sql after migration contains 'commit-mutex'", () => {
    _resetCoordinationDbState();
    const oldDb = createOldDb();
    migrateCoordinationTable(oldDb);

    const schemaRow = oldDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_locks'")
      .get() as { sql: string } | null;
    expect(schemaRow).not.toBeNull();
    expect(schemaRow!.sql).toContain("'commit-mutex'");

    oldDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });
});

// ---------------------------------------------------------------------------
// AC-6: migrateCoordinationTable() is idempotent
// ---------------------------------------------------------------------------

describe("AC-6: migrateCoordinationTable() is idempotent (safe to call twice)", () => {
  it("calling migrate twice on an already-migrated DB is a no-op", () => {
    // Already-migrated DB (new schema)
    _resetCoordinationDbState();
    const newDb = createNewDb();

    // Seed a row
    newDb.prepare(`
      INSERT INTO task_locks (task_id, task_kind, owner_session, owner_agent, claimed_at, expires_at, heartbeat_at, ttl_seconds)
      VALUES ('commit-mutex:main', 'commit-mutex', 'sess-A', 'dev-mcp-server', unixepoch('now'), unixepoch('now')+60, unixepoch('now'), 60)
    `).run();

    // Call migrate a second time — must not throw, must not lose the row
    expect(() => migrateCoordinationTable(newDb)).not.toThrow();

    const row = newDb.prepare("SELECT task_id FROM task_locks WHERE task_id = ?")
      .get("commit-mutex:main") as { task_id: string } | null;
    expect(row).not.toBeNull();

    newDb.close();
    _resetCoordinationDbState();
    _injectCoordinationDb(testDb);
  });

  it("calling ensureCoordinationTable (which calls migrate) on already-migrated DB is safe", () => {
    // ensureCoordinationTable calls migrateCoordinationTable internally
    expect(() => ensureCoordinationTable(testDb)).not.toThrow();
    // DB should still work
    const result = claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-idempotent",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
    });
    expect(result.claimed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC-7: listHeldTasks({ kind: "commit-mutex" }) works
// ---------------------------------------------------------------------------

describe("AC-7: listHeldTasks filters correctly by kind='commit-mutex'", () => {
  it("returns only commit-mutex locks when filtered", () => {
    // Claim a commit-mutex lock
    claimTask({
      task_id: "commit-mutex:main",
      task_kind: "commit-mutex",
      owner_session: "session-A",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 60,
    });
    // Also claim a sprint-task lock
    claimTask({
      task_id: "task:2000",
      task_kind: "sprint-task",
      owner_session: "session-B",
      owner_agent: "dev-mcp-server",
      ttl_seconds: 3600,
    });

    // Filter by commit-mutex
    const result = listHeldTasks({ kind: "commit-mutex" });
    expect(result.count).toBe(1);
    expect(result.locks[0]!.task_id).toBe("commit-mutex:main");
    expect(result.locks[0]!.task_kind).toBe("commit-mutex");
    expect(result.locks[0]!.ttl_seconds).toBe(60);
  });
});
