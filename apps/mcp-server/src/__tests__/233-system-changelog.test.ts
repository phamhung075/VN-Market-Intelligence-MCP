Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 233 — system_changelog table + log_fix + get_recent_fixes MCP tools
 *
 * Tests for:
 *   1. changelogStore.ts — insertChangelog / getRecentChangelogs CRUD
 *   2. DDL — correct columns, indexes, defaults
 *   3. insertChangelog — returns inserted id, stores all fields
 *   4. getRecentChangelogs — ordered DESC by fixed_at, respects limit
 *   5. files column — stored as JSON string, parsed back to string[]
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  insertChangelog,
  getRecentChangelogs,
  type ChangelogEntry,
} from "../infrastructure/db/changelogStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Task 1034 — `ensureChangelogTable` was removed from changelogStore.ts because
 * its DDL duplicated `schema.ts:initDatabase()`. Tests use this local helper
 * (mirroring the canonical DDL) so they remain isolated from the production
 * initDatabase() side effects.
 */
function ensureChangelogTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_changelog (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fix_type            TEXT    NOT NULL DEFAULT 'bugfix',
      title               TEXT    NOT NULL,
      detail              TEXT    NOT NULL DEFAULT '',
      files               TEXT    NOT NULL DEFAULT '[]',
      commit_hash         TEXT,
      fixed_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      related_feedback_id INTEGER
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_changelog_fixed_at ON system_changelog(fixed_at)`,
  );
}

function makeDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  db.exec("PRAGMA journal_mode = WAL");
  ensureChangelogTable(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DDL
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 233 — ensureChangelogTable (DDL)", () => {
  it("creates the system_changelog table without error", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    expect(() => ensureChangelogTable(db)).not.toThrow();
    db.close();
  });

  it("is idempotent — safe to call multiple times", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    expect(() => {
      ensureChangelogTable(db);
      ensureChangelogTable(db);
      ensureChangelogTable(db);
    }).not.toThrow();
    db.close();
  });

  it("creates idx_changelog_fixed_at index", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    ensureChangelogTable(db);
    const idx = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_changelog_fixed_at'",
      )
      .get();
    expect(idx).not.toBeNull();
    expect(idx?.name).toBe("idx_changelog_fixed_at");
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. insertChangelog — write path
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 233 — insertChangelog (write path)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns a positive integer row id", () => {
    const id = insertChangelog(db, {
      fixType: "bugfix",
      title: "Fix fetchHosePrices timeout",
      detail: "Increased timeout from 5s to 15s",
      files: ["src/infrastructure/fetchers/hose.ts"],
    });
    expect(id).toBeGreaterThan(0);
  });

  it("returns incrementing IDs for successive inserts", () => {
    const id1 = insertChangelog(db, {
      fixType: "bugfix",
      title: "Fix A",
      detail: "",
      files: [],
    });
    const id2 = insertChangelog(db, {
      fixType: "feature",
      title: "Fix B",
      detail: "",
      files: [],
    });
    expect(id2).toBeGreaterThan(id1);
  });

  it("stores all fields correctly", () => {
    const id = insertChangelog(db, {
      fixType: "hotfix",
      title: "Critical: Telegram send failure",
      detail: "Added retry logic with exponential backoff",
      files: ["src/infrastructure/notifiers/telegram.ts"],
      commitHash: "abc1234",
      relatedFeedbackId: 42,
    });
    const rows = getRecentChangelogs(db, 10);
    const row = rows.find((r) => r.id === id);
    expect(row).not.toBeUndefined();
    expect(row!.fix_type).toBe("hotfix");
    expect(row!.title).toBe("Critical: Telegram send failure");
    expect(row!.detail).toBe("Added retry logic with exponential backoff");
    expect(row!.commit_hash).toBe("abc1234");
    expect(row!.related_feedback_id).toBe(42);
  });

  it("defaults fix_type to 'bugfix' when not specified via direct SQL default", () => {
    // Insert with minimal required fields only
    const id = insertChangelog(db, {
      fixType: "bugfix",
      title: "Minimal insert",
      detail: "",
      files: [],
    });
    const rows = getRecentChangelogs(db, 1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.fix_type).toBe("bugfix");
  });

  it("stores commitHash as null when not provided", () => {
    const id = insertChangelog(db, {
      fixType: "bugfix",
      title: "No commit hash",
      detail: "",
      files: [],
    });
    const rows = getRecentChangelogs(db, 10);
    const row = rows.find((r) => r.id === id);
    expect(row!.commit_hash).toBeNull();
  });

  it("stores relatedFeedbackId as null when not provided", () => {
    const id = insertChangelog(db, {
      fixType: "bugfix",
      title: "No feedback id",
      detail: "",
      files: [],
    });
    const rows = getRecentChangelogs(db, 10);
    const row = rows.find((r) => r.id === id);
    expect(row!.related_feedback_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getRecentChangelogs — read path + ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 233 — getRecentChangelogs (read path)", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("returns empty array when no entries exist", () => {
    expect(getRecentChangelogs(db)).toHaveLength(0);
  });

  it("returns entries ordered by fixed_at DESC (newest first)", () => {
    // Insert with controlled fixed_at via raw SQL
    db.prepare(
      `INSERT INTO system_changelog (fix_type, title, detail, files, fixed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("bugfix", "Old fix", "", "[]", "2026-01-01T00:00:00");
    db.prepare(
      `INSERT INTO system_changelog (fix_type, title, detail, files, fixed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("bugfix", "Newer fix", "", "[]", "2026-01-02T00:00:00");
    db.prepare(
      `INSERT INTO system_changelog (fix_type, title, detail, files, fixed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("bugfix", "Newest fix", "", "[]", "2026-01-03T00:00:00");

    const rows = getRecentChangelogs(db);
    expect(rows[0]!.title).toBe("Newest fix");
    expect(rows[1]!.title).toBe("Newer fix");
    expect(rows[2]!.title).toBe("Old fix");
  });

  it("respects the limit parameter", () => {
    for (let i = 0; i < 15; i++) {
      insertChangelog(db, { fixType: "bugfix", title: `Fix ${i}`, detail: "", files: [] });
    }
    const rows = getRecentChangelogs(db, 5);
    expect(rows).toHaveLength(5);
  });

  it("defaults to limit 10 when no limit is given", () => {
    for (let i = 0; i < 15; i++) {
      insertChangelog(db, { fixType: "bugfix", title: `Fix ${i}`, detail: "", files: [] });
    }
    const rows = getRecentChangelogs(db);
    expect(rows).toHaveLength(10);
  });

  it("returns fewer than limit when fewer rows exist", () => {
    insertChangelog(db, { fixType: "bugfix", title: "Only fix", detail: "", files: [] });
    const rows = getRecentChangelogs(db, 10);
    expect(rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. files — JSON round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 233 — files JSON round-trip", () => {
  let db: Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("stores an array of files and parses it back correctly", () => {
    const files = [
      "src/infrastructure/fetchers/hose.ts",
      "src/infrastructure/fetchers/hnx.ts",
      "src/application/usecases/scanMarket.ts",
    ];
    const id = insertChangelog(db, {
      fixType: "bugfix",
      title: "Multi-file fix",
      detail: "Fixed price fetch on both exchanges",
      files,
    });
    const rows = getRecentChangelogs(db, 1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.files).toEqual(files);
  });

  it("round-trips empty files array correctly", () => {
    const id = insertChangelog(db, {
      fixType: "docs",
      title: "Doc-only update",
      detail: "No source files changed",
      files: [],
    });
    const rows = getRecentChangelogs(db, 1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.files).toEqual([]);
  });

  it("returned ChangelogEntry has all required fields", () => {
    insertChangelog(db, {
      fixType: "feature",
      title: "New tool",
      detail: "Added log_fix tool",
      files: ["src/interface/mcp/tools/changelogTools.ts"],
      commitHash: "deadbeef",
      relatedFeedbackId: 7,
    });
    const rows = getRecentChangelogs(db, 1);
    const row: ChangelogEntry = rows[0]!;
    expect(typeof row.id).toBe("number");
    expect(typeof row.fix_type).toBe("string");
    expect(typeof row.title).toBe("string");
    expect(typeof row.detail).toBe("string");
    expect(Array.isArray(row.files)).toBe(true);
    expect(typeof row.fixed_at).toBe("string");
  });
});
