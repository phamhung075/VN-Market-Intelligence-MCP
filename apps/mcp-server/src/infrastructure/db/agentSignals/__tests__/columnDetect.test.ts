Bun.env["DB_PATH"] = ":memory:";

/**
 * FACTORY-INFRA-split-agentSignalStore — detectSignalColumns() memoization.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { detectSignalColumns, resetSignalColumnCache } from "../columnDetect.js";

function baseDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("FACTORY-INFRA-split-agentSignalStore — detectSignalColumns", () => {
  it("detects a base-only schema as all-false except hasCreatedAtColumn", () => {
    const db = baseDb();
    const flags = detectSignalColumns(db);
    expect(flags).toEqual({
      hasChainColumns: false,
      hasCausalRootColumns: false,
      hasSignalClassColumn: false,
      hasValidationColumns: false,
      hasContextColumns: false,
      hasCriticColumns: false,
      hasCreatedAtColumn: true,
    });
  });

  it("detects a fully-migrated schema as all-true", () => {
    const db = baseDb();
    db.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_id TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN signal_class TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN confidence_score INTEGER`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN validated_at TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN news_sentiment REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN kinh_dich_confidence REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN agent_signals_majority TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_score REAL`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN critic_notes TEXT`);
    db.exec(`ALTER TABLE agent_signals ADD COLUMN retry_count INTEGER`);

    const flags = detectSignalColumns(db);
    expect(Object.values(flags).every((v) => v === true)).toBe(true);
  });

  it("memoizes per-connection: a schema mutation after the first call is NOT observed until reset", () => {
    const db = baseDb();
    const before = detectSignalColumns(db);
    expect(before.hasChainColumns).toBe(false);

    db.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`);
    const stillCached = detectSignalColumns(db);
    expect(stillCached.hasChainColumns).toBe(false); // stale cache — proves memoization is active

    resetSignalColumnCache(db);
    const fresh = detectSignalColumns(db);
    expect(fresh.hasChainColumns).toBe(true);
  });

  it("isolates two distinct Database instances (no cross-connection cache bleed)", () => {
    const dbA = baseDb();
    const dbB = baseDb();
    dbB.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`);

    expect(detectSignalColumns(dbA).hasChainColumns).toBe(false);
    expect(detectSignalColumns(dbB).hasChainColumns).toBe(true);
  });
});
