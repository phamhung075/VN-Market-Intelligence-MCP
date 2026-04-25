/**
 * FIX-1282 / FIX-1285 — Schema migrations regression test
 *
 * Root cause:
 *   Production DB restored from a backup that predated the migrations adding
 *   rag_analyses, evidence_scores, and vnstock_trading_stats. Server startup
 *   calls initDatabase() which runs all CREATE TABLE IF NOT EXISTS guards, but
 *   if the backup DB was mounted and the process restarted without running
 *   initDatabase() (e.g. manual sqlite file swap without restart), those tables
 *   would be absent — causing franceSummaryJob and assembleBriefing to throw
 *   "no such table" at query time.
 *
 * Fix invariant (locked in here):
 *   initDatabase() MUST create all three tables on any fresh or restored DB.
 *   Every CREATE TABLE uses IF NOT EXISTS so it is idempotent.
 *   The startup chain in index.ts calls initDatabase() before any job runs.
 *
 * Acceptance criteria:
 *   TC-1: initDatabase() creates rag_analyses on a fresh :memory: DB
 *   TC-2: initDatabase() creates evidence_scores on a fresh :memory: DB
 *   TC-3: initDatabase() creates vnstock_trading_stats on a fresh :memory: DB
 *   TC-4: All three tables are queryable — SELECT COUNT(*) returns 0, not error
 *   TC-5: franceSummaryJob query path — SELECT from rag_analyses does not throw
 *   TC-6: assembleBriefing query path — SELECT from vnstock_trading_stats does not throw
 *   TC-7: assembleBriefing query path — SELECT from evidence_scores does not throw
 *
 * Note: apps/mcp-server/src/__tests__/setup.ts sets DB_PATH=:memory: as preload.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function tableExists(db: Database, tableName: string): boolean {
  const row = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(tableName);
  return row?.name === tableName;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("FIX-1282/1285 — rag_analyses + evidence_scores + vnstock_trading_stats created by initDatabase()", () => {
  let db: Database;

  beforeEach(async () => {
    // Reset singleton so each test starts from a completely empty DB.
    closeDb();
    db = new Database(":memory:");
    await initDatabase(db);
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    closeDb();
  });

  // ── TC-1 ──────────────────────────────────────────────────────────────────
  it("TC-1: rag_analyses table exists after initDatabase()", () => {
    expect(tableExists(db, "rag_analyses")).toBe(true);
  });

  // ── TC-2 ──────────────────────────────────────────────────────────────────
  it("TC-2: evidence_scores table exists after initDatabase()", () => {
    expect(tableExists(db, "evidence_scores")).toBe(true);
  });

  // ── TC-3 ──────────────────────────────────────────────────────────────────
  it("TC-3: vnstock_trading_stats table exists after initDatabase()", () => {
    expect(tableExists(db, "vnstock_trading_stats")).toBe(true);
  });

  // ── TC-4 ──────────────────────────────────────────────────────────────────
  it("TC-4: all three tables are queryable — SELECT COUNT(*) returns 0, not error", () => {
    const r1 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM rag_analyses").get();
    const r2 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM evidence_scores").get();
    const r3 = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM vnstock_trading_stats").get();
    expect(r1?.c).toBe(0);
    expect(r2?.c).toBe(0);
    expect(r3?.c).toBe(0);
  });

  // ── TC-5 ──────────────────────────────────────────────────────────────────
  it("TC-5: franceSummaryJob query path — SELECT from rag_analyses does not throw", () => {
    // Mirrors the query used by assembleEveningSummary.ts, called from franceSummaryJob
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

  // ── TC-6 ──────────────────────────────────────────────────────────────────
  it("TC-6: assembleBriefing query path — SELECT from vnstock_trading_stats does not throw", () => {
    // Mirrors queryForeignFlowSummary in assembleBriefing.ts
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

  // ── TC-7 ──────────────────────────────────────────────────────────────────
  it("TC-7: assembleBriefing query path — SELECT from evidence_scores does not throw", () => {
    // Mirrors queryEvidenceTopScores in assembleBriefing.ts
    expect(() => {
      db.query<{ code: string; bullish_score: number; bearish_score: number }, [string]>(`
        SELECT stock AS code, bullish_score, bearish_score
        FROM evidence_scores
        WHERE stock IN (?)
        ORDER BY bullish_score DESC
      `).all("VCB");
    }).not.toThrow();
  });
});
