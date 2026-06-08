// apps/mcp-server/src/__tests__/1313-unknown-stock-chain.test.ts
// Bug 1313 — stock_code="unknown" sentinel rows leak into getChainFindings.
// Fix: add AND stock_code IS NOT NULL to getChainFindings SQL query.
//     Also: add migrateUnknownStockCodes export to clean pre-1334 rows.
//
// RED phase: getChainFindings currently lacks the IS NOT NULL filter.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignal,
  getChainFindings,
  computeCycleId,
} from "../infrastructure/db/agentSignalStore.js";

// migrateUnknownStockCodes is not yet exported — RED test for Bug 1313 Fix 2.
import { migrateUnknownStockCodes } from "../infrastructure/db/agentSignalStore.js";

// ── Minimal schema helper ────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent    TEXT    NOT NULL,
      to_agent      TEXT    NOT NULL DEFAULT 'all',
      signal_type   TEXT    NOT NULL,
      stock_code    TEXT,
      payload       TEXT    NOT NULL DEFAULT '{}',
      status        TEXT    NOT NULL DEFAULT 'unread',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at    TEXT    NOT NULL,
      cycle_id      TEXT,
      finding_data  TEXT,
      causal_ref    INTEGER,
      chain_depth   INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

// Insert a row directly bypassing postSignal normalization (simulates pre-1334 data)
function insertRaw(
  db: Database,
  cycleId: string,
  stockCode: string | null,
  fromAgent: string = "test-agent",
): void {
  db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at, cycle_id, finding_data, chain_depth)
    VALUES (?, 'all', 'chain_catalyst', ?, '{}', 'unread', datetime('now', '+120 minutes'), ?, '{}', 0)
  `).run(fromAgent, stockCode, cycleId);
}

describe("Bug 1313 — getChainFindings excludes null/unknown stock_code rows", () => {

  let db: Database;
  const cycleId = computeCycleId(new Date("2026-04-27T09:00:00Z"));

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns only the VNM signal when cycle has VNM + NULL stock_code rows", () => {
    insertRaw(db, cycleId, "VNM");
    insertRaw(db, cycleId, null);

    const findings = getChainFindings(db, cycleId);

    // NULL row must be excluded
    expect(findings.length).toBe(1);
    expect(findings[0]!.stockCode).toBe("VNM");
  });

  it("excludes rows with stock_code='unknown' (pre-1334 sentinel value)", () => {
    // Insert directly to simulate pre-1334 row that bypasses postSignal normalization
    insertRaw(db, cycleId, "unknown");
    insertRaw(db, cycleId, "HPG");

    const findings = getChainFindings(db, cycleId);

    expect(findings.length).toBe(1);
    expect(findings[0]!.stockCode).toBe("HPG");
    const unknownFindings = findings.filter((f) => f.stockCode === "unknown");
    expect(unknownFindings.length).toBe(0);
  });

  it("returns empty array when all rows have null stock_code", () => {
    insertRaw(db, cycleId, null);
    insertRaw(db, cycleId, null);

    const findings = getChainFindings(db, cycleId);
    expect(findings.length).toBe(0);
  });

  it("returns all valid stock rows when no null/unknown present", () => {
    insertRaw(db, cycleId, "VNM");
    insertRaw(db, cycleId, "HPG");
    insertRaw(db, cycleId, "VCB");

    const findings = getChainFindings(db, cycleId);
    expect(findings.length).toBe(3);
    const codes = findings.map((f) => f.stockCode);
    expect(codes).toContain("VNM");
    expect(codes).toContain("HPG");
    expect(codes).toContain("VCB");
  });

  it("postSignal normalizes 'unknown' stockCode to NULL on insert", () => {
    postSignal(db, {
      fromAgent: "test",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "unknown",
      payload: {},
      cycleId,
      ttlMinutes: 120,
    });

    const row = db.prepare(
      `SELECT stock_code FROM agent_signals WHERE cycle_id = ?`
    ).get(cycleId) as { stock_code: string | null } | null;

    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull();
  });

  it("postSignal normalizes empty string stockCode to NULL on insert", () => {
    postSignal(db, {
      fromAgent: "test",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "",
      payload: {},
      cycleId,
      ttlMinutes: 120,
    });

    const row = db.prepare(
      `SELECT stock_code FROM agent_signals WHERE cycle_id = ?`
    ).get(cycleId) as { stock_code: string | null } | null;

    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull();
  });
});

describe("Bug 1313 — migrateUnknownStockCodes cleans pre-1334 rows", () => {

  let db: Database;
  const cycleId = computeCycleId(new Date("2026-04-27T09:00:00Z"));

  beforeEach(() => {
    db = createTestDb();
  });

  it("sets stock_code=NULL for all 'unknown' rows", async () => {
    // Simulate pre-1334 rows with 'unknown' sentinel
    insertRaw(db, cycleId, "unknown");
    insertRaw(db, cycleId, "unknown");
    insertRaw(db, cycleId, "VNM"); // should be untouched

    await migrateUnknownStockCodes(db);

    const unknownCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = 'unknown'`
    ).get() as { cnt: number }).cnt;
    expect(unknownCount).toBe(0);

    const nullCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code IS NULL`
    ).get() as { cnt: number }).cnt;
    expect(nullCount).toBe(2);

    const vnmCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = 'VNM'`
    ).get() as { cnt: number }).cnt;
    expect(vnmCount).toBe(1);
  });

  it("is a no-op when no 'unknown' rows exist", async () => {
    insertRaw(db, cycleId, "HPG");
    insertRaw(db, cycleId, null);

    await migrateUnknownStockCodes(db);

    const unknownCount = (db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = 'unknown'`
    ).get() as { cnt: number }).cnt;
    expect(unknownCount).toBe(0);
  });

  it("migration result: getChainFindings returns only valid rows after cleanup", async () => {
    insertRaw(db, cycleId, "unknown");
    insertRaw(db, cycleId, "VCB");

    // Before migration: "unknown" leaks through (if filter not applied at SQL level)
    // After migration: "unknown" is gone even if SQL filter absent
    await migrateUnknownStockCodes(db);

    const findings = getChainFindings(db, cycleId);
    // With the SQL fix, NULL rows are excluded; VCB remains
    expect(findings.length).toBe(1);
    expect(findings[0]!.stockCode).toBe("VCB");
  });
});
