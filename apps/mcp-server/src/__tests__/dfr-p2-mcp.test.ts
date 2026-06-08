// dfr-p2-mcp.test.ts — DFR-P2-MCP unit tests
//
// Tests:
//   - shouldDeepFetch: all 3 signals + negative case
//   - enqueueIfNotPresent: UNIQUE dedup (source_url)
//   - per-domain daily cap enforcement
//   - 4h stale expiry in isStale()
//   - schema migration idempotency (deep_fetch_queue + deep_fetch_stats tables)

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { shouldDeepFetch, buildSectorKeywordMap } from "../domain/services/deepFetchGate.js";
import {
  enqueueIfNotPresent,
  pollPending,
  pollVpsFailed,
  markDone,
  markVpsFailed,
  markExpired,
  checkDomainDailyCap,
  incrementDomainCounter,
  isStale,
} from "../infrastructure/db/deepFetchQueueStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  // minimal schema needed for deepFetch tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      summary TEXT,
      tags TEXT,
      affected_actions TEXT,
      published_at TEXT,
      confidence REAL,
      impact_score REAL,
      sentiment TEXT,
      body_text TEXT,
      data_env TEXT
)
  `);
  initNewsTables(db);
  return db;
}

function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare<{ count: number }, [string]>(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?`,
    )
    .get(name);
  return (row?.count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema migration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — Schema migration", () => {
  it("creates deep_fetch_queue table", () => {
    const db = makeDb();
    expect(tableExists(db, "deep_fetch_queue")).toBe(true);
  });

  it("creates deep_fetch_stats table", () => {
    const db = makeDb();
    expect(tableExists(db, "deep_fetch_stats")).toBe(true);
  });

  it("is idempotent — second initNewsTables() call does not throw", () => {
    const db = makeDb();
    expect(() => initNewsTables(db)).not.toThrow();
  });

  it("deep_fetch_queue has correct columns", () => {
    const db = makeDb();
    const cols = db
      .prepare<{ name: string }, []>(`PRAGMA table_info(deep_fetch_queue)`)
      .all()
      .map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("source_url");
    expect(cols).toContain("source_domain");
    expect(cols).toContain("rag_id");
    expect(cols).toContain("ticker");
    expect(cols).toContain("status");
    expect(cols).toContain("attempts");
    expect(cols).toContain("queued_at");
    expect(cols).toContain("fetched_at");
  });

  it("deep_fetch_queue enforces UNIQUE constraint on source_url via INSERT OR IGNORE", () => {
    const db = makeDb();
    // Verify behaviorally: second insert for same source_url is silently ignored
    db.prepare(`INSERT INTO deep_fetch_queue (source_url, source_domain, rag_id) VALUES (?, ?, ?)`).run("https://cafef.vn/unique-test", "cafef.vn", "r-u1");
    // Must not throw — INSERT OR IGNORE semantics
    expect(() => {
      db.prepare(`INSERT OR IGNORE INTO deep_fetch_queue (source_url, source_domain, rag_id) VALUES (?, ?, ?)`).run("https://cafef.vn/unique-test", "cafef.vn", "r-u2");
    }).not.toThrow();
    // Only 1 row for that URL
    const cnt = db.prepare<{ c: number }, [string]>(`SELECT COUNT(*) as c FROM deep_fetch_queue WHERE source_url = ?`).get("https://cafef.vn/unique-test");
    expect(cnt?.c).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldDeepFetch unit tests — all 3 signals + negative
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — shouldDeepFetch gate", () => {
  const watchlistTickers = ["VNM", "VCB", "HPG", "FPT"];
  const sectorKeywords = new Map<string, string[]>([
    ["Banking", ["banking", "ngân hàng", "vcb", "bid"]],
    ["Steel", ["thép", "steel", "hpg"]],
    ["Agriculture / Dairy", ["sữa", "dairy", "vnm"]],
  ]);

  const baseInput = {
    title: "Neutral market update",
    snippet: "Nothing relevant here",
    impactScore: 3,
    sentiment: "neutral",
    sourceUrl: "https://example.com/article",
    affectedActions: [] as string[],
    watchlistTickers,
    sectorKeywords,
  };

  it("Signal 1a: returns true when title contains a watchlist ticker (detectStocksInText)", () => {
    const hit = shouldDeepFetch({
      ...baseInput,
      title: "VCB announces record quarterly profits",
      snippet: "Vietcombank sees strong growth",
    });
    expect(hit).toBe(true);
  });

  it("Signal 1b: returns true when affectedActions contains a watchlist ticker", () => {
    const hit = shouldDeepFetch({
      ...baseInput,
      title: "Unrelated headline",
      snippet: "No ticker mention",
      affectedActions: ["VNM"],
    });
    expect(hit).toBe(true);
  });

  it("Signal 2: returns true when snippet contains a sector keyword", () => {
    const hit = shouldDeepFetch({
      ...baseInput,
      title: "Steel sector faces headwinds",
      snippet: "thép market update for Q2 2026",
    });
    expect(hit).toBe(true);
  });

  it("Signal 3: returns true when impactScore >= 7 AND sentiment is not neutral", () => {
    const hit = shouldDeepFetch({
      ...baseInput,
      title: "Major macro event",
      snippet: "Global interest rate shock",
      impactScore: 8,
      sentiment: "bearish",
    });
    expect(hit).toBe(true);
  });

  it("Negative: returns false when no signal fires (impact=5, no ticker, no keyword)", () => {
    const hit = shouldDeepFetch({
      ...baseInput,
      title: "Foreign sports news",
      snippet: "Football match results from France",
      impactScore: 5,
      sentiment: "neutral",
      affectedActions: [],
    });
    expect(hit).toBe(false);
  });

  it("Negative: signal 3 requires BOTH high impact AND non-neutral sentiment", () => {
    // impact >= 7 but neutral → false
    const hit1 = shouldDeepFetch({
      ...baseInput,
      impactScore: 8,
      sentiment: "neutral",
    });
    expect(hit1).toBe(false);

    // non-neutral but impact < 7 → false
    const hit2 = shouldDeepFetch({
      ...baseInput,
      impactScore: 6,
      sentiment: "bullish",
    });
    expect(hit2).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSectorKeywordMap tests
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — buildSectorKeywordMap", () => {
  it("builds a map with sector keywords from watchlist entries", () => {
    const watchlist = [
      { ticker: "VNM", sector: "Agriculture / Dairy", active: true },
      { ticker: "VCB", sector: "Banking", active: true },
      { ticker: "HPG", sector: "Steel", active: true },
    ];
    const map = buildSectorKeywordMap(watchlist);
    expect(map.size).toBeGreaterThan(0);
    expect(map.has("Banking")).toBe(true);
    const bankingKws = map.get("Banking") ?? [];
    expect(bankingKws).toContain("vcb");
    expect(bankingKws).toContain("banking");
  });

  it("excludes inactive entries", () => {
    const watchlist = [
      { ticker: "VEA", sector: "Automotive", active: false },
      { ticker: "VCB", sector: "Banking", active: true },
    ];
    const map = buildSectorKeywordMap(watchlist);
    expect(map.has("Automotive")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue dedup (UNIQUE source_url) tests
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — enqueueIfNotPresent dedup (AC-P2M-7)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns true on first insert", () => {
    const inserted = enqueueIfNotPresent(db, {
      source_url: "https://cafef.vn/article-1",
      source_domain: "cafef.vn",
      rag_id: "rag-001",
      ticker: "VCB",
    });
    expect(inserted).toBe(true);
  });

  it("returns false on second insert for same URL — no duplicate row", () => {
    const url = "https://cafef.vn/article-dupe";
    enqueueIfNotPresent(db, {
      source_url: url,
      source_domain: "cafef.vn",
      rag_id: "rag-002",
      ticker: "VNM",
    });
    const second = enqueueIfNotPresent(db, {
      source_url: url,
      source_domain: "cafef.vn",
      rag_id: "rag-002b",
      ticker: "VNM",
    });
    expect(second).toBe(false);

    // Verify only 1 row in DB
    const count = db
      .prepare<{ c: number }, [string]>(
        `SELECT COUNT(*) as c FROM deep_fetch_queue WHERE source_url = ?`,
      )
      .get(url);
    expect(count?.c).toBe(1);
  });

  it("different URLs get different rows", () => {
    enqueueIfNotPresent(db, {
      source_url: "https://cafef.vn/a1",
      source_domain: "cafef.vn",
      rag_id: "rag-a1",
      ticker: null,
    });
    enqueueIfNotPresent(db, {
      source_url: "https://cafef.vn/a2",
      source_domain: "cafef.vn",
      rag_id: "rag-a2",
      ticker: null,
    });
    const count = db
      .prepare<{ c: number }, []>(
        `SELECT COUNT(*) as c FROM deep_fetch_queue`,
      )
      .get();
    expect(count?.c).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-domain daily cap tests (AC-P2M-3)
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — domain daily cap enforcement (AC-P2M-3)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("checkDomainDailyCap returns true when no fetches yet", () => {
    expect(checkDomainDailyCap(db, "cafef.vn", 50)).toBe(true);
  });

  it("incrementDomainCounter upserts correctly", () => {
    incrementDomainCounter(db, "cafef.vn");
    incrementDomainCounter(db, "cafef.vn");
    const today = new Date().toISOString().slice(0, 10);
    const row = db
      .prepare<{ fetch_count: number }, [string, string]>(
        `SELECT fetch_count FROM deep_fetch_stats WHERE domain = ? AND date = ?`,
      )
      .get("cafef.vn", today);
    expect(row?.fetch_count).toBe(2);
  });

  it("checkDomainDailyCap returns false when fetch_count >= cap", () => {
    const cap = 3;
    for (let i = 0; i < cap; i++) {
      incrementDomainCounter(db, "vneconomy.vn");
    }
    expect(checkDomainDailyCap(db, "vneconomy.vn", cap)).toBe(false);
  });

  it("checkDomainDailyCap returns true when fetch_count < cap", () => {
    incrementDomainCounter(db, "vnexpress.net");
    expect(checkDomainDailyCap(db, "vnexpress.net", 40)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4h stale expiry tests (AC-P2M-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — 4h stale expiry via isStale() (AC-P2M-8)", () => {
  it("returns false for a row queued 1 hour ago", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    const row = {
      id: 1,
      source_url: "https://cafef.vn/test",
      source_domain: "cafef.vn",
      rag_id: "r1",
      ticker: null,
      status: "pending" as const,
      attempts: 0,
      queued_at: oneHourAgo,
      fetched_at: null,
    };
    expect(isStale(row, 4)).toBe(false);
  });

  it("returns true for a row queued 5 hours ago (past 4h expiry)", () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    const row = {
      id: 2,
      source_url: "https://cafef.vn/old",
      source_domain: "cafef.vn",
      rag_id: "r2",
      ticker: null,
      status: "pending" as const,
      attempts: 0,
      queued_at: fiveHoursAgo,
      fetched_at: null,
    };
    expect(isStale(row, 4)).toBe(true);
  });

  it("marks stale rows expired in DB", () => {
    const db = makeDb();
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
    db.prepare(
      `INSERT INTO deep_fetch_queue (source_url, source_domain, rag_id, queued_at)
       VALUES (?, ?, ?, ?)`,
    ).run("https://cafef.vn/stale-article", "cafef.vn", "rag-stale", fiveHoursAgo);

    const row = db
      .prepare<{ id: number; queued_at: string }, [string]>(
        `SELECT id, queued_at FROM deep_fetch_queue WHERE source_url = ?`,
      )
      .get("https://cafef.vn/stale-article");

    expect(row).toBeDefined();
    if (row) {
      const fullRow = { ...row, source_url: "https://cafef.vn/stale-article", source_domain: "cafef.vn", rag_id: "rag-stale", ticker: null, status: "pending" as const, attempts: 0, fetched_at: null };
      expect(isStale(fullRow, 4)).toBe(true);
      markExpired(db, row.id);
      const updated = db
        .prepare<{ status: string }, [number]>(
          `SELECT status FROM deep_fetch_queue WHERE id = ?`,
        )
        .get(row.id);
      expect(updated?.status).toBe("expired");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pollPending + pollVpsFailed only correct statuses
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — pollPending and pollVpsFailed only correct statuses", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("pollPending returns only pending rows", () => {
    enqueueIfNotPresent(db, { source_url: "https://cafef.vn/p1", source_domain: "cafef.vn", rag_id: "rp1" });
    enqueueIfNotPresent(db, { source_url: "https://cafef.vn/p2", source_domain: "cafef.vn", rag_id: "rp2" });
    const row2 = db.prepare<{ id: number }, [string]>(`SELECT id FROM deep_fetch_queue WHERE source_url = ?`).get("https://cafef.vn/p2");
    if (row2) markVpsFailed(db, row2.id);

    const pending = pollPending(db, 10, 4);
    expect(pending.every((r) => r.status === "pending")).toBe(true);
    expect(pending.length).toBe(1);
  });

  it("pollVpsFailed returns only vps-failed rows (never pending)", () => {
    enqueueIfNotPresent(db, { source_url: "https://vnexpress.net/q1", source_domain: "vnexpress.net", rag_id: "rq1" });
    const row = db.prepare<{ id: number }, [string]>(`SELECT id FROM deep_fetch_queue WHERE source_url = ?`).get("https://vnexpress.net/q1");
    if (row) markVpsFailed(db, row.id);

    enqueueIfNotPresent(db, { source_url: "https://vnexpress.net/q2", source_domain: "vnexpress.net", rag_id: "rq2" });

    const failed = pollVpsFailed(db, 10, 4);
    expect(failed.every((r) => r.status === "vps-failed")).toBe(true);
    expect(failed.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// max 10 / max 5 cap enforcement (guardrail)
// ─────────────────────────────────────────────────────────────────────────────

describe("DFR-P2-MCP — max cycle cap enforcement", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    // Insert 15 pending rows
    for (let i = 0; i < 15; i++) {
      enqueueIfNotPresent(db, {
        source_url: `https://cafef.vn/cap-test-${i}`,
        source_domain: "cafef.vn",
        rag_id: `rag-cap-${i}`,
      });
    }
  });

  it("pollPending(limit=10) returns at most 10 rows", () => {
    const rows = pollPending(db, 10, 4);
    expect(rows.length).toBeLessThanOrEqual(10);
    expect(rows.length).toBe(10);
  });

  it("pollPending(limit=5) returns at most 5 rows", () => {
    const rows = pollPending(db, 5, 4);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it("pollVpsFailed(limit=5) returns at most 5 rows from vps-failed set", () => {
    // Mark 8 as vps-failed
    const pending = pollPending(db, 8, 4);
    for (const row of pending) {
      markVpsFailed(db, row.id);
    }
    const failed = pollVpsFailed(db, 5, 4);
    expect(failed.length).toBeLessThanOrEqual(5);
  });
});
