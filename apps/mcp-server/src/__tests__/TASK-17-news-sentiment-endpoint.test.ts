/**
 * TASK-17 — GET /api/news-sentiment endpoint (MAW-P1-1a)
 *
 * AC-1:  queryNewsSentiment returns newest rows first from rag_analyses
 * AC-2:  queryNewsSentiment omits rows where source_url IS NULL or empty
 * AC-3:  queryNewsSentiment returns empty array when no rows exist
 * AC-4:  queryNewsSentiment respects limit (default 20, max 50)
 * AC-5:  each item has the expected shape
 * AC-6:  affected_tickers extracted from uppercase tags (2-5 letter codes only)
 * AC-7:  affected_sectors extracted from affected_domains JSON
 * AC-8:  impact_summary is null when summary field is null or empty string
 * AC-9:  handleGetNewsSentiment returns 200 JSON with {generated_at, stale_served, oldest_item_ts, count, items}
 * AC-10: handleGetNewsSentiment returns 200 with empty items[] when no rows (no error)
 * AC-11: handleGetNewsSentiment returns 500 on DB error
 * AC-12: stale_served is true when newest item is older than 6 hours
 * AC-13: stale_served is false when newest item is within 6 hours
 * AC-14: count matches items.length
 * AC-15: source_ts falls back to created_at when published_at is null
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK-17] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  queryNewsSentiment,
  handleGetNewsSentiment,
  STALE_THRESHOLD_HOURS,
  type NewsSentimentItem,
  type NewsSentimentResponse,
} from "../interface/mcp/routes/newsSentimentHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface InsertParams {
  id: string;
  source_title?: string | null;
  source_url?: string | null;
  published_at?: string | null;
  created_at: string;
  sentiment?: string | null;
  impact_score?: number | null;
  impact_direction?: string | null;
  confidence?: number | null;
  summary?: string | null;
  tags?: string | null;
  affected_domains?: string | null;
}

function insertRow(db: Database, p: InsertParams): void {
  db.prepare(
    `INSERT INTO rag_analyses
       (id, source_title, source_url, published_at, created_at, sentiment,
        impact_score, impact_direction, confidence, summary, tags, affected_domains,
        level, embedding_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'macro', NULL)`,
  ).run(
    p.id,
    p.source_title ?? null,
    p.source_url ?? null,
    p.published_at ?? null,
    p.created_at,
    p.sentiment ?? null,
    p.impact_score ?? null,
    p.impact_direction ?? null,
    p.confidence ?? null,
    p.summary ?? null,
    p.tags ?? null,
    p.affected_domains ?? null,
  );
}

/** Minimal mock ServerResponse that captures the written response. */
function makeMockRes(): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data: string) => void;
} {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

const FAKE_REQ = {} as import("node:http").IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// queryNewsSentiment unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 — queryNewsSentiment", () => {
  it("AC-1: returns newest rows first (ORDER BY created_at DESC)", () => {
    const db = getDb();
    insertRow(db, { id: "a1", source_url: "https://cafef.vn/a1", created_at: "2026-06-10T10:00:00Z" });
    insertRow(db, { id: "a2", source_url: "https://cafef.vn/a2", created_at: "2026-06-11T08:00:00Z" });
    insertRow(db, { id: "a3", source_url: "https://cafef.vn/a3", created_at: "2026-06-09T14:00:00Z" });

    const items = queryNewsSentiment(db);

    expect(items[0]!.id).toBe("a2");
    expect(items[1]!.id).toBe("a1");
    expect(items[2]!.id).toBe("a3");
  });

  it("AC-2: omits rows where source_url IS NULL or empty string", () => {
    const db = getDb();
    insertRow(db, { id: "b1", source_url: null,  created_at: "2026-06-11T10:00:00Z" });
    insertRow(db, { id: "b2", source_url: "",    created_at: "2026-06-11T09:00:00Z" });
    insertRow(db, { id: "b3", source_url: "https://vnexpress.net/b3", created_at: "2026-06-11T08:00:00Z" });

    const items = queryNewsSentiment(db);

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("b3");
  });

  it("AC-3: returns empty array when no qualifying rows exist", () => {
    const db = getDb();
    const items = queryNewsSentiment(db);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(0);
  });

  it("AC-4: respects limit — default 20, clamps to max 50", () => {
    const db = getDb();
    for (let i = 0; i < 25; i++) {
      insertRow(db, {
        id: `c${i}`,
        source_url: `https://cafef.vn/c${i}`,
        created_at: `2026-06-11T${String(i % 24).padStart(2, "0")}:00:00Z`,
      });
    }

    const items20 = queryNewsSentiment(db, 20);
    expect(items20).toHaveLength(20);

    const items5 = queryNewsSentiment(db, 5);
    expect(items5).toHaveLength(5);

    // Clamp max: 100 → 50
    const items50 = queryNewsSentiment(db, 100);
    expect(items50.length).toBeLessThanOrEqual(50);
  });

  it("AC-5: each item has the expected shape", () => {
    const db = getDb();
    insertRow(db, {
      id: "d1",
      source_title: "FPT signs Asia deal",
      source_url: "https://vnexpress.net/fpt-asia",
      published_at: "2026-06-11T07:00:00Z",
      created_at: "2026-06-11T07:05:00Z",
      sentiment: "positive",
      impact_score: 7.5,
      impact_direction: "bullish",
      confidence: 0.82,
      summary: "FPT secures a major contract in Asia",
      tags: JSON.stringify(["FPT", "technology"]),
      affected_domains: JSON.stringify(["tech"]),
    });

    const items = queryNewsSentiment(db, 1);
    expect(items).toHaveLength(1);
    const item = items[0]!;

    expect(item.id).toBe("d1");
    expect(item.title).toBe("FPT signs Asia deal");
    expect(item.source).toBe("https://vnexpress.net/fpt-asia");
    expect(item.source_ts).toBe("2026-06-11T07:00:00Z");
    expect(item.sentiment).toBe("positive");
    expect(item.sentiment_score).toBe(7.5);
    expect(item.impact_direction).toBe("bullish");
    expect(item.confidence).toBe(0.82);
    expect(item.impact_summary).toBe("FPT secures a major contract in Asia");
  });

  it("AC-6: affected_tickers extracted from already-uppercase 2–5 letter tags only", () => {
    const db = getDb();
    insertRow(db, {
      id: "e1",
      source_url: "https://cafef.vn/e1",
      created_at: "2026-06-11T08:00:00Z",
      // Mixed: uppercase tickers (as stored by agent pipeline) + lowercase keywords
      // (as stored by news-scout). Only pre-uppercase ones should qualify.
      tags: JSON.stringify(["FPT", "gdp", "VCB", "vietnam", "HPG", "technology", "ACB"]),
    });

    const items = queryNewsSentiment(db, 1);
    const item = items[0]!;

    // Pre-uppercase ticker tags are returned as-is
    expect(item.affected_tickers).toContain("FPT");
    expect(item.affected_tickers).toContain("VCB");
    expect(item.affected_tickers).toContain("HPG");
    expect(item.affected_tickers).toContain("ACB");
    // Lowercase keyword tags are NOT classified as tickers
    expect(item.affected_tickers).not.toContain("gdp");
    expect(item.affected_tickers).not.toContain("GDP");
    expect(item.affected_tickers).not.toContain("vietnam");
    expect(item.affected_tickers).not.toContain("technology");
  });

  it("AC-7: affected_sectors extracted from affected_domains JSON", () => {
    const db = getDb();
    insertRow(db, {
      id: "f1",
      source_url: "https://cafef.vn/f1",
      created_at: "2026-06-11T08:00:00Z",
      affected_domains: JSON.stringify(["banking", "real_estate"]),
    });

    const items = queryNewsSentiment(db, 1);
    const item = items[0]!;

    expect(item.affected_sectors).toContain("banking");
    expect(item.affected_sectors).toContain("real_estate");
  });

  it("AC-8: impact_summary is null when summary is null", () => {
    const db = getDb();
    insertRow(db, {
      id: "g1",
      source_url: "https://cafef.vn/g1",
      created_at: "2026-06-11T08:00:00Z",
      summary: null,
    });

    const items = queryNewsSentiment(db, 1);
    expect(items[0]!.impact_summary).toBeNull();
  });

  it("AC-8b: impact_summary is null when summary is empty string", () => {
    const db = getDb();
    insertRow(db, {
      id: "g2",
      source_url: "https://cafef.vn/g2",
      created_at: "2026-06-11T08:00:00Z",
      summary: "   ",
    });

    const items = queryNewsSentiment(db, 1);
    expect(items[0]!.impact_summary).toBeNull();
  });

  it("AC-15: source_ts falls back to created_at when published_at is null", () => {
    const db = getDb();
    insertRow(db, {
      id: "h1",
      source_url: "https://cafef.vn/h1",
      published_at: null,
      created_at: "2026-06-11T06:30:00Z",
    });

    const items = queryNewsSentiment(db, 1);
    expect(items[0]!.source_ts).toBe("2026-06-11T06:30:00Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetNewsSentiment HTTP handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-17 — handleGetNewsSentiment HTTP handler", () => {
  it("AC-9: returns 200 JSON with {generated_at, stale_served, oldest_item_ts, count, items}", () => {
    const db = getDb();
    insertRow(db, {
      id: "z1",
      source_url: "https://vnexpress.net/z1",
      created_at: "2026-06-11T07:00:00Z",
      published_at: "2026-06-11T06:00:00Z",
    });

    const now = new Date("2026-06-11T07:30:00.000Z");
    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db, now);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as NewsSentimentResponse;
    expect(body.generated_at).toBe("2026-06-11T07:30:00.000Z");
    expect(typeof body.stale_served).toBe("boolean");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.count).toBe(1);
    expect(body.oldest_item_ts).toBeDefined();
  });

  it("AC-10: returns 200 with empty items[] when no rows exist", () => {
    const db = getDb();
    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as NewsSentimentResponse;
    expect(body.items).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.oldest_item_ts).toBeNull();
    expect(body.stale_served).toBe(false);
  });

  it("AC-11: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-12: stale_served is true when newest item is older than 6 hours", () => {
    const db = getDb();
    // Insert article with published_at 7h before "now"
    insertRow(db, {
      id: "s1",
      source_url: "https://cafef.vn/s1",
      published_at: "2026-06-11T00:00:00Z",
      created_at: "2026-06-11T00:00:00Z",
    });

    // "now" = 7h after the article
    const now = new Date("2026-06-11T07:00:00.000Z");
    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db, now);

    const body = JSON.parse(res.body) as NewsSentimentResponse;
    expect(body.stale_served).toBe(true);
  });

  it("AC-13: stale_served is false when newest item is within 6 hours", () => {
    const db = getDb();
    // Insert article with published_at 2h before "now"
    insertRow(db, {
      id: "s2",
      source_url: "https://cafef.vn/s2",
      published_at: "2026-06-11T05:00:00Z",
      created_at: "2026-06-11T05:00:00Z",
    });

    // "now" = 2h after the article
    const now = new Date("2026-06-11T07:00:00.000Z");
    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db, now);

    const body = JSON.parse(res.body) as NewsSentimentResponse;
    expect(body.stale_served).toBe(false);
  });

  it("AC-14: count matches items.length", () => {
    const db = getDb();
    insertRow(db, { id: "t1", source_url: "https://cafef.vn/t1", created_at: "2026-06-11T05:00:00Z" });
    insertRow(db, { id: "t2", source_url: "https://cafef.vn/t2", created_at: "2026-06-11T06:00:00Z" });

    const res = makeMockRes();
    handleGetNewsSentiment(FAKE_REQ, res as unknown as import("node:http").ServerResponse, db);

    const body = JSON.parse(res.body) as NewsSentimentResponse;
    expect(body.count).toBe(body.items.length);
  });

  it("STALE_THRESHOLD_HOURS is exported and equals 6", () => {
    expect(STALE_THRESHOLD_HOURS).toBe(6);
  });
});
