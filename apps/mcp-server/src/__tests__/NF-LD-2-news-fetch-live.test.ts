Bun.env["DB_PATH"] = ":memory:";

/**
 * NF-LD-2a — TDD tests for GET /api/news-fetch/live endpoint
 *
 * Tests:
 *   (a) valid source=reuters returns correct shape
 *   (b) source=invalid returns HTTP 400
 *   (c) empty table returns { ok: true, count: 0, rows: [] }
 *   (d) source=bloomberg filters correctly via source_url LIKE '%bloomberg%'
 *   (e) source=all returns both reuters + bloomberg rows with _provider hint
 *   (f) limit param is clamped (>50 → 50, <1 → 1)
 *   (g) AC-11: no getDb() — db injected by caller
 *   (h) AC-4: no write SQL verbs in handler (structural — enforced by grep; test is documentary)
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleNewsFetchLive } from "../interface/mcp/routes/newsFetchLiveHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,
      published_at       TEXT,
      sentiment          TEXT,
      impact_score       REAL,
      impact_direction   TEXT,
      confidence         REAL,
      time_horizon       TEXT,
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,
      affected_domains   TEXT,
      affected_actions   TEXT,
      parent_ids         TEXT,
      tags               TEXT,
      embedding_text     TEXT,
      data_env TEXT
);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses(source_url)
      WHERE source_url IS NOT NULL AND source_url != '';
  `);
  return db;
}

function insertRow(
  db: Database,
  overrides: Partial<{
    id: string;
    source_url: string;
    source_title: string;
    source_type: string;
    published_at: string;
    sentiment: string;
    impact_score: number;
    impact_direction: string;
    created_at: string;
  }> = {},
): void {
  const row = {
    id: overrides.id ?? crypto.randomUUID(),
    source_url: overrides.source_url ?? "https://www.reuters.com/article/test",
    source_title: overrides.source_title ?? "Test headline",
    source_type: overrides.source_type ?? "news",
    published_at: overrides.published_at ?? "2026-05-24T10:00:00Z",
    sentiment: overrides.sentiment ?? "bullish",
    impact_score: overrides.impact_score ?? 0.75,
    impact_direction: overrides.impact_direction ?? "positive",
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
  db.prepare(`
    INSERT INTO rag_analyses
      (id, created_at, level, source_url, source_title, source_type,
       published_at, sentiment, impact_score, impact_direction)
    VALUES (?, ?, 'global', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.created_at, row.source_url, row.source_title,
    row.source_type, row.published_at, row.sentiment,
    row.impact_score, row.impact_direction,
  );
}

/** Minimal mock of IncomingMessage that carries a URL string */
function mockReq(url: string): IncomingMessage {
  return { url, headers: {}, method: "GET" } as unknown as IncomingMessage;
}

