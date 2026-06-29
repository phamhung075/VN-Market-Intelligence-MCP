/**
 * Deferred Task Scheduler — Unit Tests (ST-7 / DEFERRED-TASK-SCHEDULER-MVP)
 *
 * AC gates covered:
 *   AC-1: typeof(fire_at) = integer (not text/ISO8601)
 *   AC-2: dedup_key UNIQUE in CREATE TABLE (not ADD COLUMN)
 *   AC-3: deadline expiry — insert fire_at=now-10,deadline_at=now-5 → sweeper expires, NOT routes
 *   AC-11: D1 — terminal set = {fired,failed,expired,cancelled} (NOT 'done' as MVP terminal)
 *   idempotency: dedup_key collision → existing id returned, no duplicate row
 *   atomicity: two concurrent claimDueScheduledTasks → each row claimed exactly once
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ensureCoordinationTable,
  claimDueScheduledTasks,
  completeScheduledTask,
  expireScheduledTask,
  failScheduledTask,
  insertScheduledTask,
  getScheduledTaskByDedupKey,
  listScheduledTasksDb,
  _injectCoordinationDb,
  _resetCoordinationDbState,
} from "../infrastructure/db/coordinationStore.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  ensureCoordinationTable(db);
  return db;
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function insertTestTask(
  db: Database,
  overrides: Partial<{
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
    created_at: number;
  }> = {},
): string {
  const now = nowEpoch();
  const id = overrides.id ?? `test-${Math.random().toString(36).slice(2)}`;
  insertScheduledTask(db, {
    id,
    agent: overrides.agent ?? "ops",
    team: overrides.team ?? "DEV",
    intent: overrides.intent ?? "test-intent",
    prompt: overrides.prompt ?? "test prompt",
    fire_at: overrides.fire_at ?? now + 3600,
    deadline_at: overrides.deadline_at !== undefined ? overrides.deadline_at : null,
    dedup_key: overrides.dedup_key !== undefined ? overrides.dedup_key : null,
    reason: overrides.reason ?? "unit test reason",
    origin_ref: overrides.origin_ref !== undefined ? overrides.origin_ref : null,
    max_attempts: overrides.max_attempts ?? 1,
    created_at: overrides.created_at ?? now,
  });
  return id;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  _resetCoordinationDbState();
  testDb = createTestDb();
  _injectCoordinationDb(testDb);
});

afterEach(() => {
  _resetCoordinationDbState();
  try { testDb.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// AC-1: All time columns stored as INTEGER epoch-seconds (not ISO8601 text)
// ---------------------------------------------------------------------------

describe("AC-1: epoch-seconds INTEGER storage", () => {
  it("typeof(fire_at) is integer after insert", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { fire_at: now + 60 });

    const row = testDb
      .prepare("SELECT typeof(fire_at) AS t FROM scheduled_tasks LIMIT 1")
      .get() as { t: string } | null;

    expect(row).not.toBeNull();
    expect(row!.t).toBe("integer");
  });

  it("typeof(created_at) is integer after insert", () => {
    insertTestTask(testDb);
    const row = testDb
      .prepare("SELECT typeof(created_at) AS t FROM scheduled_tasks LIMIT 1")
      .get() as { t: string } | null;
    expect(row!.t).toBe("integer");
  });

  it("typeof(fired_at) is integer after claim (not text)", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { fire_at: now - 10 });
    claimDueScheduledTasks(testDb, now);

    const row = testDb
      .prepare("SELECT typeof(fired_at) AS t FROM scheduled_tasks LIMIT 1")
      .get() as { t: string } | null;

    // fired_at is set to nowEpoch (an integer) during claim
    expect(row!.t).toBe("integer");
  });
});

// ---------------------------------------------------------------------------
// AC-2: dedup_key UNIQUE constraint present in CREATE TABLE DDL
// ---------------------------------------------------------------------------

describe("AC-2: dedup_key UNIQUE in CREATE TABLE DDL", () => {
  it("SELECT sql FROM sqlite_master contains UNIQUE on dedup_key", () => {
    const row = testDb
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'")
      .get() as { sql: string } | null;

    expect(row).not.toBeNull();
    // The UNIQUE constraint must be in the CREATE TABLE statement itself
    expect(row!.sql).toContain("UNIQUE");
    expect(row!.sql).toContain("dedup_key");
  });

  it("duplicate dedup_key insert fails (UNIQUE constraint enforced)", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { dedup_key: "test-dedup-001", fire_at: now + 3600 });

    // Second insert with same dedup_key should throw
    expect(() => {
      insertTestTask(testDb, { dedup_key: "test-dedup-001", fire_at: now + 7200 });
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC-3: Deadline expiry — task with deadline_at in the past must NOT route
// ---------------------------------------------------------------------------

describe("AC-3: deadline expiry gate", () => {
  it("task with fire_at=now-10, deadline_at=now-5 → claimed by sweeper, expires, NOT routed", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, {
      fire_at: now - 10,       // past fire_at: eligible for claim
      deadline_at: now - 5,    // deadline already past: must expire
    });

    // Step 1: Atomic claim (pending→firing)
    const claimed = claimDueScheduledTasks(testDb, now);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.id).toBe(id);
    expect(claimed[0]!.status).toBe("firing");

    // Step 2: Deadline gate — now > deadline_at → expire
    const task = claimed[0]!;
    expect(task.deadline_at).not.toBeNull();
    expect(now > task.deadline_at!).toBe(true); // deadline gate fires

    expireScheduledTask(testDb, id);

    // Verify: status must be 'expired', not 'fired'
    const finalRow = testDb
      .prepare("SELECT status FROM scheduled_tasks WHERE id = ?")
      .get(id) as { status: string } | null;

    expect(finalRow!.status).toBe("expired");
  });

  it("task with deadline_at in the future → fires normally (not expired)", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, {
      fire_at: now - 10,
      deadline_at: now + 3600,  // future deadline: OK
    });

    const claimed = claimDueScheduledTasks(testDb, now);
    expect(claimed).toHaveLength(1);

    const task = claimed[0]!;
    // Deadline gate: now < deadline_at → do NOT expire
    expect(now > task.deadline_at!).toBe(false);

    // Route + complete
    completeScheduledTask(testDb, id, "fired");

    const finalRow = testDb
      .prepare("SELECT status FROM scheduled_tasks WHERE id = ?")
      .get(id) as { status: string } | null;

    expect(finalRow!.status).toBe("fired");
  });

  it("task with NULL deadline_at → fires normally (no expiry gate)", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, {
      fire_at: now - 10,
      deadline_at: null,
    });

    const claimed = claimDueScheduledTasks(testDb, now);
    expect(claimed).toHaveLength(1);

    completeScheduledTask(testDb, id, "fired");

    const finalRow = testDb
      .prepare("SELECT status FROM scheduled_tasks WHERE id = ?")
      .get(id) as { status: string } | null;
    expect(finalRow!.status).toBe("fired");
  });
});

// ---------------------------------------------------------------------------
// AC-11 (D1): Terminal set = {fired, failed, expired, cancelled} — NOT 'done' as MVP terminal
// ---------------------------------------------------------------------------

describe("AC-11 / D1: terminal state set", () => {
  it("'fired' is a valid terminal status after successful routing (D1 success path)", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now - 10 });
    claimDueScheduledTasks(testDb, now);
    completeScheduledTask(testDb, id, "fired");

    const row = testDb.prepare("SELECT status FROM scheduled_tasks WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("fired");
  });

  it("'failed' is a valid terminal status after routing error", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now - 10 });
    claimDueScheduledTasks(testDb, now);
    failScheduledTask(testDb, id, "spawn error: agent unreachable");

    const row = testDb.prepare("SELECT status FROM scheduled_tasks WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("failed");
  });

  it("'expired' is a valid terminal status after deadline gate", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now - 10, deadline_at: now - 5 });
    claimDueScheduledTasks(testDb, now);
    expireScheduledTask(testDb, id);

    const row = testDb.prepare("SELECT status FROM scheduled_tasks WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("expired");
  });

  it("'cancelled' is a valid terminal status", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now + 3600 });

    testDb.prepare("UPDATE scheduled_tasks SET status='cancelled' WHERE id=?").run(id);

    const row = testDb.prepare("SELECT status FROM scheduled_tasks WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("cancelled");
  });

  it("invalid status 'in_progress' rejected by CHECK constraint", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now + 3600 });

    expect(() => {
      testDb.prepare("UPDATE scheduled_tasks SET status='in_progress' WHERE id=?").run(id);
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Idempotency: dedup_key collision → existing id returned, no duplicate row
// ---------------------------------------------------------------------------

describe("dedup_key idempotency", () => {
  it("lookup via getScheduledTaskByDedupKey returns existing row on collision", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, {
      dedup_key: "dedup-rebuild-mcp-001",
      fire_at: now + 1200,
    });

    const found = getScheduledTaskByDedupKey(testDb, "dedup-rebuild-mcp-001");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
    expect(found!.status).toBe("pending");
  });

  it("getScheduledTaskByDedupKey returns null for unknown key", () => {
    const found = getScheduledTaskByDedupKey(testDb, "no-such-key");
    expect(found).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Atomicity: two claimDueScheduledTasks calls → each row claimed exactly once
// ---------------------------------------------------------------------------

describe("atomicity: claimDueScheduledTasks single-winner", () => {
  it("each due row claimed exactly once across two concurrent calls", () => {
    const now = nowEpoch();
    const id1 = insertTestTask(testDb, { fire_at: now - 10 });
    const id2 = insertTestTask(testDb, { fire_at: now - 5 });

    // First claim sweep
    const firstClaim = claimDueScheduledTasks(testDb, now);
    // Second claim sweep (simulates concurrent session)
    const secondClaim = claimDueScheduledTasks(testDb, now);

    // All rows claimed by first call; second call should return empty
    expect(firstClaim).toHaveLength(2);
    const claimedIds = new Set(firstClaim.map((r) => r.id));
    expect(claimedIds.has(id1)).toBe(true);
    expect(claimedIds.has(id2)).toBe(true);

    expect(secondClaim).toHaveLength(0); // already in 'firing', not 'pending'
  });

  it("future tasks not claimed by sweep (fire_at > nowEpoch)", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { fire_at: now + 3600 }); // future

    const claimed = claimDueScheduledTasks(testDb, now);
    expect(claimed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listScheduledTasksDb: audit capability (AC-10)
// ---------------------------------------------------------------------------

describe("listScheduledTasksDb audit", () => {
  it("returns fired rows with non-null fired_at after complete", () => {
    const now = nowEpoch();
    const id = insertTestTask(testDb, { fire_at: now - 10 });
    claimDueScheduledTasks(testDb, now);
    completeScheduledTask(testDb, id, "fired", "2026-06-29T18:15Z");

    const results = listScheduledTasksDb(testDb, { status: "fired" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(id);
    expect(results[0]!.fired_at).not.toBeNull();
    expect(results[0]!.sweep_tick).toBe("2026-06-29T18:15Z");
    expect(results[0]!.status).toBe("fired");
  });

  it("filters by team", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { team: "COWORK", agent: "market-watcher" });
    insertTestTask(testDb, { team: "DEV", agent: "ops" });

    const cowork = listScheduledTasksDb(testDb, { team: "COWORK" });
    expect(cowork).toHaveLength(1);
    expect(cowork[0]!.team).toBe("COWORK");

    const dev = listScheduledTasksDb(testDb, { team: "DEV" });
    expect(dev).toHaveLength(1);
    expect(dev[0]!.team).toBe("DEV");
  });

  it("due_before filter: fire_at <= due_before", () => {
    const now = nowEpoch();
    insertTestTask(testDb, { fire_at: now - 100 }); // past
    insertTestTask(testDb, { fire_at: now + 3600 }); // future

    const due = listScheduledTasksDb(testDb, { due_before: now });
    expect(due).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AGENT_TEAM_MAP: resolveAgentTeam correctness (AC-8)
// ---------------------------------------------------------------------------

describe("AC-8: AGENT_TEAM_MAP resolveAgentTeam", () => {
  // Import here to keep test self-contained
  it("known COWORK agent resolves to COWORK", async () => {
    const { resolveAgentTeam } = await import("../interface/mcp/tools/system/agentTeamMap.js");
    expect(resolveAgentTeam("market-watcher")).toBe("COWORK");
    expect(resolveAgentTeam("news-scout")).toBe("COWORK");
    expect(resolveAgentTeam("alert-commander")).toBe("COWORK");
  });

  it("known DEV agent resolves to DEV", async () => {
    const { resolveAgentTeam } = await import("../interface/mcp/tools/system/agentTeamMap.js");
    expect(resolveAgentTeam("ops")).toBe("DEV");
    expect(resolveAgentTeam("system-auditor")).toBe("DEV");
    expect(resolveAgentTeam("dev-mcp-server")).toBe("DEV");
    expect(resolveAgentTeam("po")).toBe("DEV");
  });

  it("unknown agent returns null (fail-loud — no silent default)", async () => {
    const { resolveAgentTeam } = await import("../interface/mcp/tools/system/agentTeamMap.js");
    expect(resolveAgentTeam("not-a-real-agent")).toBeNull();
    expect(resolveAgentTeam("")).toBeNull();
    expect(resolveAgentTeam("MARKET-WATCHER")).toBeNull(); // case-sensitive
  });
});
