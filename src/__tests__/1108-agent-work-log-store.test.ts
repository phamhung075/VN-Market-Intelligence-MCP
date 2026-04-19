/**
 * Task 1108 — agent_work_log DDL + store tests
 *
 * Covers:
 *   - Table presence after initDatabase()
 *   - logAgentWorkStart inserts row with status='running', returns id
 *   - logAgentWorkEnd updates row correctly
 *   - getAgentWorkLog returns entries sorted by started_at DESC
 *   - getAgentWorkLog with agentName filter
 *   - getAgentWorkLog with days filter
 *   - getAgentWorkLog with limit
 *   - purgeOldAgentWorkLogs removes old rows, keeps recent ones
 *   - Empty table returns []
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  logAgentWorkStart,
  logAgentWorkEnd,
  getAgentWorkLog,
  purgeOldAgentWorkLogs,
  type AgentWorkLogEntry,
} from "../infrastructure/db/agentWorkLogStore.js";

// Use an in-memory DB for each test run
let db: Database;

beforeEach(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  // Get the fresh in-memory db
  const { getDb } = await import("../infrastructure/db/schema.js");
  db = getDb();
});

afterEach(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
  delete Bun.env["DB_PATH"];
});

describe("Task 1108 — agent_work_log DDL + store", () => {
  // ── Schema ──────────────────────────────────────────────────────────────────

  it("agent_work_log table exists after initDatabase()", () => {
    const rows = db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_work_log'`,
      )
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]!.name).toBe("agent_work_log");
  });

  it("idx_agent_work_log_agent_started index exists after initDatabase()", () => {
    const rows = db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_agent_work_log_agent_started'`,
      )
      .all();
    expect(rows.length).toBe(1);
  });

  // ── logAgentWorkStart ──────────────────────────────────────────────────────

  it("logAgentWorkStart inserts a row with status='running' and returns id", () => {
    const id = logAgentWorkStart(db, "test-agent");
    expect(id).toBeGreaterThan(0);

    const row = db
      .query<{ status: string; agent_name: string; session_id: string | null }, [number]>(
        `SELECT status, agent_name, session_id FROM agent_work_log WHERE id = ?`,
      )
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.status).toBe("running");
    expect(row!.agent_name).toBe("test-agent");
    expect(row!.session_id).toBeNull();
  });

  it("logAgentWorkStart stores sessionId when provided", () => {
    const id = logAgentWorkStart(db, "news-scout", "sess-abc-123");

    const row = db
      .query<{ session_id: string | null }, [number]>(
        `SELECT session_id FROM agent_work_log WHERE id = ?`,
      )
      .get(id);

    expect(row!.session_id).toBe("sess-abc-123");
  });

  it("logAgentWorkStart returns incrementing ids for multiple inserts", () => {
    const id1 = logAgentWorkStart(db, "agent-a");
    const id2 = logAgentWorkStart(db, "agent-b");
    expect(id2).toBeGreaterThan(id1);
  });

  // ── logAgentWorkEnd ────────────────────────────────────────────────────────

  it("logAgentWorkEnd updates row with finished_at, summary, findings, actions, status", () => {
    const id = logAgentWorkStart(db, "alert-commander");
    logAgentWorkEnd(
      db,
      id,
      "Processed 5 signals",
      "VNM price drop -4%",
      JSON.stringify([{ tool: "send_telegram", result: "ok" }]),
      "completed",
    );

    const row = db
      .query<
        {
          status: string;
          summary: string;
          findings: string;
          actions_json: string;
          finished_at: string;
        },
        [number]
      >(
        `SELECT status, summary, findings, actions_json, finished_at FROM agent_work_log WHERE id = ?`,
      )
      .get(id);

    expect(row!.status).toBe("completed");
    expect(row!.summary).toBe("Processed 5 signals");
    expect(row!.findings).toBe("VNM price drop -4%");
    expect(JSON.parse(row!.actions_json)).toHaveLength(1);
    expect(row!.finished_at).not.toBeNull();
  });

  it("logAgentWorkEnd can set status='error'", () => {
    const id = logAgentWorkStart(db, "data-fetcher");
    logAgentWorkEnd(db, id, "Fetch failed", "Timeout after 30s", null, "error");

    const row = db
      .query<{ status: string }, [number]>(
        `SELECT status FROM agent_work_log WHERE id = ?`,
      )
      .get(id);

    expect(row!.status).toBe("error");
  });

  // ── getAgentWorkLog ────────────────────────────────────────────────────────

  it("getAgentWorkLog returns [] for empty table", () => {
    const entries = getAgentWorkLog(db);
    expect(entries).toEqual([]);
  });

  it("getAgentWorkLog returns entries sorted by started_at DESC", async () => {
    // Insert two rows with a small delay to ensure different timestamps
    const id1 = logAgentWorkStart(db, "agent-x");
    // Force a later timestamp by directly inserting with explicit started_at
    db.run(
      `INSERT INTO agent_work_log (agent_name, started_at, status) VALUES (?, datetime('now', '+1 second'), 'running')`,
      ["agent-y"],
    );
    const id2 = db.query<{ id: number }, []>(`SELECT MAX(id) as id FROM agent_work_log`).get()!.id;

    const entries = getAgentWorkLog(db);
    expect(entries.length).toBe(2);
    // More recent (id2) should come first
    expect(entries[0]!.id).toBe(id2);
    expect(entries[1]!.id).toBe(id1);
  });

  it("getAgentWorkLog filters by agentName", () => {
    logAgentWorkStart(db, "agent-alpha");
    logAgentWorkStart(db, "agent-beta");
    logAgentWorkStart(db, "agent-alpha");

    const entries = getAgentWorkLog(db, { agentName: "agent-alpha" });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.agent_name === "agent-alpha")).toBe(true);
  });

  it("getAgentWorkLog with days filter returns only recent entries", () => {
    // Insert a very old row manually
    db.run(
      `INSERT INTO agent_work_log (agent_name, started_at, status) VALUES (?, datetime('now', '-10 days'), 'completed')`,
      ["old-agent"],
    );
    // Insert a recent row
    logAgentWorkStart(db, "recent-agent");

    // Filter for last 5 days — should only get the recent one
    const entries = getAgentWorkLog(db, { days: 5 });
    expect(entries.length).toBe(1);
    expect(entries[0]!.agent_name).toBe("recent-agent");
  });

  it("getAgentWorkLog with limit returns at most N entries", () => {
    for (let i = 0; i < 5; i++) {
      logAgentWorkStart(db, `agent-${i}`);
    }

    const entries = getAgentWorkLog(db, { limit: 3 });
    expect(entries.length).toBe(3);
  });

  it("getAgentWorkLog can combine agentName + days + limit filters", () => {
    for (let i = 0; i < 4; i++) {
      logAgentWorkStart(db, "target-agent");
    }
    logAgentWorkStart(db, "other-agent");
    // Old entry for target-agent
    db.run(
      `INSERT INTO agent_work_log (agent_name, started_at, status) VALUES (?, datetime('now', '-20 days'), 'completed')`,
      ["target-agent"],
    );

    const entries = getAgentWorkLog(db, { agentName: "target-agent", days: 7, limit: 2 });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.agent_name === "target-agent")).toBe(true);
  });

  it("getAgentWorkLog returns AgentWorkLogEntry with all expected fields", () => {
    const id = logAgentWorkStart(db, "unified-agent", "sess-xyz");
    logAgentWorkEnd(db, id, "Done", "Found 3 issues", "[]", "completed");

    const [entry] = getAgentWorkLog(db) as [AgentWorkLogEntry];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("agent_name", "unified-agent");
    expect(entry).toHaveProperty("session_id", "sess-xyz");
    expect(entry).toHaveProperty("started_at");
    expect(entry).toHaveProperty("finished_at");
    expect(entry).toHaveProperty("summary", "Done");
    expect(entry).toHaveProperty("findings", "Found 3 issues");
    expect(entry).toHaveProperty("actions_json", "[]");
    expect(entry).toHaveProperty("status", "completed");
  });

  // ── purgeOldAgentWorkLogs ──────────────────────────────────────────────────

  it("purgeOldAgentWorkLogs removes rows older than retentionDays", () => {
    // Insert old rows
    for (let i = 0; i < 3; i++) {
      db.run(
        `INSERT INTO agent_work_log (agent_name, started_at, status) VALUES (?, datetime('now', '-40 days'), 'completed')`,
        [`old-agent-${i}`],
      );
    }
    // Insert recent rows
    logAgentWorkStart(db, "recent-a");
    logAgentWorkStart(db, "recent-b");

    const deleted = purgeOldAgentWorkLogs(db, 30);
    expect(deleted).toBe(3);

    const remaining = getAgentWorkLog(db);
    expect(remaining.length).toBe(2);
    expect(remaining.every((e) => e.agent_name.startsWith("recent"))).toBe(true);
  });

  it("purgeOldAgentWorkLogs returns 0 when nothing to purge", () => {
    logAgentWorkStart(db, "fresh-agent");
    const deleted = purgeOldAgentWorkLogs(db, 30);
    expect(deleted).toBe(0);
  });

  it("purgeOldAgentWorkLogs keeps rows exactly at the boundary", () => {
    // Row at exactly retentionDays old — boundary depends on < vs <= in SQL
    // The implementation uses < (strictly older than boundary), so a row at
    // exactly 30 days is kept.
    db.run(
      `INSERT INTO agent_work_log (agent_name, started_at, status) VALUES (?, datetime('now', '-30 days'), 'completed')`,
      ["boundary-agent"],
    );

    const deleted = purgeOldAgentWorkLogs(db, 30);
    // Boundary row should be kept (not deleted)
    expect(deleted).toBe(0);
  });
});
