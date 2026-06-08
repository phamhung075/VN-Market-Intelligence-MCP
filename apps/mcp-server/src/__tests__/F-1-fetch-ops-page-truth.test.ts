/**
 * F-1 — FETCH-OPS-PAGE-TRUTH: news filter fix + fetch-status endpoint
 *
 * AC-5: buildSql("bloomberg") SQL contains 'bloomberg.com' domain anchor (not bare '%bloomberg%').
 * AC-5: buildSql("reuters") SQL contains 'reuters.com' domain anchor (not bare '%reuters%').
 * AC-3: handleFetchStatus returns correct schema structure.
 * AC-4: sources[] contains only sources with actual rows in rag_analyses.
 *
 * Test isolation: in-memory SQLite, schema initialised before each test.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { buildSql } from "../interface/mcp/routes/newsHeadlinesHandler.js";
import {
  handleFetchStatus,
  deriveSourceSlug,
  computeFreshnessStatus,
} from "../interface/mcp/routes/fetchStatusHandler.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal schema setup (rag_analyses + bctc_vps_queue)
// ─────────────────────────────────────────────────────────────────────────────

function setupDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url  TEXT,
      source_title TEXT,
      published_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code  TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service      TEXT NOT NULL,
      items_count  INTEGER DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'ok',
      error_msg    TEXT,
      duration_ms  INTEGER,
      pushed_at    TEXT NOT NULL DEFAULT (datetime('now')),
      truncation_detected INTEGER,
      schema_errors_count INTEGER,
      failed_item_indices TEXT,
      parse_time_ms INTEGER,
      validation_time_ms INTEGER,
      db_time_ms INTEGER,
      vps_response_size_bytes INTEGER,
      circuit_breaker_state TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal HTTP response mock
// ─────────────────────────────────────────────────────────────────────────────

function makeRes(): { res: ServerResponse; body: () => string; status: () => number } {
  let _status = 0;
  let _body = "";
  const res = {
    writeHead(code: number) { _status = code; },
    end(data: string) { _body = data; },
  } as unknown as ServerResponse;
  return { res, body: () => _body, status: () => _status };
}

const MOCK_REQ = {} as IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("F-1 — buildSql domain anchor (AC-5)", () => {
  it("bloomberg SQL uses '%bloomberg.com%' not bare '%bloomberg%'", () => {
    const sql = buildSql("bloomberg");
    expect(sql).toContain("bloomberg.com");
    expect(sql).not.toMatch(/%bloomberg[^.]%/);
  });

  it("reuters SQL uses '%reuters.com%' not bare '%reuters%'", () => {
    const sql = buildSql("reuters");
    expect(sql).toContain("reuters.com");
    expect(sql).not.toMatch(/%reuters[^.]%/);
  });

  it("cafef SQL still uses plain '%cafef%' (no change needed)", () => {
    const sql = buildSql("cafef");
    expect(sql).toContain("cafef");
  });

  it("all SQL has no WHERE clause (returns all sources)", () => {
    const sql = buildSql("all");
    expect(sql).not.toContain("WHERE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveSourceSlug unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("F-1 — deriveSourceSlug", () => {
  it("extracts 'cafef' from cafef.vn URL", () => {
    expect(deriveSourceSlug("https://cafef.vn/chung-khoan/news.html")).toBe("cafef");
  });

  it("strips www. prefix from vnexpress.net", () => {
    expect(deriveSourceSlug("https://www.vnexpress.net/article")).toBe("vnexpress");
  });

  it("extracts 'vneconomy' from vneconomy.vn", () => {
    expect(deriveSourceSlug("https://vneconomy.vn/article")).toBe("vneconomy");
  });

  it("returns null for malformed URL", () => {
    expect(deriveSourceSlug("not-a-url")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFreshnessStatus unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("F-1 — computeFreshnessStatus", () => {
  it("returns 'no-data' for null ageMs", () => {
    expect(computeFreshnessStatus(null)).toBe("no-data");
  });

  it("returns 'fresh' for ageMs < 2h (1h59m)", () => {
    expect(computeFreshnessStatus(119 * 60 * 1000)).toBe("fresh");
  });

  it("returns 'stale' for ageMs >= 2h", () => {
    expect(computeFreshnessStatus(2 * 60 * 60 * 1000)).toBe("stale");
  });

  it("returns 'stale' for ageMs >> 12h", () => {
    expect(computeFreshnessStatus(24 * 60 * 60 * 1000)).toBe("stale");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleFetchStatus integration tests (AC-3, AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("F-1 — handleFetchStatus (AC-3, AC-4)", () => {
  let db: Database;

  beforeEach(() => {
    db = setupDb();
  });

  afterEach(() => {
    db.close();
  });

  it("AC-3: returns correct top-level schema structure", () => {
    const { res, body, status } = makeRes();
    const now = new Date("2026-06-06T12:00:00Z");
    handleFetchStatus(MOCK_REQ, res, db, now);

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    expect(parsed).toHaveProperty("sources");
    expect(parsed).toHaveProperty("vpsProxy");
    expect(parsed).toHaveProperty("bctcPipeline");
    expect(parsed).toHaveProperty("fetchedAt");
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(typeof parsed.vpsProxy).toBe("object");
    expect(typeof parsed.bctcPipeline).toBe("object");
  });

  it("AC-3: bctcPipeline has pending/done/failed keys", () => {
    const { res, body, status } = makeRes();
    const now = new Date("2026-06-06T12:00:00Z");
    handleFetchStatus(MOCK_REQ, res, db, now);

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    expect(parsed.bctcPipeline).toHaveProperty("pending");
    expect(parsed.bctcPipeline).toHaveProperty("done");
    expect(parsed.bctcPipeline).toHaveProperty("failed");
  });

  it("AC-4: sources[] is empty when rag_analyses has no rows", () => {
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    expect(parsed.sources).toHaveLength(0);
  });

  it("AC-4: sources[] contains only sources present in rag_analyses", () => {
    // Insert rows for cafef and vnexpress only
    db.exec(`
      INSERT INTO rag_analyses (source_url, source_title, created_at)
      VALUES
        ('https://cafef.vn/news/article1.html', 'VNM', datetime('now', '-30 minutes')),
        ('https://cafef.vn/news/article2.html', 'VCB', datetime('now', '-45 minutes')),
        ('https://www.vnexpress.net/kinh-doanh/article.html', 'HPG', datetime('now', '-2 hours'));
    `);

    const { res, body, status } = makeRes();
    const now = new Date();
    handleFetchStatus(MOCK_REQ, res, db, now);

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    const ids = parsed.sources.map((s: { id: string }) => s.id);

    // Only cafef and vnexpress should appear — no phantom bloomberg/reuters
    expect(ids).toContain("cafef");
    expect(ids).toContain("vnexpress");
    expect(ids).not.toContain("bloomberg");
    expect(ids).not.toContain("reuters");
  });

  it("AC-4: sources[] excludes rows with null source_url (R-5 guard)", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, source_title, created_at)
      VALUES
        (NULL, 'Title with null URL', datetime('now')),
        ('https://cafef.vn/article.html', 'CafeF article', datetime('now'));
    `);

    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    // sources array must not have an entry with id=null
    const hasNullId = parsed.sources.some((s: { id: string | null }) => s.id === null || s.id === "");
    expect(hasNullId).toBe(false);
  });

  it("AC-3: source entry has id, lastArticleAt, ageMs, count24h, status fields", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, source_title, created_at)
      VALUES ('https://cafef.vn/news.html', 'Test', datetime('now', '-1 hour'));
    `);

    const { res, body, status } = makeRes();
    const now = new Date();
    handleFetchStatus(MOCK_REQ, res, db, now);

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    expect(parsed.sources.length).toBeGreaterThan(0);
    const src = parsed.sources[0];
    expect(src).toHaveProperty("id");
    expect(src).toHaveProperty("lastArticleAt");
    expect(src).toHaveProperty("ageMs");
    expect(src).toHaveProperty("count24h");
    expect(src).toHaveProperty("status");
  });

  it("fresh article (30min old) gets status='fresh'", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, source_title, created_at)
      VALUES ('https://cafef.vn/news.html', 'Recent', datetime('now', '-30 minutes'));
    `);

    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    const cafef = parsed.sources.find((s: { id: string }) => s.id === "cafef");
    expect(cafef).toBeDefined();
    expect(cafef.status).toBe("fresh");
  });

  it("stale article (3h old) gets status='stale'", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, source_title, created_at)
      VALUES ('https://cafef.vn/news.html', 'Old', datetime('now', '-3 hours'));
    `);

    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    const cafef = parsed.sources.find((s: { id: string }) => s.id === "cafef");
    expect(cafef).toBeDefined();
    expect(cafef.status).toBe("stale");
  });

  it("bctcPipeline counts reflect actual queue state", () => {
    db.exec(`
      INSERT INTO bctc_vps_queue (action_code, status) VALUES
        ('VCB', 'pending'),
        ('HPG', 'pending'),
        ('VNM', 'done'),
        ('MSN', 'done'),
        ('ACB', 'done'),
        ('BID', 'failed');
    `);

    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());

    expect(status()).toBe(200);
    const parsed = JSON.parse(body());
    expect(parsed.bctcPipeline.pending).toBe(2);
    expect(parsed.bctcPipeline.done).toBe(3);
    expect(parsed.bctcPipeline.failed).toBe(1);
  });
});
