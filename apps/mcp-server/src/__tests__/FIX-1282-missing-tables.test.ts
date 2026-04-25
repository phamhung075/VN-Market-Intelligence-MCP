/**
 * FIX-1282 / FIX-1285 — Missing tables regression test
 *
 * Acceptance criteria:
 *   TC-1: initDatabase() on a fresh :memory: DB creates rag_analyses
 *   TC-2: initDatabase() on a fresh :memory: DB creates evidence_scores
 *   TC-3: initDatabase() on a fresh :memory: DB creates vnstock_trading_stats
 *   TC-4: All three tables are queryable (no "no such table" error) after init
 *   TC-5: franceSummaryJob query path — SELECT from rag_analyses returns without error
 *   TC-6: assembleBriefing query path — SELECT from vnstock_trading_stats returns without error
 *   TC-7: assembleBriefing query path — SELECT from evidence_scores returns without error
 *
 * Root cause: Tables are defined in schema slice functions (initNewsTables,
 * initSystemTables, initFinancialReportsTables) which are all called by
 * initDatabase(). A production DB file that predates these slice additions
 * would be missing the tables if initDatabase() was somehow not called on
 * restart. This test locks in the invariant: after initDatabase(), all three
 * tables MUST exist.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// Helper: check if a table exists in a Database instance
function tableExists(db: Database, tableName: string): boolean {
  const row = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(tableName);
  return row?.name === tableName;
}

describe("FIX-1282/1285 — rag_analyses, evidence_scores, vnstock_trading_stats created by initDatabase()", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    // Each test gets a fresh independent in-memory DB — not the singleton,
    // so we can test initDatabase(dbArg) directly.
    db = new Database(":memory:");
    await initDatabase(db);
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    closeDb();
  });

  // ── TC-1 ─────────────────────────────────────────────────────────────────
  it("TC-1: rag_analyses exists after initDatabase()", () => {
    expect(tableExists(db, "rag_analyses")).toBe(true);
  });

  // ── TC-2 ─────────────────────────────────────────────────────────────────
  it("TC-2: evidence_scores exists after initDatabase()", () => {
    expect(tableExists(db, "evidence_scores")).toBe(true);
  });

  // ── TC-3 ─────────────────────────────────────────────────────────────────
  it("TC-3: vnstock_trading_stats exists after initDatabase()", () => {
    expect(tableExists(db, "vnstock_trading_stats")).toBe(true);
  });

  // ── TC-4 ─────────────────────────────────────────────────────────────────
  it("TC-4: all three tables are queryable (SELECT COUNT(*) returns 0 rows, not an error)", () => {
    const r1 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM rag_analyses").get();
    const r2 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM evidence_scores").get();
    const r3 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM vnstock_trading_stats").get();
    expect(r1?.c).toBe(0);
    expect(r2?.c).toBe(0);
    expect(r3?.c).toBe(0);
  });

  // ── TC-5 ─────────────────────────────────────────────────────────────────
  it("TC-5: franceSummaryJob query path — SELECT from rag_analyses does not throw", () => {
    // Mirrors assembleEveningSummary.ts query path used by franceSummaryJob
    expect(() => {
      db.query<{ id: string; impact_score: number | null }, [string]>(`
        SELECT id, impact_score
        FROM rag_analyses
        WHERE created_at >= ?
        ORDER BY impact_score DESC
        LIMIT 5
      `).all("2026-01-01T00:00:00Z");
    }).not.toThrow();
  });

  // ── TC-6 ─────────────────────────────────────────────────────────────────
  it("TC-6: assembleBriefing query path — SELECT from vnstock_trading_stats does not throw", () => {
    // Mirrors assembleBriefing.ts queryForeignFlowSummary
    expect(() => {
      db.query<{ code: string; foreign_volume: number | null }, [string]>(`
        SELECT code, foreign_volume
        FROM vnstock_trading_stats
        WHERE code IN (?)
          AND foreign_volume IS NOT NULL
        ORDER BY foreign_volume DESC
      `).all("VCB");
    }).not.toThrow();
  });

  // ── TC-7 ─────────────────────────────────────────────────────────────────
  it("TC-7: assembleBriefing query path — SELECT from evidence_scores does not throw", () => {
    // Mirrors assembleBriefing.ts queryEvidenceTopScores
    expect(() => {
      db.query<{ code: string; bullish_score: number; bearish_score: number }, [string]>(`
        SELECT stock AS code, bullish_score, bearish_score
        FROM evidence_scores
        WHERE stock IN (?)
        ORDER BY bullish_score DESC
      `).all("VCB");
    }).not.toThrow();
  });

  // ── TC-8: idempotency — calling initDatabase() twice is safe ─────────────
  it("TC-8: initDatabase() is idempotent — second call does not throw or duplicate tables", async () => {
    await initDatabase(db);
    const r = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='rag_analyses'"
      )
      .get();
    // Still exactly one table (not duplicated)
    expect(r?.cnt).toBe(1);
  });
});