/** Captures res.writeHead() and res.end() calls, returns parsed body + status */
function mockRes(): { res: ServerResponse; getStatus: () => number; getBody: () => unknown } {
  let status = 200;
  let body = "";
  const res = {
    writeHead(s: number) { status = s; },
    end(data: string) { body = data; },
    setHeader() {},
  } as unknown as ServerResponse;
  return {
    res,
    getStatus: () => status,
    getBody: () => JSON.parse(body),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("NF-LD-2a — GET /api/news-fetch/live", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  // AC-9 (a): valid source=reuters returns correct shape
  test("(a) source=reuters — returns ok:true with correct row shape", () => {
    insertRow(db, {
      id: "r1",
      source_url: "https://www.reuters.com/markets/test-article",
      source_title: "Reuters test headline",
      sentiment: "bearish",
      impact_score: 0.5,
      impact_direction: "negative",
      published_at: "2026-05-24T09:00:00Z",
    });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; source: string; count: number; rows: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.source).toBe("reuters");
    expect(body.count).toBe(1);
    expect(body.rows).toHaveLength(1);

    const row = body.rows[0] as Record<string, unknown>;
    expect(row.headline).toBe("Reuters test headline");
    expect(typeof row.url).toBe("string");
    expect(typeof row.created_at).toBe("string");
    // published_at, sentiment, impact_direction, impact_score must be present
    expect("published_at" in row).toBe(true);
    expect("sentiment" in row).toBe(true);
    expect("impact_direction" in row).toBe(true);
    expect("impact_score" in row).toBe(true);
    // _provider must NOT be present for source=reuters (only for source=all)
    expect("_provider" in row).toBe(false);
  });

  // AC-9 (b): invalid source → 400
  test("(b) source=invalid — returns HTTP 400 with ok:false", () => {
    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=invalid"), res, db);

    expect(getStatus()).toBe(400);
    const body = getBody() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid source/);
  });

  // AC-9 (c): empty table → count:0, rows:[]
  test("(c) empty table — returns ok:true, count:0, rows:[]", () => {
    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; count: number; rows: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.rows).toHaveLength(0);
  });

  // (d): bloomberg filter works
  test("(d) source=bloomberg — returns only bloomberg rows", () => {
    insertRow(db, { id: "b1", source_url: "https://www.bloomberg.com/news/articles/test" });
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/test" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=bloomberg"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    const firstRow = body.rows[0]!;
    expect(firstRow.url).toContain("bloomberg");
  });

  // (e): source=all returns both providers + _provider hint
  test("(e) source=all — returns both providers with _provider hint", () => {
    insertRow(db, { id: "b1", source_url: "https://www.bloomberg.com/news/test" });
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/test" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; source: string; count: number; rows: { url: string; _provider: string }[] };
    expect(body.ok).toBe(true);
    expect(body.source).toBe("all");
    expect(body.count).toBe(2);

    const providers = body.rows.map((r) => r._provider).sort();
    expect(providers).toEqual(["bloomberg", "reuters"]);
  });

  // (f): limit clamped at MAX_LIMIT (50)
  test("(f) limit=999 — clamped to 50, returns at most 50 rows", () => {
    // Insert 55 reuters rows
    for (let i = 0; i < 55; i++) {
      insertRow(db, {
        id: `r${i}`,
        source_url: `https://www.reuters.com/article/${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      });
    }

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters&limit=999"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number; rows: unknown[] };
    expect(body.count).toBe(50);
    expect(body.rows).toHaveLength(50);
  });

  // (g): default limit = 20 when not specified
  test("(g) no limit param — defaults to 20 rows", () => {
    for (let i = 0; i < 25; i++) {
      insertRow(db, {
        id: `r${i}`,
        source_url: `https://www.reuters.com/article/default/${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      });
    }

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number };
    expect(body.count).toBe(20);
  });

  // (h): rows ordered by created_at DESC (most recent first)
  test("(h) rows ordered by created_at DESC", () => {
    const t1 = "2026-05-24T08:00:00Z";
    const t2 = "2026-05-24T09:00:00Z";
    const t3 = "2026-05-24T10:00:00Z";

    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/a/1", created_at: t1 });
    insertRow(db, { id: "r2", source_url: "https://www.reuters.com/a/2", created_at: t3 });
    insertRow(db, { id: "r3", source_url: "https://www.reuters.com/a/3", created_at: t2 });

    const { res, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    const body = getBody() as { rows: { created_at: string }[] };
    const [row0, row1, row2] = body.rows as [{ created_at: string }, { created_at: string }, { created_at: string }];
    expect(row0.created_at).toBe(t3);
    expect(row1.created_at).toBe(t2);
    expect(row2.created_at).toBe(t1);
  });

  // source=reuters does NOT return bloomberg rows
  test("reuters filter does not return bloomberg rows", () => {
    insertRow(db, { id: "b1", source_url: "https://www.bloomberg.com/news/xyz" });

    const { res, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    const body = getBody() as { count: number };
    expect(body.count).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // NEWS-INGEST-2b — VN source visibility tests
  // ─────────────────────────────────────────────────────────────────────────────

  // (i): source=all returns VN-source rows (cafef, vnexpress, vneconomy)
  test("(i) source=all — returns VN-source rows (cafef/vnexpress/vneconomy)", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/article-1.chn", source_title: "CafeF headline" });
    insertRow(db, { id: "v1", source_url: "https://vnexpress.net/kinh-doanh/article-1.html", source_title: "VnExpress headline" });
    insertRow(db, { id: "e1", source_url: "https://vneconomy.vn/chung-khoan/article-1.htm", source_title: "VnEconomy headline" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=all"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; source: string; count: number; rows: { url: string; _provider: string }[] };
    expect(body.ok).toBe(true);
    expect(body.source).toBe("all");
    expect(body.count).toBe(3);

    const providers = body.rows.map((r) => r._provider).sort();
    expect(providers).toEqual(["cafef", "vneconomy", "vnexpress"]);
  });

  // (j): source=all default (no param) also returns VN rows
  test("(j) source param omitted (defaults to all) — returns VN rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/vn-article.chn", source_title: "CafeF VN article" });
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/reuters-article", source_title: "Reuters article" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number; rows: { _provider: string }[] };
    expect(body.count).toBe(2);

    const providers = body.rows.map((r) => r._provider).sort();
    expect(providers).toEqual(["cafef", "reuters"]);
  });

  // (k): source=cafef — filters to cafef rows only
  test("(k) source=cafef — returns only cafef rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/a.chn", source_title: "CafeF row" });
    insertRow(db, { id: "v1", source_url: "https://vnexpress.net/kinh-doanh/b.html", source_title: "VnExpress row" });
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/c", source_title: "Reuters row" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=cafef"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    expect(body.rows[0]!.url).toContain("cafef");
  });

  // (l): source=vnexpress — filters to vnexpress rows only
  test("(l) source=vnexpress — returns only vnexpress rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/a.chn" });
    insertRow(db, { id: "v1", source_url: "https://vnexpress.net/kinh-doanh/b.html", source_title: "VnExpress article" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=vnexpress"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    expect(body.rows[0]!.url).toContain("vnexpress");
  });

  // (m): source=vneconomy — filters to vneconomy rows only
  test("(m) source=vneconomy — returns only vneconomy rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/a.chn" });
    insertRow(db, { id: "e1", source_url: "https://vneconomy.vn/chung-khoan/c.htm", source_title: "VnEconomy article" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=vneconomy"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    expect(body.rows[0]!.url).toContain("vneconomy");
  });

  // (n): _provider correctly derived from URL for all known providers in source=all
  test("(n) source=all — _provider correctly labels reuters/bloomberg/cafef/vnexpress/vneconomy/other", () => {
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/test" });
    insertRow(db, { id: "b1", source_url: "https://www.bloomberg.com/news/test" });
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/test" });
    insertRow(db, { id: "v1", source_url: "https://vnexpress.net/kinh-doanh/test" });
    insertRow(db, { id: "e1", source_url: "https://vneconomy.vn/chung-khoan/test" });
    insertRow(db, { id: "o1", source_url: "https://some-other-source.com/article" });

    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=all"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { rows: { url: string; _provider: string }[] };
    expect(body.rows).toHaveLength(6);

    const providerMap = Object.fromEntries(
      body.rows.map((r) => [new URL(r.url!).hostname, r._provider])
    );
    expect(providerMap["www.reuters.com"]).toBe("reuters");
    expect(providerMap["www.bloomberg.com"]).toBe("bloomberg");
    expect(providerMap["cafef.vn"]).toBe("cafef");
    expect(providerMap["vnexpress.net"]).toBe("vnexpress");
    expect(providerMap["vneconomy.vn"]).toBe("vneconomy");
    expect(providerMap["some-other-source.com"]).toBe("other");
  });

  // (o): source=all + mixed DB — VN rows do NOT appear under source=reuters
  test("(o) non-regression: source=reuters does NOT return VN rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/a.chn" });
    insertRow(db, { id: "v1", source_url: "https://vnexpress.net/kinh-doanh/b.html" });
    insertRow(db, { id: "r1", source_url: "https://www.reuters.com/markets/x" });

    const { res, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=reuters"), res, db);

    const body = getBody() as { count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    expect(body.rows[0]!.url).toContain("reuters");
  });

  // (p): source=bloomberg does NOT return VN rows
  test("(p) non-regression: source=bloomberg does NOT return VN rows", () => {
    insertRow(db, { id: "c1", source_url: "https://cafef.vn/stock/a.chn" });
    insertRow(db, { id: "b1", source_url: "https://www.bloomberg.com/news/x" });

    const { res, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=bloomberg"), res, db);

    const body = getBody() as { count: number; rows: { url: string }[] };
    expect(body.count).toBe(1);
    expect(body.rows[0]!.url).toContain("bloomberg");
  });

  // (q): unknown VN-like source string (e.g. "vietstock") still returns 400
  test("(q) source=vietstock — returns HTTP 400 (not a valid source enum)", () => {
    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=vietstock"), res, db);

    expect(getStatus()).toBe(400);
    const body = getBody() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid source/);
  });

  // (r): source=all on empty table returns ok:true, count:0 (honest empty)
  test("(r) source=all on empty table — returns ok:true count:0 (honest empty)", () => {
    const { res, getStatus, getBody } = mockRes();
    handleNewsFetchLive(mockReq("/api/news-fetch/live?source=all"), res, db);

    expect(getStatus()).toBe(200);
    const body = getBody() as { ok: boolean; count: number; rows: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.rows).toHaveLength(0);
  });
});
