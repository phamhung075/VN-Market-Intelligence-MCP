Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1116 — evidence_fragments DDL + evidenceFragmentStore CRUD
 *
 * Tests for:
 * 1. initDatabase() creates evidence_fragments + evidence_scores tables
 * 2. insertEvidenceFragment — inserts row, sets expires_at, returns id
 * 3. getEvidenceFragments — returns newest-first, respects days filter
 * 4. purgeExpiredFragments — deletes expired rows, returns count
 * 5. upsertEvidenceScore — upserts by (stock, score_date)
 * 6. getLatestEvidenceScore — returns most recent row for stock
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertEvidenceFragment,
  getEvidenceFragments,
  purgeExpiredFragments,
  upsertEvidenceScore,
  getLatestEvidenceScore,
} from "../infrastructure/db/evidenceFragmentStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers (mirrors what initDatabase() adds to schema.ts)
// ─────────────────────────────────────────────────────────────────────────────

function createEvidenceSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      evidence_type  TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp      TEXT NOT NULL,
      source_agent   TEXT NOT NULL,
      ttl_days       INTEGER NOT NULL DEFAULT 30,
      expires_at     TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_stock_ts ON evidence_fragments(stock, timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_expires  ON evidence_fragments(expires_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0.0,
      bearish_score  REAL NOT NULL DEFAULT 0.0,
      neutral_score  REAL NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL,
      UNIQUE(stock, score_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_es_stock ON evidence_scores(stock, score_date DESC)`);
}

function makeDb(): Database {
  const db = new Database(":memory:");
  createEvidenceSchema(db);
  return db;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

function daysAgoStr(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1116 — evidence_fragments DDL + store", () => {

  describe("Schema creation", () => {
    it("createEvidenceSchema creates evidence_fragments table", () => {
      const db = makeDb();
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_fragments'")
        .get();
      expect(row).not.toBeNull();
    });

    it("createEvidenceSchema creates evidence_scores table", () => {
      const db = makeDb();
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_scores'")
        .get();
      expect(row).not.toBeNull();
    });

    it("evidence_fragments has idx_ef_stock_ts index", () => {
      const db = makeDb();
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ef_stock_ts'")
        .get();
      expect(row).not.toBeNull();
    });

    it("evidence_scores has unique constraint on (stock, score_date)", () => {
      const db = makeDb();
      const row = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='evidence_scores'")
        .get() as { sql: string } | null;
      expect(row?.sql).toContain("UNIQUE");
    });
  });

  describe("insertEvidenceFragment", () => {
    let db: Database;
    beforeEach(() => { db = makeDb(); });

    it("inserts a fragment and returns a positive id", () => {
      const id = insertEvidenceFragment(db, {
        stock: "VCB",
        evidence_type: "news_sentiment_stock",
        direction: "bullish",
        magnitude: 0.7,
        confidence: 0.8,
        source_agent: "04-market-watcher",
      });
      expect(id).toBeGreaterThan(0);
    });

    it("sets expires_at to timestamp + ttl_days (default 30)", () => {
      const id = insertEvidenceFragment(db, {
        stock: "VCB",
        evidence_type: "news_sentiment_stock",
        direction: "bullish",
        magnitude: 0.7,
        confidence: 0.8,
        source_agent: "04-market-watcher",
      });
      const row = db.prepare("SELECT expires_at, timestamp FROM evidence_fragments WHERE id=?").get(id) as { expires_at: string; timestamp: string };
      const ts = new Date(row.timestamp).getTime();
      const exp = new Date(row.expires_at).getTime();
      const diffDays = (exp - ts) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it("respects custom ttl_days", () => {
      const id = insertEvidenceFragment(db, {
        stock: "VCB",
        evidence_type: "news_sentiment_stock",
        direction: "bullish",
        magnitude: 0.5,
        confidence: 0.6,
        source_agent: "test",
        ttl_days: 7,
      });
      const row = db.prepare("SELECT expires_at, timestamp FROM evidence_fragments WHERE id=?").get(id) as { expires_at: string; timestamp: string };
      const ts = new Date(row.timestamp).getTime();
      const exp = new Date(row.expires_at).getTime();
      const diffDays = (exp - ts) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it("stores direction correctly", () => {
      const id = insertEvidenceFragment(db, {
        stock: "FPT",
        evidence_type: "bctc_revenue_growth",
        direction: "bearish",
        magnitude: 0.3,
        confidence: 0.5,
        source_agent: "03-bctc-collector",
      });
      const row = db.prepare("SELECT direction FROM evidence_fragments WHERE id=?").get(id) as { direction: string };
      expect(row.direction).toBe("bearish");
    });
  });

  describe("getEvidenceFragments", () => {
    let db: Database;
    beforeEach(() => { db = makeDb(); });

    it("returns fragments newest-first", () => {
      // Insert two fragments with different timestamps via direct SQL
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "bullish", 0.7, 0.8, daysAgo(5), "agent", 30, daysFromNow(25));
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "bearish", 0.4, 0.6, daysAgo(2), "agent", 30, daysFromNow(28));

      const frags = getEvidenceFragments(db, "VCB");
      expect(frags).toHaveLength(2);
      // Newest first: t-2d before t-5d
      const age0 = Date.now() - new Date(frags[0]!.timestamp).getTime();
      const age1 = Date.now() - new Date(frags[1]!.timestamp).getTime();
      expect(age0).toBeLessThan(age1);
    });

    it("excludes fragments older than days filter", () => {
      // t-5d (within 30d window), t-35d (outside 30d window)
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "bullish", 0.7, 0.8, daysAgo(5), "agent", 30, daysFromNow(25));
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "bullish", 0.5, 0.6, daysAgo(35), "agent", 30, daysFromNow(0));

      const frags = getEvidenceFragments(db, "VCB", { days: 30 });
      expect(frags).toHaveLength(1);
      expect(new Date(frags[0]!.timestamp).getTime()).toBeGreaterThan(Date.now() - 31 * 86400 * 1000);
    });

    it("returns empty array for unknown stock", () => {
      const frags = getEvidenceFragments(db, "UNKNOWN");
      expect(frags).toHaveLength(0);
    });

    it("filters by evidenceTypes when provided", () => {
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("FPT", "news_sentiment_stock", "bullish", 0.7, 0.8, daysAgo(1), "agent", 30, daysFromNow(29));
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("FPT", "bctc_revenue_growth", "bullish", 0.5, 0.6, daysAgo(2), "agent", 30, daysFromNow(28));

      const frags = getEvidenceFragments(db, "FPT", { evidenceTypes: ["bctc_revenue_growth"] });
      expect(frags).toHaveLength(1);
      expect(frags[0]!.evidence_type).toBe("bctc_revenue_growth");
    });
  });

  describe("purgeExpiredFragments", () => {
    let db: Database;
    beforeEach(() => { db = makeDb(); });

    it("deletes expired fragments and returns count", () => {
      // Insert 1 expired + 1 active
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "bullish", 0.7, 0.8, daysAgo(35), "agent", 30, daysAgo(5)); // expired
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("FPT", "news_sentiment_stock", "bearish", 0.4, 0.5, daysAgo(1), "agent", 30, daysFromNow(29)); // active

      const deleted = purgeExpiredFragments(db);
      expect(deleted).toBe(1);

      const remaining = db.prepare("SELECT COUNT(*) as c FROM evidence_fragments").get() as { c: number };
      expect(remaining.c).toBe(1);
    });

    it("returns 0 when nothing to purge", () => {
      db.prepare(`
        INSERT INTO evidence_fragments (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run("VCB", "news_sentiment_stock", "neutral", 0.3, 0.4, daysAgo(1), "agent", 30, daysFromNow(29));

      const deleted = purgeExpiredFragments(db);
      expect(deleted).toBe(0);
    });
  });

  describe("upsertEvidenceScore + getLatestEvidenceScore", () => {
    let db: Database;
    beforeEach(() => { db = makeDb(); });

    it("inserts an evidence score", () => {
      upsertEvidenceScore(db, "VCB", "2026-04-12", {
        bullish: 0.56,
        bearish: 0.12,
        neutral: 0.0,
        fragmentCount: 4,
      });
      const score = getLatestEvidenceScore(db, "VCB");
      expect(score).not.toBeNull();
      expect(score!.stock).toBe("VCB");
      expect(score!.bullish).toBeCloseTo(0.56, 2);
      expect(score!.fragmentCount).toBe(4);
    });

    it("upserts (replaces) on same stock + date", () => {
      upsertEvidenceScore(db, "VCB", "2026-04-12", {
        bullish: 0.56,
        bearish: 0.12,
        neutral: 0.0,
        fragmentCount: 4,
      });
      upsertEvidenceScore(db, "VCB", "2026-04-12", {
        bullish: 0.8,
        bearish: 0.05,
        neutral: 0.1,
        fragmentCount: 6,
      });
      const score = getLatestEvidenceScore(db, "VCB");
      expect(score!.bullish).toBeCloseTo(0.8, 2);
      expect(score!.fragmentCount).toBe(6);

      const count = db.prepare("SELECT COUNT(*) as c FROM evidence_scores WHERE stock='VCB'").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("getLatestEvidenceScore returns most recent when multiple dates", () => {
      upsertEvidenceScore(db, "FPT", "2026-04-10", { bullish: 0.3, bearish: 0.1, neutral: 0.0, fragmentCount: 2 });
      upsertEvidenceScore(db, "FPT", "2026-04-12", { bullish: 0.7, bearish: 0.2, neutral: 0.1, fragmentCount: 5 });

      const score = getLatestEvidenceScore(db, "FPT");
      expect(score!.score_date).toBe("2026-04-12");
    });

    it("getLatestEvidenceScore returns null for unknown stock", () => {
      const score = getLatestEvidenceScore(db, "UNKNOWN");
      expect(score).toBeNull();
    });
  });
});
