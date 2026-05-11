// scripts/migrations/__tests__/signal-T1.test.ts
// Unit test for create-signals-db migration script.
// Uses an in-memory SQLite DB via bun:sqlite to avoid touching the real signals.db.

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";

// Import the DDL statements from the migration script
import { SIGNALS_DDL } from "../create-signals-db.ts";

describe("signal-T1 — create-signals-db migration", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    for (const stmt of SIGNALS_DDL) {
      db.exec(stmt);
    }
  });

  afterAll(() => {
    db.close();
  });

  it("creates the signals_processed table", () => {
    const row = db
      .query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='signals_processed'"
      )
      .get();
    expect(row).not.toBeNull();
  });

  it("table has all required columns", () => {
    const columns = db.query("PRAGMA table_info(signals_processed)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("fingerprint");
    expect(colNames).toContain("from_agent");
    expect(colNames).toContain("to_agent");
    expect(colNames).toContain("type");
    expect(colNames).toContain("priority");
    expect(colNames).toContain("payload");
    expect(colNames).toContain("created_at");
    expect(colNames).toContain("processed_at");
    expect(colNames).toContain("processed_by");
    expect(colNames).toContain("result");
    expect(colNames).toContain("source_filename");
  });

  it("processed_by has default value 'dev-team'", () => {
    const columns = db.query("PRAGMA table_info(signals_processed)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    const processedBy = columns.find((c) => c.name === "processed_by");
    expect(processedBy?.dflt_value).toBe("'dev-team'");
  });

  it("fingerprint has UNIQUE constraint", () => {
    db.exec(`INSERT INTO signals_processed
      (fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, result)
      VALUES ('fp1','agentA','agentB','task','HIGH','{}','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','routed-to-po')`);

    expect(() => {
      db.exec(`INSERT INTO signals_processed
        (fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, result)
        VALUES ('fp1','agentC','agentD','task','HIGH','{}','2026-01-01T00:00:00Z','2026-01-01T00:02:00Z','routed-to-po')`);
    }).toThrow();
  });

  it("creates idx_signals_fingerprint index", () => {
    const row = db
      .query(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_signals_fingerprint'"
      )
      .get();
    expect(row).not.toBeNull();
  });

  it("creates idx_signals_processed_at index", () => {
    const row = db
      .query(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_signals_processed_at'"
      )
      .get();
    expect(row).not.toBeNull();
  });

  it("second DDL run is a no-op (IF NOT EXISTS guard)", () => {
    // Running the DDL again should not throw
    expect(() => {
      for (const stmt of SIGNALS_DDL) {
        db.exec(stmt);
      }
    }).not.toThrow();
  });
});
