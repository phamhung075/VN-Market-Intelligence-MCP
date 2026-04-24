/**
 * 1311a-schema-migration.test.ts
 * RED→GREEN: verdict columns exist on market_messages after initNewsTables()
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news";

describe("1311a: market_messages verdict column migration", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    // Simulate pre-migration DB: create table WITHOUT verdict columns
    db.exec(`
      CREATE TABLE market_messages (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent   TEXT    NOT NULL,
        message_type TEXT    NOT NULL,
        ticker       TEXT,
        content      TEXT    NOT NULL,
        sent_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Now run init (should migrate gracefully)
    initNewsTables(db);
  });

  afterAll(() => {
    db.close();
  });

  function columnNames(tableName: string): string[] {
    const rows = db.query(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  it("market_messages has verdict column", () => {
    expect(columnNames("market_messages")).toContain("verdict");
  });

  it("market_messages has verdict_note column", () => {
    expect(columnNames("market_messages")).toContain("verdict_note");
  });

  it("market_messages has reviewed_at column", () => {
    expect(columnNames("market_messages")).toContain("reviewed_at");
  });

  it("verdict columns accept NULL (no NOT NULL constraint)", () => {
    db.exec(`
      INSERT INTO market_messages (from_agent, message_type, content)
      VALUES ('test-agent', 'alert', 'test content')
    `);
    const row = db.query(
      "SELECT verdict, verdict_note, reviewed_at FROM market_messages WHERE from_agent = 'test-agent'"
    ).get() as { verdict: null; verdict_note: null; reviewed_at: null };
    expect(row.verdict).toBeNull();
    expect(row.verdict_note).toBeNull();
    expect(row.reviewed_at).toBeNull();
  });

  it("verdict columns accept values (UPDATE persists)", () => {
    db.exec(`
      UPDATE market_messages
      SET verdict = 'good', verdict_note = 'accurate', reviewed_at = 1714000000
      WHERE from_agent = 'test-agent'
    `);
    const row = db.query(
      "SELECT verdict, verdict_note, reviewed_at FROM market_messages WHERE from_agent = 'test-agent'"
    ).get() as { verdict: string; verdict_note: string; reviewed_at: number };
    expect(row.verdict).toBe("good");
    expect(row.verdict_note).toBe("accurate");
    expect(row.reviewed_at).toBe(1714000000);
  });

  it("migration is idempotent (second initNewsTables call does not throw)", () => {
    expect(() => initNewsTables(db)).not.toThrow();
  });
});
